/**
 * table-extractor.ts — the table extraction ladder.
 *
 * Financial statements live in TABLES, and prose text extraction mangles them, so tables get a
 * first-class path. The ladder (cheapest → most expensive, each step gated by the next):
 *
 *   1. layout  — deterministic whitespace/tab heuristics over native text (free, no AI)
 *   2. vision  — Groq vision on the rendered page image with a strict rows×columns JSON schema
 *   3. ocr     — tesseract (local, no rate limits) when vision quota is exhausted/unavailable
 *
 * Every result carries `detectedBy` + a `quality` score (fraction of numeric cells that validate
 * against Indian number formats). Below the provisional quality gate a table is marked
 * `degraded` and flows into the reviewer business rules — never silently dropped.
 *
 * IMPORTANT: the 95%/85% accuracy gates are PROVISIONAL — set from the Phase 0 spike (3 fixture
 * pages) and meant to be recalibrated from reviewer-correction telemetry after ~30 real docs.
 */

import { createWorker } from 'tesseract.js';
import Groq from 'groq-sdk';
import { z } from 'zod';
import { tokenBudgetManager, estimateTokens } from '@/lib/ai/rate-limiter';
import { VISION_MODEL } from '@/lib/ai/budget/model-limit-registry';
import { withRateLimitRetry } from '@/lib/ai/retry-wrapper';
import { resolveTesseractWorkerPath } from './tesseract-paths';

export interface RawTable {
  /** header cells, may be empty for irregular tables */
  columns: string[];
  rows: string[][];
}

export type TableDetectionSource = 'layout' | 'vision' | 'ocr';

export interface TableExtractionResult {
  tables: RawTable[];
  detectedBy: TableDetectionSource;
  /** fraction (0..1) of numeric cells that parsed — below the gate → degraded */
  quality: number;
  error?: string;
}

/**
 * Provisional quality gates from the Phase 0 spike — recalibrate after 30+ real documents
 * using reviewer-correction telemetry (per-detectedBy correction rates).
 */
export const QUALITY_GATES: Record<TableDetectionSource, number> = {
  layout: 0.5, // heuristics over mangled text → deliberately lenient, flagged for vision/OCR upgrade
  vision: 0.85,
  ocr: 0.5,
};

const NUMERIC_CELL_RE = /^[\s(]*[₹$€]?\s*-?\d[\d,.]*\s*(?:cr|mn|mn\s?usd|lakh|thousand|%|x)?[\s)]*$/i;

/**
 * Parse a number in Indian/P&L formats: "1,234.56", "(12.5)", "₹ 45 Cr", "12 Mn USD", "5 Lakh".
 * Returns null when the cell is not numeric (labels, headers, blank).
 */
export function parseIndianNumber(cell: string): number | null {
  if (!cell) return null;
  const trimmed = cell.trim();
  if (!trimmed || /^[-–—\s]+$/.test(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  if (!/[0-9]/.test(lower)) return null;

  const negative = /^\(.*\)$/.test(trimmed) || (trimmed.includes('-') && !/^\d[\d,]*$/.test(trimmed));

  // Strip currency symbols, group separators, spaces, and unit suffixes in one pass.
  const units: Array<[RegExp, number]> = [
    [/crore|cr\b/, 1e7],
    [/\bmn\b|\bmillion\b/, 1e6],
    [/lakh|lac\b/, 1e5],
    [/thousand|\bth\b/, 1e3],
  ];
  let multiplier = 1;
  for (const [re, m] of units) {
    if (re.test(lower)) {
      multiplier = m;
      break;
    }
  }

  let digits = trimmed.replace(/[₹$€,\s]/g, '');
  if (negative && /^\(.*\)$/.test(digits)) {
    digits = digits.replace(/^\((.*)\)$/, '$1');
  }
  digits = digits.replace(/-/g, '').replace(/[a-z%xX]+/gi, '').trim();

  if (!/^\d*\.?\d+$/.test(digits)) return null;

  const value = parseFloat(digits);
  if (Number.isNaN(value)) return null;
  return negative ? -value * multiplier : value * multiplier;
}

function numericFraction(cell: string): boolean {
  return NUMERIC_CELL_RE.test(cell) || parseIndianNumber(cell) !== null;
}

/** Quality = fraction of cells in numeric positions (row.length > 1) that parsed as numbers. */
export function validateTableQuality(tables: RawTable[]): number {
  let numeric = 0;
  let total = 0;
  for (const table of tables) {
    for (const row of table.rows) {
      if (row.length < 2) continue;
      for (const cell of row.slice(1)) {
        total++;
        if (numericFraction(cell)) numeric++;
      }
    }
  }
  return total === 0 ? 0 : numeric / total;
}

// ---------------------------------------------------------------------------
// Step 1 — layout heuristics (deterministic, free)
// ---------------------------------------------------------------------------

/**
 * Reconstruct tabular structure from native text. Two passes per line:
 *  1. split on multi-space/tab runs (kept-alignment output), then
 *  2. split on single spaces when the line ENDS with ≥2 numeric tokens (columns collapsed
 *     to single spaces by pdf text extraction — a very common real-world shape, e.g.
 *     "Total Revenue 12,580.17 11,185.85").
 * Simple and lossy by design — `detectedBy: 'layout'` keeps it auditable, and the quality
 * gate decides whether to escalate to vision/OCR.
 */
export function parseLayoutTables(pageText: string): RawTable[] {
  const lines = pageText
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' ').trim())
    .filter((l) => l.length > 3);

  const tables: RawTable[] = [];
  let current: string[][] | null = null;

  const numericish = (token: string) => /^\d[\d,.]*$/.test(token) || /^[₹$€]?\s*-?\d/.test(token);

  const flush = () => {
    if (current && current.length >= 2) {
      const columns = current[0];
      tables.push({ columns, rows: current.slice(1) });
    }
    current = null;
  };

  const splitLine = (line: string): string[] | null => {
    // Pass 1 — multi-space/tab separated columns
    const wide = line.split(/\s{2,}|\t/).map((c) => c.trim()).filter((c) => c.length > 0);
    if (wide.length >= 2 && wide.filter(numericish).length >= 2) return wide;

    // Pass 2 — single-space collapsed columns: ≥3 tokens, ending with ≥2 numeric tokens
    const narrow = line.split(/\s+/);
    if (narrow.length >= 3 && narrow.length <= 8) {
      const trailing = narrow.slice(-2);
      if (trailing.every(numericish) && narrow.filter(numericish).length >= 2) return narrow;
    }
    return null;
  };

  for (const line of lines) {
    const cells = splitLine(line);
    if (cells) {
      current = current || [];
      current.push(cells);
    } else {
      flush();
    }
  }
  flush();
  return tables;
}

// ---------------------------------------------------------------------------
// Step 2 — vision (Groq, budgeted lane)
// ---------------------------------------------------------------------------

const VisionTableSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

export interface VisionTableResponse {
  tables: RawTable[];
}

/**
 * Extract tables from a rendered page image via Groq vision. Strict JSON-only output,
 * schema-validated, retried once on rate limits. Usage is recorded against the vision
 * model's token budget lane (an image ≈ 1k tokens) so 60 table pages show up as a real
 * cost line, not a silent multiplier.
 */
export async function extractTablesWithVision(
  imageDataUrl: string,
  apiKey: string,
  model = VISION_MODEL
): Promise<RawTable[]> {
  const groq = new Groq({ apiKey });
  const PROMPT =
    'Transcribe every table on this page into valid JSON ONLY, no markdown, no prose. ' +
    'Format: {"columns": ["<header cell>", ...], "rows": [["<cell>", "<cell>", ...], ...]}. ' +
    'Preserve every number exactly as printed (commas, decimals, units). Empty cells are "". ' +
    'If there are multiple tables, return the largest one.';

  const run = async () => {
    const response = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0,
    });

    const content = response.choices?.[0]?.message?.content || '';
    const json = extractJsonBlock(content);
    const parsed = VisionTableSchema.parse(json);
    const rows = parsed.rows.filter((r) => r.length > 0);
    return rows.length > 0 ? [{ columns: parsed.columns, rows }] : [];
  };

  try {
    const result = await withRateLimitRetry(run, 2);
    // Budget the vision lane: image + prompt ≈ 1k tokens per page (order-of-magnitude, not exact)
    tokenBudgetManager.recordUsage(model, 1000 + estimateTokens(PROMPT));
    return result;
  } catch (err) {
    tokenBudgetManager.recordUsage(model, 1000);
    throw new Error(
      `Vision table extraction failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** Pull the first {...} JSON object out of an LLM reply (defends against stray prose). */
export function extractJsonBlock(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object in vision response');
  return JSON.parse(content.slice(start, end + 1));
}

// ---------------------------------------------------------------------------
// Step 3 — OCR (local, no rate limits)
// ---------------------------------------------------------------------------

export async function extractTablesWithOcr(imageDataUrl: string): Promise<RawTable[]> {
  try {
    const worker = await createWorker('eng', undefined, { workerPath: resolveTesseractWorkerPath() });
    try {
      const { data: { text } } = await worker.recognize(imageDataUrl);
      return parseLayoutTables(text);
    } finally {
      await worker.terminate().catch(() => {});
    }
  } catch (err) {
    console.error('[TableExtractor] Tesseract OCR failed:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

export interface TableLadderOptions {
  nativeText: string;
  imageDataUrl?: string;
  apiKey?: string;
  allowVision?: boolean;
}

/**
 * Run the cheapest-to-most-expensive ladder and return the best non-degraded result.
 * Vision is skipped when: no image, no API key, or vision explicitly disabled.
 * OCR is the exhaustion fallback — always local and free.
 */
export async function runTableLadder(opts: TableLadderOptions): Promise<TableExtractionResult> {
  // Step 1 — layout
  const layoutTables = parseLayoutTables(opts.nativeText);
  const layoutQuality = validateTableQuality(layoutTables);
  if (layoutQuality >= QUALITY_GATES.layout && layoutTables.length > 0) {
    return { tables: layoutTables, detectedBy: 'layout', quality: layoutQuality };
  }

  // Step 2 — vision
  if (opts.allowVision !== false && opts.imageDataUrl && opts.apiKey) {
    try {
      const visionTables = await extractTablesWithVision(opts.imageDataUrl, opts.apiKey);
      const visionQuality = validateTableQuality(visionTables);
      if (visionQuality >= QUALITY_GATES.vision && visionTables.length > 0) {
        return { tables: visionTables, detectedBy: 'vision', quality: visionQuality };
      }
      // Vision succeeded but scored below gate → keep as degraded evidence, try OCR next
      if (visionTables.length > 0) {
        console.warn(`[TableLadder] Vision quality ${visionQuality.toFixed(2)} below gate ${QUALITY_GATES.vision} — falling through to OCR.`);
      }
    } catch (err) {
      console.warn('[TableLadder] Vision failed, falling through to OCR:', err instanceof Error ? err.message : err);
    }
  }

  // Step 3 — OCR
  if (opts.imageDataUrl) {
    try {
      const ocrTables = await extractTablesWithOcr(opts.imageDataUrl);
      const ocrQuality = validateTableQuality(ocrTables);
      if (ocrQuality >= QUALITY_GATES.ocr && ocrTables.length > 0) {
        return { tables: ocrTables, detectedBy: 'ocr', quality: ocrQuality };
      }
      if (ocrTables.length > 0) {
        return { tables: ocrTables, detectedBy: 'ocr', quality: ocrQuality };
      }
    } catch (err) {
      console.warn('[TableLadder] OCR failed:', err instanceof Error ? err.message : err);
    }
  }

  // Nothing passed — return whatever layout found so the caller can mark it degraded
  return {
    tables: layoutTables,
    detectedBy: 'layout',
    quality: layoutQuality,
    error: 'All table extraction steps failed to meet quality gates',
  };
}
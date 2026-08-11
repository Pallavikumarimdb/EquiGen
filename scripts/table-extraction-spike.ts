/**
 * Phase 0 table-extraction spike (provisional gates).
 *
 * Generates two fixture PDFs with a KNOWN ground-truth table:
 *   A — clean text-based export (the common case for modern filings)
 *   B — image-only page (simulates a scanned filing)
 *
 * Then measures the ladder's accuracy per step:
 *   layout (free heuristics) on A; vision + OCR on B.
 * Metrics: cell-level precision / recall against ground truth (numeric cells, Indian formats).
 * Results → public/temp/spike-results.json + console summary.
 *
 * The accuracy gates in QUALITY_GATES are PROVISIONAL — set from this spike's output and
 * meant to be recalibrated from reviewer-correction telemetry after ~30 real documents.
 *
 * Run: pnpm spike:table   (vision step needs GROQ_API_KEY set)
 */

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

/** Minimal .env loader — tsx/scripts don't auto-load Next.js env files. */
function loadEnvFile(file = path.join(process.cwd(), '.env')): void {
  try {
    const content = fsSync.readFileSync(file, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    /* no .env — fine, env vars may already be set */
  }
}
loadEnvFile();
import { PDFExtractor } from '../src/lib/parsers/pdf-extractor';
import {
  parseLayoutTables,
  validateTableQuality,
  extractTablesWithVision,
  extractTablesWithOcr,
  RawTable,
  parseIndianNumber,
  QUALITY_GATES,
} from '../src/lib/parsers/table-extractor';

interface GroundTruth {
  name: string;
  columns: string[];
  rows: string[][];
}

const GROUND_TRUTH: GroundTruth = {
  name: 'Profit & Loss extract (FY25/FY24)',
  columns: ['Particulars', 'FY25', 'FY24'],
  rows: [
    ['Revenue from operations', '12,345.67', '10,987.65'],
    ['Other income', '234.50', '198.20'],
    ['Total revenue', '12,580.17', '11,185.85'],
    ['Expenses', '10,234.56', '9,876.54'],
    ['Profit before tax', '2,345.61', '1,309.31'],
    ['Net profit', '1,756.20', '982.45'],
  ],
};

const HTML_TABLES = `
<div style="font-family: Arial, sans-serif; font-size: 11px; padding: 20px;">
  <h3>Statement of Profit and Loss</h3>
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse;">
    <tr><th align="left">Particulars</th><th align="right">FY25</th><th align="right">FY24</th></tr>
    ${GROUND_TRUTH.rows
    .map(
      (r) =>
        `<tr><td>${r[0]}</td><td align="right">${r[1]}</td><td align="right">${r[2]}</td></tr>`
    )
    .join('')}
  </table>
  <p style="height: 40px;"></p>
  <h3>Segmental Revenue</h3>
  <table border="1" cellspacing="0" cellpadding="6" style="border-collapse: collapse;">
    <tr><th align="left">Segment</th><th align="right">FY25</th></tr>
    <tr><td>Domestic</td><td align="right">9,876.00</td></tr>
    <tr><td>Exports</td><td align="right">2,469.67</td></tr>
  </table>
</div>
`;

const OUT_DIR = path.join(process.cwd(), 'public', 'temp', 'spike-fixtures');
const RESULT_PATH = path.join(process.cwd(), 'public', 'temp', 'spike-results.json');

/** Numeric cells of the first table only (segmental table excluded for tight measurement). */
function expectedNumericCells(gt: GroundTruth): string[] {
  return gt.rows.flatMap((r) => r.slice(1));
}

function normalizedValues(cells: string[]): number[] {
  return cells.map(parseIndianNumber).filter((v): v is number => v !== null);
}

function measure(parsedTables: RawTable[], expected: string[]): { precision: number; recall: number; found: number; correct: number; expectedCount: number; quality: number } {
  const foundValues = normalizedValues(parsedTables.flatMap((t) => t.rows.flatMap((r) => r.slice(1))));
  const expectedValues = normalizedValues(expected);
  const foundSet = new Set(foundValues.map((v) => v.toFixed(4)));
  const expectedSet = new Set(expectedValues.map((v) => v.toFixed(4)));
  let correct = 0;
  foundSet.forEach((v) => { if (expectedSet.has(v)) correct++; });
  const found = foundSet.size;
  const precision = found === 0 ? 0 : correct / found;
  const recall = expectedSet.size === 0 ? 0 : correct / expectedSet.size;
  return { precision, recall, found, correct, expectedCount: expectedSet.size, quality: validateTableQuality(parsedTables) };
}

async function generateFixtures(): Promise<{ fixtureA: Uint8Array; fixtureB: Uint8Array }> {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(HTML_TABLES);

    // Fixture A — text-based PDF (selectable text)
    const pdfA = await page.pdf({ format: 'A4', printBackground: true });

    // Fixture B — image-only page: screenshot the table area, embed the PNG as the only content
    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    const dataUrl = `data:image/png;base64,${Buffer.from(screenshot).toString('base64')}`;
    const imgPage = await browser.newPage();
    await imgPage.setContent(
      `<html><body style="margin:0;padding:0;"><img src="${dataUrl}" style="width: 100%;"/></body></html>`
    );
    const pdfB = await imgPage.pdf({ format: 'A4', printBackground: true });

    return { fixtureA: pdfA, fixtureB: pdfB };
  } finally {
    await browser.close();
  }
}

async function main() {
  const apiKey = process.env.GROQ_API_KEY || '';
  const results: {
    fixture: string;
    generatedAt: string;
    gates: typeof QUALITY_GATES;
    steps: Record<string, unknown>;
    scanned?: unknown;
  } = {
    fixture: GROUND_TRUTH.name,
    generatedAt: new Date().toISOString(),
    gates: QUALITY_GATES,
    steps: {},
  };

  await fs.mkdir(OUT_DIR, { recursive: true });
  const { fixtureA, fixtureB } = await generateFixtures();

  const expected = expectedNumericCells(GROUND_TRUTH);
  const extractor = new PDFExtractor();

  // NOTE: write fixture files AFTER measurement — Node ≥22 detaches the underlying
  // ArrayBuffer of a Uint8Array passed to fs.writeFile (zero-copy transfer to the threadpool).

  // --- Fixture A: layout step over native text ---
  {
    const cleanArrayBuffer = fixtureA.buffer.slice(fixtureA.byteOffset, fixtureA.byteOffset + fixtureA.byteLength);
    const pages = await extractor.extractPages(new Uint8Array(cleanArrayBuffer));
    const t0 = Date.now();
    const tables = parseLayoutTables(pages.map((p) => p.nativeText).join('\n'));
    const m = measure(tables, expected);
    const elapsed = Date.now() - t0;
    console.log(`[layout on text PDF] precision=${m.precision.toFixed(3)} recall=${m.recall.toFixed(3)} quality=${m.quality.toFixed(3)} (${elapsed}ms) — gate ${QUALITY_GATES.layout} → ${m.quality >= QUALITY_GATES.layout ? 'PASS' : 'FAIL'}`);
    results.steps['layout-text'] = { ...m, elapsedMs: elapsed, pass: m.quality >= QUALITY_GATES.layout };
  }

  // --- Fixture B: image-only page (scanned simulation) ---
  {
    // pdf.js DETACHES the ArrayBuffer it reads (worker transfer) — one independent copy per consumer.
    const cleanForText = fixtureB.buffer.slice(fixtureB.byteOffset, fixtureB.byteOffset + fixtureB.byteLength);
    const cleanForRender = fixtureB.buffer.slice(fixtureB.byteOffset, fixtureB.byteOffset + fixtureB.byteLength);
    const pages = await extractor.extractPages(new Uint8Array(cleanForText));
    const nativeText = pages.map((p) => p.nativeText).join('\n');
    console.log(`[scanned fixture] native text length: ${nativeText.length} chars — ${pages.every((p) => p.isScanned) ? 'detected as scanned ✓' : 'WARNING: not flagged scanned'}`);

    const imgDataUrl = await extractor.renderPageToImage(new Uint8Array(cleanForRender), 1);
    results.scanned = { nativeTextLength: nativeText.length, pageCount: pages.length };

    // vision step (needs key)
    if (apiKey) {
      const t0 = Date.now();
      try {
        const tables = await extractTablesWithVision(imgDataUrl, apiKey);
        const m = measure(tables, expected);
        const elapsed = Date.now() - t0;
        console.log(`[vision on scanned PDF] precision=${m.precision.toFixed(3)} recall=${m.recall.toFixed(3)} quality=${m.quality.toFixed(3)} (${elapsed}ms) — gate ${QUALITY_GATES.vision} → ${m.quality >= QUALITY_GATES.vision ? 'PASS' : 'FAIL'}`);
        results.steps['vision-scanned'] = { ...m, elapsedMs: elapsed, pass: m.quality >= QUALITY_GATES.vision };
      } catch (err) {
        console.warn('[vision on scanned PDF] failed:', err instanceof Error ? err.message : err);
        results.steps['vision-scanned'] = { error: err instanceof Error ? err.message : String(err) };
      }
    } else {
      console.warn('[vision on scanned PDF] skipped — GROQ_API_KEY not set');
      results.steps['vision-scanned'] = { skipped: 'GROQ_API_KEY not set' };
    }

    // ocr step (local)
    {
      const t0 = Date.now();
      try {
        const tables = await extractTablesWithOcr(imgDataUrl);
        const m = measure(tables, expected);
        const elapsed = Date.now() - t0;
        console.log(`[ocr on scanned PDF] precision=${m.precision.toFixed(3)} recall=${m.recall.toFixed(3)} quality=${m.quality.toFixed(3)} (${elapsed}ms) — gate ${QUALITY_GATES.ocr} → ${m.quality >= QUALITY_GATES.ocr ? 'PASS' : 'FAIL'}`);
        results.steps['ocr-scanned'] = { ...m, elapsedMs: elapsed, pass: m.quality >= QUALITY_GATES.ocr };
      } catch (err) {
        console.warn('[ocr on scanned PDF] failed:', err instanceof Error ? err.message : err);
        results.steps['ocr-scanned'] = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  await fs.writeFile(RESULT_PATH, JSON.stringify(results, null, 2));
  await fs.writeFile(path.join(OUT_DIR, 'fixture-a-text.pdf'), fixtureA);
  await fs.writeFile(path.join(OUT_DIR, 'fixture-b-scanned.pdf'), fixtureB);
  console.log(`\nSpike results → ${RESULT_PATH}`);
  console.log('NOTE: these numbers set PROVISIONAL gates only — recalibrate from reviewer-correction telemetry after ~30 real documents.');
}

main().catch((err) => {
  console.error('Spike failed:', err);
  process.exit(1);
});
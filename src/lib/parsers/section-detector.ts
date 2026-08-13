/**
 * section-detector.ts — deterministic, zero-AI-token targeting for large PDFs.
 *
 * Annual reports are highly standardized (SEBI/ICAI conventions), so the pages that matter
 * can be located with header regexes + table-density scoring before any LLM work happens.
 * The detector emits a confidence score per target class and a verdict that drives the
 * fallback ladder:
 *
 *   ok             → ≥2 of the 4 core financial markers found → target normally
 *   ocr_recheck    → markers missing but scanned pages present → OCR those pages, re-detect
 *   full_document  → markers missing on a text-rich document → fall back to page-chunked
 *                    extraction over everything (report flagged lowTargetingConfidence)
 *   blocked        → document contains (almost) no readable text at all → fail loudly,
 *                    never silently produce a report missing the financial statements
 *
 * The confidence numbers are provisional Phase 0 gates; they are meant to be recalibrated
 * from reviewer-correction telemetry after ~30 real documents (see plan).
 */

export interface PageInput {
  pageNo: number;
  text: string;
  /** true when native text extraction yielded ~nothing (likely scanned page) */
  isScanned?: boolean;
}

export interface SectionMap {
  /** Pages holding the standalone/consolidated financial statements */
  financials: number[];
  /** Pages holding narrative sections (MD&A, directors' report, overviews) */
  narrative: number[];
  /** Narrative pages with elevated risk/outlook/competition keywords (SWOT candidates) */
  swotCandidates: number[];
}

export interface SectionConfidence {
  /** 0..1 — coverage of the 4 core statement markers (balance sheet / P&L / cash flow / notes) */
  financials: number;
  /** 0..1 — presence of narrative section headers */
  narrative: number;
}

export type TargetingVerdict =
  "ok" | "ocr_recheck" | "full_document" | "blocked";

export interface TargetingResult {
  map: SectionMap;
  confidence: SectionConfidence;
  verdict: TargetingVerdict;
  /** Which of the 4 core statement markers were NOT found anywhere */
  missingCoreMarkers: string[];
  /** Pages flagged as scanned (native text below threshold) — candidates for OCR */
  scannedPages: number[];
}

// --- Core financial statement markers (ICAI/SEBI naming variants) ---

const CORE_MARKERS = [
  {
    key: "balance_sheet",
    label: "Balance Sheet",
    re: /\b(?:statement of\s+)?balance\s*sheet\b/i,
  },
  {
    key: "profit_loss",
    label: "Statement of Profit and Loss",
    re: /\b(?:statement of\s+)?profit\s*(?:and|&)\s*loss\b/i,
  },
  {
    key: "cash_flow",
    label: "Cash Flow Statement",
    re: /\b(?:statement of\s+)?cash\s*flows?\b/i,
  },
  {
    key: "notes",
    label: "Notes to Financial Statements",
    re: /\bnotes?\s+to\s+(?:accounts|(?:the\s+)?financial\s*statements)\b/i,
  },
] as const;

const FINANCIAL_WRAPPER_RE =
  /\b(?:standalone|consolidated)\s+financial\s*statements\b/i;

const NARRATIVE_HEADER_RES = [
  /\bmanagement\s+discussion\s*(?:and|&)\s*analysis\b/i,
  /\b(?:directors?'?\s*report|chairman'?s\s*(?:message|letter|statement|address))\b/i,
  /\b(?:business|corporate)\s*(?:overview|review)\b/i,
  /\bcompany\s*overview\b/i,
  /\babout\s+the\s+company\b/i,
];

const SWOT_SIGNAL_WORDS = [
  "opportunity",
  "opportunities",
  "risk",
  "risks",
  "outlook",
  "competition",
  "competitive",
  "market position",
  "growth",
  "strategy",
  "threats",
  "weaknesses",
  "strengths",
  "expansion",
  "segment",
];

const MIN_TEXT_THRESHOLD = 100;

/** Heuristic table-density: fraction of lines carrying ≥2 numeric-ish tokens (1,234 / 12.5% / ₹). */
export function estimateTableDensity(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3);
  if (lines.length === 0) return 0;
  const numericish = /(?:[₹$€]\s*)?-?\d{1,3}(?:,\d{3})*(?:\.\d+)?%?/;
  let tableLines = 0;
  for (const line of lines) {
    const tokens = line.split(/\s{2,}|\t/);
    let numericCount = 0;
    for (const token of tokens) {
      if (numericish.test(token) && token.replace(/[^0-9]/g, "").length >= 1)
        numericCount++;
    }
    if (numericCount >= 2) tableLines++;
  }
  return tableLines / lines.length;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Locate the sections that matter in a parsed document, with confidence + verdict.
 * Pure function — no I/O, no AI — easy to unit test and cheap to run on 500 pages.
 */
export function detectSections(pages: PageInput[]): TargetingResult {
  const map: SectionMap = { financials: [], narrative: [], swotCandidates: [] };
  const foundMarkers = new Set<string>();
  const scannedPages: number[] = [];
  let totalWords = 0;

  for (const page of pages) {
    const text = page.text || "";
    totalWords += countWords(text);
    const isScanned = page.isScanned ?? text.trim().length < MIN_TEXT_THRESHOLD;
    if (isScanned) scannedPages.push(page.pageNo);

    // Financial markers on this page?
    let financialHit = false;
    for (const marker of CORE_MARKERS) {
      if (marker.re.test(text)) {
        foundMarkers.add(marker.key);
        financialHit = true;
      }
    }

    const tableDensity = estimateTableDensity(text);
    const hasTables = tableDensity >= 0.15;
    const statementLike = financialHit || hasTables;

    if (
      financialHit ||
      FINANCIAL_WRAPPER_RE.test(text) ||
      (hasTables && tableDensity >= 0.3)
    ) {
      map.financials.push(page.pageNo);
      continue; // statement pages are not narrative pages
    }

    const isNarrative = NARRATIVE_HEADER_RES.some((re) => re.test(text));
    if (isNarrative) {
      map.narrative.push(page.pageNo);
    }

    // SWOT candidate: narrative-ish pages with keyword signals
    const lower = text.toLowerCase();
    const signalCount = SWOT_SIGNAL_WORDS.filter((w) =>
      lower.includes(w),
    ).length;
    if (statementLike || signalCount >= 2) {
      map.swotCandidates.push(page.pageNo);
    }
  }

  // --- Confidence + verdict ---

  const missingCoreMarkers = CORE_MARKERS.map((m) => m.key)
    .filter((key) => !foundMarkers.has(key))
    .map((key) => key);

  const financialsConfidence = foundMarkers.size / CORE_MARKERS.length;
  const narrativeConfidence =
    map.narrative.length >= 2
      ? 1
      : map.narrative.length === 1
        ? 0.6
        : map.swotCandidates.length > 0
          ? 0.3
          : 0;

  let verdict: TargetingVerdict;
  if (foundMarkers.size >= 2) {
    verdict = "ok";
  } else if (scannedPages.length > 0) {
    // Text may exist in images — OCR the scanned pages, then re-detect
    verdict = "ocr_recheck";
  } else if (totalWords < 1) {
    // No text anywhere and nothing to OCR — a blank/empty PDF; fail loudly
    verdict = "blocked";
  } else {
    verdict = "full_document";
  }

  return {
    map,
    confidence: {
      financials: financialsConfidence,
      narrative: narrativeConfidence,
    },
    verdict,
    missingCoreMarkers,
    scannedPages,
  };
}

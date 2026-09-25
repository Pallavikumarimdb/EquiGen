/**
 * Pipeline Eval — RC-9 Reliability Fix
 *
 * Production-grade evaluation suite for EquiGen's autonomous agent pipeline.
 * Tests REAL data quality outcomes, not just tool routing:
 *
 *   1. Live data gate       — did Yahoo Finance return isLiveData=true?
 *   2. Fallback detection   — was the sector fallback used? (always a FAIL)
 *   3. Revenue sanity       — within tolerance of golden example?
 *   4. Market cap sanity    — within tolerance of golden example?
 *   5. Target price gate    — baseTargetPrice > 0? (0 = fallback sentinel)
 *   6. Section completeness — all 6 sections > 100 chars each?
 *   7. Data freshness       — fetchedAt within last 24 hours?
 *   8. Hardcoded fallback   — baseRevenue != 10000? ebitdaMargin != 0.18?
 *
 * Usage:
 *   import { pipelineEval } from "@/lib/eval/pipeline-eval";
 *   const report = await pipelineEval.run("RELIANCE", agentRunOutput);
 *   // or via API: GET /api/eval/run?ticker=RELIANCE
 */

import { ExtractedFinancials } from "@/lib/ai/tools/yahoo-financials-tool";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoldenMetricRange {
  valueMinCr?: number;
  valueMaxCr?: number;
  valueMin?: number;
  valueMax?: number;
  label: string;
}

export interface GoldenExample {
  _meta: { ticker: string; companyName: string; fiscalYear: string; source: string };
  revenue?: GoldenMetricRange;
  marketCap?: GoldenMetricRange;
  ebitdaMargin?: GoldenMetricRange;
  trailingPE?: GoldenMetricRange;
  beta?: GoldenMetricRange;
  currentPrice?: GoldenMetricRange;
}

export type EvalStatus = "PASS" | "FAIL" | "WARN" | "SKIP";

export interface EvalCheckResult {
  name: string;
  status: EvalStatus;
  detail: string;
  expected?: string;
  got?: string | number | null;
}

export interface PipelineEvalReport {
  ticker: string;
  timestamp: string;
  overallStatus: "PASS" | "FAIL" | "WARN";
  checks: EvalCheckResult[];
  score: number;           // 0–100: % of non-SKIP checks passing
  dataQualityScore: number; // 0–1: fraction of live sources
  hasFallbackData: boolean; // true = sector fallback was used (critical failure)
  recommendation: string;   // human-readable summary for analyst
}

// Agent output shape we evaluate against
export interface AgentRunSnapshot {
  yahoo?: ExtractedFinancials | null;
  modelingDataQuality?: {
    isDerivedFromRealData: boolean;
    financialSource: string;
    baseRevenue: number;
    disclaimer: string | null;
  };
  modelOutput?: {
    baseTargetPrice?: number;
    assumptions?: {
      ebitdaMargin?: string;
      revenueGrowthRate?: string;
      isDerivedFromExtractedData?: string;
    };
  };
  sections?: Array<{ name: string; content: string }>;
  dataSources?: {
    bseNseFilings?: { isLive: boolean; count: number };
    concallTranscript?: { isLive: boolean; quotesFound: number };
    screenerMarketData?: { isLive: boolean };
    creditRating?: { isLive: boolean; found: boolean };
    news?: { isLive: boolean; count: number };
    dcfModel?: { isDerivedFromRealData: boolean; source: string };
  };
}

// ─── Golden Example Loader ────────────────────────────────────────────────────

// Static imports of golden examples (avoids runtime fs reads in Next.js serverless)
import relianceGolden from "./golden-examples/RELIANCE_golden.json";
import tcsGolden from "./golden-examples/TCS_golden.json";
import hdfcbankGolden from "./golden-examples/HDFCBANK_golden.json";

const GOLDEN_EXAMPLES: Record<string, GoldenExample> = {
  RELIANCE:  relianceGolden as GoldenExample,
  TCS:       tcsGolden as GoldenExample,
  HDFCBANK:  hdfcbankGolden as GoldenExample,
};

// ─── Individual Check Implementations ────────────────────────────────────────

function checkLiveData(snapshot: AgentRunSnapshot): EvalCheckResult {
  const isLive = snapshot.yahoo?.isLiveData === true;
  const source = snapshot.yahoo?.dataSource ?? "none";
  return {
    name: "Live Data Gate",
    status: isLive ? "PASS" : "FAIL",
    detail: isLive
      ? `Yahoo Finance returned live data (source: ${source})`
      : `Yahoo Finance isLiveData=false — all data paths failed. Source: ${source || "none"}`,
    got: isLive ? source : "isLiveData=false",
  };
}

function checkFallbackDetection(snapshot: AgentRunSnapshot): EvalCheckResult {
  const source = snapshot.modelingDataQuality?.financialSource ?? "unknown";
  const isFallback = source === "sector_fallback" || snapshot.modelingDataQuality?.isDerivedFromRealData === false;
  return {
    name: "Sector Fallback Detection",
    status: isFallback ? "FAIL" : "PASS",
    detail: isFallback
      ? `⚠️ CRITICAL: Sector fallback used (source: ${source}). Model outputs are generic, not company-specific.`
      : `Real financial data used (source: ${source})`,
    got: source,
  };
}

function checkRevenueSanity(ticker: string, snapshot: AgentRunSnapshot): EvalCheckResult {
  const golden = GOLDEN_EXAMPLES[ticker];
  if (!golden?.revenue) {
    return { name: "Revenue Sanity", status: "SKIP", detail: "No golden example for this ticker." };
  }

  const actual = snapshot.yahoo?.revenueCr ?? snapshot.modelingDataQuality?.baseRevenue;
  if (actual == null) {
    return { name: "Revenue Sanity", status: "FAIL", detail: "revenueCr is null — no revenue data available.", got: null };
  }

  const min = golden.revenue.valueMinCr ?? 0;
  const max = golden.revenue.valueMaxCr ?? Infinity;
  const inRange = actual >= min && actual <= max;

  return {
    name: "Revenue Sanity",
    status: inRange ? "PASS" : "FAIL",
    detail: inRange
      ? `Revenue ₹${actual.toLocaleString("en-IN")} Cr is within expected range`
      : `Revenue ₹${actual.toLocaleString("en-IN")} Cr is OUTSIDE expected range`,
    expected: `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")} Cr`,
    got: actual,
  };
}

function checkMarketCapSanity(ticker: string, snapshot: AgentRunSnapshot): EvalCheckResult {
  const golden = GOLDEN_EXAMPLES[ticker];
  if (!golden?.marketCap) {
    return { name: "Market Cap Sanity", status: "SKIP", detail: "No golden example for this ticker." };
  }

  const actual = snapshot.yahoo?.marketCapCr;
  if (actual == null) {
    return { name: "Market Cap Sanity", status: "FAIL", detail: "marketCapCr is null — market data unavailable.", got: null };
  }

  const min = golden.marketCap.valueMinCr ?? 0;
  const max = golden.marketCap.valueMaxCr ?? Infinity;
  const inRange = actual >= min && actual <= max;

  return {
    name: "Market Cap Sanity",
    status: inRange ? "PASS" : "FAIL",
    detail: inRange
      ? `Market Cap ₹${actual.toLocaleString("en-IN")} Cr is within expected range`
      : `Market Cap ₹${actual.toLocaleString("en-IN")} Cr is OUTSIDE expected range`,
    expected: `₹${min.toLocaleString("en-IN")} – ₹${max.toLocaleString("en-IN")} Cr`,
    got: actual,
  };
}

function checkTargetPriceGate(snapshot: AgentRunSnapshot): EvalCheckResult {
  const tp = snapshot.modelOutput?.baseTargetPrice;

  if (tp == null) {
    return { name: "Target Price Gate", status: "WARN", detail: "No model output available (modeling step may not have run).", got: null };
  }
  if (tp === 0) {
    return {
      name: "Target Price Gate",
      status: "FAIL",
      detail: "baseTargetPrice = 0 (sentinel value — sector fallback was used). Report must NOT display a target price.",
      got: 0,
    };
  }
  return {
    name: "Target Price Gate",
    status: "PASS",
    detail: `Target price ₹${tp.toLocaleString("en-IN")}/share is derived from real data.`,
    got: tp,
  };
}

function checkSectionCompleteness(snapshot: AgentRunSnapshot): EvalCheckResult {
  const requiredSections = [
    "executive_summary",
    "business_description",
    "financial_analysis",
    "valuation",
    "key_risks",
    "management_qa_highlights",
  ];

  if (!snapshot.sections || snapshot.sections.length === 0) {
    return { name: "Section Completeness", status: "FAIL", detail: "No sections generated.", got: "0/6 sections" };
  }

  const sectionMap = new Map(snapshot.sections.map((s) => [s.name, s.content]));
  const problems: string[] = [];

  for (const name of requiredSections) {
    const content = sectionMap.get(name) ?? "";
    if (content.length < 100) {
      problems.push(`${name} (${content.length} chars)`);
    } else if (content.includes("data pending")) {
      problems.push(`${name} (contains "data pending" placeholder)`);
    }
  }

  const found = requiredSections.length - problems.length;
  return {
    name: "Section Completeness",
    status: problems.length === 0 ? "PASS" : problems.length <= 2 ? "WARN" : "FAIL",
    detail: problems.length === 0
      ? `All ${requiredSections.length} sections generated with sufficient content.`
      : `${problems.length} section(s) need improvement: ${problems.join(", ")}`,
    got: `${found}/${requiredSections.length}`,
  };
}

function checkDataFreshness(snapshot: AgentRunSnapshot): EvalCheckResult {
  const fetchedAt = snapshot.yahoo?.fetchedAt;
  if (!fetchedAt) {
    return { name: "Data Freshness", status: "WARN", detail: "No fetchedAt timestamp — cannot verify freshness." };
  }

  const ageMs = Date.now() - new Date(fetchedAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  const isStale = ageHours > 24;

  return {
    name: "Data Freshness",
    status: isStale ? "WARN" : "PASS",
    detail: isStale
      ? `Data is ${ageHours.toFixed(1)}h old — fetched at ${fetchedAt}. Refresh for intraday analysis.`
      : `Data is fresh (${ageHours.toFixed(1)}h old).`,
    got: `${ageHours.toFixed(1)}h ago`,
  };
}

function checkHardcodedFallback(snapshot: AgentRunSnapshot): EvalCheckResult {
  const baseRevenue = snapshot.modelingDataQuality?.baseRevenue;
  const problems: string[] = [];

  if (baseRevenue === 10000) {
    problems.push("baseRevenue = ₹10,000 Cr (generic fallback constant)");
  }

  // Parse assumption strings from model output
  const assumptions = snapshot.modelOutput?.assumptions;
  if (assumptions?.ebitdaMargin === "18.0%") {
    problems.push("ebitdaMargin = 18.0% (hardcoded sector average)");
  }
  if (assumptions?.revenueGrowthRate === "12.0%") {
    problems.push("revenueGrowthRate = 12.0% (hardcoded sector average)");
  }

  return {
    name: "Hardcoded Fallback Detection",
    status: problems.length === 0 ? "PASS" : "FAIL",
    detail: problems.length === 0
      ? "No hardcoded fallback constants detected — model inputs are company-specific."
      : `Hardcoded fallback detected: ${problems.join("; ")}`,
    got: problems.length === 0 ? "None detected" : problems.join(", "),
  };
}

function checkLiveSourceCount(snapshot: AgentRunSnapshot): EvalCheckResult {
  const ds = snapshot.dataSources;
  if (!ds) {
    return { name: "Live Source Count", status: "WARN", detail: "No dataSources summary available." };
  }

  const liveFlags = [
    ds.bseNseFilings?.isLive,
    ds.concallTranscript?.isLive,
    ds.screenerMarketData?.isLive,
    ds.creditRating?.isLive,
    ds.news?.isLive,
    ds.dcfModel?.isDerivedFromRealData,
  ];
  const liveCount = liveFlags.filter(Boolean).length;
  const total = liveFlags.length;
  const status: EvalStatus = liveCount >= 3 ? "PASS" : liveCount >= 1 ? "WARN" : "FAIL";

  return {
    name: "Live Source Count",
    status,
    detail: `${liveCount}/${total} data sources are live.`,
    expected: "≥ 3/6",
    got: `${liveCount}/${total}`,
  };
}

// ─── Pipeline Eval Service ────────────────────────────────────────────────────

export class PipelineEvalService {
  /**
   * Runs the full eval suite against a snapshot of agent output.
   * Call after every autonomous run to measure reliability.
   */
  public async run(ticker: string, snapshot: AgentRunSnapshot): Promise<PipelineEvalReport> {
    const upper = ticker.toUpperCase();
    const timestamp = new Date().toISOString();

    const checks: EvalCheckResult[] = [
      checkLiveData(snapshot),
      checkFallbackDetection(snapshot),
      checkRevenueSanity(upper, snapshot),
      checkMarketCapSanity(upper, snapshot),
      checkTargetPriceGate(snapshot),
      checkSectionCompleteness(snapshot),
      checkDataFreshness(snapshot),
      checkHardcodedFallback(snapshot),
      checkLiveSourceCount(snapshot),
    ];

    // Score: % of non-SKIP checks passing
    const applicable = checks.filter((c) => c.status !== "SKIP");
    const passed = applicable.filter((c) => c.status === "PASS").length;
    const score = applicable.length > 0 ? Math.round((passed / applicable.length) * 100) : 0;

    // Data quality score (0–1) for UI badge
    const ds = snapshot.dataSources;
    const liveSources = ds ? [
      ds.bseNseFilings?.isLive,
      ds.concallTranscript?.isLive,
      ds.screenerMarketData?.isLive,
      ds.creditRating?.isLive,
      ds.news?.isLive,
      ds.dcfModel?.isDerivedFromRealData,
    ].filter(Boolean).length : 0;
    const dataQualityScore = liveSources / 6;

    const hasFallbackData = snapshot.modelingDataQuality?.isDerivedFromRealData === false;

    // Overall status
    const hasFail = checks.some((c) => c.status === "FAIL");
    const hasWarn = checks.some((c) => c.status === "WARN");
    const overallStatus = hasFail ? "FAIL" : hasWarn ? "WARN" : "PASS";

    // Human-readable recommendation
    let recommendation: string;
    if (hasFallbackData) {
      recommendation = "⛔ CRITICAL: This report used sector-average fallback data. Do NOT publish or share with clients. Fix Yahoo Finance data fetching first.";
    } else if (score < 60) {
      recommendation = `⚠️ WARN: Report quality score is ${score}%. Review failing checks before publishing.`;
    } else if (score < 85) {
      recommendation = `⚠️ WARN: Report quality score is ${score}%. Some data gaps exist — add disclaimers for sections marked 'data pending'.`;
    } else {
      recommendation = `✅ PASS: Report quality score is ${score}%. Data appears reliable — standard review applies before publication.`;
    }

    // Log to terminal
    console.log(`\n[PipelineEval] ══════════════════════════════════════════════`);
    console.log(`[PipelineEval] Eval Report for ${upper} | Score: ${score}% | ${overallStatus}`);
    for (const c of checks) {
      const icon = c.status === "PASS" ? "✓" : c.status === "FAIL" ? "✗" : c.status === "WARN" ? "⚠" : "–";
      console.log(`[PipelineEval]   ${icon} [${c.status.padEnd(4)}] ${c.name}: ${c.detail}`);
    }
    console.log(`[PipelineEval] ${recommendation}`);
    console.log(`[PipelineEval] ══════════════════════════════════════════════\n`);

    return {
      ticker: upper,
      timestamp,
      overallStatus,
      checks,
      score,
      dataQualityScore,
      hasFallbackData,
      recommendation,
    };
  }
}

export const pipelineEval = new PipelineEvalService();

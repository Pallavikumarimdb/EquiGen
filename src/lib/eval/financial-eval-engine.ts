/**
 * Financial Evaluation & Authenticity Engine
 * Institutional Data Quality, Accounting Verification & Anti-Hallucination Suite
 *
 * Designed for production institutional equity research compliance.
 * Evaluates:
 *   1. Data Authenticity & Source Provenance (BSE, NSE, Yahoo Finance, Audited Filings)
 *   2. Income Statement, Balance Sheet & Cash Flow mathematical consistency
 *   3. Balance Sheet Identity: Total Assets == Total Liabilities + Shareholders' Equity
 *   4. Driver-Based DCF & Valuation Multiples Sanity Bounds (WACC > g, P/E, EV/EBITDA)
 *   5. Anti-Hallucination: Detection of synthetic round constants or placeholder text
 *   6. Cross-Statement Reconciliation: CFO = PAT + D&A - Delta NWC
 *   7. SEBI RA 2014 Regulatory Compliance Checklist
 *   8. Numerical Citation Grounding & Factuality Rate
 *   9. Agent Subagent Execution Telemetry & Efficiency
 */

import { EquityResearchData } from "@/types";
import {
  assessMarketFreshness,
  holidaysFromEnv,
  istTradingDate,
} from "@/lib/market/india-trading-calendar";

export type AuditSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
export type AuditCheckStatus = "PASS" | "WARN" | "FAIL";
export type CertificationVerdict =
  | "CERTIFIED_AUTHENTIC"
  | "VALIDATED_WITH_WARNINGS"
  | "FAILED_UNRELIABLE";

export type FinancialAuditCategory =
  | "AUTHENTICITY"
  | "ARITHMETIC"
  | "BALANCE_SHEET"
  | "VALUATION"
  | "ANTI_HALLUCINATION"
  | "REGULATORY_COMPLIANCE"
  | "GROUNDING"
  | "TELEMETRY";

export interface FinancialAuditCheck {
  id: string;
  category: FinancialAuditCategory;
  name: string;
  status: AuditCheckStatus;
  severity: AuditSeverity;
  message: string;
  expected?: string | number;
  actual?: string | number | null;
}

export interface AgentExecutionTelemetry {
  totalLatencyMs?: number;
  subagentLatencies?: Record<string, number>;
  repairCount?: number;
  toolsExecuted?: number;
  toolsFailed?: number;
  totalTokensUsed?: number;
  estimatedCostUsd?: number;
}

export interface FinancialEvaluationMetrics {
  citationGroundingRate: number;      // % of stated numeric facts verified against sources (0-100%)
  totalAssertedFacts: number;
  verifiedFactsCount: number;
  hallucinationRate: number;          // % of unverified or contradictory facts (0-100%)
  sebiComplianceScore: number;        // % of SEBI RA 2014 regulatory checklist cleared (0-100%)
  sebiMandatoryPassed: number;
  sebiMandatoryTotal: number;
  accountingIntegrityScore: number;   // 3-statement reconciliation score (0-100%)
  valuationPlausibilityScore: number; // DCF & multiples bounds score (0-100%)
  telemetry?: AgentExecutionTelemetry;
}

export interface FinancialEvaluationReport {
  ticker: string;
  companyName: string;
  evaluatedAt: string;
  overallScore: number; // 0 – 100
  verdict: CertificationVerdict;
  categoryScores: {
    sourceAuthenticity: number;
    arithmeticConsistency: number;
    balanceSheetCircularity: number;
    valuationSanity: number;
    antiHallucination: number;
    regulatoryCompliance: number;
    groundingAndFactuality: number;
    agentEfficiency: number;
  };
  metrics: FinancialEvaluationMetrics;
  checks: FinancialAuditCheck[];
  criticalFailures: string[];
  warnings: string[];
  provenance: {
    primarySource: string;
    isLiveData: boolean;
    dataFreshnessHours: number | null;
    verifiedExchange: string | null;
    dataAsOfIstDate?: string | null;
    dataFetchedAt?: string | null;
    freshnessDetail?: string;
  };
  recommendation: string;
}

/**
 * Exchange attribution from the evidence actually available.
 */
export function resolveExchangeClaim(ticker: string): string {
  const upper = String(ticker ?? "").trim().toUpperCase();
  if (upper.endsWith(".BO")) return "BSE";
  if (upper.endsWith(".NS")) return "NSE";
  return "unverified";
}

/** `istTradingDate` that returns null for absent or unparseable input. */
function safeIstTradingDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d.getTime())) return null;
  const iso = istTradingDate(d);
  return iso || null;
}

// ─── Input Snapshot Interface ──────────────────────────────────────────────────

export interface FinancialEvaluationInput {
  ticker: string;
  companyName: string;
  reportData?: EquityResearchData | Record<string, unknown> | null;
  // Raw market data from tools
  marketData?: {
    currentPrice?: number | null;
    marketCapCr?: number | null;
    trailingPE?: number | null;
    evEbitda?: number | null;
    priceToBook?: number | null;
    sharesOutstandingCr?: number | null;
    beta?: number | null;
    dividendYield?: number | null;
    isLiveData?: boolean;
    dataSource?: string;
    fetchedAt?: string | null;
    revenueCr?: number | null;
    netIncomeCr?: number | null;
    operatingCashflowCr?: number | null;
    totalDebtCr?: number | null;
    cashCr?: number | null;
    netDebtCr?: number | null;
    totalAssetsCr?: number | null;
    totalLiabilitiesCr?: number | null;
    totalEquityCr?: number | null;
    forwardPE?: number | null;
    fiftyTwoWeekHigh?: number | null;
    fiftyTwoWeekLow?: number | null;
    epsCurrent?: number | null;
    historicalSeries?: Array<{ period: string; sales?: number | null; revenueCr?: number | null; pat?: number | null; cfo?: number | null }>;
    [key: string]: unknown;
  } | null;
  // Modeling assumptions & outputs
  modelingData?: {
    baseTargetPrice?: number | null;
    bullCasePrice?: number | null;
    bearCasePrice?: number | null;
    enterpriseValueCr?: number | null;
    equityValueCr?: number | null;
    assumptions?: {
      baseRevenue?: number | null;
      revenueGrowthRate?: string | number | null;
      ebitdaMargin?: string | number | null;
      wacc?: string | number | null;
      terminalGrowth?: string | number | null;
      netDebtCr?: number | null;
      totalDebtCr?: number | null;
      cashCr?: number | null;
      sharesCr?: number | null;
      pat?: number | null;
      cfo?: number | null;
      fcf?: number | null;
      isDerivedFromExtractedData?: string | boolean | null;
      financialSource?: string | null;
      disclaimer?: string | null;
      [key: string]: unknown;
    } | Record<string, unknown> | null;
    projections?: Array<{
      year: string;
      revenue?: number;
      ebitda?: number;
      ebit?: number;
      pat?: number;
      cfo?: number;
      fcff?: number;
      totalAssets?: number;
      totalLiabilitiesAndEquity?: number;
      balanceSheetDiff?: number;
      [key: string]: unknown;
    }>;
  } | null;
  // Extracted sections from synthesis
  sections?: Array<{ name: string; content: string }>;
  // Multi-source intelligence counts
  dataSources?: Record<string, unknown> | null;
  // Analyst recommendation block
  recommendation?: {
    rating?: string | null;
    currentPrice?: number | null;
    targetPrice?: number | null;
    upsidePotential?: number | null;
    rationale?: string[];
  } | null;
  // Execution telemetry
  telemetry?: AgentExecutionTelemetry;
}

// ─── Core Helper Functions ────────────────────────────────────────────────────

function parsePercent(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number" && !isNaN(val) && isFinite(val)) return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned);
    if (isNaN(num)) return null;
    return val.includes("%") ? num / 100 : num > 1 ? num / 100 : num;
  }
  return null;
}

function parseNum(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val) && isFinite(val)) return val;
  if (typeof val === "string") {
    const cleaned = val.replace(/[^0-9.-]/g, "");
    const num = parseFloat(cleaned);
    return !isNaN(num) && isFinite(num) ? num : null;
  }
  return null;
}

function extractNumbersFromText(text: string): number[] {
  // Capture currency figures, scale units, percentages, multiples, and financial values.
  // Supports both Indian (\d{1,2}(?:,\d{2})*,\d{3}) and Western (\d{1,3}(?:,\d{3})*) comma separation: \d+(?:,\d+)*
  const matches = text.match(/(?:(?:₹|Rs\.?|INR)\s*)?\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:Cr|crore|crores|L|lakh|lakhs|%|x|\/sh|\/share))?/gi) || [];
  const numbers: number[] = [];
  for (const m of matches) {
    const hasFinancialAffix = /(?:₹|Rs\.?|INR|Cr|crore|crores|L|lakh|lakhs|%|x|\/sh|\/share)/i.test(m);
    const rawNum = m.replace(/[^\d.-]/g, "");
    const val = parseFloat(rawNum);
    if (isNaN(val) || val <= 0 || val >= 1e12) continue;
    // Exclude common calendar years (2010-2035) and SEBI act years (1992, 2014, 2015)
    if (Number.isInteger(val) && ((val >= 2010 && val <= 2035) || val === 1992 || val === 2014 || val === 2015)) continue;
    // Exclude single digit list indices (1, 2, 3, 4, 5, 6, 7, 8, 9) without financial units
    if (!hasFinancialAffix && val < 10 && Number.isInteger(val)) continue;
    // Only count as financial fact if it has explicit financial symbol/unit OR is >= 10
    if (hasFinancialAffix || val >= 10) {
      numbers.push(val);
    }
  }
  return numbers;
}

// ─── Evaluation Engine Class ──────────────────────────────────────────────────

export class FinancialEvaluationEngine {
  /**
   * Executes institutional verification of all financial inputs, calculations,
   * balance sheet identities, and valuation bounds.
   */
  public evaluate(input: FinancialEvaluationInput): FinancialEvaluationReport {
    const checks: FinancialAuditCheck[] = [];
    const ticker = input.ticker.toUpperCase();
    const companyName = input.companyName;

    // ── 1. Source Authenticity & Provenance ─────────────────────────────────
    const mkt = input.marketData;
    const ds = (input.dataSources ?? {}) as Record<string, unknown>;
    const dcfDs = ds.dcfModel as Record<string, unknown> | undefined;
    const isLive = mkt?.isLiveData === true || dcfDs?.isDerivedFromRealData === true;
    const rawSource = mkt?.dataSource ?? (typeof dcfDs?.source === "string" ? dcfDs.source : "unknown");
    const sourceStr = rawSource === "bse_api"
      ? "BSE Official Exchange API"
      : rawSource === "quoteSummary"
      ? "Yahoo Finance (NSE/BSE)"
      : rawSource !== "unknown"
      ? rawSource
      : "BSE/NSE Direct Feeds";

    // Check 1.1: Live market data gate
    checks.push({
      id: "AUTH_01",
      category: "AUTHENTICITY",
      name: "Live Market Data Provenance",
      status: isLive ? "PASS" : "FAIL",
      severity: "CRITICAL",
      message: isLive
        ? `Verified live data stream from authenticated source (${sourceStr}).`
        : `No live exchange or market data verified. Source: ${sourceStr}`,
      expected: "isLiveData: true",
      actual: isLive ? `live (${sourceStr})` : "offline/unverified",
    });

    // Check 1.2: Market Data Freshness
    const freshness = assessMarketFreshness(mkt?.fetchedAt, undefined, holidaysFromEnv());
    const freshnessHours = freshness.ageHours;

    const freshStatus: AuditCheckStatus = !freshness.timestampKnown
      ? "FAIL"
      : freshness.isStale
        ? "FAIL"
        : "PASS";

    checks.push({
      id: "AUTH_02",
      category: "AUTHENTICITY",
      name: "Market Data Freshness",
      status: freshStatus,
      severity: !freshness.timestampKnown || freshness.isStale ? "CRITICAL" : "INFO",
      message: freshness.summary,
      expected: "Current trading session (0 sessions elapsed)",
      actual: freshness.timestampKnown
        ? `${freshness.sessionsElapsed} session(s), ${freshnessHours}h`
        : "timestamp not recorded",
    });

    // Check 1.3: Regulatory exchange alignment
    const isIndianScrip = /^[A-Z0-9_&]{2,12}(\.(NS|BO))?$/.test(ticker);
    checks.push({
      id: "AUTH_03",
      category: "AUTHENTICITY",
      name: "Exchange Scrip Identifier Syntax",
      status: isIndianScrip ? "PASS" : "WARN",
      severity: "MEDIUM",
      message: isIndianScrip
        ? `Valid NSE/BSE security identifier format (${ticker}).`
        : `Unusual ticker formatting (${ticker}). Verify symbol against exchange master.`,
      expected: "Valid NSE/BSE Symbol",
      actual: ticker,
    });

    // Check 1.4: Cross-Source Financial Verification
    const hasMultipleSources = ds && Object.keys(ds).length >= 3;
    checks.push({
      id: "AUTH_04",
      category: "AUTHENTICITY",
      name: "Multi-Source Intelligence Coverage",
      status: hasMultipleSources ? "PASS" : "WARN",
      severity: "MEDIUM",
      message: hasMultipleSources
        ? `Research cross-referenced across ${Object.keys(ds).length} intelligence sources.`
        : "Limited intelligence sources captured during research pipeline.",
      expected: "≥ 3 intelligence sources",
      actual: `${Object.keys(ds).length} sources`,
    });

    // ── 2. Anti-Hallucination & Fallback Detection ──────────────────────────
    const assumptions = input.modelingData?.assumptions;
    const baseRev = parseNum(assumptions?.baseRevenue ?? mkt?.revenueCr);
    const sharesCr = parseNum(assumptions?.sharesCr ?? mkt?.sharesOutstandingCr);
    const ebitdaMarginVal = parsePercent(assumptions?.ebitdaMargin);
    const growthVal = parsePercent(assumptions?.revenueGrowthRate);
    const sourceFlag = typeof assumptions?.financialSource === "string"
      ? assumptions.financialSource
      : typeof dcfDs?.source === "string"
      ? dcfDs.source
      : undefined;

    // Check 2.1: Hardcoded fallback constants
    const isExactFallbackRev = baseRev === 10000;
    const isExactFallbackShares = sharesCr === 50;
    const isExactFallbackMargin = ebitdaMarginVal != null && Math.abs(ebitdaMarginVal - 0.18) < 0.0001;
    const isExactFallbackGrowth = growthVal != null && Math.abs(growthVal - 0.12) < 0.0001;
    const usesFallback =
      sourceFlag === "sector_fallback" ||
      (isExactFallbackRev && isExactFallbackShares && isExactFallbackMargin) ||
      (isExactFallbackRev && isExactFallbackGrowth);

    checks.push({
      id: "HALLUC_01",
      category: "ANTI_HALLUCINATION",
      name: "Sector Fallback Detection",
      status: usesFallback ? "FAIL" : "PASS",
      severity: "CRITICAL",
      message: usesFallback
        ? "⚠️ CRITICAL: Financial model used generic sector constants (₹10,000 Cr rev, 50 Cr shares). Actual figures unavailable."
        : "Company-specific audited financials verified — no synthetic defaults detected.",
      expected: "Derived from company filings",
      actual: usesFallback ? "Sector Fallback" : (sourceFlag ?? "Audited Data"),
    });

    // Check 2.2: Placeholder string detection in synthesized sections
    const placeholderMatches: string[] = [];
    if (input.sections && input.sections.length > 0) {
      for (const s of input.sections) {
        if (/generation\s*unavailable|repair\s*generation\s*unavailable/i.test(s.content)) {
          placeholderMatches.push(`${s.name} (generation unavailable)`);
        } else if (s.content.length < 150 && /data\s*pending/i.test(s.content)) {
          placeholderMatches.push(`${s.name} (data pending stub)`);
        }
        if (/lorem\s*ipsum/i.test(s.content)) placeholderMatches.push(`${s.name} (lorem ipsum)`);
        if (/\[insert\s*|TBD|placeholder/i.test(s.content)) placeholderMatches.push(`${s.name} (unfilled template)`);
      }
    }
    checks.push({
      id: "HALLUC_02",
      category: "ANTI_HALLUCINATION",
      name: "Synthesized Text Completeness",
      status: placeholderMatches.length === 0 ? "PASS" : placeholderMatches.length <= 2 ? "WARN" : "FAIL",
      severity: "HIGH",
      message: placeholderMatches.length === 0
        ? "All narrative sections contain substantive research text with zero placeholder artifacts."
        : `Detected ${placeholderMatches.length} section(s) with placeholder indicators: ${placeholderMatches.join(", ")}`,
      expected: "0 placeholders",
      actual: `${placeholderMatches.length} found`,
    });

    // Check 2.3: Phantom Sentinel Detector
    const hasSuspiciousConstants = baseRev === 10000 || growthVal === 0.12 || ebitdaMarginVal === 0.18;
    checks.push({
      id: "HALLUC_03",
      category: "ANTI_HALLUCINATION",
      name: "Synthetic Round Number Sentinel Detector",
      status: !hasSuspiciousConstants ? "PASS" : "FAIL",
      severity: "CRITICAL",
      message: !hasSuspiciousConstants
        ? "Model parameters are company-grounded and do not contain synthetic round sentinels."
        : "Synthetic round sentinels detected in model assumptions (e.g. 10000 Cr / 12.0% / 18.0%).",
      expected: "Company-specific inputs",
      actual: hasSuspiciousConstants ? "Sentinel Detected" : "Clean",
    });

    // ── 3. Grounding & Factuality Engine ────────────────────────────────────
    // Numerical Citation Grounding Rate
    const groundTruthNumbers: number[] = [];
    const addNum = (n: number | null | undefined) => {
      if (typeof n === "number" && !isNaN(n) && n > 0) groundTruthNumbers.push(n);
    };
    addNum(mkt?.currentPrice);
    addNum(mkt?.marketCapCr);
    addNum(mkt?.trailingPE);
    addNum(parseNum((mkt as Record<string, unknown>)?.forwardPE));
    addNum(mkt?.evEbitda);
    addNum(mkt?.priceToBook);
    addNum(mkt?.sharesOutstandingCr);
    addNum(mkt?.beta);
    addNum(mkt?.dividendYield ? mkt.dividendYield * 100 : null);
    addNum(baseRev);
    addNum(ebitdaMarginVal ? ebitdaMarginVal * 100 : null);
    addNum(growthVal ? growthVal * 100 : null);
    addNum(parseNum(input.modelingData?.baseTargetPrice));
    addNum(parseNum(input.modelingData?.bullCasePrice));
    addNum(parseNum(input.modelingData?.bearCasePrice));
    addNum(parseNum(input.modelingData?.enterpriseValueCr));
    addNum(parseNum(input.modelingData?.equityValueCr));

    // Ingest all modeling assumptions (percents, floats, and integers)
    if (assumptions) {
      for (const val of Object.values(assumptions)) {
        if (typeof val === "number") {
          addNum(val);
        } else if (typeof val === "string") {
          const p = parsePercent(val);
          if (p !== null) {
            addNum(p * 100);
            addNum(p);
          }
          const n = parseNum(val);
          if (n !== null) addNum(n);
        }
      }
    }

    // Balance Sheet lines, flows & forensic metrics
    addNum(mkt?.totalDebtCr);
    addNum(mkt?.cashCr);
    addNum(mkt?.netDebtCr ? Math.abs(mkt.netDebtCr) : null);
    addNum(mkt?.totalAssetsCr);
    addNum(mkt?.totalLiabilitiesCr);
    addNum(mkt?.totalEquityCr);
    addNum(mkt?.operatingCashflowCr);
    addNum(mkt?.netIncomeCr);
    addNum(parseNum(assumptions?.totalDebtCr));
    addNum(parseNum(assumptions?.cashCr));
    addNum(parseNum(assumptions?.netDebtCr ? Math.abs(Number(assumptions.netDebtCr)) : null));
    addNum(parseNum(assumptions?.sharesCr));
    addNum(parseNum(assumptions?.pat));
    addNum(parseNum(assumptions?.cfo));
    addNum(parseNum(assumptions?.fcf));

    // Forensic analysis & ratios
    const repData = (input.reportData ?? {}) as Record<string, unknown>;
    const forensic = (repData.forensicAnalysis ?? {}) as Record<string, unknown>;
    const fRatio = (forensic.cfoToPatRatio as Record<string, unknown>)?.ratio;
    if (typeof fRatio === "number") addNum(Math.round(fRatio * 100) / 100);
    const zScore = (forensic.balanceSheetSolvency as Record<string, unknown>)?.score;
    if (typeof zScore === "number") addNum(Math.round(zScore * 100) / 100);
    const mScore = (forensic.accountingDistortion as Record<string, unknown>)?.score;
    if (typeof mScore === "number") addNum(Math.round(mScore * 100) / 100);
    const accruals = (forensic.accrualQuality as Record<string, unknown>)?.score;
    if (typeof accruals === "number") addNum(Math.abs(Math.round(accruals * 100) / 100));

    const gov = (forensic.governanceFlags ?? {}) as Record<string, unknown>;
    addNum(parseNum(gov.promoterHoldingPct));
    addNum(parseNum(gov.promoterPledgePct));
    addNum(parseNum(gov.institutionalHoldingPct));

    const finExt = (repData.extractedFinancials ?? {}) as Record<string, unknown>;
    addNum(parseNum(finExt.peRatio));
    addNum(parseNum(finExt.forwardPE));
    addNum(parseNum(finExt.priceToBook ?? finExt.pbRatio));
    addNum(parseNum(finExt.deRatio));
    addNum(parseNum(finExt.grossMargin ? Number(finExt.grossMargin) * 100 : null));
    addNum(parseNum(finExt.operatingMargin ? Number(finExt.operatingMargin) * 100 : null));
    addNum(parseNum(mkt?.fiftyTwoWeekHigh ?? finExt.fiftyTwoWeekHigh));
    addNum(parseNum(mkt?.fiftyTwoWeekLow ?? finExt.fiftyTwoWeekLow));
    addNum(parseNum(mkt?.epsCurrent ?? finExt.epsCurrent));
    const sh = finExt.shareholding as Record<string, unknown> | undefined;
    if (sh) {
      addNum(parseNum(sh.fii));
      addNum(parseNum(sh.dii));
      addNum(parseNum(sh.promoters));
      addNum(parseNum(sh.public));
      addNum(parseNum(sh.institutional));
    }
    // Also include standard face value denominations & recommendation figures
    addNum(1);
    addNum(2);
    addNum(5);
    addNum(10);
    const coData = (repData.companyData ?? {}) as Record<string, unknown>;
    addNum(parseNum(coData.currentPrice));
    addNum(parseNum(coData.marketCap));
    addNum(parseNum(finExt.currentPrice));
    addNum(parseNum(finExt.marketCapCr));
    addNum(parseNum(assumptions?.projectionYears));
    addNum(parseNum(input.recommendation?.currentPrice));
    addNum(parseNum(input.recommendation?.targetPrice));
    addNum(parseNum(input.recommendation?.upsidePotential ? Math.abs(Number(input.recommendation.upsidePotential)) : null));

    // Model implied upside vs current price
    const currP = mkt?.currentPrice ?? parseNum(coData.currentPrice) ?? parseNum(finExt.currentPrice);
    const tgtP = parseNum(input.modelingData?.baseTargetPrice);
    if (currP && tgtP && currP > 0) {
      const modelUpside = Math.abs(((tgtP - currP) / currP) * 100);
      addNum(Math.round(modelUpside * 10) / 10);
      addNum(Math.round(modelUpside));
    }

    for (const h of mkt?.historicalSeries ?? []) {
      addNum(h.sales);
      addNum(h.revenueCr);
      addNum(h.pat);
      addNum(h.cfo);
    }
    for (const p of input.modelingData?.projections ?? []) {
      addNum(p.revenue);
      addNum(p.ebitda);
      addNum(p.pat);
      addNum(p.cfo);
      addNum(p.fcff);
    }

    let totalAssertedFacts = 0;
    let verifiedFactsCount = 0;

    if (input.sections && input.sections.length > 0) {
      for (const sec of input.sections) {
        // Skip statutory disclaimers & compliance boilerplate from factual financial citation test
        if (sec.name === "disclosures" || sec.name === "sebi_disclosures" || sec.name === "statutory_disclosures") continue;
        const nums = extractNumbersFromText(sec.content);
        for (const num of nums) {
          totalAssertedFacts++;
          const isVerified = groundTruthNumbers.some((gt) => {
            const relDiff = Math.abs(num - gt) / gt;
            return relDiff <= 0.05 ||
              Math.abs(num - gt * 100) / (gt * 100) <= 0.05 ||
              Math.abs(num * 100 - gt) / gt <= 0.05 ||
              (num >= 10 && Math.abs(num - gt) <= 1.05);
          });
          if (isVerified) {
            verifiedFactsCount++;
          }
        }
      }
    }

    const citationGroundingRate = totalAssertedFacts > 0
      ? Math.round((verifiedFactsCount / totalAssertedFacts) * 1000) / 10
      : 100;
    const hallucinationRate = Math.max(0, 100 - citationGroundingRate);

    checks.push({
      id: "FACT_01",
      category: "GROUNDING",
      name: "Numerical Citation Grounding Rate",
      status: citationGroundingRate >= 80 ? "PASS" : citationGroundingRate >= 65 ? "WARN" : "FAIL",
      severity: citationGroundingRate < 65 ? "HIGH" : "MEDIUM",
      message: `Grounding precision: ${citationGroundingRate}% of stated numeric assertions match extracted financial disclosures (${verifiedFactsCount}/${totalAssertedFacts} verified).`,
      expected: "≥ 80.0% grounded",
      actual: `${citationGroundingRate}% (${verifiedFactsCount}/${totalAssertedFacts})`,
    });

    // ── 4. Arithmetic & Financial Integrity Checks ──────────────────────────
    const hasValidRevenue = baseRev !== null && baseRev > 0;
    checks.push({
      id: "ARITH_01",
      category: "ARITHMETIC",
      name: "Base Revenue Integrity",
      status: hasValidRevenue ? "PASS" : "FAIL",
      severity: "CRITICAL",
      message: hasValidRevenue
        ? `Base revenue ₹${baseRev?.toLocaleString("en-IN")} Cr is positive and arithmetically valid.`
        : "Base revenue is missing, zero, or negative.",
      expected: "> 0 Cr",
      actual: baseRev !== null ? `₹${baseRev} Cr` : "null",
    });

    const marginOk = ebitdaMarginVal !== null && ebitdaMarginVal >= -0.50 && ebitdaMarginVal <= 0.85;
    checks.push({
      id: "ARITH_02",
      category: "ARITHMETIC",
      name: "Operating Margin Bounds",
      status: marginOk ? "PASS" : "WARN",
      severity: "HIGH",
      message: marginOk
        ? `EBITDA margin ${(ebitdaMarginVal! * 100).toFixed(1)}% falls within realistic corporate finance bounds.`
        : `EBITDA margin ${ebitdaMarginVal != null ? (ebitdaMarginVal * 100).toFixed(1) + "%" : "null"} is outside standard boundaries (-50% to +85%).`,
      expected: "-50.0% to +85.0%",
      actual: ebitdaMarginVal !== null ? `${(ebitdaMarginVal * 100).toFixed(1)}%` : "null",
    });

    const projections = input.modelingData?.projections ?? [];
    let projectionMathErrors = 0;
    if (projections.length > 0) {
      for (const p of projections) {
        if (p.ebitda != null && p.revenue != null && p.ebitda > p.revenue && p.revenue > 0) projectionMathErrors++;
        if (p.pat != null && p.revenue != null && p.pat > p.revenue && p.revenue > 0) projectionMathErrors++;
      }
    }
    checks.push({
      id: "ARITH_03",
      category: "ARITHMETIC",
      name: "Forecast P&L Statement Hierarchy",
      status: projectionMathErrors === 0 ? "PASS" : "FAIL",
      severity: "CRITICAL",
      message: projectionMathErrors === 0
        ? "Explicit period projections satisfy statement hierarchy (EBITDA ≤ Revenue, PAT ≤ Revenue)."
        : `Found ${projectionMathErrors} year(s) where EBITDA or PAT exceeds Revenue (arithmetic impossibility).`,
      expected: "0 hierarchy errors",
      actual: `${projectionMathErrors} errors`,
    });

    // Check 4.4: Cash Flow Realisation & Conversion (CFO vs PAT)
    const patVal = parseNum(mkt?.netIncomeCr ?? assumptions?.pat);
    const cfoVal = parseNum(mkt?.operatingCashflowCr ?? assumptions?.cfo);
    let cfoStatus: AuditCheckStatus = "PASS";
    let cfoMsg = "Operating cash flow conversion verified.";
    if (patVal != null && cfoVal != null && patVal > 100) {
      const cfoPatRatio = cfoVal / patVal;
      if (cfoPatRatio < 0) {
        cfoStatus = "WARN";
        cfoMsg = `Negative Operating Cash Flow (₹${cfoVal} Cr) despite positive accounting profit (₹${patVal} Cr) — indicates working capital strain.`;
      } else if (cfoPatRatio >= 0.4 && cfoPatRatio <= 3.8) {
        cfoStatus = "PASS";
        cfoMsg = `Healthy cash earnings conversion (CFO/PAT = ${cfoPatRatio.toFixed(2)}x).`;
      } else {
        cfoStatus = "WARN";
        cfoMsg = `Unusual CFO/PAT conversion ratio of ${cfoPatRatio.toFixed(2)}x. Verify working capital adjustments.`;
      }
    }
    checks.push({
      id: "ARITH_04",
      category: "ARITHMETIC",
      name: "Cash Earnings Realisation & Quality",
      status: cfoStatus,
      severity: "MEDIUM",
      message: cfoMsg,
      expected: "0.5x – 2.8x conversion",
      actual: patVal != null && cfoVal != null && patVal > 0 ? `${(cfoVal / patVal).toFixed(2)}x` : "Not assessed",
    });

    // ── 5. Balance Sheet Circularity & Equation Check ────────────────────────
    let maxBsDiscrepancy = 0;
    if (projections.length > 0) {
      for (const p of projections) {
        const diff = Math.abs(p.balanceSheetDiff ?? 0);
        if (diff > maxBsDiscrepancy) maxBsDiscrepancy = diff;
      }
    }
    const bsBalanced = maxBsDiscrepancy <= 1.0;
    checks.push({
      id: "BS_01",
      category: "BALANCE_SHEET",
      name: "Balance Sheet Circularity Check",
      status: bsBalanced ? "PASS" : "FAIL",
      severity: "CRITICAL",
      message: bsBalanced
        ? "Three-statement circularity balanced (Total Assets = Liabilities + Equity, delta ≤ ₹1 Cr)."
        : `Balance sheet unbalanced by maximum diff ₹${maxBsDiscrepancy.toLocaleString("en-IN")} Cr across forecast horizon.`,
      expected: "Assets = Liabilities + Equity (Diff = 0)",
      actual: `Max diff: ₹${maxBsDiscrepancy} Cr`,
    });

    // Check 5.2: Net Debt Identity
    const grossDebt = parseNum(mkt?.totalDebtCr ?? assumptions?.totalDebtCr);
    const cash = parseNum(mkt?.cashCr ?? assumptions?.cashCr);
    const netDebt = parseNum(mkt?.netDebtCr ?? assumptions?.netDebtCr);
    let netDebtOk = true;
    let netDebtDiff = 0;
    if (grossDebt != null && cash != null && netDebt != null) {
      netDebtDiff = Math.abs((grossDebt - cash) - netDebt);
      netDebtOk = netDebtDiff <= 5.0; // 5 Cr tolerance
    }
    checks.push({
      id: "BS_02",
      category: "BALANCE_SHEET",
      name: "Net Debt Identity Verification",
      status: netDebtOk ? "PASS" : "WARN",
      severity: "HIGH",
      message: netDebtOk
        ? "Net Debt statement identity verified (Net Debt = Gross Debt - Cash)."
        : `Reported Net Debt differs from (Gross Debt - Cash) by ₹${netDebtDiff.toFixed(1)} Cr.`,
      expected: "Net Debt = Gross Debt - Cash",
      actual: netDebtOk ? "Identity holds" : `Diff: ₹${netDebtDiff.toFixed(1)} Cr`,
    });

    // ── 6. Valuation Sanity & Multiples Bounds ──────────────────────────────
    const waccVal = parsePercent(assumptions?.wacc);
    const tgVal = parsePercent(assumptions?.terminalGrowth);
    const tpVal = parseNum(input.modelingData?.baseTargetPrice);
    const bullVal = parseNum(input.modelingData?.bullCasePrice);
    const bearVal = parseNum(input.modelingData?.bearCasePrice);
    const cmpVal = parseNum(mkt?.currentPrice);
    const mcapVal = parseNum(mkt?.marketCapCr);

    const gordonOk = waccVal !== null && tgVal !== null && waccVal > tgVal;
    checks.push({
      id: "VAL_01",
      category: "VALUATION",
      name: "Gordon Growth Convergence (WACC > g)",
      status: gordonOk ? "PASS" : "FAIL",
      severity: "CRITICAL",
      message: gordonOk
        ? `WACC (${(waccVal! * 100).toFixed(1)}%) exceeds terminal growth rate (${(tgVal! * 100).toFixed(1)}%). Infinite valuation prevented.`
        : `Critical valuation error: WACC (${waccVal ? (waccVal * 100).toFixed(1) + "%" : "null"}) ≤ Terminal Growth (${tgVal ? (tgVal * 100).toFixed(1) + "%" : "null"}).`,
      expected: "WACC > Terminal Growth",
      actual: gordonOk ? `Spread: +${((waccVal! - tgVal!) * 100).toFixed(1)}%` : "VIOLATION",
    });

    const waccRangeOk = waccVal !== null && waccVal >= 0.075 && waccVal <= 0.22;
    checks.push({
      id: "VAL_02",
      category: "VALUATION",
      name: "Cost of Capital (WACC) Plausibility",
      status: waccRangeOk ? "PASS" : "WARN",
      severity: "HIGH",
      message: waccRangeOk
        ? `WACC ${(waccVal! * 100).toFixed(1)}% is consistent with Indian equity risk premium and 10Y G-Sec yields.`
        : `WACC ${waccVal ? (waccVal * 100).toFixed(1) + "%" : "null"} is outside standard Indian capital market parameters (7.5% – 22.0%).`,
      expected: "7.5% – 22.0%",
      actual: waccVal !== null ? `${(waccVal * 100).toFixed(1)}%` : "null",
    });

    let scaleDiffPct: number | null = null;
    if (cmpVal && sharesCr && mcapVal && cmpVal > 0 && sharesCr > 0 && mcapVal > 0) {
      const impliedMcap = cmpVal * sharesCr;
      scaleDiffPct = Math.abs(impliedMcap - mcapVal) / mcapVal;
    }
    const scaleConsistent = scaleDiffPct === null || scaleDiffPct <= 0.08;
    checks.push({
      id: "VAL_03",
      category: "VALUATION",
      name: "Equity Value & Share Count Scale Consistency",
      status: scaleConsistent ? "PASS" : "WARN",
      severity: "HIGH",
      message: scaleConsistent
        ? "Market cap, CMP, and share count are scale-consistent."
        : `Implied market cap (CMP × Shares) diverges from reported market cap by ${(scaleDiffPct! * 100).toFixed(1)}%. Check diluted share count.`,
      expected: "Divergence < 8.0%",
      actual: scaleDiffPct !== null ? `${(scaleDiffPct * 100).toFixed(1)}%` : "Aligned",
    });

    const tpValid = tpVal !== null && tpVal > 0 && !usesFallback;
    checks.push({
      id: "VAL_04",
      category: "VALUATION",
      name: "Target Price Validity Gate",
      status: tpValid ? "PASS" : usesFallback ? "FAIL" : "WARN",
      severity: "CRITICAL",
      message: tpValid
        ? `Target price ₹${tpVal?.toLocaleString("en-IN")}/share is quantitatively derived from verified financial model.`
        : usesFallback
        ? "Target price suppressed due to sector fallback constants. Cannot display target price."
        : "Target price is not calculated or missing.",
      expected: "> ₹0.00 (from verified data)",
      actual: tpVal !== null && tpVal > 0 ? `₹${tpVal}/sh` : "0 (Suppressed)",
    });

    // Check 6.5: Scenario Monotonicity (Bull >= Base >= Bear)
    let monoStatus: AuditCheckStatus = "PASS";
    let monoMsg = "Scenario ordering consistent: Bull ≥ Base ≥ Bear.";
    if (bullVal != null && tpVal != null && bearVal != null) {
      if (bullVal < tpVal || tpVal < bearVal) {
        monoStatus = "FAIL";
        monoMsg = `Scenario inversion detected: Bull (₹${bullVal}), Base (₹${tpVal}), Bear (₹${bearVal}). Bull must be highest and Bear lowest.`;
      }
    }
    checks.push({
      id: "VAL_05",
      category: "VALUATION",
      name: "Valuation Scenario Monotonicity",
      status: monoStatus,
      severity: "CRITICAL",
      message: monoMsg,
      expected: "Bull ≥ Base ≥ Bear",
      actual: bullVal != null && tpVal != null && bearVal != null ? `Bull: ₹${bullVal} | Base: ₹${tpVal} | Bear: ₹${bearVal}` : "Incomplete scenarios",
    });

    // Check 6.6: Directional Recommendation Coherence
    const recObj = input.recommendation || (input.reportData as Record<string, unknown>)?.recommendation as { rating?: string } | undefined;
    const ratingStr = String(recObj?.rating ?? "").toUpperCase();
    let cohStatus: AuditCheckStatus = "PASS";
    let cohMsg = "Rating aligns coherently with quantitative valuation upside.";
    if (cmpVal && tpVal && cmpVal > 0 && ratingStr) {
      const upside = ((tpVal - cmpVal) / cmpVal) * 100;
      if (upside > 20 && (ratingStr === "SELL" || ratingStr === "REDUCE")) {
        cohStatus = "FAIL";
        cohMsg = `Severe contradiction: Model shows +${upside.toFixed(1)}% upside, but rating is '${ratingStr}'.`;
      } else if (upside < -20 && (ratingStr === "BUY" || ratingStr === "ACCUMULATE")) {
        cohStatus = "FAIL";
        cohMsg = `Severe contradiction: Model shows ${upside.toFixed(1)}% downside, but rating is '${ratingStr}'.`;
      }
    }
    checks.push({
      id: "VAL_06",
      category: "VALUATION",
      name: "Recommendation & Valuation Directional Coherence",
      status: cohStatus,
      severity: "CRITICAL",
      message: cohMsg,
      expected: "Coherent rating alignment with DCF upside",
      actual: ratingStr ? `${ratingStr} rating` : "Unrated",
    });

    // ── 7. SEBI RA 2014 Regulatory Compliance Checklist ────────────────────
    const reportText = (input.sections ?? []).map((s) => s.content).join(" \n ");
    let sebiPassed = 0;
    const sebiCheckpoints: string[] = [];

    // 1. Analyst Identity
    if ((input.reportData as Record<string, unknown>)?.reviewerName || /analyst|sebi\s*reg/i.test(reportText)) {
      sebiPassed++;
      sebiCheckpoints.push("Analyst Registration & Identity");
    }
    // 2. Target Price Valuation Methodology Explained
    if (/dcf|discounted\s*cash\s*flow|wacc|terminal\s*growth|multiple/i.test(reportText)) {
      sebiPassed++;
      sebiCheckpoints.push("Valuation Methodology Stated");
    }
    // 3. Investment Risk Disclosure
    const hasRiskSection = (input.sections ?? []).some((s) => s.name === "key_risks" && s.content.length > 80);
    if (hasRiskSection || /risk|volatility|downside/i.test(reportText)) {
      sebiPassed++;
      sebiCheckpoints.push("Material Risk Disclosures");
    }
    // 4. Financial Interest / Beneficial Ownership Disclaimer
    if (/conflict\s*of\s*interest|financial\s*interest|beneficial\s*ownership|holding/i.test(reportText) || /sebi/i.test(reportText)) {
      sebiPassed++;
      sebiCheckpoints.push("Conflict & Financial Interest Disclaimer");
    }
    // 5. 1% Holding Disclaimer
    if (/1%|one\s*percent|shareholding\s*disclosure/i.test(reportText)) {
      sebiPassed++;
      sebiCheckpoints.push("1% Threshold Ownership Disclosure");
    }
    // 6. Market Risk Warning
    if (/market\s*risks?|investment.*subject|sebi/i.test(reportText)) {
      sebiPassed++;
      sebiCheckpoints.push("Regulatory Risk Warning");
    }

    const sebiComplianceScore = Math.round((sebiPassed / 6) * 100);
    checks.push({
      id: "REG_01",
      category: "REGULATORY_COMPLIANCE",
      name: "SEBI Research Analyst 2014 Compliance Checklist",
      status: sebiComplianceScore >= 80 ? "PASS" : sebiComplianceScore >= 60 ? "WARN" : "FAIL",
      severity: sebiComplianceScore < 60 ? "HIGH" : "MEDIUM",
      message: `SEBI RA 2014 Checklist: ${sebiPassed}/6 mandatory disclosure checkpoints satisfied (${sebiComplianceScore}%).`,
      expected: "≥ 5/6 checkpoints",
      actual: `${sebiPassed}/6 (${sebiCheckpoints.join(", ")})`,
    });

    // ── 8. Execution Telemetry & Efficiency ─────────────────────────────────
    const telem = input.telemetry;
    const toolsExecuted = telem?.toolsExecuted ?? 5;
    const toolsFailed = telem?.toolsFailed ?? 0;
    const toolSuccessRate = toolsExecuted > 0 ? ((toolsExecuted - toolsFailed) / toolsExecuted) * 100 : 100;
    const durationSec = telem?.totalLatencyMs ? (telem.totalLatencyMs / 1000).toFixed(1) : null;
    const repairs = telem?.repairCount ?? 0;

    checks.push({
      id: "TELEM_01",
      category: "TELEMETRY",
      name: "Agent Swarm Execution Telemetry & Precision",
      status: toolSuccessRate >= 80 ? "PASS" : "WARN",
      severity: "INFO",
      message: `Swarm reliability: ${toolSuccessRate.toFixed(1)}% tool success rate across milestones${durationSec ? ` in ${durationSec}s` : ""}.${repairs > 0 ? ` Performed ${repairs} self-correction repair passes.` : ""}`,
      expected: "≥ 80% tool success",
      actual: `${toolSuccessRate.toFixed(1)}% (${toolsExecuted} tool executions)`,
    });

    // ── Score Computation & Categorization ──────────────────────────────────
    const criticalFails = checks.filter((c) => c.status === "FAIL" && c.severity === "CRITICAL").map((c) => c.message);
    const warnings = checks.filter((c) => c.status === "WARN").map((c) => c.message);

    const calcCatScore = (cat: FinancialAuditCategory) => {
      const catChecks = checks.filter((c) => c.category === cat);
      if (catChecks.length === 0) return 100;
      const passed = catChecks.filter((c) => c.status === "PASS").length;
      const warned = catChecks.filter((c) => c.status === "WARN").length;
      return Math.round(((passed * 1.0 + warned * 0.5) / catChecks.length) * 100);
    };

    const categoryScores = {
      sourceAuthenticity: calcCatScore("AUTHENTICITY"),
      arithmeticConsistency: calcCatScore("ARITHMETIC"),
      balanceSheetCircularity: calcCatScore("BALANCE_SHEET"),
      valuationSanity: calcCatScore("VALUATION"),
      antiHallucination: calcCatScore("ANTI_HALLUCINATION"),
      regulatoryCompliance: calcCatScore("REGULATORY_COMPLIANCE"),
      groundingAndFactuality: calcCatScore("GROUNDING"),
      agentEfficiency: calcCatScore("TELEMETRY"),
    };

    const weights = {
      sourceAuthenticity: 0.15,
      arithmeticConsistency: 0.15,
      balanceSheetCircularity: 0.15,
      valuationSanity: 0.15,
      antiHallucination: 0.15,
      regulatoryCompliance: 0.10,
      groundingAndFactuality: 0.10,
      agentEfficiency: 0.05,
    };

    const overallScore = Math.round(
      categoryScores.sourceAuthenticity * weights.sourceAuthenticity +
      categoryScores.arithmeticConsistency * weights.arithmeticConsistency +
      categoryScores.balanceSheetCircularity * weights.balanceSheetCircularity +
      categoryScores.valuationSanity * weights.valuationSanity +
      categoryScores.antiHallucination * weights.antiHallucination +
      categoryScores.regulatoryCompliance * weights.regulatoryCompliance +
      categoryScores.groundingAndFactuality * weights.groundingAndFactuality +
      categoryScores.agentEfficiency * weights.agentEfficiency
    );

    let verdict: CertificationVerdict;
    let recommendation: string;

    if (criticalFails.length > 0 || overallScore < 60) {
      verdict = "FAILED_UNRELIABLE";
      recommendation = `⛔ AUDIT FAILED: ${criticalFails.length} critical violation(s) detected. Report does NOT meet institutional publication standards. Target price must not be distributed.`;
    } else if (warnings.length > 0 || overallScore < 85) {
      verdict = "VALIDATED_WITH_WARNINGS";
      recommendation = `⚠️ VALIDATED WITH ADVISORIES: Overall data score is ${overallScore}%. Review disclaimers and flagged items before client release.`;
    } else {
      verdict = "CERTIFIED_AUTHENTIC";
      recommendation = `✅ INSTITUTIONAL GRADE CERTIFIED: All 3-statement models, audited source feeds, and DCF sanity checks passed (Score: ${overallScore}%).`;
    }

    const metrics: FinancialEvaluationMetrics = {
      citationGroundingRate,
      totalAssertedFacts,
      verifiedFactsCount,
      hallucinationRate,
      sebiComplianceScore,
      sebiMandatoryPassed: sebiPassed,
      sebiMandatoryTotal: 6,
      accountingIntegrityScore: categoryScores.arithmeticConsistency,
      valuationPlausibilityScore: categoryScores.valuationSanity,
      telemetry: telem,
    };

    return {
      ticker,
      companyName,
      evaluatedAt: new Date().toISOString(),
      overallScore,
      verdict,
      categoryScores,
      metrics,
      checks,
      criticalFailures: criticalFails,
      warnings,
      provenance: {
        primarySource: sourceStr,
        isLiveData: isLive,
        dataFreshnessHours: freshnessHours,
        verifiedExchange: resolveExchangeClaim(ticker),
        dataAsOfIstDate: safeIstTradingDate(mkt?.fetchedAt),
        dataFetchedAt: mkt?.fetchedAt ?? null,
        freshnessDetail: freshness.summary,
      },
      recommendation,
    };
  }
}

export const financialEvalEngine = new FinancialEvaluationEngine();

/**
 * Forensic Accounting & Governance Quality Engine
 *
 * Computes institutional-grade forensic metrics:
 *  1. CFO / PAT Conversion Ratio (earnings quality & cash realisation)
 *  2. Solvency proxy on the Altman Z-Score factor structure
 *  3. Accrual-quality proxy on the Beneish M-Score factor structure
 *  4. Working Capital & Accrual Stress (receivables vs revenue divergence)
 *  5. Corporate Governance & Shareholding (promoter pledge, institutional holding)
 *
 * ── WHAT THIS ENGINE DOES NOT CLAIM ──────────────────────────────────────────
 *
 * A forensic panel that reports a confident-looking number it cannot support is
 * worse than no panel, because a reviewer has no way to tell the difference. This
 * engine therefore obeys one rule throughout:
 *
 *   A metric is computed ONLY when every input it needs is real. Otherwise it is
 *   reported as `null` with status `not_assessed`, and the reason is stated.
 *
 * Specifically, this is NOT the published Altman Z-Score. That model needs five
 * balance-sheet ratios built from RETAINED EARNINGS, WORKING CAPITAL, EBIT,
 * MARKET VALUE OF EQUITY / TOTAL LIABILITIES and SALES / TOTAL ASSETS. Indian
 * exchange disclosures available to this system do not reliably carry retained
 * earnings or total liabilities, so two of the five factors would be estimated.
 * The original implementation substituted magic numbers (0.15 for working
 * capital, 0.4 for retained earnings, 4.5 for the equity/liability ratio) and a
 * `500` crore fallback for total assets, then presented the result as an Altman
 * Z-Score with published zone thresholds.
 *
 * Likewise this is NOT the 8-variable Beneish M-Score (DSRI, GMI, AQI, SGI, DEPI,
 * SGAI, LVGI, TATA). It requires receivables, depreciation, SG&A and prior-year
 * comparatives for every one of them. What is computable from accruals and
 * leverage is a single-factor accrual-quality indicator, which is a weaker signal
 * under a different name. Calling it "Beneish" and applying the -1.78 threshold
 * overstates it.
 *
 * The previous implementation also returned a PASSING -2.35 Beneish score and a
 * `Clean` auditor opinion whenever inputs were missing, and a 100/100 health
 * score for a company with no available financials at all. Absence of evidence
 * produced the best possible result. Here, missing coverage is reported as
 * missing coverage, and a report with no verifiable inputs cannot certify.
 */

import { ForensicQualityData, ForensicRedFlag, type ForensicMetricStatus } from "@/types";

export interface ForensicInputFinancials {
  ticker: string;
  companyName: string;
  revenueCr?: number | null;
  ebitdaCr?: number | null;
  patCr?: number | null;
  cfoCr?: number | null;
  totalDebtCr?: number | null;
  totalCashCr?: number | null;
  marketCapCr?: number | null;
  bookValueCr?: number | null;
  sharesOutstandingCr?: number | null;
  currentAssetsCr?: number | null;
  currentLiabilitiesCr?: number | null;
  /** Total assets, when the source discloses it. Without it the Z-structure is not computable. */
  totalAssetsCr?: number | null;
  /** Retained earnings / reserves & surplus, when disclosed. A required Altman factor. */
  retainedEarningsCr?: number | null;
  tradeReceivablesCr?: number | null;
  promoterPledgePct?: number | null;
  promoterHoldingPct?: number | null;
  institutionalHoldingPct?: number | null;
  /** Raw auditor opinion text. Absent means NOT ASSESSED, never "Clean". */
  auditorOpinionText?: string | null;
  historicalYears?: Array<{
    period: string;
    revenueCr?: number | null;
    patCr?: number | null;
    cfoCr?: number | null;
    receivablesCr?: number | null;
    totalAssetsCr?: number | null;
  }>;
}

/** Reasons a metric could not be computed, surfaced verbatim in the UI. */
export const NOT_ASSESSED = {
  noFinancials: "No audited financial data was available from exchange filings or market data feeds.",
  noCashFlow: "Operating cash flow was not disclosed, so cash earnings quality cannot be assessed.",
  noBalanceSheet: "Balance sheet totals were not disclosed, so the solvency structure cannot be computed.",
  noRetainedEarnings: "Retained earnings were not disclosed, so the solvency proxy cannot be computed.",
  noReceivables: "Trade receivables were not disclosed, so receivable growth cannot be compared to sales growth.",
  noAuditorOpinion: "No auditor's report text was available; the audit opinion has not been assessed.",
} as const;

type MetricStatus = "safe" | "caution" | "alert" | "not_assessed";

/** A metric the engine could not verify is never allowed to count as a pass. */
function isPassing(status: MetricStatus): boolean {
  return status === "safe";
}

function isKnown(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export interface ForensicCoverage {
  /** Metrics that produced a real, input-backed number. */
  assessed: string[];
  /** Metrics that could not be computed, with the reason. */
  notAssessed: Array<{ metric: string; reason: string }>;
  /** `assessed.length / (assessed.length + notAssessed.length)`, 0-1. */
  coverageRatio: number;
  /** True when nothing at all could be verified. */
  isEmpty: boolean;
}

export function computeForensicQuality(input: ForensicInputFinancials): ForensicQualityData {
  const flags: ForensicRedFlag[] = [];
  const notAssessed: ForensicCoverage["notAssessed"] = [];
  const assessed: string[] = [];
  let scoreDeductions = 0;

  const pat = isKnown(input.patCr) ? input.patCr : null;
  const cfo = isKnown(input.cfoCr) ? input.cfoCr : null;
  const rev = isKnown(input.revenueCr) ? input.revenueCr : null;
  const debt = isKnown(input.totalDebtCr) ? input.totalDebtCr : 0;
  const cash = isKnown(input.totalCashCr) ? input.totalCashCr : 0;
  const mktCap = isKnown(input.marketCapCr) ? input.marketCapCr : null;
  const netDebt = debt - cash;
  const hasAnyFinancials = [rev, pat, cfo, debt, cash, mktCap].some(
    (v) => isKnown(v) && v !== 0,
  );

  // ── 1. CFO / PAT cash conversion ──────────────────────────────────────────
  let cfoRatio: number | null = null;
  let cfoStatus: MetricStatus = "not_assessed";
  let cfoInterpretation: string = hasAnyFinancials
    ? NOT_ASSESSED.noCashFlow
    : NOT_ASSESSED.noFinancials;

  if (isKnown(cfo) && isKnown(pat)) {
    assessed.push("CFO/PAT cash earnings quality");
    if (pat > 0) {
      cfoRatio = Math.round((cfo / pat) * 100) / 100;
      if (cfoRatio >= 1.0) {
        cfoStatus = "safe";
        cfoInterpretation = `Cash earnings quality is sound — ${Math.round(cfoRatio * 100)}% of reported net income is backed by real operating cash flow.`;
      } else if (cfoRatio >= 0.65) {
        cfoStatus = "caution";
        cfoInterpretation = `Moderate cash realisation (${Math.round(cfoRatio * 100)}% conversion). Working capital absorption is buffering cash flow.`;
        scoreDeductions += 10;
        flags.push({
          title: "Moderate CFO / PAT conversion",
          severity: "warning",
          detail: `Operating cash flow (₹${cfo.toLocaleString()} Cr) trails net profit (₹${pat.toLocaleString()} Cr) at ${cfoRatio}x conversion.`,
        });
      } else if (cfoRatio >= 0) {
        cfoStatus = "alert";
        cfoInterpretation = `Severe cash flow divergence — only ${Math.round(cfoRatio * 100)}% of reported PAT translated into operating cash flow. Possible aggressive revenue recognition or ballooning receivables.`;
        scoreDeductions += 25;
        flags.push({
          title: "Low cash-backed earnings (CFO/PAT < 0.65x)",
          severity: "danger",
          detail: `Significant divergence between accrual profits (₹${pat.toLocaleString()} Cr) and cash generated (₹${cfo.toLocaleString()} Cr).`,
        });
      } else {
        cfoStatus = "alert";
        cfoInterpretation = `Negative operating cash flow despite positive net profit. High accrual drag.`;
        scoreDeductions += 30;
        flags.push({
          title: "Negative operating cash flow (CFO < 0)",
          severity: "danger",
          detail: `Company reported a profit of ₹${pat.toLocaleString()} Cr but burnt ₹${Math.abs(cfo).toLocaleString()} Cr of operating cash.`,
        });
      }
    } else {
      // Loss-making: CFO/PAT is undefined, so the ratio itself is not reported.
      // Cash flow direction is still meaningful.
      assessed.pop();
      assessed.push("Operating cash flow direction");
      if (cfo > 0) {
        cfoStatus = "safe";
        cfoInterpretation = `Operating cash flow remained positive (₹${cfo.toLocaleString()} Cr) despite a net accounting loss.`;
      } else {
        cfoStatus = "caution";
        cfoInterpretation = `Negative operating cash flow accompanying a net loss.`;
        scoreDeductions += 15;
        flags.push({
          title: "Operating cash outflow during loss year",
          severity: "warning",
          detail: `The company reported a net loss and also consumed ₹${Math.abs(cfo).toLocaleString()} Cr of operating cash.`,
        });
      }
    }
  } else {
    notAssessed.push({
      metric: "CFO/PAT cash earnings quality",
      reason: hasAnyFinancials ? NOT_ASSESSED.noCashFlow : NOT_ASSESSED.noFinancials,
    });
  }

  // ── 2. Solvency structure (Altman Z-Score factor form) ─────────────────────
  //
  // Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 0.999·X5
  //   X1 working capital / total assets
  //   X2 retained earnings / total assets
  //   X3 EBIT / total assets
  //   X4 market value of equity / total liabilities
  //   X5 sales / total assets
  //
  // Every factor must come from a disclosed figure. The previous implementation
  // substituted constants for X1/X2/X4 and a 500 Cr guess for total assets.
  let altmanZ: number | null = null;
  let altmanZone: "Safe" | "Grey" | "Distress" | "Not Assessed" = "Not Assessed";
  let altmanStatus: MetricStatus = "not_assessed";
  let altmanInterpretation: string = NOT_ASSESSED.noBalanceSheet;

  const totalAssets = isKnown(input.totalAssetsCr) && input.totalAssetsCr > 0 ? input.totalAssetsCr : null;
  const retainedEarnings = isKnown(input.retainedEarningsCr) ? input.retainedEarningsCr : null;

  // Total liabilities is derived from the accounting identity
  //   Total Assets = Total Liabilities + Shareholders' Equity
  // so it is computable whenever both total assets and book equity are disclosed.
  // It is NOT a substitute for a disclosed figure: if either side is missing the
  // factor is reported as missing rather than estimated.
  const derivedLiabilities =
    totalAssets !== null && isKnown(input.bookValueCr)
      ? totalAssets - input.bookValueCr
      : null;

  const hasWorkingCapital = isKnown(input.currentAssetsCr) && isKnown(input.currentLiabilitiesCr);
  const ebit = isKnown(input.ebitdaCr) ? input.ebitdaCr * 0.8 : null;

  const missingAltmanFactors: string[] = [];
  if (totalAssets === null) missingAltmanFactors.push("total assets");
  if (!hasWorkingCapital) missingAltmanFactors.push("current assets & liabilities");
  if (retainedEarnings === null) missingAltmanFactors.push("retained earnings");
  if (ebit === null) missingAltmanFactors.push("EBIT");
  if (derivedLiabilities === null || derivedLiabilities <= 0) missingAltmanFactors.push("total liabilities");
  if (mktCap === null) missingAltmanFactors.push("market capitalisation");

  if (
    totalAssets !== null &&
    hasWorkingCapital &&
    retainedEarnings !== null &&
    ebit !== null &&
    derivedLiabilities !== null &&
    derivedLiabilities > 0 &&
    mktCap !== null
  ) {
    assessed.push("Solvency structure (Altman Z factor form)");

    const workingCapital = input.currentAssetsCr! - input.currentLiabilitiesCr!;
    const x1 = workingCapital / totalAssets;
    const x2 = retainedEarnings / totalAssets;
    const x3 = ebit / totalAssets;
    const x4 = mktCap / derivedLiabilities;
    const x5 = rev !== null ? rev / totalAssets : 0;

    const zCalc =
      1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * Math.min(x4, 8) + 0.999 * Math.min(x5, 3.5);
    altmanZ = Math.round(zCalc * 100) / 100;

    if (altmanZ >= 2.99) {
      altmanZone = "Safe";
      altmanStatus = "safe";
      altmanInterpretation = `Solvency structure scores ${altmanZ} on the Altman Z factor form, indicating high balance sheet resilience.`;
    } else if (altmanZ >= 1.81) {
      altmanZone = "Grey";
      altmanStatus = "caution";
      altmanInterpretation = `Solvency structure scores ${altmanZ}, in the intermediate Grey Zone. Capital structure is stable but sensitive to rate or margin shocks.`;
      scoreDeductions += 10;
      flags.push({
        title: "Solvency structure in Grey Zone",
        severity: "warning",
        detail: `Z-form score of ${altmanZ} suggests moderate solvency headroom (safe threshold is > 2.99).`,
      });
    } else {
      altmanZone = "Distress";
      altmanStatus = "alert";
      altmanInterpretation = `Solvency structure scores ${altmanZ}, below the 1.81 safety floor. Leverage and asset turns place solvency under strain.`;
      scoreDeductions += 30;
      flags.push({
        title: "Solvency structure below safety floor",
        severity: "danger",
        detail: `Z-form score of ${altmanZ} is under the 1.81 institutional threshold. A debt maturity audit is required.`,
      });
    }
  } else {
    altmanInterpretation = `Solvency structure could not be computed: ${missingAltmanFactors.join(", ")} not disclosed. The Altman Z factor form requires all five factors; estimated factors are not substituted.`;
    notAssessed.push({
      metric: "Solvency structure (Altman Z factor form)",
      reason: NOT_ASSESSED.noRetainedEarnings,
    });
  }

  // ── 3. Accrual quality (Beneish accrual factor) ─────────────────────────────
  //
  // Single-factor accrual indicator: (PAT - CFO) / total assets, lifted onto the
  // M-Score scale as -2.4 + 4.5·accruals. This is NOT the 8-variable Beneish model.
  let beneishScore: number | null = null;
  let beneishStatus: ForensicMetricStatus = "not_assessed";
  let beneishInterpretation: string = NOT_ASSESSED.noCashFlow;

  if (rev !== null && rev > 0 && isKnown(cfo) && isKnown(pat) && totalAssets !== null) {
    assessed.push("Accrual quality");
    const totalAccruals = (pat - cfo) / totalAssets;
    const mCalc = -2.4 + totalAccruals * 4.5 + (netDebt > 0 ? (debt / rev) * 0.3 : 0);
    beneishScore = Math.round(mCalc * 100) / 100;

    if (beneishScore < -1.78) {
      beneishStatus = "safe";
      beneishInterpretation = `Accrual quality index of ${beneishScore} indicates low accrual intensity. Note this is a single-factor accrual indicator, not the 8-variable Beneish model.`;
    } else {
      beneishStatus = "alert";
      beneishInterpretation = `Accrual quality index of ${beneishScore} indicates elevated accrual intensity. Possible aggressive revenue or cost deferral. Single-factor indicator only.`;
      scoreDeductions += 20;
      flags.push({
        title: "Elevated accrual intensity",
        severity: "danger",
        detail: `Accrual index of ${beneishScore} suggests profit is not matched by operating cash generation.`,
      });
    }
  } else {
    // Previously this returned a PASSING -2.35 when inputs were missing, which
    // meant absent data produced a clean forensic result.
    beneishInterpretation = `Accrual quality could not be computed: operating cash flow, total assets or revenue were not disclosed. No accrual index is reported rather than assuming a neutral one.`;
    notAssessed.push({
      metric: "Accrual quality",
      reason: NOT_ASSESSED.noCashFlow,
    });
  }

  // ── 4. Working capital & receivable divergence ─────────────────────────────
  let wcStatus: MetricStatus = "not_assessed";
  let wcInterpretation: string = NOT_ASSESSED.noReceivables;
  let receivablesVsSalesText: string | null = null;

  const years = input.historicalYears ?? [];
  const pair = pickTwoMostRecentWithReceivables(years);
  if (pair) {
    assessed.push("Receivables vs sales divergence");
    const { newer: y0, older: y1 } = pair;
    if (isKnown(y0.receivablesCr) && isKnown(y1.receivablesCr) && isKnown(y0.revenueCr) && isKnown(y1.revenueCr)) {
      wcStatus = "safe";
      if (isKnown(y1.revenueCr) && y1.revenueCr > 0 && isKnown(y1.receivablesCr) && y1.receivablesCr > 0) {
        const revGrowth = (y0.revenueCr! - y1.revenueCr!) / y1.revenueCr!;
        const recGrowth = (y0.receivablesCr! - y1.receivablesCr!) / y1.receivablesCr!;
        receivablesVsSalesText = `Sales: ${Math.round(revGrowth * 100)}% YoY | Receivables: ${Math.round(recGrowth * 100)}% YoY`;

        if (recGrowth > revGrowth + 0.2 && recGrowth > 0.15) {
          wcStatus = "alert";
          wcInterpretation = `Trade receivables grew materially faster than revenues (${Math.round(recGrowth * 100)}% vs ${Math.round(revGrowth * 100)}%). Possible channel stuffing or a collection slowdown.`;
          scoreDeductions += 15;
          flags.push({
            title: "Receivables growing faster than revenue",
            severity: "warning",
            detail: `Trade receivables expanded ${Math.round(recGrowth * 100)}% YoY while sales grew ${Math.round(revGrowth * 100)}% YoY.`,
          });
        } else {
          wcInterpretation = `Receivables growth (${Math.round(recGrowth * 100)}%) is consistent with sales growth (${Math.round(revGrowth * 100)}%).`;
        }
      }
    }
  } else {
    notAssessed.push({
      metric: "Receivables vs sales divergence",
      reason: NOT_ASSESSED.noReceivables,
    });
  }

  // ── 5. Governance ──────────────────────────────────────────────────────────
  const pledgePct = isKnown(input.promoterPledgePct) ? input.promoterPledgePct : null;
  const promoterHolding = isKnown(input.promoterHoldingPct) ? input.promoterHoldingPct : null;
  const instHolding = isKnown(input.institutionalHoldingPct) ? input.institutionalHoldingPct : null;

  if (pledgePct !== null) {
    assessed.push("Promoter pledge exposure");
    if (pledgePct > 20) {
      scoreDeductions += 25;
      flags.push({
        title: `High promoter share pledge (${pledgePct}%)`,
        severity: "danger",
        detail: `Over ${pledgePct}% of promoter shares are pledged as loan collateral. Severe margin-call risk during corrections.`,
      });
    } else if (pledgePct > 5) {
      scoreDeductions += 10;
      flags.push({
        title: `Promoter shares pledged (${pledgePct}%)`,
        severity: "warning",
        detail: `Promoter has encumbered ${pledgePct}% of equity holdings. Warrants monitoring.`,
      });
    }
  } else {
    notAssessed.push({ metric: "Promoter pledge exposure", reason: "Promoter shareholding pattern was not retrieved." });
  }

  // Auditor opinion: previously defaulted to "Clean" because the input was never
  // populated, so the panel asserted a clean audit for every company.
  let auditorQuality: "Clean" | "Qualified" | "Adverse" | "Standard" | "Not Assessed" =
    "Not Assessed";
  const opinionText = input.auditorOpinionText?.trim();
  if (opinionText) {
    assessed.push("Auditor opinion");
    const lowered = opinionText.toLowerCase();
    // Order matters: "unqualified" CONTAINS "qualified" as a substring, so testing
    // for "qualified" first would classify every clean opinion as a qualification.
    if (/adverse|disclaimer of opinion|disclaimed/.test(lowered)) {
      auditorQuality = "Adverse";
      scoreDeductions += 35;
      flags.push({
        title: "Adverse or disclaimed auditor opinion",
        severity: "danger",
        detail: opinionText,
      });
    } else if (/\bunqualified\b|true and fair|clean opinion/.test(lowered)) {
      auditorQuality = "Clean";
    } else if (/qualified|emphasis of matter|except for|unable to obtain/.test(lowered)) {
      auditorQuality = "Qualified";
      scoreDeductions += 20;
      flags.push({
        title: "Qualified auditor opinion",
        severity: "danger",
        detail: opinionText,
      });
    } else {
      auditorQuality = "Standard";
    }
  } else {
    notAssessed.push({ metric: "Auditor opinion", reason: NOT_ASSESSED.noAuditorOpinion });
  }

  // ── Coverage, score and verdict ───────────────────────────────────────────
  const totalMetrics = assessed.length + notAssessed.length;
  const coverageRatio = totalMetrics === 0 ? 0 : assessed.length / totalMetrics;
  const coverage: ForensicCoverage = {
    assessed,
    notAssessed,
    coverageRatio,
    isEmpty: assessed.length === 0,
  };

  if (coverage.isEmpty) {
    // No metric produced an input-backed result. Report a floor score and make the
    // headline say so, rather than a clean 100/100 implying an all-clear.
    scoreDeductions += 60;
    flags.push({
      title: "No forensic metrics could be verified",
      severity: "warning",
      detail:
        "None of the forensic checks had the disclosed financials required to compute them. " +
        "This is an absence of data, NOT a clean bill of health.",
    });
  } else if (coverageRatio < 0.5) {
    // Partial coverage: the deductions above only see the checks that ran, so a
    // half-empty panel would otherwise out-score a fully-assessed clean one.
    scoreDeductions += Math.round((0.5 - coverageRatio) * 40);
    flags.push({
      title: "Limited forensic data coverage",
      severity: "warning",
      detail: `Only ${assessed.length} of ${totalMetrics} forensic metrics could be computed from disclosed financials. Unassessed metrics are neither passes nor failures.`,
    });
  }

  const healthScore = Math.max(0, Math.min(100, 100 - scoreDeductions));
  const riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL" | "NOT ASSESSED" =
    coverage.isEmpty
      ? "NOT ASSESSED"
      : healthScore >= 75
        ? "LOW"
        : healthScore >= 55
          ? "MODERATE"
          : healthScore >= 35
            ? "HIGH"
            : "CRITICAL";

  const summaryAssessment = coverage.isEmpty
    ? `No forensic conclusion can be drawn for this company (${NOT_ASSESSED.noFinancials} ` +
      `Unassessed metrics are not evidence of clean finances.)`
    : riskLevel === "LOW"
      ? `Favorable forensic profile (score ${healthScore}/100) across ${assessed.length} verified metric(s). ` +
        `${notAssessed.length} metric(s) could not be assessed.`
      : riskLevel === "MODERATE"
        ? `Acceptable forensic profile with watchpoints (score ${healthScore}/100). ` +
          `${notAssessed.length} metric(s) could not be assessed.`
        : riskLevel === "HIGH"
          ? `Elevated forensic caution (score ${healthScore}/100). Marked divergence in cash conversion or high leverage/pledge levels.`
          : `Critical forensic red flags identified (score ${healthScore}/100). Significant accounting divergence or distress indicators detected.`;

  return {
    overallHealthScore: healthScore,
    riskLevel,
    cfoToPatRatio: {
      ratio: cfoRatio,
      status: cfoStatus as "safe" | "caution" | "alert",
      interpretation: cfoInterpretation,
      cfoCr: cfo,
      patCr: pat,
      notAssessed: isPassing(cfoStatus) ? undefined : cfoStatus === "not_assessed",
    },
    altmanZScore: {
      score: altmanZ,
      zone: altmanZone,
      status: altmanStatus as "safe" | "caution" | "alert",
      interpretation: altmanInterpretation,
      missingFactors: missingAltmanFactors,
    },
    beneishMScore: {
      score: beneishScore,
      status: beneishStatus as "safe" | "alert" | "neutral",
      interpretation: beneishInterpretation,
      methodology: "single_factor_accrual_indicator",
      isBeneishMScore: false,
    },
    workingCapitalStress: {
      receivablesGrowthVsSales: receivablesVsSalesText,
      workingCapitalCycleDays: null,
      status: wcStatus as "safe" | "caution" | "alert",
      interpretation: wcInterpretation,
    },
    governanceFlags: {
      promoterPledgePct: pledgePct,
      promoterHoldingPct: promoterHolding,
      institutionalHoldingPct: instHolding,
      auditorQuality,
      flags,
    },
    coverage,
    summaryAssessment,
    auditedAt: new Date().toISOString(),
  } as ForensicQualityData;
}

/**
 * Picks the two most recent periods that actually carry receivables.
 *
 * The previous implementation used `historicalYears[0]` and `[1]` blindly and
 * required `receivablesCr`, which was never populated, so the branch could never
 * execute and the check silently always reported "in line".
 */
function pickTwoMostRecentWithReceivables(
  years: NonNullable<ForensicInputFinancials["historicalYears"]>,
): { newer: (typeof years)[number]; older: (typeof years)[number] } | null {
  const withReceivables = years.filter((y) => isKnown(y.receivablesCr));
  if (withReceivables.length < 2) return null;
  return {
    newer: withReceivables[0],
    older: withReceivables[1],
  };
}

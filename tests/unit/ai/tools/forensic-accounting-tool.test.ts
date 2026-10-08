/**
 * Unit tests for the forensic accounting engine.
 *
 * This file had no coverage at all, which is why the engine could report a
 * PASSING Beneish score and a `Clean` auditor opinion for a company with no
 * financials, and a 100/100 health score for a company with no verifiable inputs.
 * Those behaviours are pinned here so they cannot come back.
 */

import { describe, it, expect } from "vitest";
import {
  computeForensicQuality,
  NOT_ASSESSED,
  type ForensicInputFinancials,
} from "@/lib/ai/tools/forensic-accounting-tool";

const empty: ForensicInputFinancials = {
  ticker: "UNKNOWN",
  companyName: "Unknown Company",
};

/** A fully-disclosed, healthy balance sheet — the only case that should score well. */
const healthy: ForensicInputFinancials = {
  ticker: "TCS.NS",
  companyName: "Tata Consultancy Services",
  revenueCr: 240893,
  ebitdaCr: 63000,
  patCr: 46000,
  cfoCr: 47000,
  totalDebtCr: 8000,
  totalCashCr: 40000,
  marketCapCr: 1375600,
  bookValueCr: 220000,
  sharesOutstandingCr: 362,
  currentAssetsCr: 150000,
  currentLiabilitiesCr: 60000,
  totalAssetsCr: 400000,
  retainedEarningsCr: 150000,
  tradeReceivablesCr: 55000,
  promoterPledgePct: 0,
  promoterHoldingPct: 72,
  institutionalHoldingPct: 18,
  auditorOpinionText: "We have audited the accompanying financial statements... unqualified opinion.",
  historicalYears: [
    { period: "FY25", revenueCr: 220000, patCr: 41000, cfoCr: 42000, receivablesCr: 48000 },
    { period: "FY24", revenueCr: 195000, patCr: 36000, cfoCr: 37000, receivablesCr: 42000 },
  ],
};

describe("absence of evidence is not evidence of safety", () => {
  it("does NOT certify a company with no financials at all", () => {
    const r = computeForensicQuality(empty);

    // Previously: no deductions were possible, so scoreDeductions stayed 0 and the
    // engine returned 100/100 LOW risk for a company it had never seen.
    expect(r.overallHealthScore).toBeLessThan(60);
    expect(r.riskLevel).toBe("NOT ASSESSED");
    expect(r.coverage?.isEmpty).toBe(true);
    expect(r.coverage?.assessed).toHaveLength(0);
    expect(r.coverage?.notAssessed.length).toBeGreaterThan(0);
  });

  it("states plainly that nothing could be verified", () => {
    const r = computeForensicQuality(empty);
    expect(r.summaryAssessment).toMatch(/no forensic conclusion/i);
    expect(r.summaryAssessment).toMatch(/no audited financial data was available/i);
    // Must not read as a clean bill of health.
    expect(r.summaryAssessment).not.toMatch(/high-quality forensic profile/i);
    expect(r.summaryAssessment).not.toMatch(/favorable forensic profile/i);
  });

  it("flags the missing-data condition as a red flag rather than ignoring it", () => {
    const r = computeForensicQuality(empty);
    expect(r.governanceFlags.flags.some((f) => f.title.includes("No forensic metrics"))).toBe(true);
  });

  it("does not report a passing Beneish score when inputs are missing", () => {
    const r = computeForensicQuality(empty);
    // The old code returned -2.35 with status "safe" here.
    expect(r.beneishMScore.score).toBeNull();
    expect(r.beneishMScore.status).toBe("not_assessed");
    expect(r.beneishMScore.isBeneishMScore).toBe(false);
  });

  it("does not report an Altman Z-Score when balance sheet factors are missing", () => {
    const r = computeForensicQuality(empty);
    expect(r.altmanZScore.score).toBeNull();
    expect(r.altmanZScore.zone).toBe("Not Assessed");
    expect(r.altmanZScore.status).toBe("not_assessed");
  });

  it("names the specific balance-sheet items that are missing", () => {
    const r = computeForensicQuality(empty);
    expect(r.altmanZScore.missingFactors).toBeDefined();
    expect(r.altmanZScore.missingFactors!.length).toBeGreaterThan(0);
    expect(r.altmanZScore.interpretation).toMatch(/not disclosed/i);
  });

  it("does not report a CFO/PAT ratio when cash flow is undisclosed", () => {
    const r = computeForensicQuality({ ...empty, patCr: 10000 });
    expect(r.cfoToPatRatio.ratio).toBeNull();
    expect(r.cfoToPatRatio.status).toBe("not_assessed");
  });

  it("does not report a receivables divergence when receivables are undisclosed", () => {
    const r = computeForensicQuality({
      ...empty,
      revenueCr: 100000,
      historicalYears: [{ period: "FY25", revenueCr: 100000 }],
    });
    expect(r.workingCapitalStress.status).toBe("not_assessed");
    expect(r.workingCapitalStress.receivablesGrowthVsSales).toBeNull();
  });

  it("does not report a promoter pledge of 0% when the pattern was not retrieved", () => {
    const r = computeForensicQuality({ ...empty, revenueCr: 100000, patCr: 10000, cfoCr: 11000 });
    expect(r.governanceFlags.promoterPledgePct).toBeNull();
  });

  it("does NOT report a Clean auditor opinion when no report text was read", () => {
    const r = computeForensicQuality({ ...empty, revenueCr: 100000, patCr: 10000, cfoCr: 11000 });
    // The old code hardcoded "Clean" for every company.
    expect(r.governanceFlags.auditorQuality).toBe("Not Assessed");
  });

  it("does not report a working-capital cycle figure it never computed", () => {
    const r = computeForensicQuality(healthy);
    // Always null: the engine has no basis for it, so it must not invent one.
    expect(r.workingCapitalStress.workingCapitalCycleDays).toBeNull();
  });
});

describe("partial coverage must not out-score full coverage", () => {
  it("deducts when fewer than half the metrics could be assessed", () => {
    const full = computeForensicQuality(healthy);
    const partial = computeForensicQuality({
      ...healthy,
      // Remove the balance-sheet lines the solvency structure needs, plus the
      // receivables history and the auditor's opinion, so most metrics are unassessable.
      currentAssetsCr: null,
      currentLiabilitiesCr: null,
      totalAssetsCr: null,
      retainedEarningsCr: null,
      tradeReceivablesCr: null,
      auditorOpinionText: null,
      historicalYears: [
        { period: "FY25", revenueCr: 220000, patCr: 41000, cfoCr: 42000 },
        { period: "FY24", revenueCr: 195000, patCr: 36000, cfoCr: 37000 },
      ],
    });

    expect(partial.coverage!.assessed.length).toBeLessThan(partial.coverage!.notAssessed.length);
    expect(partial.coverage!.coverageRatio).toBeLessThan(0.5);
    expect(partial.overallHealthScore).toBeLessThan(full.overallHealthScore);
    expect(partial.riskLevel).not.toBe("NOT ASSESSED");
  });

  it("lists each unassessed metric with its reason", () => {
    const r = computeForensicQuality({
      ...healthy,
      totalAssetsCr: null,
      retainedEarningsCr: null,
      currentAssetsCr: null,
      currentLiabilitiesCr: null,
    });

    const names = r.coverage!.notAssessed.map((n) => n.metric);
    expect(names).toContain("Solvency structure (Altman Z factor form)");
    expect(r.coverage!.notAssessed.every((n) => n.reason.length > 0)).toBe(true);
  });
});

describe("CFO / PAT cash conversion", () => {
  it("passes at or above 1.0x conversion", () => {
    const r = computeForensicQuality({ ...healthy, cfoCr: 47000, patCr: 46000 });
    expect(r.cfoToPatRatio.ratio).toBeCloseTo(1.02, 1);
    expect(r.cfoToPatRatio.status).toBe("safe");
  });

  it("warns between 0.65x and 1.0x", () => {
    const r = computeForensicQuality({ ...healthy, cfoCr: 35000, patCr: 46000 });
    expect(r.cfoToPatRatio.status).toBe("caution");
    expect(r.overallHealthScore).toBeLessThan(100);
  });

  it("alerts below 0.65x", () => {
    const r = computeForensicQuality({ ...healthy, cfoCr: 20000, patCr: 46000 });
    expect(r.cfoToPatRatio.status).toBe("alert");
    expect(r.governanceFlags.flags.some((f) => f.severity === "danger")).toBe(true);
  });

  it("alerts on negative operating cash flow with positive profit", () => {
    const r = computeForensicQuality({ ...healthy, cfoCr: -5000, patCr: 46000 });
    expect(r.cfoToPatRatio.status).toBe("alert");
    expect(r.cfoToPatRatio.interpretation).toMatch(/negative operating cash flow/i);
  });

  it("reports cash flow direction rather than a ratio for a loss-making company", () => {
    const r = computeForensicQuality({ ...healthy, cfoCr: 3000, patCr: -10000 });
    // CFO/PAT is undefined for a loss, so no ratio is invented.
    expect(r.cfoToPatRatio.ratio).toBeNull();
    expect(r.cfoToPatRatio.status).toBe("safe");
    expect(r.cfoToPatRatio.interpretation).toMatch(/remained positive/i);
  });
});

describe("solvency structure (Altman Z factor form)", () => {
  it("computes a score only when all five factors are disclosed", () => {
    const r = computeForensicQuality(healthy);
    expect(r.altmanZScore.score).not.toBeNull();
    expect(r.altmanZScore.status).not.toBe("not_assessed");
    expect(r.altmanZScore.missingFactors ?? []).toHaveLength(0);
  });

  it("classifies the Safe zone above 2.99", () => {
    const r = computeForensicQuality(healthy);
    expect(r.altmanZScore.score!).toBeGreaterThan(2.99);
    expect(r.altmanZScore.zone).toBe("Safe");
    expect(r.altmanZScore.status).toBe("safe");
  });

  it("classifies the Distress zone below 1.81", () => {
    const r = computeForensicQuality({
      ...healthy,
      // Heavy debt, thin equity, low asset turns.
      totalDebtCr: 380000,
      totalCashCr: 1000,
      bookValueCr: 20000,
      marketCapCr: 60000,
      revenueCr: 120000,
      ebitdaCr: 12000,
      currentAssetsCr: 40000,
      currentLiabilitiesCr: 35000,
      totalAssetsCr: 400000,
      retainedEarningsCr: 5000,
    });
    expect(r.altmanZScore.score!).toBeLessThan(1.81);
    expect(r.altmanZScore.zone).toBe("Distress");
    expect(r.altmanZScore.status).toBe("alert");
  });

  it("does not substitute constants for missing factors", () => {
    // Only revenue and PAT are known. The old code filled X1 with 0.15, X2 with 0.4,
    // X4 with 4.5 and total assets with 500 Cr, then reported a Z-Score.
    const r = computeForensicQuality({
      ...empty,
      revenueCr: 100000,
      patCr: 10000,
      ebitdaCr: 20000,
      marketCapCr: 500000,
    });
    expect(r.altmanZScore.score).toBeNull();
    expect(r.altmanZScore.status).toBe("not_assessed");
  });
});

describe("accrual quality indicator", () => {
  it("is labelled as a single-factor indicator, not a Beneish M-Score", () => {
    const r = computeForensicQuality(healthy);
    expect(r.beneishMScore.methodology).toBe("single_factor_accrual_indicator");
    expect(r.beneishMScore.isBeneishMScore).toBe(false);
    expect(r.beneishMScore.interpretation).toMatch(/not the 8-variable Beneish model/i);
  });

  it("passes for a company whose profit is cash-backed", () => {
    const r = computeForensicQuality({ ...healthy, cfoCr: 47000, patCr: 46000 });
    expect(r.beneishMScore.score).not.toBeNull();
    expect(r.beneishMScore.status).toBe("safe");
  });

  it("alerts when profit far exceeds operating cash flow", () => {
    // Accruals of (46000 - (-10000)) / 400000 = 0.14 lifts the index above -1.78.
    const r = computeForensicQuality({ ...healthy, cfoCr: -10000, patCr: 46000 });
    expect(r.beneishMScore.status).toBe("alert");
    expect(r.beneishMScore.score!).toBeGreaterThan(-1.78);
    expect(r.governanceFlags.flags.some((f) => f.title.includes("accrual"))).toBe(true);
  });
});

describe("receivables vs sales divergence", () => {
  it("alerts when receivables outgrow sales by more than 20pp and 15%", () => {
    const r = computeForensicQuality({
      ...healthy,
      historicalYears: [
        { period: "FY25", revenueCr: 100000, receivablesCr: 60000 },
        { period: "FY24", revenueCr: 90000, receivablesCr: 30000 },
      ],
    });
    expect(r.workingCapitalStress.status).toBe("alert");
    expect(r.workingCapitalStress.receivablesGrowthVsSales).toMatch(/Sales: 11% YoY \| Receivables: 100% YoY/);
  });

  it("passes when receivables grow in line with sales", () => {
    const r = computeForensicQuality({
      ...healthy,
      historicalYears: [
        { period: "FY25", revenueCr: 110000, receivablesCr: 55000 },
        { period: "FY24", revenueCr: 100000, receivablesCr: 50000 },
      ],
    });
    expect(r.workingCapitalStress.status).toBe("safe");
  });

  it("ignores periods that carry no receivables rather than treating them as zero", () => {
    const r = computeForensicQuality({
      ...healthy,
      historicalYears: [
        { period: "FY25", revenueCr: 110000 },
        { period: "FY24", revenueCr: 100000, receivablesCr: 50000 },
      ],
    });
    expect(r.workingCapitalStress.status).toBe("not_assessed");
  });
});

describe("governance", () => {
  it("flags a promoter pledge above 20%", () => {
    const r = computeForensicQuality({ ...healthy, promoterPledgePct: 35 });
    expect(r.governanceFlags.flags.some((f) => f.title.includes("High promoter share pledge"))).toBe(true);
    expect(r.overallHealthScore).toBeLessThan(80);
  });

  it("warns on a pledge between 5% and 20%", () => {
    const r = computeForensicQuality({ ...healthy, promoterPledgePct: 12 });
    expect(r.governanceFlags.flags.some((f) => f.title.includes("Promoter shares pledged"))).toBe(true);
  });

  it("does not flag a company whose pledge was never retrieved", () => {
    const r = computeForensicQuality({ ...healthy, promoterPledgePct: null });
    expect(r.governanceFlags.flags.some((f) => f.title.includes("pledge"))).toBe(false);
  });

  it("flags a qualified auditor opinion", () => {
    const r = computeForensicQuality({
      ...healthy,
      auditorOpinionText: "Qualified opinion: we are unable to obtain sufficient evidence regarding inventory.",
    });
    expect(r.governanceFlags.auditorQuality).toBe("Qualified");
    expect(r.overallHealthScore).toBeLessThan(85);
  });

  it("flags an adverse opinion", () => {
    const r = computeForensicQuality({
      ...healthy,
      auditorOpinionText: "Adverse opinion: the financial statements do not present fairly.",
    });
    expect(r.governanceFlags.auditorQuality).toBe("Adverse");
  });

  it("treats an unqualified opinion as clean", () => {
    const r = computeForensicQuality({
      ...healthy,
      auditorOpinionText: "Unqualified opinion: true and fair view.",
    });
    expect(r.governanceFlags.auditorQuality).toBe("Clean");
  });
});

describe("health score and risk bands", () => {
  it("clamps the score to 0-100", () => {
    const r = computeForensicQuality({
      ...healthy,
      cfoCr: -5000,
      patCr: 46000,
      promoterPledgePct: 40,
      auditorOpinionText: "Adverse opinion.",
    });
    expect(r.overallHealthScore).toBeGreaterThanOrEqual(0);
    expect(r.overallHealthScore).toBeLessThanOrEqual(100);
  });

  it("maps score bands to risk levels", () => {
    expect(computeForensicQuality(healthy).riskLevel).toBe("LOW");

    const moderate = computeForensicQuality({ ...healthy, cfoCr: 35000, patCr: 46000 });
    expect(moderate.overallHealthScore).toBeLessThan(100);
    expect(["LOW", "MODERATE"]).toContain(moderate.riskLevel);
  });

  it("never returns a risk level for an unassessable company", () => {
    const r = computeForensicQuality(empty);
    expect(r.riskLevel).toBe("NOT ASSESSED");
  });
});

describe("NOT_ASSESSED reason catalogue", () => {
  it("covers every metric the engine can decline to compute", () => {
    const reasons = Object.values(NOT_ASSESSED);
    expect(reasons.length).toBeGreaterThanOrEqual(5);
    for (const reason of reasons) {
      expect(typeof reason).toBe("string");
      expect(reason.length).toBeGreaterThan(10);
    }
  });
});

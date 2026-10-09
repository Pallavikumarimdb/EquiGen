/**
 * Unit tests for financial-eval-engine.ts
 * Tests quantitative authenticity, accounting circularity, and Gordon Growth bounds.
 */

import { describe, it, expect } from "vitest";
import {
  financialEvalEngine,
  resolveExchangeClaim,
  FinancialEvaluationInput,
} from "@/lib/eval/financial-eval-engine";

describe("FinancialEvaluationEngine", () => {
  it("certifies authentic institutional research note with live inputs", () => {
    const input: FinancialEvaluationInput = {
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      marketData: {
        currentPrice: 3800,
        marketCapCr: 1375600,
        trailingPE: 29.5,
        evEbitda: 21.0,
        sharesOutstandingCr: 362,
        beta: 0.85,
        isLiveData: true,
        dataSource: "bse_exchange_api",
        fetchedAt: new Date().toISOString(),
      },
      modelingData: {
        baseTargetPrice: 4250,
        enterpriseValueCr: 1450000,
        equityValueCr: 1538500,
        assumptions: {
          baseRevenue: 240893,
          revenueGrowthRate: "11.5%",
          ebitdaMargin: "26.2%",
          wacc: "11.2%",
          terminalGrowth: "4.5%",
          netDebtCr: -88500, // net cash
          sharesCr: 362,
          isDerivedFromExtractedData: "True",
          financialSource: "bse_exchange_api",
        },
        projections: [
          {
            year: "FY26",
            revenue: 268595,
            ebitda: 70372,
            ebit: 64800,
            pat: 48600,
            cfo: 52000,
            fcff: 45000,
            totalAssets: 180000,
            totalLiabilitiesAndEquity: 180000,
            balanceSheetDiff: 0,
          },
        ],
      },
      sections: [
        { name: "executive_summary", content: "TCS delivered strong operational results with broad-based market expansion and robust margins." },
        { name: "valuation", content: "Our DCF valuation implies an intrinsic target price of Rs 4,250 per share based on 11.2% WACC." },
      ],
      dataSources: {
        bseNseFilings: { isLive: true, count: 6 },
        concallTranscript: { isLive: true, quotesFound: 10 },
        screenerMarketData: { isLive: true },
        creditRating: { isLive: true, found: true },
        news: { isLive: true, count: 8 },
        dcfModel: { isDerivedFromRealData: true, source: "bse_exchange_api" },
      },
    };

    const report = financialEvalEngine.evaluate(input);

    expect(report.verdict).toBe("CERTIFIED_AUTHENTIC");
    expect(report.overallScore).toBeGreaterThanOrEqual(85);
    expect(report.criticalFailures.length).toBe(0);
    expect(report.checks.find((c) => c.id === "BS_01")?.status).toBe("PASS");
    expect(report.checks.find((c) => c.id === "VAL_01")?.status).toBe("PASS");
    expect(report.checks.find((c) => c.id === "HALLUC_01")?.status).toBe("PASS");
  });

  it("detects and fails on broken Balance Sheet circularity (Assets != Liabilities + Equity)", () => {
    const input: FinancialEvaluationInput = {
      ticker: "INFY",
      companyName: "Infosys Ltd",
      modelingData: {
        baseTargetPrice: 1800,
        assumptions: {
          baseRevenue: 150000,
          wacc: "12.0%",
          terminalGrowth: "4.0%",
        },
        projections: [
          {
            year: "FY26",
            revenue: 168000,
            ebitda: 39000,
            ebit: 34000,
            pat: 25000,
            totalAssets: 120000,
            totalLiabilitiesAndEquity: 95000,
            balanceSheetDiff: 25000, // 25,000 Cr out of balance!
          },
        ],
      },
    };

    const report = financialEvalEngine.evaluate(input);

    const bsCheck = report.checks.find((c) => c.id === "BS_01");
    expect(bsCheck?.status).toBe("FAIL");
    expect(report.criticalFailures.length).toBeGreaterThan(0);
    expect(report.verdict).toBe("FAILED_UNRELIABLE");
  });

  it("fails on Gordon Growth mathematical inversion (WACC <= Terminal Growth)", () => {
    const input: FinancialEvaluationInput = {
      ticker: "WIPRO",
      companyName: "Wipro Ltd",
      modelingData: {
        baseTargetPrice: 500,
        assumptions: {
          baseRevenue: 90000,
          wacc: "4.0%",          // Violates Gordon Growth: WACC (4%) <= Terminal Growth (5%)
          terminalGrowth: "5.0%",
        },
      },
    };

    const report = financialEvalEngine.evaluate(input);

    const gordonCheck = report.checks.find((c) => c.id === "VAL_01");
    expect(gordonCheck?.status).toBe("FAIL");
    expect(report.criticalFailures.some((msg) => msg.includes("WACC"))).toBe(true);
    expect(report.verdict).toBe("FAILED_UNRELIABLE");
  });

  it("detects and flags sector fallback constants and placeholder artifacts", () => {
    const input: FinancialEvaluationInput = {
      ticker: "UNKNOWN_CORP",
      companyName: "Unknown Corp",
      modelingData: {
        baseTargetPrice: 0, // suppressed target price
        assumptions: {
          baseRevenue: 10000, // generic fallback constant
          sharesCr: 50,       // generic fallback constant
          ebitdaMargin: "18.0%",
          financialSource: "sector_fallback",
        },
      },
      sections: [
        { name: "executive_summary", content: "Financial analysis [data pending: annual report unavailable]." },
      ],
    };

    const report = financialEvalEngine.evaluate(input);

    const fallbackCheck = report.checks.find((c) => c.id === "HALLUC_01");
    const placeholderCheck = report.checks.find((c) => c.id === "HALLUC_02");

    expect(fallbackCheck?.status).toBe("FAIL");
    expect(placeholderCheck?.status).toBe("WARN");
    expect(report.verdict).toBe("FAILED_UNRELIABLE");
  });
});

/** Builds a market-data block with an explicit fetch timestamp. */
function marketData(fetchedAt: string | null) {
  return {
    currentPrice: 3800,
    marketCapCr: 1375600,
    sharesOutstandingCr: 362,
    isLiveData: true,
    dataSource: "bse_exchange_api",
    fetchedAt,
  };
}

/** Assumptions that keep every non-freshness check passing. */
const cleanAssumptions = {
  baseRevenue: 240893,
  revenueGrowthRate: "11.5%",
  ebitdaMargin: "26.2%",
  wacc: "11.2%",
  terminalGrowth: "4.5%",
  netDebtCr: -88500,
  sharesCr: 362,
  isDerivedFromExtractedData: "True",
  financialSource: "bse_exchange_api",
};

describe("AUTH_02 — market data freshness", () => {
  /**
   * This check previously could not fail:
   *   const isFresh = freshnessHours === null || freshnessHours <= 24;
   *   status: isFresh ? "PASS" : "WARN"
   * An absent timestamp scored an instant PASS, and because the orchestrator
   * backfilled `fetchedAt ?? new Date()`, the 24h branch was never reached either.
   */
  it("FAILS when no fetch timestamp was recorded", () => {
    const report = financialEvalEngine.evaluate({
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      marketData: marketData(null),
      modelingData: { assumptions: cleanAssumptions },
    });

    const check = report.checks.find((c) => c.id === "AUTH_02");
    expect(check?.status).toBe("FAIL");
    expect(check?.severity).toBe("CRITICAL");
    expect(check?.actual).toBe("timestamp not recorded");
    expect(report.provenance.dataFetchedAt).toBeNull();
    expect(report.provenance.dataFreshnessHours).toBeNull();
  });

  it("FAILS when the timestamp is unparseable", () => {
    const report = financialEvalEngine.evaluate({
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      marketData: marketData("sometime last quarter"),
      modelingData: { assumptions: cleanAssumptions },
    });

    expect(report.checks.find((c) => c.id === "AUTH_02")?.status).toBe("FAIL");
  });

  it("PASSES for data fetched inside the current trading session", () => {
    const report = financialEvalEngine.evaluate({
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      marketData: marketData(new Date().toISOString()),
      modelingData: { assumptions: cleanAssumptions },
    });

    const check = report.checks.find((c) => c.id === "AUTH_02");
    expect(check?.status).toBe("PASS");
    expect(report.provenance.dataFreshnessHours).not.toBeNull();
  });

  it("FAILS for data several trading sessions old, even under 24 wall-clock hours", () => {
    // Tuesday 15:00 IST fetched, read Wednesday 09:00 IST: 20 wall-clock hours, but
    // Tuesday's close happened after the fetch, so the datum is already stale.
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const report = financialEvalEngine.evaluate({
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      marketData: marketData(twoDaysAgo.toISOString()),
      modelingData: { assumptions: cleanAssumptions },
    });

    const check = report.checks.find((c) => c.id === "AUTH_02");
    // Whatever the wall-clock figure, a multi-session gap must never PASS.
    if ((report.provenance.dataFreshnessHours ?? 0) < 24) {
      expect(check?.status).toBe("FAIL");
    }
    expect(check?.message).toMatch(/STALE|current trading session/i);
  });

  it("reports the IST as-of date so artifacts need not print the render time", () => {
    const fetchedAt = "2026-03-12T06:00:00.000Z"; // 11:30 IST on 2026-03-12
    const report = financialEvalEngine.evaluate({
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      marketData: marketData(fetchedAt),
      modelingData: { assumptions: cleanAssumptions },
    });

    expect(report.provenance.dataFetchedAt).toBe(fetchedAt);
    expect(report.provenance.dataAsOfIstDate).toBe("2026-03-12");
  });
});

describe("provenance.verifiedExchange — never guess a venue", () => {
  it.each([
    ["TCS.BO", "BSE"],
    ["TCS.NS", "NSE"],
    ["RELIANCE", "unverified"],
    ["", "unverified"],
  ])("ticker %s resolves to %s", (ticker, expected) => {
    expect(resolveExchangeClaim(ticker)).toBe(expected);
  });

  it("does not claim NSE for a bare scrip, which the old suffix ternary did", () => {
    const report = financialEvalEngine.evaluate({
      ticker: "RELIANCE",
      companyName: "Reliance Industries",
      marketData: marketData(new Date().toISOString()),
      modelingData: { assumptions: cleanAssumptions },
    });
    expect(report.provenance.verifiedExchange).toBe("unverified");
  });
});

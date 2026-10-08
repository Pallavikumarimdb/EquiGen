/**
 * Unit tests for financial-eval-engine.ts
 * Tests quantitative authenticity, accounting circularity, and Gordon Growth bounds.
 */

import { describe, it, expect } from "vitest";
import { financialEvalEngine, FinancialEvaluationInput } from "@/lib/eval/financial-eval-engine";

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

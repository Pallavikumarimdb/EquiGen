/**
 * Unit tests for pipeline-eval.ts (RC-9 Data Quality Evaluation Suite)
 */

import { describe, it, expect } from "vitest";
import { pipelineEval, AgentRunSnapshot } from "@/lib/eval/pipeline-eval";

describe("pipelineEval", () => {
  it("passes all checks with score 100% for high-quality live agent run", async () => {
    const liveSnapshot: AgentRunSnapshot = {
      yahoo: {
        ticker: "RELIANCE",
        currency: "INR",
        isLiveData: true,
        dataSource: "quoteSummary",
        revenueCr: 900000,
        marketCapCr: 1990000,
        ebitdaMargin: 0.18,
        trailingPE: 28.5,
        beta: 1.1,
        fetchedAt: new Date().toISOString(),
        currentPrice: 2950,
        ebitdaCr: 160000,
        netIncomeCr: 75000,
        epsCurrent: 110,
        epsGrowth: 0.1,
        totalDebtCr: 300000,
        cashCr: 150000,
        netDebtCr: 150000,
        bookValuePerShare: 1100,
        enterpriseValueCr: 2140000,
        sharesOutstandingCr: 670,
        forwardPE: 25,
        priceToBook: 2.7,
        dividendYield: 0.004,
        revenueGrowthYoY: 0.12,
        grossMargin: 0.35,
        operatingMargin: 0.16,
        evEbitda: 18.5,
      },
      modelingDataQuality: {
        isDerivedFromRealData: true,
        financialSource: "yahoo_finance_quoteSummary",
        baseRevenue: 900000,
        disclaimer: null,
      },
      modelOutput: {
        baseTargetPrice: 3450,
        assumptions: {
          revenueGrowthRate: "14.5%",
          ebitdaMargin: "17.8%",
        },
      },
      sections: [
        { name: "executive_summary", content: "A".repeat(150) },
        { name: "business_description", content: "B".repeat(150) },
        { name: "financial_analysis", content: "C".repeat(150) },
        { name: "valuation", content: "D".repeat(150) },
        { name: "key_risks", content: "E".repeat(150) },
        { name: "management_qa_highlights", content: "F".repeat(150) },
      ],
      dataSources: {
        bseNseFilings: { isLive: true, count: 5 },
        concallTranscript: { isLive: true, quotesFound: 8 },
        screenerMarketData: { isLive: true },
        creditRating: { isLive: true, found: true },
        news: { isLive: true, count: 10 },
        dcfModel: { isDerivedFromRealData: true, source: "yahoo_finance_quoteSummary" },
      },
    };

    const report = await pipelineEval.run("RELIANCE", liveSnapshot);

    expect(report.overallStatus).toBe("PASS");
    expect(report.score).toBe(100);
    expect(report.dataQualityScore).toBe(1.0);
    expect(report.checks.find((c) => c.name === "Live Data Gate")?.status).toBe("PASS");
    expect(report.checks.find((c) => c.name === "Sector Fallback Detection")?.status).toBe("PASS");
    expect(report.checks.find((c) => c.name === "Target Price Gate")?.status).toBe("PASS");
    expect(report.checks.find((c) => c.name === "Section Completeness")?.status).toBe("PASS");
  });

  it("detects and flags fallback data when agent uses sector fallback", async () => {
    const fallbackSnapshot: AgentRunSnapshot = {
      yahoo: null,
      modelingDataQuality: {
        isDerivedFromRealData: false,
        financialSource: "sector_fallback",
        baseRevenue: 10000, // generic fallback constant
        disclaimer: "Using sector fallback",
      },
      modelOutput: {
        baseTargetPrice: 0, // 0 = sentinel for fallback failure
        assumptions: {
          ebitdaMargin: "18.0%",
          revenueGrowthRate: "12.0%",
        },
      },
      sections: [
        { name: "executive_summary", content: "Brief overview." }, // < 100 chars
      ],
    };

    const report = await pipelineEval.run("RELIANCE", fallbackSnapshot);

    expect(report.overallStatus).toBe("FAIL");
    expect(report.checks.find((c) => c.name === "Sector Fallback Detection")?.status).toBe("FAIL");
    expect(report.checks.find((c) => c.name === "Target Price Gate")?.status).toBe("FAIL");
    expect(report.checks.find((c) => c.name === "Hardcoded Fallback Detection")?.status).toBe("FAIL");
    expect(report.checks.find((c) => c.name === "Section Completeness")?.status).toBe("FAIL");
  });

  it("identifies stale data older than 24 hours as WARN", async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const staleSnapshot: AgentRunSnapshot = {
      yahoo: {
        ticker: "TCS",
        currency: "INR",
        isLiveData: true,
        fetchedAt: twoDaysAgo,
        currentPrice: 3800,
        revenueCr: 240000,
        marketCapCr: 1400000,
        ebitdaMargin: 0.25,
        trailingPE: 30,
        beta: 0.9,
        ebitdaCr: 60000,
        netIncomeCr: 45000,
        epsCurrent: 120,
        epsGrowth: 0.08,
        totalDebtCr: 0,
        cashCr: 20000,
        netDebtCr: -20000,
        bookValuePerShare: 350,
        enterpriseValueCr: 1380000,
        sharesOutstandingCr: 360,
        forwardPE: 27,
        priceToBook: 10,
        dividendYield: 0.015,
        revenueGrowthYoY: 0.07,
        grossMargin: 0.4,
        operatingMargin: 0.24,
        evEbitda: 22.0,
      },
      modelOutput: {
        baseTargetPrice: 4200,
      },
    };

    const report = await pipelineEval.run("TCS", staleSnapshot);
    const freshnessCheck = report.checks.find((c) => c.name === "Data Freshness");
    expect(freshnessCheck?.status).toBe("WARN");
  });
});

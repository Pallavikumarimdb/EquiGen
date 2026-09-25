/**
 * Unit tests for modeling-agent.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelingAgent, ModelingAgentInput } from "@/lib/ai/subagents/modeling-agent";
import * as yahooTool from "@/lib/ai/tools/yahoo-financials-tool";

// Mock Yahoo Finance tool
vi.mock("@/lib/ai/tools/yahoo-financials-tool", () => ({
  fetchYahooFinancials: vi.fn(),
  toModelingInputRecord: vi.fn((yf) => ({
    revenue: yf.revenueCr,
    ebitda: yf.ebitdaCr,
    ebitdaMargin: yf.ebitdaMargin,
    totalDebt: yf.totalDebtCr,
    cash: yf.cashCr,
    outstandingShares: yf.sharesOutstandingCr,
    beta: yf.beta,
    salesGrowth: yf.revenueGrowthYoY,
    _isLiveData: true,
  })),
}));

// Mock prisma so database writes don't hit Postgres during unit tests
vi.mock("@/lib/db", () => ({
  prisma: {
    subagentRun: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "run-123" }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ModelingAgent", () => {
  it("derives model parameters from Path 1 (extracted financials)", async () => {
    const agent = new ModelingAgent();
    const input: ModelingAgentInput = {
      planId: "plan-1",
      runId: "run-1",
      ticker: "INFY",
      companyName: "Infosys Ltd",
      milestone: {
        id: "m-modeling",
        label: "DCF Modeling",
        type: "build_financial_model",
        description: "DCF for INFY",
        agentType: "modeling",
        estimatedMinutes: 2,
        estimatedCostUsd: 0.05,
        config: {
          modelType: "dcf",
          projectionYears: 5,
          runMonteCarlo: true,
          runSensitivity: true,
        },
        status: "pending",
      },
      extractedFinancials: {
        revenue: 153670,
        ebitda: 36000,
        ebitdaMargin: 0.234,
        totalDebt: 8000,
        cash: 18000,
        sharesCr: 415,
        beta: 0.95,
      },
    };

    const output = await agent.run(input);

    expect(output.ticker).toBe("INFY");
    expect(output.milestoneCompleted).toBe(true);
    expect(output.dataQuality.isDerivedFromRealData).toBe(true);
    expect(output.dataQuality.financialSource).toBe("extracted_filings");
    expect(output.dataQuality.baseRevenue).toBe(153670);
    expect(output.modelOutput.baseTargetPrice).toBeGreaterThan(0);
    expect(output.modelOutput.bullCasePrice).toBeGreaterThan(output.modelOutput.baseTargetPrice);
    expect(output.modelOutput.bearCasePrice).toBeLessThan(output.modelOutput.baseTargetPrice);
  });

  it("derives model parameters from Path 2 (Yahoo Finance quoteSummary) when extracted filings are missing", async () => {
    vi.mocked(yahooTool.fetchYahooFinancials).mockResolvedValue({
      ticker: "RELIANCE",
      currency: "INR",
      isLiveData: true,
      dataSource: "quoteSummary",
      revenueCr: 900000,
      ebitdaCr: 160000,
      ebitdaMargin: 0.178,
      totalDebtCr: 300000,
      cashCr: 150000,
      sharesOutstandingCr: 676,
      beta: 1.1,
      revenueGrowthYoY: 0.12,
      currentPrice: 2950,
      marketCapCr: 1990000,
      trailingPE: 28,
      fetchedAt: "2026-09-25T12:00:00Z",
      netIncomeCr: 75000,
      epsCurrent: 110,
      epsGrowth: 0.1,
      netDebtCr: 150000,
      bookValuePerShare: 1100,
      enterpriseValueCr: 2140000,
      forwardPE: 25,
      priceToBook: 2.7,
      dividendYield: 0.004,
      grossMargin: 0.35,
      operatingMargin: 0.16,
      evEbitda: 18.5,
    });

    const agent = new ModelingAgent();
    const input: ModelingAgentInput = {
      planId: "plan-2",
      runId: "run-2",
      ticker: "RELIANCE",
      companyName: "Reliance Industries",
      milestone: {
        id: "m-modeling-2",
        label: "DCF Modeling",
        type: "build_financial_model",
        description: "DCF for RELIANCE",
        agentType: "modeling",
        estimatedMinutes: 2,
        estimatedCostUsd: 0.05,
        config: {
          modelType: "dcf",
          projectionYears: 5,
          runMonteCarlo: true,
          runSensitivity: true,
        },
        status: "pending",
      },
    };

    const output = await agent.run(input);

    expect(output.ticker).toBe("RELIANCE");
    expect(output.dataQuality.isDerivedFromRealData).toBe(true);
    expect(output.dataQuality.financialSource).toBe("screener_live");
    expect(output.dataQuality.baseRevenue).toBe(900000);
    expect(output.modelOutput.baseTargetPrice).toBeGreaterThan(0);
  });

  it("handles Path 3 fallback gracefully with disclaimer when all data sources fail", async () => {
    vi.mocked(yahooTool.fetchYahooFinancials).mockResolvedValue({
      ticker: "UNKNOWN_CORP",
      currency: "INR",
      isLiveData: false,
      revenueCr: null,
      ebitdaCr: null,
      ebitdaMargin: null,
      totalDebtCr: null,
      cashCr: null,
      sharesOutstandingCr: null,
      beta: null,
      revenueGrowthYoY: null,
      currentPrice: null,
      marketCapCr: null,
      trailingPE: null,
      fetchedAt: "2026-09-25T12:00:00Z",
      netIncomeCr: null,
      epsCurrent: null,
      epsGrowth: null,
      netDebtCr: null,
      bookValuePerShare: null,
      enterpriseValueCr: null,
      forwardPE: null,
      priceToBook: null,
      dividendYield: null,
      grossMargin: null,
      operatingMargin: null,
      evEbitda: null,
    });

    const agent = new ModelingAgent();
    const input: ModelingAgentInput = {
      planId: "plan-3",
      runId: "run-3",
      ticker: "UNKNOWN_CORP",
      companyName: "Unknown Corp",
      milestone: {
        id: "m-modeling-3",
        label: "DCF Modeling",
        type: "build_financial_model",
        description: "DCF for UNKNOWN_CORP",
        agentType: "modeling",
        estimatedMinutes: 2,
        estimatedCostUsd: 0.05,
        config: {
          modelType: "dcf",
          projectionYears: 5,
          runMonteCarlo: true,
          runSensitivity: true,
        },
        status: "pending",
      },
    };

    const output = await agent.run(input);

    expect(output.ticker).toBe("UNKNOWN_CORP");
    expect(output.dataQuality.isDerivedFromRealData).toBe(false);
    expect(output.dataQuality.financialSource).toBe("sector_fallback");
    expect(output.dataQuality.disclaimer).toBeTruthy();
    // Sentinels in place for fallback detection
    expect(output.modelOutput.baseTargetPrice).toBe(0);
  });
});

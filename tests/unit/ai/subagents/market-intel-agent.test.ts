/**
 * Unit tests for market-intel-agent.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { MarketIntelAgent, MarketIntelAgentInput } from "@/lib/ai/subagents/market-intel-agent";
import * as bseTool from "@/lib/ai/tools/bse-financial-data-tool";
import * as yahooTool from "@/lib/ai/tools/yahoo-financials-tool";
import * as creditTool from "@/lib/ai/tools/credit-rating-tool";
import * as newsTool from "@/lib/ai/tools/sector-news-deep-tool";

// Mock external tool calls
vi.mock("@/lib/ai/tools/bse-financial-data-tool", () => ({
  fetchBseCompanyFinancials: vi.fn(),
  toScreenerProfileShape: vi.fn((data) => ({
    ticker: data.ticker,
    companyName: data.companyName,
    currentPrice: data.currentPrice,
    marketCapCr: data.marketCapCr,
    peRatio: data.peRatio,
    historicalSeries: [],
    shareholding: { promoters: 50 },
    isLiveData: true,
  })),
}));

vi.mock("@/lib/ai/tools/yahoo-financials-tool", () => ({
  fetchYahooFinancials: vi.fn(),
}));

vi.mock("@/lib/ai/tools/credit-rating-tool", () => ({
  fetchCreditRatings: vi.fn(),
}));

vi.mock("@/lib/ai/tools/sector-news-deep-tool", () => ({
  fetchSectorNews: vi.fn(),
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

describe("MarketIntelAgent", () => {
  it("orchestrates peer benchmarking using BSE, Yahoo Finance, credit ratings and news", async () => {
    vi.mocked(bseTool.fetchBseCompanyFinancials).mockImplementation(async (ticker: string) => ({
      ticker: ticker.toUpperCase(),
      scripCode: "500123",
      companyName: `${ticker} Corp`,
      currentPrice: 2500,
      marketCapCr: 500000,
      peRatio: 25,
      pbRatio: 4,
      rocePercent: 20,
      dividendYieldPercent: 1.2,
      high52W: 2800,
      low52W: 2000,
      historicalSeries: [],
      shareholding: { promoters: 50, fii: 20, dii: 15, public: 15, reportDate: "2024" },
      fetchedAt: "2026-09-25T12:00:00Z",
      isLiveData: true,
      dataSource: "bse_api",
    }));

    vi.mocked(yahooTool.fetchYahooFinancials).mockResolvedValue({
      ticker: "TCS",
      currency: "INR",
      isLiveData: true,
      dataSource: "quoteSummary",
      currentPrice: 3800,
      marketCapCr: 1400000,
      trailingPE: 30,
      evEbitda: 21,
      beta: 0.9,
      fetchedAt: "2026-09-25T12:00:00Z",
      revenueCr: 240000,
      ebitdaCr: 60000,
      ebitdaMargin: 0.25,
      grossMargin: 0.4,
      operatingMargin: 0.24,
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
    });

    vi.mocked(creditTool.fetchCreditRatings).mockResolvedValue({
      ticker: "TCS",
      ratings: [
        {
          agency: "CRISIL",
          rating: "AAA/Stable",
          instrument: "Long Term Debt",
          action: "reaffirmed",
          ratingDate: "2024-03-01",
          keyRationale: ["Industry leader"],
          source: "https://bseindia.com/123",
        },
      ],
      overallCreditProfile: "Highest Safety (AAA)",
      isLiveData: true,
      fetchedAt: "2026-09-25T12:00:00Z",
    });

    vi.mocked(newsTool.fetchSectorNews).mockResolvedValue({
      ticker: "TCS",
      sector: "Information Technology",
      news: [],
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0, regulatory_risk: 0 },
      isLiveData: true,
      fetchedAt: "2026-09-25T12:00:00Z",
    });

    const agent = new MarketIntelAgent();
    const input: MarketIntelAgentInput = {
      planId: "plan-1",
      runId: "run-1",
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      milestone: {
        id: "m-1",
        label: "Peer Benchmarking",
        type: "peer_benchmark",
        description: "Benchmark TCS vs INFY",
        agentType: "market_intel",
        config: {
          peerTickers: ["INFY"],
          metrics: ["PE", "MarketCap"],
        },
        estimatedMinutes: 5,
        estimatedCostUsd: 0.05,
        status: "pending",
      },
    };

    const output = await agent.run(input);

    expect(output.ticker).toBe("TCS");
    expect(output.milestoneCompleted).toBe(true);
    expect(output.peerProfiles).toHaveLength(2); // TCS and INFY
    expect(output.yahooFinancials?.isLiveData).toBe(true);
    expect(output.creditRatings.overallCreditProfile).toBe("Highest Safety (AAA)");
    expect(output.newsDigest.isLiveData).toBe(true);
    expect(output.benchmarkMarkdown).toContain("Valuation & Operational Peer Benchmark");
    expect(output.summary).toContain("TCS");
  });
});

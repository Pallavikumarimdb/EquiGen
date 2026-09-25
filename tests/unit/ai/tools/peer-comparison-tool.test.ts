/**
 * Unit tests for peer-comparison-tool.ts (RC-7 EV/EBITDA and fundamentals fix)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPeerComparison } from "@/lib/ai/tools/peer-comparison-tool";
import * as yahooTool from "@/lib/ai/tools/yahoo-financials-tool";

vi.mock("@/lib/ai/tools/yahoo-financials-tool", () => ({
  fetchYahooFinancials: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("peer-comparison-tool", () => {
  it("fetches fundamentals for explicit peer list and formats EV/EBITDA and margins", async () => {
    vi.mocked(yahooTool.fetchYahooFinancials).mockImplementation(async (ticker: string) => ({
      ticker: ticker.toUpperCase(),
      currentPrice: 3500,
      marketCapCr: 1200000,
      trailingPE: 30.5,
      evEbitda: 21.2,
      revenueGrowthYoY: 0.154,
      operatingMargin: 0.245,
      ebitdaMargin: 0.26,
      beta: 0.95,
      dividendYield: 0.015,
      grossMargin: 0.35,
      currency: "INR",
      isLiveData: true,
      dataSource: "quoteSummary",
      fetchedAt: "2026-09-25T12:00:00.000Z",
      revenueCr: 240000,
      ebitdaCr: 62400,
      netIncomeCr: 45000,
      epsCurrent: 125,
      epsGrowth: 0.12,
      totalDebtCr: 0,
      cashCr: 25000,
      netDebtCr: -25000,
      bookValuePerShare: 350,
      enterpriseValueCr: 1175000,
      sharesOutstandingCr: 360,
      forwardPE: 27,
      priceToBook: 10,
    }));

    const result = await fetchPeerComparison("TCS", ["INFY", "WIPRO"]);

    expect(result.targetCompany).toBe("TCS");
    expect(result.peers).toHaveLength(2);

    const infy = result.peers[0];
    expect(infy.ticker).toBe("INFY");
    expect(infy.evEbitda).toBe("21.2x"); // RC-7: Real formatted EV/EBITDA
    expect(infy.opMargin).toBe("24.5%"); // RC-7: Real formatted operating margin
    expect(infy.revGrowthYoY).toBe("15.4%"); // RC-7: Real formatted YoY growth
    expect(infy.peRatio).toBe("30.5x");
    expect(infy.isLiveData).toBe(true);
    expect(result.rawSummary).toContain("**INFY**");
  });

  it("falls back to sector defaults when no explicit peer list is provided", async () => {
    vi.mocked(yahooTool.fetchYahooFinancials).mockImplementation(async (ticker: string) => ({
      ticker: ticker.toUpperCase(),
      currentPrice: 1000,
      marketCapCr: 50000,
      trailingPE: 20,
      evEbitda: 14,
      revenueGrowthYoY: 0.1,
      operatingMargin: 0.18,
      ebitdaMargin: 0.2,
      beta: 1.0,
      dividendYield: 0.01,
      grossMargin: 0.35,
      currency: "INR",
      isLiveData: true,
      dataSource: "quoteSummary",
      fetchedAt: "2026-09-25T12:00:00.000Z",
      revenueCr: 10000,
      ebitdaCr: 2000,
      netIncomeCr: 1200,
      epsCurrent: 50,
      epsGrowth: 0.08,
      totalDebtCr: 1000,
      cashCr: 500,
      netDebtCr: 500,
      bookValuePerShare: 200,
      enterpriseValueCr: 50500,
      sharesOutstandingCr: 50,
      forwardPE: 18,
      priceToBook: 5,
    }));

    const result = await fetchPeerComparison("banking");

    expect(result.peers.length).toBeGreaterThanOrEqual(4);
    expect(result.peers.some((p) => p.ticker === "HDFCBANK" || p.ticker === "ICICIBANK")).toBe(true);
  });

  it("handles peer failure gracefully without crashing the whole comparison table", async () => {
    vi.mocked(yahooTool.fetchYahooFinancials)
      .mockResolvedValueOnce({
        ticker: "GOODCO",
        currentPrice: 500,
        marketCapCr: 10000,
        trailingPE: 15,
        evEbitda: 10,
        revenueGrowthYoY: 0.05,
        operatingMargin: 0.12,
        ebitdaMargin: 0.15,
        beta: 1.1,
        dividendYield: 0.02,
        grossMargin: 0.35,
        currency: "INR",
        isLiveData: true,
        dataSource: "quoteSummary",
        fetchedAt: "2026-09-25T12:00:00.000Z",
        revenueCr: 5000,
        ebitdaCr: 750,
        netIncomeCr: 400,
        epsCurrent: 20,
        epsGrowth: 0.05,
        totalDebtCr: 500,
        cashCr: 200,
        netDebtCr: 300,
        bookValuePerShare: 80,
        enterpriseValueCr: 10100,
        sharesOutstandingCr: 20,
        forwardPE: 14,
        priceToBook: 6,
      })
      .mockRejectedValueOnce(new Error("Network failure for BADCO"));

    const result = await fetchPeerComparison("TARGET", ["GOODCO", "BADCO"]);

    expect(result.peers).toHaveLength(2);
    expect(result.peers[0].isLiveData).toBe(true);
    expect(result.peers[1].isLiveData).toBe(false);
    expect(result.peers[1].currentPrice).toBe("N/A");
  });
});

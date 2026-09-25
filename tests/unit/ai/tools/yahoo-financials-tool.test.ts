/**
 * Unit tests for yahoo-financials-tool.ts
 *
 * Strategy: Mock global fetch to avoid real HTTP calls.
 * Tests cover the full 4-tier fallback chain, crumb bootstrap,
 * currency conversion helpers, and the modeling input adapter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchYahooFinancials,
  toModelingInputRecord,
  _clearCrumbCacheForTesting,
  type ExtractedFinancials,
} from "@/lib/ai/tools/yahoo-financials-tool";

// ─── Mock fetch globally ───────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
  _clearCrumbCacheForTesting();
});

// Helper to build a minimal quoteSummary response
function makeQuoteSummaryResponse(overrides: Record<string, unknown> = {}): object {
  return {
    quoteSummary: {
      result: [
        {
          summaryDetail: {
            marketCap: { raw: 200000000000 }, // ₹20,000 Cr
            trailingPE: { raw: 25.5 },
            forwardPE: { raw: 22.0 },
            dividendYield: { raw: 0.018 },
            beta: { raw: 1.12 },
          },
          defaultKeyStatistics: {
            sharesOutstanding: { raw: 600000000 }, // 60 Cr shares
            enterpriseValue: { raw: 210000000000 },
            enterpriseToEbitda: { raw: 18.5 },
            priceToBook: { raw: 3.2 },
            trailingEps: { raw: 45.5 },
            earningsQuarterlyGrowth: { raw: 0.12 },
            bookValue: { raw: 150.0 },
          },
          financialData: {
            financialCurrency: "INR",
            totalRevenue: { raw: 50000000000 }, // ₹5,000 Cr
            ebitda: { raw: 9000000000 },        // ₹900 Cr
            ebitdaMargins: { raw: 0.18 },
            grossMargins: { raw: 0.32 },
            operatingMargins: { raw: 0.15 },
            netIncomeToCommon: { raw: 4000000000 }, // ₹400 Cr
            totalDebt: { raw: 15000000000 },    // ₹1,500 Cr
            totalCash: { raw: 5000000000 },     // ₹500 Cr
            currentPrice: { raw: 1250 },
            revenueGrowth: { raw: 0.14 },
          },
          incomeStatementHistory: {
            incomeStatementHistory: [
              {
                totalRevenue: { raw: 48000000000 },
                netIncome: { raw: 3800000000 },
              },
              {
                totalRevenue: { raw: 42000000000 },
                netIncome: { raw: 3200000000 },
              },
            ],
          },
          ...overrides,
        },
      ],
    },
  };
}

function makeV7QuoteResponse(): object {
  return {
    quoteResponse: {
      result: [
        {
          regularMarketPrice: 1250,
          marketCap: 200000000000,
          trailingPE: 25.5,
          forwardPE: 22.0,
          priceToBook: 3.2,
          epsTrailingTwelveMonths: 45.5,
          sharesOutstanding: 600000000,
          beta: 1.12,
          trailingAnnualDividendYield: 0.018,
          currency: "INR",
        },
      ],
    },
  };
}

function makeV8ChartResponse(): object {
  return {
    chart: {
      result: [
        {
          meta: {
            currency: "INR",
            regularMarketPrice: 1248,
            marketCap: 199000000000,
          },
        },
      ],
    },
  };
}

// ─── Crumb bootstrap helpers ───────────────────────────────────────────────────

function mockCrumbSequence() {
  // Visit 1: Yahoo homepage (returns session cookies)
  mockFetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: (h: string) => h === "set-cookie" ? "A=1; Path=/; Secure, B=2; Path=/" : null },
    text: async () => "<html></html>",
  });
  // Visit 2: Yahoo crumb endpoint
  mockFetch.mockResolvedValueOnce({
    ok: true,
    headers: { get: () => null },
    text: async () => "testCrumb123",
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("fetchYahooFinancials — Tier 1 (quoteSummary + crumb)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses full quoteSummary response and returns live data", async () => {
    mockCrumbSequence();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => makeQuoteSummaryResponse(),
    });

    const result = await fetchYahooFinancials("TESTCO");
    expect(result.isLiveData).toBe(true);
    expect(result.dataSource).toBe("quoteSummary");
    expect(result.revenueCr).toBe(5000);   // 50_000_000_000 / 10_000_000
    expect(result.ebitdaCr).toBe(900);
    expect(result.ebitdaMargin).toBeCloseTo(0.18);
    expect(result.currentPrice).toBe(1250);
    expect(result.marketCapCr).toBe(20000);
    expect(result.sharesOutstandingCr).toBeCloseTo(60, 0);
    expect(result.trailingPE).toBeCloseTo(25.5);
    expect(result.netDebtCr).toBe(1000); // (1500 - 500)
    expect(result.beta).toBeCloseTo(1.12);
    expect(result.revenueGrowthYoY).toBeCloseTo(0.14);
  });

  it("returns ticker normalized to UPPER case", async () => {
    mockCrumbSequence();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => makeQuoteSummaryResponse(),
    });
    const result = await fetchYahooFinancials("reliance");
    expect(result.ticker).toBe("RELIANCE");
  });

  it("toCrores: non-INR currency returns null for absolute values", async () => {
    mockCrumbSequence();
    // Simulate USD company
    const usdResponse = makeQuoteSummaryResponse();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (usdResponse as any).quoteSummary.result[0].financialData.financialCurrency = "USD";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => usdResponse,
    });
    const result = await fetchYahooFinancials("FOREIGNCO");
    // Non-INR currency: all toCrores fields should be null
    expect(result.revenueCr).toBeNull();
    expect(result.marketCapCr).toBeNull();
  });
});

describe("fetchYahooFinancials — Tier 2 (v7 quote fallback)", () => {
  it("falls through to v7 quote when quoteSummary returns 401", async () => {
    mockCrumbSequence();
    // Tier 1 returns 401
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, headers: { get: () => null } });
    // Tier 2: v7 quote succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => makeV7QuoteResponse(),
    });

    const result = await fetchYahooFinancials("RELIANCE");
    expect(result.isLiveData).toBe(true);
    expect(result.dataSource).toBe("v7_quote");
    expect(result.currentPrice).toBe(1250);
    expect(result.marketCapCr).toBe(20000);
    expect(result.trailingPE).toBeCloseTo(25.5);
    // v7 quote doesn't provide revenue fundamentals
    expect(result.revenueCr).toBeNull();
  });
});

describe("fetchYahooFinancials — Tier 3 (v8 chart fallback)", () => {
  it("falls through to v8 chart when quoteSummary + v7 both fail", async () => {
    mockCrumbSequence();
    // Tier 1 returns 404
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null } });
    // v7 quote fails with 404
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, headers: { get: () => null } });
    // v8 chart succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      json: async () => makeV8ChartResponse(),
    });

    const result = await fetchYahooFinancials("TCS");
    expect(result.isLiveData).toBe(true);
    expect(result.dataSource).toBe("v8_chart");
    expect(result.currentPrice).toBe(1248);
    expect(result.revenueCr).toBeNull(); // chart doesn't have fundamentals
  });
});

describe("fetchYahooFinancials — all tiers fail", () => {
  it("returns empty result with fetchError when all tiers fail for unknown ticker", async () => {
    // Mock all fetch calls to fail
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await fetchYahooFinancials("UNKNOWNXYZ");
    expect(result.isLiveData).toBe(false);
    expect(result.revenueCr).toBeNull();
    expect(result.fetchError).toBeTruthy();
    expect(result.ticker).toBe("UNKNOWNXYZ");
  });
});

describe("toModelingInputRecord", () => {
  it("maps all fields correctly", () => {
    const fin: ExtractedFinancials = {
      revenueCr: 5000, revenueGrowthYoY: 0.14,
      ebitdaCr: 900, ebitdaMargin: 0.18, grossMargin: 0.32, operatingMargin: 0.15,
      netIncomeCr: 400, epsCurrent: 45.5, epsGrowth: 0.12,
      totalDebtCr: 1500, cashCr: 500, netDebtCr: 1000, bookValuePerShare: 150,
      currentPrice: 1250, marketCapCr: 20000, enterpriseValueCr: 21000, sharesOutstandingCr: 60,
      trailingPE: 25.5, forwardPE: 22, evEbitda: 18.5, priceToBook: 3.2, dividendYield: 0.018,
      beta: 1.12, ticker: "TESTCO", currency: "INR",
      fetchedAt: new Date().toISOString(), isLiveData: true, dataSource: "quoteSummary",
    };

    const record = toModelingInputRecord(fin);
    expect(record.revenue).toBe(5000);
    expect(record.sales).toBe(5000);       // alias
    expect(record.ebitda).toBe(900);
    expect(record.ebitdaMargin).toBe(0.18);
    expect(record.outstandingShares).toBe(60);
    expect(record.beta).toBe(1.12);
    expect(record._isLiveData).toBe(true);
    expect(record._source).toMatch(/yahoo_finance/);
  });

  it("preserves null for missing fields", () => {
    const fin: ExtractedFinancials = {
      revenueCr: null, revenueGrowthYoY: null,
      ebitdaCr: null, ebitdaMargin: null, grossMargin: null, operatingMargin: null,
      netIncomeCr: null, epsCurrent: null, epsGrowth: null,
      totalDebtCr: null, cashCr: null, netDebtCr: null, bookValuePerShare: null,
      currentPrice: null, marketCapCr: null, enterpriseValueCr: null, sharesOutstandingCr: null,
      trailingPE: null, forwardPE: null, evEbitda: null, priceToBook: null, dividendYield: null,
      beta: null, ticker: "EMPTY", currency: "INR",
      fetchedAt: new Date().toISOString(), isLiveData: false,
    };
    const record = toModelingInputRecord(fin);
    expect(record.revenue).toBeNull();
    expect(record.beta).toBeNull();
  });
});

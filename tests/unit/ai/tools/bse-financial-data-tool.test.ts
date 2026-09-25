/**
 * Unit tests for bse-financial-data-tool.ts (RC-2 Screener replacement)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchBseCompanyFinancials,
  toScreenerProfileShape,
  type BseCompanyFinancials,
} from "@/lib/ai/tools/bse-financial-data-tool";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bse-financial-data-tool", () => {
  it("resolves known ticker and aggregates header, results, and shareholding", async () => {
    // 1. Scrip header mock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        LongName: "Reliance Industries Ltd",
        CurrRate: "2,950.50",
        mktcap: "19,95,000",
        PE: "28.4",
        PricBook: "2.8",
        DivYield: "0.35",
        High52: "3,024.90",
        Low52: "2,220.30",
      }),
    });

    // 2. Financial results mock (standalone)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Table: [
          { TO_DATE: "20240331", NET_SALES: "900000", EBITDA: "175000", PAT: "79000", EPS: "115.5" },
          { TO_DATE: "20230331", NET_SALES: "800000", EBITDA: "150000", PAT: "66000", EPS: "98.2" },
        ],
      }),
    });

    // 3. Shareholding mock
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        Table: [
          { Category: "Promoter", Percent: "50.3" },
          { Category: "Foreign Portfolio Investors", Percent: "22.1" },
          { Category: "Mutual Funds", Percent: "15.4" },
          { Category: "Public", Percent: "12.2" },
        ],
      }),
    });

    const data = await fetchBseCompanyFinancials("RELIANCE");

    expect(data.isLiveData).toBe(true);
    expect(data.ticker).toBe("RELIANCE");
    expect(data.companyName).toBe("Reliance Industries Ltd");
    expect(data.currentPrice).toBe(2951); // rounded by parseCrores
    expect(data.marketCapCr).toBe(1995000);
    expect(data.peRatio).toBe(28.4);
    expect(data.pbRatio).toBe(2.8);
    expect(data.shareholding.promoters).toBe(50.3);
    expect(data.shareholding.fii).toBe(22.1);
    expect(data.shareholding.dii).toBe(15.4);
    expect(data.shareholding.public).toBe(12.2);
    expect(data.historicalSeries.length).toBeGreaterThan(0);
  });

  it("returns error and isLiveData:false when scrip code cannot be resolved", async () => {
    // Scrip code resolution API fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const data = await fetchBseCompanyFinancials("NONEXISTENT_TICKER_XYZ");
    expect(data.isLiveData).toBe(false);
    expect(data.fetchError).toContain("Scrip code not found");
    expect(data.historicalSeries).toHaveLength(0);
  });

  it("converts BseCompanyFinancials to ScreenerProfile shape properly", () => {
    const bseData: BseCompanyFinancials = {
      ticker: "INFY",
      scripCode: "500209",
      companyName: "Infosys Ltd",
      currentPrice: 1850,
      marketCapCr: 750000,
      peRatio: 26.5,
      pbRatio: 7.2,
      rocePercent: 32.5,
      dividendYieldPercent: 2.1,
      high52W: 1950,
      low52W: 1350,
      historicalSeries: [
        { period: "FY24", revenueCr: 153670, ebitdaCr: 36000, patCr: 26248, epsCr: 63.4 },
      ],
      shareholding: {
        promoters: 14.7,
        fii: 33.5,
        dii: 36.2,
        public: 15.6,
        reportDate: "31-Mar-2024",
      },
      fetchedAt: "2026-09-25T12:00:00.000Z",
      isLiveData: true,
      dataSource: "bse_api",
    };

    const screenerProfile = toScreenerProfileShape(bseData);

    expect(screenerProfile.ticker).toBe("INFY");
    expect(screenerProfile.companyName).toBe("Infosys Ltd");
    expect(screenerProfile.currentPrice).toBe(1850);
    expect(screenerProfile.peRatio).toBe(26.5);
    expect(screenerProfile.historicalSeries).toHaveLength(1);
    expect(screenerProfile.historicalSeries[0].sales).toBe(153670);
    expect(screenerProfile.historicalSeries[0].ebitda).toBe(36000);
    expect(screenerProfile.historicalSeries[0].pat).toBe(26248);
    expect(screenerProfile.shareholding.promoters).toBe(14.7);
    expect(screenerProfile.isLiveData).toBe(true);
  });
});

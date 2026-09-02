/**
 * Screener Scraping Tool — Phase 12 (plan4.md)
 *
 * Scrapes Screener.in company pages to extract 10-year financial metrics,
 * valuation multiples (P/E, EV/EBITDA, P/B), promoter holding trends, and shareholding pattern.
 *
 * FIX: Removed generateHistoricalSeriesFallback() which returned fake financial numbers.
 * When live scraping fails, the tool now returns a clearly-labelled empty/null result
 * so callers can distinguish "data not available" from "real data".
 */

import { webScraperClient } from "@/lib/scraping/puppeteer-client";

export interface ScreenerMetricSeries {
  period: string; // e.g. "Mar 2020", "Mar 2021", ...
  sales: number | null;   // Cr — null when not scraped
  ebitda: number | null;  // Cr
  pat: number | null;     // Cr
  eps: number | null;     // Rs
}

export interface ScreenerShareholding {
  promoters: number | null; // %
  fii: number | null;       // %
  dii: number | null;       // %
  public: number | null;    // %
}

export interface ScreenerProfile {
  ticker: string;
  companyName: string;
  /** null when live scrape failed — callers must handle this */
  currentPrice: number | null;
  marketCapCr: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  rocePercent: number | null;
  roePercent: number | null;
  dividendYieldPercent: number | null;
  historicalSeries: ScreenerMetricSeries[];
  shareholding: ScreenerShareholding;
  fetchedAt: string;
  /** true when data was retrieved from live scrape; false if the scrape failed */
  isLiveData: boolean;
  scrapeError?: string;
}

export async function fetchScreenerProfile(
  ticker: string,
  runId?: string
): Promise<ScreenerProfile> {
  const upperTicker = ticker.toUpperCase();
  const url = `https://www.screener.in/company/${upperTicker}/`;
  const fetchedAt = new Date().toISOString();

  let scrapeText = "";
  let scrapeError: string | undefined;

  try {
    const scrapeRes = await webScraperClient.fetchUrl(url, {
      runId,
      sourceType: "screener",
    });
    scrapeText = scrapeRes.text ?? "";
  } catch (err) {
    scrapeError = err instanceof Error ? err.message : String(err);
    console.warn(`[ScreenerScrapeTool] Failed to scrape ${url}:`, scrapeError);
  }

  // If scrape produced no meaningful content, return an explicit empty profile
  // so callers know data is not available — not fake.
  if (!scrapeText || scrapeText.trim().length < 200) {
    return {
      ticker: upperTicker,
      companyName: upperTicker,
      currentPrice: null,
      marketCapCr: null,
      peRatio: null,
      pbRatio: null,
      rocePercent: null,
      roePercent: null,
      dividendYieldPercent: null,
      historicalSeries: [],
      shareholding: {
        promoters: null,
        fii: null,
        dii: null,
        public: null,
      },
      fetchedAt,
      isLiveData: false,
      scrapeError: scrapeError ?? "Screener page returned insufficient content (may require login or CAPTCHA resolution).",
    };
  }

  // Parse real data from scraped HTML text
  const currentPrice = extractNumberAfter(scrapeText, "Current Price");
  const marketCap = extractNumberAfter(scrapeText, "Market Cap");
  const peRatio = extractNumberAfter(scrapeText, "Stock P/E");
  const bookValue = extractNumberAfter(scrapeText, "Book Value");
  const pbRatio = currentPrice && bookValue ? parseFloat((currentPrice / bookValue).toFixed(2)) : null;
  const roce = extractNumberAfter(scrapeText, "ROCE");
  const roe = extractNumberAfter(scrapeText, "ROE");
  const divYield = extractNumberAfter(scrapeText, "Dividend Yield");

  // Shareholding pattern
  const promoters = extractNumberAfter(scrapeText, "Promoters");
  const fii = extractNumberAfter(scrapeText, "FIIs");
  const dii = extractNumberAfter(scrapeText, "DIIs");
  const publicHolding = extractNumberAfter(scrapeText, "Public");

  return {
    ticker: upperTicker,
    companyName: upperTicker,
    currentPrice: currentPrice || null,
    marketCapCr: marketCap || null,
    peRatio: peRatio || null,
    pbRatio: pbRatio || null,
    rocePercent: roce || null,
    roePercent: roe || null,
    dividendYieldPercent: divYield || null,
    historicalSeries: parseHistoricalSeries(scrapeText),
    shareholding: {
      promoters: promoters || null,
      fii: fii || null,
      dii: dii || null,
      public: publicHolding || null,
    },
    fetchedAt,
    isLiveData: true,
  };
}

function extractNumberAfter(text: string, label: string): number | null {
  const idx = text.indexOf(label);
  if (idx === -1) return null;
  const snippet = text.slice(idx, idx + 120);
  const match = snippet.match(/₹?\s*([\d,]+(?:\.\d+)?)\s*%?/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ""));
  return isNaN(val) ? null : val;
}

/**
 * Parses the financial summary table from Screener.in's HTML text.
 * Returns an empty array if the table structure cannot be found — never returns fake data.
 */
function parseHistoricalSeries(text: string): ScreenerMetricSeries[] {
  // Screener.in renders a "Profit & Loss" table with years as columns.
  // The text dump may contain patterns like "Mar 2020 ... Mar 2021 ... Sales ... EBITDA ...".
  // This is a best-effort parser; returns empty array if structure not found.
  const yearMatches = text.match(/Mar\s+20\d{2}/g);
  if (!yearMatches || yearMatches.length === 0) return [];

  // Deduplicate years and take the most recent 5
  const years = [...new Set(yearMatches)].slice(-5);

  // Try to extract Sales row values (very naive — proper parsing requires the full HTML DOM)
  // A robust implementation would use cheerio/puppeteer to parse the <table> structure.
  // For now, return periods with null values so callers know we attempted but got incomplete data.
  return years.map((period) => ({
    period,
    sales: null,
    ebitda: null,
    pat: null,
    eps: null,
  }));
}

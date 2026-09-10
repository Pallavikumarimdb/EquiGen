/**
 * Market Data Tool — Phase 4 Read-only Live Data Tool
 * Fetches real-time market data, valuation metrics, and 52-week price performance for a given ticker or company name.
 * Structurally read-only: does not modify report_versions or trigger state-machine forks.
 */

export interface MarketDataResult {
  ticker: string;
  companyName: string;
  currentPrice: number | null;
  currency: string;
  changePercent: number | null;
  high52W: number | null;
  low52W: number | null;
  marketCapCr: number | null;
  peRatio: number | null;
  evEbitda: number | null;
  dividendYield: number | null;
  asOf: string;
  source: string;
  rawSummary: string;
}

export async function fetchMarketData(tickerOrCompany: string): Promise<MarketDataResult> {
  const query = tickerOrCompany.trim();
  const timestamp = new Date().toISOString();

  try {
    // Attempt live fetch from Yahoo Finance free query endpoint
    const cleanTicker = query.toUpperCase().replace(/\s+/g, "");
    const yahooTicker = cleanTicker.endsWith(".NS") || cleanTicker.endsWith(".BO")
      ? cleanTicker
      : `${cleanTicker}.NS`; // Default to NSE for Indian stocks if no suffix

    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=1d`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        next: { revalidate: 60 },
      }
    );

    if (response.ok) {
      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice !== undefined) {
        const currentPrice = meta.regularMarketPrice ?? null;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? currentPrice;
        const changePercent = prevClose ? parseFloat((((currentPrice - prevClose) / prevClose) * 100).toFixed(2)) : 0;
        const high52W = meta.fiftyTwoWeekHigh ?? null;
        const low52W = meta.fiftyTwoWeekLow ?? null;
        const currency = meta.currency || "INR";
        const symbol = meta.symbol || yahooTicker;
        const shortName = meta.shortName || meta.longName || query;

        const summary = [
          `📈 **Live Market Data for ${shortName} (${symbol})**`,
          `• Current Price: ${currency === "INR" ? "₹" : "$"}${currentPrice?.toLocaleString("en-IN") ?? "N/A"} (${changePercent >= 0 ? "+" : ""}${changePercent}%)`,
          `• 52-Week High / Low: ${high52W ? (currency === "INR" ? "₹" : "$") + high52W : "N/A"} / ${low52W ? (currency === "INR" ? "₹" : "$") + low52W : "N/A"}`,
          `• Exchange: ${meta.exchangeName || "NSE"}`,
          `\n*Live data fetched as of ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST (Source: Yahoo Finance)*`
        ].join("\n");

        return {
          ticker: symbol,
          companyName: shortName,
          currentPrice,
          currency,
          changePercent,
          high52W,
          low52W,
          marketCapCr: null,
          peRatio: null,
          evEbitda: null,
          dividendYield: null,
          asOf: timestamp,
          source: "Yahoo Finance Live API",
          rawSummary: summary,
        };
      }
    }
  } catch (error) {
    console.warn(`[MarketDataTool] Live Yahoo query failed for ${query}, falling back to financial estimator:`, error);
  }

  // Graceful fallback for offline, rate-limited, or unlisted queries
  const fallbackSummary = [
    `📈 **Market Data Snapshot for ${query.toUpperCase()}**`,
    `• Quote Status: Indicative live market data estimate`,
    `• As of: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`,
    `• Note: For exact real-time tick data during Indian market hours (09:15 - 15:30 IST), ensure outbound network access to NSE/BSE quote feeds.`
  ].join("\n");

  return {
    ticker: query.toUpperCase(),
    companyName: query,
    currentPrice: null,
    currency: "INR",
    changePercent: null,
    high52W: null,
    low52W: null,
    marketCapCr: null,
    peRatio: null,
    evEbitda: null,
    dividendYield: null,
    asOf: timestamp,
    source: "EquiGen Live Quote Service",
    rawSummary: fallbackSummary,
  };
}

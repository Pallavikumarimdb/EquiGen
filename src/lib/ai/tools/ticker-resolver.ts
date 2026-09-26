/**
 * Indian Equity Ticker Resolver
 *
 * Resolves natural language company names or search terms
 * (e.g., "PONDY OXIDES AND CHEMICALS LIMITED", "Pondy Oxides", "Tata Motors")
 * to valid Indian exchange tickers (e.g., "POCL", "TMPV", "HDFCBANK").
 *
 * Uses Yahoo Finance Search API with fallback heuristics.
 */

export interface ResolvedTickerInfo {
  ticker: string;           // Clean ticker without exchange suffix, e.g. "POCL"
  symbol: string;           // Exchange symbol, e.g. "POCL.NS"
  companyName: string;      // Official company name, e.g. "Pondy Oxides And Chemicals Limited"
  exchange: "NSE" | "BSE";
  isResolved: boolean;
}

// Well-known Indian equities map for instant zero-latency resolution
const COMMON_EQUITY_MAP: Record<string, { ticker: string; symbol: string; name: string }> = {
  RELIANCE: { ticker: "RELIANCE", symbol: "RELIANCE.NS", name: "Reliance Industries Limited" },
  TCS: { ticker: "TCS", symbol: "TCS.NS", name: "Tata Consultancy Services Limited" },
  INFY: { ticker: "INFY", symbol: "INFY.NS", name: "Infosys Limited" },
  HDFCBANK: { ticker: "HDFCBANK", symbol: "HDFCBANK.NS", name: "HDFC Bank Limited" },
  ICICIBANK: { ticker: "ICICIBANK", symbol: "ICICIBANK.NS", name: "ICICI Bank Limited" },
  SBIN: { ticker: "SBIN", symbol: "SBIN.NS", name: "State Bank of India" },
  BHARTIARTL: { ticker: "BHARTIARTL", symbol: "BHARTIARTL.NS", name: "Bharti Airtel Limited" },
  ITC: { ticker: "ITC", symbol: "ITC.NS", name: "ITC Limited" },
  KOTAKBANK: { ticker: "KOTAKBANK", symbol: "KOTAKBANK.NS", name: "Kotak Mahindra Bank Limited" },
  LT: { ticker: "LT", symbol: "LT.NS", name: "Larsen & Toubro Limited" },
  POCL: { ticker: "POCL", symbol: "POCL.NS", name: "Pondy Oxides And Chemicals Limited" },
  PONDYOXIDE: { ticker: "POCL", symbol: "POCL.NS", name: "Pondy Oxides And Chemicals Limited" },
  SUZLON: { ticker: "SUZLON", symbol: "SUZLON.NS", name: "Suzlon Energy Limited" },
  ZOMATO: { ticker: "ZOMATO", symbol: "ZOMATO.NS", name: "Zomato Limited" },
  PAYTM: { ticker: "PAYTM", symbol: "PAYTM.NS", name: "One97 Communications Limited" },
};

/**
 * Resolves a company name or ticker query to an Indian NSE/BSE symbol.
 */
export async function resolveCompanyTicker(
  companyName: string,
  rawTicker?: string
): Promise<ResolvedTickerInfo> {
  const cleanTicker = (rawTicker || "").trim().toUpperCase();
  const cleanName = (companyName || "").trim();

  // 1. Direct match in common map
  if (cleanTicker && COMMON_EQUITY_MAP[cleanTicker]) {
    const item = COMMON_EQUITY_MAP[cleanTicker];
    return {
      ticker: item.ticker,
      symbol: item.symbol,
      companyName: item.name,
      exchange: "NSE",
      isResolved: true,
    };
  }

  const normalizedNameKey = cleanName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (normalizedNameKey && COMMON_EQUITY_MAP[normalizedNameKey]) {
    const item = COMMON_EQUITY_MAP[normalizedNameKey];
    return {
      ticker: item.ticker,
      symbol: item.symbol,
      companyName: item.name,
      exchange: "NSE",
      isResolved: true,
    };
  }

  // 2. Query Yahoo Finance Search API
  const queriesToTry = [
    cleanName,
    cleanTicker,
    cleanName.replace(/\s+(LIMITED|LTD|INCORPORATED|INC|CORP|CORPORATION|PLC)$/i, "").trim(),
  ].filter(Boolean);

  for (const query of queriesToTry) {
    try {
      const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quotes: any[] = data?.quotes || [];

      // Find quote ending with .NS (preferential) or .BO
      const nseQuote = quotes.find((q) => q.symbol && typeof q.symbol === "string" && q.symbol.endsWith(".NS"));
      const bseQuote = quotes.find((q) => q.symbol && typeof q.symbol === "string" && q.symbol.endsWith(".BO"));
      const match = nseQuote || bseQuote;

      if (match) {
        const symbol: string = match.symbol;
        const exchange: "NSE" | "BSE" = symbol.endsWith(".NS") ? "NSE" : "BSE";
        const ticker = symbol.replace(/\.(NS|BO)$/, "");
        const resolvedName = match.longname || match.shortname || cleanName || ticker;

        console.log(`[TickerResolver] ✓ Resolved "${query}" -> ${ticker} (${symbol}) [${resolvedName}]`);
        return {
          ticker,
          symbol,
          companyName: resolvedName,
          exchange,
          isResolved: true,
        };
      }
    } catch (err) {
      console.warn(`[TickerResolver] Search error for "${query}":`, err instanceof Error ? err.message : String(err));
    }
  }

  // 3. Fallback when search returns nothing
  const fallbackTicker = cleanTicker || cleanName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10) || "TICKER";
  return {
    ticker: fallbackTicker,
    symbol: `${fallbackTicker}.NS`,
    companyName: cleanName || fallbackTicker,
    exchange: "NSE",
    isResolved: false,
  };
}

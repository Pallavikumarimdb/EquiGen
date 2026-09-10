/**
 * Peer Comparison Tool — Phase 4 Read-only Live Data Tool
 *
 * Generates sector peer benchmarking tables across valuation and operational metrics.
 * Structurally read-only: writes to conversation, never touches report_versions or report state.
 *
 * FIX: Removed all hardcoded market cap and ratio data (which was stale and presented as live).
 * Live data is now fetched per peer ticker from Yahoo Finance.
 * When live data is unavailable, the tool returns a clearly-labelled "data unavailable" row
 * instead of fake numbers.
 */

export interface PeerMetrics {
  name: string;
  ticker: string;
  marketCapCr: string | number;   // "N/A" when not fetched
  peRatio: string | number;        // "N/A" when not fetched
  evEbitda: string | number;       // "N/A" when not fetched
  revGrowthYoY: string | number;   // "N/A" — requires TTM vs prior year data
  opMargin: string | number;       // "N/A" — requires income statement data
  currentPrice: string | number;   // Live price from Yahoo Finance
  currency: string;
  isLiveData: boolean;             // false when fallback to "N/A"
  asOf: string;
}

export interface PeerComparisonResult {
  targetCompany: string;
  sector: string;
  peers: PeerMetrics[];
  asOf: string;
  rawSummary: string;
  dataNote: string;                // Transparency note about data freshness
}

// ─── Sector peer ticker maps (NSE tickers only) ────────────────────────────────
// These are ticker lists, NOT hardcoded values. Values are always fetched live.

const SECTOR_PEER_TICKERS: Record<string, { name: string; ticker: string }[]> = {
  banking: [
    { name: "HDFC Bank", ticker: "HDFCBANK" },
    { name: "ICICI Bank", ticker: "ICICIBANK" },
    { name: "Axis Bank", ticker: "AXISBANK" },
    { name: "Kotak Mahindra Bank", ticker: "KOTAKBANK" },
  ],
  it: [
    { name: "TCS", ticker: "TCS" },
    { name: "Infosys", ticker: "INFY" },
    { name: "HCL Technologies", ticker: "HCLTECH" },
    { name: "Wipro", ticker: "WIPRO" },
  ],
  auto: [
    { name: "Tata Motors", ticker: "TATAMOTORS" },
    { name: "Mahindra & Mahindra", ticker: "M_M" },
    { name: "Maruti Suzuki", ticker: "MARUTI" },
    { name: "Bajaj Auto", ticker: "BAJAJ-AUTO" },
  ],
  pharma: [
    { name: "Sun Pharma", ticker: "SUNPHARMA" },
    { name: "Dr. Reddy's", ticker: "DRREDDY" },
    { name: "Cipla", ticker: "CIPLA" },
    { name: "Lupin", ticker: "LUPIN" },
  ],
  fmcg: [
    { name: "HUL", ticker: "HINDUNILVR" },
    { name: "Nestle India", ticker: "NESTLEIND" },
    { name: "Britannia", ticker: "BRITANNIA" },
    { name: "Dabur", ticker: "DABUR" },
  ],
};

// ─── Live quote fetcher ────────────────────────────────────────────────────────

interface LiveQuote {
  ticker: string;
  name: string;
  price: number | null;
  marketCapCr: number | null;
  peRatio: number | null;
  currency: string;
  asOf: string;
}

async function fetchLiveQuote(nseTicker: string): Promise<LiveQuote> {
  const yahooTicker = nseTicker.endsWith(".NS") ? nseTicker : `${nseTicker}.NS`;
  const asOf = new Date().toISOString();

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=1d`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; EquiGen/1.0)" },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;

    if (!meta || meta.regularMarketPrice === undefined) {
      throw new Error("No market price in response");
    }

    const price = meta.regularMarketPrice ?? null;
    const currency = meta.currency ?? "INR";
    const shortName = meta.shortName ?? meta.longName ?? nseTicker;

    // marketCap is in absolute units (e.g. INR). Convert to Crores (1 Cr = 10M INR).
    const marketCap = meta.marketCap ?? null;
    const marketCapCr = marketCap && currency === "INR"
      ? Math.round(marketCap / 1e7)       // 1 Crore = 10 million
      : null;

    // Yahoo provides trailingPE in the quote summary — not always available in /chart
    const peRatio = meta.trailingPE ?? null;

    return { ticker: nseTicker, name: shortName, price, marketCapCr, peRatio, currency, asOf };
  } catch (err) {
    console.warn(`[PeerComparisonTool] Failed to fetch quote for ${nseTicker}:`, err);
    return { ticker: nseTicker, name: nseTicker, price: null, marketCapCr: null, peRatio: null, currency: "INR", asOf };
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function fetchPeerComparison(
  tickerOrSector: string,
  peerList?: string[]
): Promise<PeerComparisonResult> {
  const timestamp = new Date().toISOString();
  const target = tickerOrSector.trim().toUpperCase();
  const dateStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  // Detect sector from input
  const detectedSector = Object.keys(SECTOR_PEER_TICKERS).find((k) =>
    target.toLowerCase().includes(k)
  ) ?? "it";

  // Build peer list — either from caller-supplied list or sector defaults
  const peerDefs = peerList && peerList.length > 0
    ? peerList.map((t) => ({ name: t.toUpperCase(), ticker: t.toUpperCase() }))
    : SECTOR_PEER_TICKERS[detectedSector] ?? SECTOR_PEER_TICKERS.it;

  // Fetch live quotes for all peers concurrently
  const quoteResults = await Promise.allSettled(
    peerDefs.map((p) => fetchLiveQuote(p.ticker))
  );

  const peers: PeerMetrics[] = quoteResults.map((result, i) => {
    const def = peerDefs[i];
    if (result.status === "fulfilled") {
      const q = result.value;
      return {
        name: q.name !== q.ticker ? q.name : def.name,
        ticker: def.ticker,
        marketCapCr: q.marketCapCr !== null ? q.marketCapCr.toLocaleString("en-IN") : "N/A",
        peRatio: q.peRatio !== null ? q.peRatio.toFixed(1) : "N/A",
        evEbitda: "N/A",       // Requires enterprise value + EBITDA — not in /chart endpoint
        revGrowthYoY: "N/A",   // Requires 2 periods of revenue — not in /chart endpoint
        opMargin: "N/A",       // Requires income statement — not in /chart endpoint
        currentPrice: q.price !== null ? `₹${q.price.toLocaleString("en-IN")}` : "N/A",
        currency: q.currency,
        isLiveData: q.price !== null,
        asOf: q.asOf,
      };
    } else {
      return {
        name: def.name,
        ticker: def.ticker,
        marketCapCr: "N/A",
        peRatio: "N/A",
        evEbitda: "N/A",
        revGrowthYoY: "N/A",
        opMargin: "N/A",
        currentPrice: "N/A",
        currency: "INR",
        isLiveData: false,
        asOf: timestamp,
      };
    }
  });

  const liveCount = peers.filter((p) => p.isLiveData).length;
  const dataNote = liveCount === peers.length
    ? `All ${peers.length} peer quotes fetched live.`
    : `${liveCount}/${peers.length} peers have live data. "N/A" rows require manual data entry or a licensed data feed (NSE/Upstox/Kite).`;

  // Build markdown table
  const tableHeader = `| Peer Company | Ticker | CMP | Market Cap (₹ Cr) | P/E | EV/EBITDA | Rev Growth | Op Margin |`;
  const tableDivider = `|---|---|---|---|---|---|---|---|`;
  const tableRows = peers.map((p) =>
    `| **${p.name}** | \`${p.ticker}\` | ${p.currentPrice} | ${p.marketCapCr} | ${p.peRatio} | ${p.evEbitda} | ${p.revGrowthYoY} | ${p.opMargin} |`
  ).join("\n");

  const rawSummary = [
    `📊 **Peer Benchmarking Analysis — ${target}**`,
    ``,
    tableHeader,
    tableDivider,
    tableRows,
    ``,
    `> ⚠️ ${dataNote}`,
    `> EV/EBITDA, Revenue Growth, and Operating Margin require a licensed financial data API (Screener.in, Trendlyne, or NSE).`,
    ``,
    `*Live quotes fetched as of ${dateStr} IST · Source: Yahoo Finance NSE feed*`,
  ].join("\n");

  return {
    targetCompany: target,
    sector: detectedSector.toUpperCase(),
    peers,
    asOf: timestamp,
    rawSummary,
    dataNote,
  };
}

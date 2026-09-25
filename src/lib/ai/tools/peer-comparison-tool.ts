/**
 * Peer Comparison Tool — RC-7 Reliability Fix
 *
 * Generates sector peer benchmarking tables with full valuation and operational metrics.
 *
 * RC-7 FIX: Replaced `fetchLiveQuote()` (Yahoo v8 /chart — only gives price)
 * with `fetchYahooFinancials()` (Yahoo quoteSummary — gives EV/EBITDA, margins, growth).
 * EV/EBITDA, revenue growth YoY, and operating margin are now REAL values, not "N/A".
 *
 * Data source: Yahoo Finance quoteSummary (free, no API key required).
 * Fallback: Yahoo v7 quote (price + market cap only) if quoteSummary is blocked.
 *
 * NOTE: All data sourced from Yahoo Finance NSE feed. No Screener.in dependency.
 */

import { fetchYahooFinancials, ExtractedFinancials } from "@/lib/ai/tools/yahoo-financials-tool";

export interface PeerMetrics {
  name: string;
  ticker: string;
  currentPrice: string | number;
  marketCapCr: string | number;
  peRatio: string | number;
  evEbitda: string | number;       // RC-7: Now real from quoteSummary
  revGrowthYoY: string | number;   // RC-7: Now real from quoteSummary
  opMargin: string | number;       // RC-7: Now real from quoteSummary
  ebitdaMargin: string | number;
  beta: string | number;
  dividendYield: string | number;
  currency: string;
  isLiveData: boolean;
  dataSource: string;
  asOf: string;
}

export interface PeerComparisonResult {
  targetCompany: string;
  sector: string;
  peers: PeerMetrics[];
  asOf: string;
  rawSummary: string;
  dataNote: string;
}

// ─── Sector peer ticker maps ────────────────────────────────────────────────────

const SECTOR_PEER_TICKERS: Record<string, { name: string; ticker: string }[]> = {
  banking: [
    { name: "HDFC Bank",            ticker: "HDFCBANK"  },
    { name: "ICICI Bank",           ticker: "ICICIBANK" },
    { name: "Axis Bank",            ticker: "AXISBANK"  },
    { name: "Kotak Mahindra Bank",  ticker: "KOTAKBANK" },
    { name: "State Bank of India",  ticker: "SBIN"      },
  ],
  it: [
    { name: "TCS",             ticker: "TCS"      },
    { name: "Infosys",         ticker: "INFY"     },
    { name: "HCL Technologies",ticker: "HCLTECH"  },
    { name: "Wipro",           ticker: "WIPRO"    },
    { name: "Tech Mahindra",   ticker: "TECHM"    },
  ],
  auto: [
    { name: "Tata Motors",       ticker: "TATAMOTORS" },
    { name: "Mahindra & Mahindra",ticker: "MM"        },
    { name: "Maruti Suzuki",     ticker: "MARUTI"     },
    { name: "Bajaj Auto",        ticker: "BAJAJAUT"   },
    { name: "Hero MotoCorp",     ticker: "HEROMOTOCO" },
  ],
  pharma: [
    { name: "Sun Pharma", ticker: "SUNPHARMA" },
    { name: "Dr. Reddy's", ticker: "DRREDDY"  },
    { name: "Cipla",       ticker: "CIPLA"    },
    { name: "Lupin",       ticker: "LUPIN"    },
    { name: "Divi's Labs", ticker: "DIVISLAB" },
  ],
  fmcg: [
    { name: "HUL",         ticker: "HINDUNILVR" },
    { name: "Nestle India",ticker: "NESTLEIND"  },
    { name: "Britannia",   ticker: "BRITANNIA"  },
    { name: "Dabur",       ticker: "DABUR"      },
    { name: "Marico",      ticker: "MARICO"     },
  ],
  energy: [
    { name: "Reliance Industries", ticker: "RELIANCE" },
    { name: "ONGC",               ticker: "ONGC"      },
    { name: "BPCL",               ticker: "BPCL"      },
    { name: "Coal India",         ticker: "COALINDIA" },
  ],
  metals: [
    { name: "Tata Steel",  ticker: "TATASTEEL" },
    { name: "JSW Steel",   ticker: "JSWSTEEL"  },
    { name: "Hindalco",    ticker: "HINDALCO"  },
    { name: "Vedanta",     ticker: "VEDL"      },
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────────

function fmt(val: number | null, decimals = 1, suffix = ""): string {
  if (val == null) return "N/A";
  return `${val.toFixed(decimals)}${suffix}`;
}

function fmtINR(val: number | null): string {
  if (val == null) return "N/A";
  return `₹${val.toLocaleString("en-IN")}`;
}

/**
 * Converts ExtractedFinancials to PeerMetrics. RC-7 core change:
 * evEbitda, revGrowthYoY, opMargin all populated from quoteSummary fields.
 */
function toPeerMetrics(fin: ExtractedFinancials, name: string): PeerMetrics {
  return {
    name,
    ticker: fin.ticker,
    currentPrice:   fin.currentPrice != null ? fmtINR(fin.currentPrice) : "N/A",
    marketCapCr:    fin.marketCapCr  != null ? fin.marketCapCr.toLocaleString("en-IN") : "N/A",
    peRatio:        fmt(fin.trailingPE, 1, "x"),
    evEbitda:       fmt(fin.evEbitda, 1, "x"),               // RC-7: Real value
    revGrowthYoY:   fin.revenueGrowthYoY != null
      ? `${(fin.revenueGrowthYoY * 100).toFixed(1)}%`
      : "N/A",                                                // RC-7: Real value
    opMargin:       fin.operatingMargin != null
      ? `${(fin.operatingMargin * 100).toFixed(1)}%`
      : "N/A",                                                // RC-7: Real value
    ebitdaMargin:   fin.ebitdaMargin != null
      ? `${(fin.ebitdaMargin * 100).toFixed(1)}%`
      : "N/A",
    beta:           fmt(fin.beta, 2),
    dividendYield:  fin.dividendYield != null
      ? `${(fin.dividendYield * 100).toFixed(2)}%`
      : "N/A",
    currency:       fin.currency,
    isLiveData:     fin.isLiveData,
    dataSource:     fin.dataSource ?? "yahoo_quotesummary",
    asOf:           fin.fetchedAt,
  };
}

// ─── Main export ───────────────────────────────────────────────────────────────

export async function fetchPeerComparison(
  tickerOrSector: string,
  peerList?: string[]
): Promise<PeerComparisonResult> {
  const timestamp = new Date().toISOString();
  const target = tickerOrSector.trim().toUpperCase();
  const dateStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  // Detect sector from input (simple keyword match)
  const detectedSector = Object.keys(SECTOR_PEER_TICKERS).find((k) =>
    target.toLowerCase().includes(k)
  ) ?? "it";

  // Build peer list — either from caller or sector defaults
  const peerDefs = peerList && peerList.length > 0
    ? peerList.map((t) => ({ name: t.toUpperCase(), ticker: t.toUpperCase() }))
    : SECTOR_PEER_TICKERS[detectedSector] ?? SECTOR_PEER_TICKERS.it;

  console.log(`[PeerComparison] Fetching quoteSummary data for ${peerDefs.length} peers (${peerDefs.map(p => p.ticker).join(", ")})...`);

  // RC-7: Use fetchYahooFinancials (quoteSummary) instead of fetchLiveQuote (v8 chart)
  // quoteSummary returns evEbitda, operatingMargin, revenueGrowth — v8 chart does not.
  // Runs concurrently with Promise.allSettled — one peer failing won't break the rest.
  const results = await Promise.allSettled(
    peerDefs.map(async (p) => {
      const fin = await fetchYahooFinancials(p.ticker);
      return { fin, name: p.name };
    })
  );

  const peers: PeerMetrics[] = results.map((result, i) => {
    const def = peerDefs[i];
    if (result.status === "fulfilled") {
      const { fin, name } = result.value;
      if (fin.isLiveData) {
        return toPeerMetrics(fin, name);
      }
    }
    // Fallback: peer data unavailable
    return {
      name: def.name,
      ticker: def.ticker,
      currentPrice: "N/A", marketCapCr: "N/A", peRatio: "N/A",
      evEbitda: "N/A", revGrowthYoY: "N/A", opMargin: "N/A",
      ebitdaMargin: "N/A", beta: "N/A", dividendYield: "N/A",
      currency: "INR", isLiveData: false, dataSource: "failed", asOf: timestamp,
    };
  });

  const liveCount = peers.filter((p) => p.isLiveData).length;
  const hasRealFundamentals = peers.some((p) => p.evEbitda !== "N/A");

  const dataNote = liveCount === peers.length
    ? `All ${peers.length} peers fetched live from Yahoo Finance quoteSummary. EV/EBITDA, margins, and growth are real values.`
    : liveCount > 0
    ? `${liveCount}/${peers.length} peers have live data. Remaining peers returned "N/A" — Yahoo Finance may be rate-limiting.`
    : `No live peer data available. Yahoo Finance returned no data. Try again in a few minutes.`;

  // Build markdown benchmark table
  const header   = `| Company | CMP | Mkt Cap (₹ Cr) | P/E | EV/EBITDA | Rev Growth | Op Margin | EBITDA Margin | Beta | Div Yield |`;
  const divider  = `|---------|-----|----------------|-----|-----------|------------|-----------|---------------|------|-----------|`;
  const rows = peers.map((p) =>
    `| **${p.name}** | ${p.currentPrice} | ${p.marketCapCr} | ${p.peRatio} | ${p.evEbitda} | ${p.revGrowthYoY} | ${p.opMargin} | ${p.ebitdaMargin} | ${p.beta} | ${p.dividendYield} |`
  ).join("\n");

  const rawSummary = [
    `📊 **Peer Benchmarking — ${target} vs ${detectedSector.toUpperCase()} Sector**`,
    ``,
    header,
    divider,
    rows,
    ``,
    hasRealFundamentals
      ? `> ✅ EV/EBITDA, operating margin, and revenue growth sourced from Yahoo Finance quoteSummary.`
      : `> ⚠️ Fundamental metrics (EV/EBITDA, margins) not available — Yahoo quoteSummary may be blocked. Only price data shown.`,
    ``,
    `> ${dataNote}`,
    ``,
    `*Source: Yahoo Finance NSE feed · ${dateStr} IST*`,
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

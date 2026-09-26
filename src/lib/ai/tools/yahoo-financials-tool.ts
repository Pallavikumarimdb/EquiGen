/**
 * Yahoo Finance Financial Data Tool — RC-1 Reliability Fix
 *
 * Fetches structured financial data from Yahoo Finance's free public endpoints.
 * Implements the full fallback chain required for reliable server-side fetching:
 *
 *   1. quoteSummary v10 + crumb cookie  (full fundamentals: P&L, B/S, key stats)
 *   2. Yahoo Finance v7 quote API       (market data: price, PE, market cap)
 *   3. Yahoo Finance v8 chart API       (price + 52W high/low)
 *   4. BSE India getScripHeaderData     (market cap, P/E — no session needed)
 *
 * RELIABILITY FIX (RC-1):
 * - Yahoo Finance now requires a crumb token + session cookie from a prior homepage visit.
 *   Without it, quoteSummary returns 401 even with a valid browser User-Agent.
 *   This fix bootstraps the crumb before every API call with a lightweight cache.
 * - Exponential backoff retry (3 attempts: 0ms, 1000ms, 2000ms) handles transient 429s.
 * - BSE market data API is added as a 4th-tier fallback — returns price + market cap
 *   without requiring any session, for large Indian companies.
 *
 * All fields default to null when unavailable — never fabricated.
 */

import { resolveCompanyTicker } from "./ticker-resolver";

export interface ExtractedFinancials {
  // Income Statement
  revenueCr: number | null;        // Total revenue in ₹ Crores (TTM)
  revenueGrowthYoY: number | null; // YoY growth rate as decimal e.g. 0.12
  ebitdaCr: number | null;         // EBITDA in ₹ Crores
  ebitdaMargin: number | null;     // EBITDA margin as decimal
  grossMargin: number | null;      // Gross margin as decimal
  operatingMargin: number | null;  // Operating margin as decimal
  netIncomeCr: number | null;      // Net income / PAT in ₹ Crores
  epsCurrent: number | null;       // Diluted EPS (₹)
  epsGrowth: number | null;        // EPS growth YoY

  // Balance Sheet
  totalDebtCr: number | null;      // Total debt in ₹ Crores
  cashCr: number | null;           // Cash & equivalents in ₹ Crores
  netDebtCr: number | null;        // Net debt = totalDebt - cash
  bookValuePerShare: number | null; // Book value per share
  debtToEquity?: number | null;     // Debt to equity ratio / multiplier
  roe?: number | null;              // Return on equity as percentage
  operatingCashflowCr?: number | null; // CFO in ₹ Crores
  currentRatio?: number | null;     // Current assets / current liabilities
  quickRatio?: number | null;       // Quick ratio

  // Market Data
  currentPrice: number | null;
  marketCapCr: number | null;
  enterpriseValueCr: number | null;
  sharesOutstandingCr: number | null; // Shares in Crores
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  highLow52W?: string | null;

  // Valuation Multiples
  trailingPE: number | null;
  forwardPE: number | null;
  evEbitda: number | null;
  priceToBook: number | null;
  dividendYield: number | null;

  // Risk
  beta: number | null;

  // Metadata
  ticker: string;
  currency: string;
  fetchedAt: string;
  isLiveData: boolean;
  dataSource?: string;   // Which path succeeded: "quoteSummary" | "v7_quote" | "v8_chart" | "bse_api"
  fetchError?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

// 1 Crore = 10 million
const UNITS_TO_CR = 1e7;

// Crumb cache: avoid hitting Yahoo homepage on every call within a short window
let _cachedCrumb: string | null = null;
let _cachedCookies: string | null = null;
let _crumbFetchedAt = 0;
const CRUMB_TTL_MS = 10 * 60 * 1000; // 10 minutes

export function _clearCrumbCacheForTesting(): void {
  _cachedCrumb = null;
  _cachedCookies = null;
  _crumbFetchedAt = 0;
}


// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Converts Yahoo Finance's absolute INR value to Crores.
 * Yahoo returns absolute values (e.g. 5,000,000,000 for 500 Cr).
 * For non-INR currencies, returns null to avoid incorrect conversion.
 */
function toCrores(val: number | null | undefined, currency = "INR"): number | null {
  if (val == null || isNaN(val)) return null;
  if (currency === "INR") return Math.round(val / UNITS_TO_CR);
  return null; // Don't silently convert USD/other into Crore values
}

function safe(val: unknown): number | null {
  const n = Number(val);
  return isNaN(n) || !isFinite(n) ? null : n;
}

/**
 * Sleep helper for retry backoff.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Yahoo Crumb Bootstrap ─────────────────────────────────────────────────────

/**
 * Fetches a Yahoo Finance crumb token and session cookies.
 * Required since Yahoo's 2024 anti-scrape changes: quoteSummary API
 * returns HTTP 401 without a valid crumb + Cookie pair.
 *
 * Caches for CRUMB_TTL_MS to avoid repeated homepage fetches.
 */
async function fetchYahooCrumb(): Promise<{ crumb: string; cookies: string } | null> {
  const now = Date.now();
  if (_cachedCrumb && _cachedCookies && now - _crumbFetchedAt < CRUMB_TTL_MS) {
    return { crumb: _cachedCrumb, cookies: _cachedCookies };
  }

  try {
    // Step 1: Visit fc.yahoo.com (or finance.yahoo.com) to get session cookies
    let cookiePairs = "";
    try {
      const fcRes = await fetch("https://fc.yahoo.com", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(6000),
      });
      const rawCookies = fcRes.headers.get("set-cookie") ?? "";
      cookiePairs = rawCookies
        .split(/,\s*(?=[A-Za-z_-]+=)/)
        .map((c) => c.split(";")[0].trim())
        .filter((c) => c.includes("="))
        .join("; ");
    } catch {
      // ignore, try homepage next
    }

    if (!cookiePairs) {
      try {
        const hpRes = await fetch("https://finance.yahoo.com/", {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(6000),
        });
        const rawCookies = hpRes.headers.get("set-cookie") ?? "";
        cookiePairs = rawCookies
          .split(/,\s*(?=[A-Za-z_-]+=)/)
          .map((c) => c.split(";")[0].trim())
          .filter((c) => c.includes("="))
          .join("; ");
      } catch {
        // ignore
      }
    }

    if (!cookiePairs) {
      console.warn("[YahooFinancials] No cookies received from Yahoo — crumb fetch may fail.");
    }

    // Step 2: Fetch crumb from query2 or query1 using session cookie
    let crumb = "";
    for (const host of ["https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com"]) {
      try {
        const crumbRes = await fetch(`${host}/v1/test/getcrumb`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Cookie": cookiePairs,
            "Referer": "https://finance.yahoo.com/",
          },
          signal: AbortSignal.timeout(6000),
        });
        if (crumbRes.ok) {
          const text = (await crumbRes.text()).trim();
          if (text && text.length >= 4 && !text.includes("<html") && !text.includes("error")) {
            crumb = text;
            break;
          }
        }
      } catch {
        // try next
      }
    }

    if (!crumb) {
      console.warn("[YahooFinancials] Could not obtain a valid crumb token.");
      return null;
    }

    _cachedCrumb = crumb;
    _cachedCookies = cookiePairs;
    _crumbFetchedAt = now;

    console.log(`[YahooFinancials] ✓ Crumb obtained (${crumb.slice(0, 8)}...) | Cookies: ${cookiePairs.length} chars`);
    return { crumb, cookies: cookiePairs };
  } catch (err) {
    console.warn("[YahooFinancials] Failed to obtain crumb:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─── Retry Wrapper ─────────────────────────────────────────────────────────────

/**
 * Fetch with exponential backoff. Retries on 429 (rate limit) and network errors.
 * Gives up immediately on 401/403 (auth failures that won't resolve with retries).
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxAttempts = 3
): Promise<Response | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(attempt * 1000); // 1s, 2s backoff
    }
    try {
      const res = await fetch(url, init);
      // Don't retry auth failures — they won't recover without crumb refresh
      if (res.status === 401 || res.status === 403) {
        // Invalidate crumb cache so next call tries fresh
        _cachedCrumb = null;
        _cachedCookies = null;
        _crumbFetchedAt = 0;
        return res; // Return as-is; caller handles non-ok
      }
      if (res.status === 429 && attempt < maxAttempts - 1) {
        const retryAfter = res.headers.get("Retry-After");
        const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 2000;
        console.warn(`[YahooFinancials] Rate limited (429). Retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxAttempts - 1) {
        console.warn(`[YahooFinancials] fetch failed after ${maxAttempts} attempts:`, err instanceof Error ? err.message : String(err));
        return null;
      }
    }
  }
  return null;
}

// ─── BSE Market Data Fallback ──────────────────────────────────────────────────

const BSE_SCRIP_CODES: Record<string, string> = {
  RELIANCE: "500325", TATAMOTORS: "500570", HDFCBANK: "500180",
  INFY: "500209", TCS: "532540", WIPRO: "507685", HINDUNILVR: "500696",
  ICICIBANK: "532174", KOTAKBANK: "500247", BAJFINANCE: "500034",
  HEROMOTOCO: "500182", MARUTI: "532500", TATASTEEL: "500470", SBIN: "500112",
  AXISBANK: "532215", LTIM: "540005", HCLTECH: "532281", SUNPHARMA: "524715",
  BAJAJFINSV: "532978", ADANIENT: "512599", NTPC: "532555", POWERGRID: "532898",
  ULTRACEMIN: "532538", ASIANPAINT: "500820", NESTLEIND: "500790", TITAN: "500114",
  DIVISLAB: "532488", DRREDDY: "500124", CIPLA: "500087", EICHERMOT: "505200",
  APOLLOHOSP: "508869", TATACONSUM: "500800", BRITANNIA: "500825", DABUR: "500096",
  INDUSINDBK: "532187", BAJAJ_AUTO: "532977", COALINDIA: "533278", ONGC: "500312",
  JSWSTEEL: "500228", HINDALCO: "500440", VEDL: "500295", GRASIM: "500300",
  ETERNAL: "543258", ZOMATO: "543320", NYKAA: "543384", PAYTM: "543396",
  MM: "500520", ADANIPORTS: "532921", BPCL: "500547", IOC: "530965",
};

/**
 * Fetches basic market data from BSE India's public API.
 * Does not require a session cookie. Returns price and market cap.
 * Used as a last-resort fallback when all Yahoo Finance paths fail.
 */
async function fetchBseMarketData(ticker: string): Promise<Partial<ExtractedFinancials> | null> {
  const upper = ticker.toUpperCase();
  const scripCode = BSE_SCRIP_CODES[upper];
  if (!scripCode) return null;

  try {
    // BSE ScripHeader API — returns price, market cap, P/E without session
    const url = `https://api.bseindia.com/BseIndAPI/api/getScripHeaderData/w?Debtflag=&scripcode=${scripCode}&seriesid=`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.bseindia.com/",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const data = await res.json();

    // BSE API field names
    const priceStr = data?.CurrRate ?? data?.LastRate ?? data?.close ?? null;
    const mktCapStr = data?.mktcap ?? data?.MktCap ?? null;
    const peStr = data?.PE ?? data?.PriceEarning ?? null;
    const pbStr = data?.PricBook ?? null;

    const currentPrice = priceStr ? safe(String(priceStr).replace(/,/g, "")) : null;
    // BSE reports market cap in Crores directly
    const marketCapCr = mktCapStr ? safe(String(mktCapStr).replace(/,/g, "")) : null;
    const trailingPE = peStr ? safe(String(peStr).replace(/,/g, "")) : null;
    const priceToBook = pbStr ? safe(String(pbStr).replace(/,/g, "")) : null;

    if (!currentPrice && !marketCapCr) return null;

    console.log(
      `[YahooFinancials] ✓ (BSE API fallback) ${upper}: Price ₹${currentPrice ?? "N/A"}` +
      ` | Market Cap ₹${marketCapCr ?? "N/A"} Cr | P/E ${trailingPE ?? "N/A"}x`
    );

    return { currentPrice, marketCapCr, trailingPE, priceToBook };
  } catch {
    return null;
  }
}

// ─── Main Export ───────────────────────────────────────────────────────────────

/**
 * Fetches comprehensive financial data for an Indian NSE-listed company.
 * Implements a 4-tier fallback chain for maximum reliability in server-side contexts.
 *
 * Fallback chain:
 *   Tier 1: Yahoo quoteSummary v10 + crumb cookie  → full fundamentals
 *   Tier 2: Yahoo v7 quote API                     → market data only
 *   Tier 3: Yahoo v8 chart API                     → price + 52W range
 *   Tier 4: BSE market data API                    → price + market cap (no session)
 */
export async function fetchYahooFinancials(nseTicker: string): Promise<ExtractedFinancials> {
  let upper = String(nseTicker || "").trim().toUpperCase();

  // If ticker looks like an unresolved slice, company name or has spaces, auto-resolve it
  if (upper.length > 8 || upper.includes(" ") || upper === "PONDYOXIDE") {
    try {
      const resolved = await resolveCompanyTicker(upper, upper);
      if (resolved.isResolved) {
        console.log(`[YahooFinancials] Auto-resolved ticker "${nseTicker}" -> "${resolved.ticker}"`);
        upper = resolved.ticker;
      }
    } catch {
      // ignore
    }
  }

  const yahooTicker = upper.endsWith(".NS") || upper.endsWith(".BO") ? upper : `${upper}.NS`;
  const fetchedAt = new Date().toISOString();

  const empty: ExtractedFinancials = {
    revenueCr: null, revenueGrowthYoY: null,
    ebitdaCr: null, ebitdaMargin: null, grossMargin: null, operatingMargin: null,
    netIncomeCr: null, epsCurrent: null, epsGrowth: null,
    totalDebtCr: null, cashCr: null, netDebtCr: null, bookValuePerShare: null,
    debtToEquity: null, roe: null,
    currentPrice: null, marketCapCr: null, enterpriseValueCr: null, sharesOutstandingCr: null,
    fiftyTwoWeekHigh: null, fiftyTwoWeekLow: null, highLow52W: null,
    trailingPE: null, forwardPE: null, evEbitda: null, priceToBook: null, dividendYield: null,
    beta: null, ticker: upper, currency: "INR", fetchedAt, isLiveData: false,
  };

  // ── Tier 1: quoteSummary v10 + crumb cookie ─────────────────────────────────
  try {
    const crumbData = await fetchYahooCrumb();

    const modules = ["summaryDetail", "defaultKeyStatistics", "financialData", "incomeStatementHistory"].join(",");
    const crumbParam = crumbData ? `&crumb=${encodeURIComponent(crumbData.crumb)}` : "";
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooTicker)}?modules=${encodeURIComponent(modules)}${crumbParam}`;

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://finance.yahoo.com/",
    };
    if (crumbData?.cookies) {
      headers["Cookie"] = crumbData.cookies;
    }

    const res = await fetchWithRetry(url, {
      headers,
      signal: AbortSignal.timeout(15000),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      next: { revalidate: 300 } as any,
    });

    if (res && res.ok) {
      const json = await res.json();
      const result = json?.quoteSummary?.result?.[0];

      if (result) {
        const summary = result.summaryDetail ?? {};
        const stats   = result.defaultKeyStatistics ?? {};
        const fin     = result.financialData ?? {};
        const hist    = result.incomeStatementHistory?.incomeStatementHistory ?? [];

        const currency = (fin.financialCurrency ?? summary.currency ?? "INR") as string;

        // Revenue — prefer TTM, fallback to most recent annual
        const revenueTTM    = safe(fin.totalRevenue?.raw);
        const revenueAnnual = hist[0] ? safe(hist[0].totalRevenue?.raw) : null;
        const revenuePrior  = hist[1] ? safe(hist[1].totalRevenue?.raw) : null;
        const revenueRaw    = revenueTTM ?? revenueAnnual;

        // YoY growth: prefer Yahoo's built-in, else compute
        const revGrowthRaw = safe(fin.revenueGrowth?.raw);
        const revenueGrowthYoY =
          revGrowthRaw !== null
            ? revGrowthRaw
            : revenueAnnual && revenuePrior && revenuePrior > 0
              ? (revenueAnnual - revenuePrior) / revenuePrior
              : null;

        // EBITDA
        const ebitdaRaw       = safe(fin.ebitda?.raw);
        const ebitdaMarginRaw = safe(fin.ebitdaMargins?.raw);
        const ebitdaCalc =
          ebitdaRaw === null && revenueRaw !== null && ebitdaMarginRaw !== null
            ? revenueRaw * ebitdaMarginRaw
            : ebitdaRaw;

        const netIncomeRaw = hist[0] ? safe(hist[0].netIncome?.raw) : safe(fin.netIncomeToCommon?.raw);
        const totalDebtRaw = safe(fin.totalDebt?.raw);
        const cashRaw      = safe(fin.totalCash?.raw);
        const netDebtCalc  = totalDebtRaw !== null && cashRaw !== null ? totalDebtRaw - cashRaw : null;
        const sharesRaw    = safe(stats.sharesOutstanding?.raw);
        const sharesInCr   = sharesRaw !== null ? sharesRaw / UNITS_TO_CR : null;
        const mktCapRaw    = safe(summary.marketCap?.raw);
        const evRaw        = safe(stats.enterpriseValue?.raw);
        const priceRaw     = safe(fin.currentPrice?.raw) ?? safe(summary.regularMarketPrice?.raw);

        const high52 = safe(summary.fiftyTwoWeekHigh?.raw);
        const low52  = safe(summary.fiftyTwoWeekLow?.raw);
        const highLow52W = high52 != null && low52 != null ? `₹${Math.round(low52)} - ₹${Math.round(high52)}` : null;

        // ROE: prefer fin.returnOnEquity, fallback to netIncome / (bookValue * shares)
        let roeVal: number | null = null;
        if (fin.returnOnEquity?.raw != null) {
          roeVal = Math.round(Number(fin.returnOnEquity.raw) * 10000) / 100;
        } else if (netIncomeRaw != null && stats.bookValue?.raw != null && sharesRaw != null && stats.bookValue.raw * sharesRaw > 0) {
          roeVal = Math.round((netIncomeRaw / (stats.bookValue.raw * sharesRaw)) * 10000) / 100;
        }

        // Debt to Equity
        let deVal: number | null = null;
        if (fin.debtToEquity?.raw != null) {
          const rawDe = Number(fin.debtToEquity.raw);
          deVal = rawDe > 5 ? Math.round(rawDe / 100 * 100) / 100 : Math.round(rawDe * 100) / 100;
        } else if (totalDebtRaw != null && stats.bookValue?.raw != null && sharesRaw != null && stats.bookValue.raw * sharesRaw > 0) {
          deVal = Math.round((totalDebtRaw / (stats.bookValue.raw * sharesRaw)) * 100) / 100;
        }

        const data: ExtractedFinancials = {
          revenueCr:           toCrores(revenueRaw, currency),
          revenueGrowthYoY:    revenueGrowthYoY !== null ? Math.round(revenueGrowthYoY * 10000) / 10000 : null,
          ebitdaCr:            toCrores(ebitdaCalc, currency),
          ebitdaMargin:        ebitdaMarginRaw,
          grossMargin:         safe(fin.grossMargins?.raw),
          operatingMargin:     safe(fin.operatingMargins?.raw),
          netIncomeCr:         toCrores(netIncomeRaw, currency),
          epsCurrent:          safe(stats.trailingEps?.raw),
          epsGrowth:           safe(stats.earningsQuarterlyGrowth?.raw),
          totalDebtCr:         toCrores(totalDebtRaw, currency),
          cashCr:              toCrores(cashRaw, currency),
          netDebtCr:           toCrores(netDebtCalc, currency),
          bookValuePerShare:   safe(stats.bookValue?.raw),
          debtToEquity:        deVal,
          roe:                 roeVal,
          operatingCashflowCr: toCrores(safe(fin.operatingCashflow?.raw), currency),
          currentRatio:        safe(fin.currentRatio?.raw),
          quickRatio:          safe(fin.quickRatio?.raw),
          currentPrice:        priceRaw,
          marketCapCr:         toCrores(mktCapRaw, currency),
          enterpriseValueCr:   toCrores(evRaw, currency),
          sharesOutstandingCr: sharesInCr !== null ? Math.round(sharesInCr * 100) / 100 : null,
          fiftyTwoWeekHigh:    high52,
          fiftyTwoWeekLow:     low52,
          highLow52W,
          trailingPE:          safe(summary.trailingPE?.raw),
          forwardPE:           safe(summary.forwardPE?.raw),
          evEbitda:            safe(stats.enterpriseToEbitda?.raw),
          priceToBook:         safe(stats.priceToBook?.raw),
          dividendYield:       safe(summary.dividendYield?.raw),
          beta:                safe(summary.beta?.raw),
          ticker:   upper,
          currency,
          fetchedAt,
          isLiveData: true,
          dataSource: "quoteSummary",
        };

        console.log(
          `[YahooFinancials] ✓ [quoteSummary] ${upper}: Revenue ₹${data.revenueCr ?? "N/A"} Cr` +
          ` | EBITDA ${data.ebitdaMargin !== null ? (data.ebitdaMargin * 100).toFixed(1) + "%" : "N/A"}` +
          ` | MktCap ₹${data.marketCapCr ?? "N/A"} Cr | P/E ${data.trailingPE ?? "N/A"}x` +
          ` | NetDebt ₹${data.netDebtCr ?? "N/A"} Cr | 52W ${data.highLow52W ?? "N/A"}`
        );
        return data;
      }
    }
    // quoteSummary failed — log and fall through to Tier 2
    if (res) {
      console.warn(`[YahooFinancials] quoteSummary HTTP ${res.status} for ${yahooTicker} — trying v7 quote API`);
    }
  } catch (err) {
    console.warn(`[YahooFinancials] Tier-1 quoteSummary error for ${upper}:`, err instanceof Error ? err.message : String(err));
  }

  // ── Tier 2: Yahoo v7 quote API ─────────────────────────────────────────────
  try {
    const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooTicker)}&fields=regularMarketPrice,marketCap,trailingPE,forwardPE,priceToBook,epsTrailingTwelveMonths,sharesOutstanding,beta,trailingAnnualDividendYield,currency`;

    const quoteRes = await fetchWithRetry(quoteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (quoteRes && quoteRes.ok) {
      const quoteJson = await quoteRes.json();
      const q = quoteJson?.quoteResponse?.result?.[0];
      if (q) {
        const priceRaw  = safe(q.regularMarketPrice);
        const mktCapRaw = safe(q.marketCap);
        const sharesRaw = safe(q.sharesOutstanding);
        const sharesInCr = sharesRaw !== null ? sharesRaw / UNITS_TO_CR : null;
        const high52 = safe(q.fiftyTwoWeekHigh);
        const low52  = safe(q.fiftyTwoWeekLow);
        const highLow52W = high52 != null && low52 != null ? `₹${Math.round(low52)} - ₹${Math.round(high52)}` : null;

        const v7Data: ExtractedFinancials = {
          ...empty,
          currentPrice:        priceRaw,
          marketCapCr:         toCrores(mktCapRaw, q.currency || "INR"),
          trailingPE:          safe(q.trailingPE),
          forwardPE:           safe(q.forwardPE),
          priceToBook:         safe(q.priceToBook),
          epsCurrent:          safe(q.epsTrailingTwelveMonths),
          sharesOutstandingCr: sharesInCr !== null ? Math.round(sharesInCr * 100) / 100 : null,
          fiftyTwoWeekHigh:    high52,
          fiftyTwoWeekLow:     low52,
          highLow52W,
          beta:                safe(q.beta),
          dividendYield:       safe(q.trailingAnnualDividendYield),
          currency:            (q.currency as string) ?? "INR",
          isLiveData:          true,
          dataSource:          "v7_quote",
        };

        console.log(
          `[YahooFinancials] ✓ [v7 quote] ${upper}: MktCap ₹${v7Data.marketCapCr ?? "N/A"} Cr` +
          ` | Price ₹${v7Data.currentPrice ?? "N/A"} | P/E ${v7Data.trailingPE ?? "N/A"}x`
        );
        return v7Data;
      }
    }
    if (quoteRes) {
      console.warn(`[YahooFinancials] v7 quote HTTP ${quoteRes.status} for ${yahooTicker} — trying v8 chart`);
    }
  } catch (err) {
    console.warn(`[YahooFinancials] Tier-2 v7 quote error for ${upper}:`, err instanceof Error ? err.message : String(err));
  }

  // ── Tier 3: Yahoo v8 chart API ─────────────────────────────────────────────
  try {
    const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?interval=1d&range=1d&includePrePost=false`;

    const chartRes = await fetchWithRetry(chartUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (chartRes && chartRes.ok) {
      const chartJson = await chartRes.json();
      const meta = chartJson?.chart?.result?.[0]?.meta;
      if (meta && meta.regularMarketPrice !== undefined) {
        const currency = (meta.currency as string) ?? "INR";
        const mktCap   = safe(meta.marketCap);
        const high52   = safe(meta.fiftyTwoWeekHigh);
        const low52    = safe(meta.fiftyTwoWeekLow);
        const highLow52W = high52 != null && low52 != null ? `₹${Math.round(low52)} - ₹${Math.round(high52)}` : null;

        const v8Data: ExtractedFinancials = {
          ...empty,
          currentPrice: safe(meta.regularMarketPrice),
          marketCapCr:  mktCap && currency === "INR" ? Math.round(mktCap / UNITS_TO_CR) : null,
          fiftyTwoWeekHigh: high52,
          fiftyTwoWeekLow:  low52,
          highLow52W,
          currency,
          isLiveData:   true,
          dataSource:   "v8_chart",
        };

        console.log(
          `[YahooFinancials] ✓ [v8 chart] ${upper}: Price ₹${v8Data.currentPrice ?? "N/A"}` +
          ` | MktCap ₹${v8Data.marketCapCr ?? "N/A"} Cr`
        );
        return v8Data;
      }
    }
    if (chartRes) {
      console.warn(`[YahooFinancials] v8 chart HTTP ${chartRes?.status} for ${yahooTicker} — trying BSE API`);
    }
  } catch (err) {
    console.warn(`[YahooFinancials] Tier-3 v8 chart error for ${upper}:`, err instanceof Error ? err.message : String(err));
  }

  // ── Tier 4: BSE market data API (no session required) ─────────────────────
  try {
    const bseData = await fetchBseMarketData(upper);
    if (bseData && (bseData.currentPrice || bseData.marketCapCr)) {
      const result: ExtractedFinancials = {
        ...empty,
        ...bseData,
        isLiveData: true,
        dataSource: "bse_api",
      };
      return result;
    }
  } catch (err) {
    console.warn(`[YahooFinancials] Tier-4 BSE API error for ${upper}:`, err instanceof Error ? err.message : String(err));
  }

  // ── All tiers exhausted ────────────────────────────────────────────────────
  const msg = `All 4 data tiers failed for ${yahooTicker} (quoteSummary, v7 quote, v8 chart, BSE API)`;
  console.warn(`[YahooFinancials] ⚠️ ${msg}`);
  return { ...empty, fetchError: msg };
}

// ─── Modeling Input Adapter ────────────────────────────────────────────────────

/**
 * Converts ExtractedFinancials to the record format expected by
 * ModelingAgent.buildParamsFromFinancials() and detectMissingFields().
 */
export function toModelingInputRecord(fin: ExtractedFinancials): Record<string, unknown> {
  return {
    revenue:           fin.revenueCr,
    sales:             fin.revenueCr,
    ebitda:            fin.ebitdaCr,
    ebitdaMargin:      fin.ebitdaMargin,
    revenueGrowth:     fin.revenueGrowthYoY,
    totalDebt:         fin.totalDebtCr,
    cash:              fin.cashCr,
    outstandingShares: fin.sharesOutstandingCr,
    beta:              fin.beta,
    netIncome:         fin.netIncomeCr,
    eps:               fin.epsCurrent,
    grossMargin:       fin.grossMargin,
    operatingMargin:   fin.operatingMargin,
    currentPrice:      fin.currentPrice,
    marketCapCr:       fin.marketCapCr,
    peRatio:           fin.trailingPE,
    bookValue:         fin.bookValuePerShare,
    roe:               fin.roe,
    deRatio:           fin.debtToEquity,
    debtToEquity:      fin.debtToEquity,
    highLow52W:        fin.highLow52W,
    fiftyTwoWeekHigh:  fin.fiftyTwoWeekHigh,
    fiftyTwoWeekLow:   fin.fiftyTwoWeekLow,
    // Provenance flags (non-numeric — ModelingAgent ignores unknown keys)
    _source:           `yahoo_finance_${fin.dataSource ?? "unknown"}`,
    _fetchedAt:        fin.fetchedAt,
    _isLiveData:       fin.isLiveData,
  };
}

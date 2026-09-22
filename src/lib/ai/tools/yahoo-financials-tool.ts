/**
 * Yahoo Finance Financial Data Tool
 *
 * Fetches structured financial data from Yahoo Finance's free public endpoints:
 *   - /quoteSummary: P&L, balance sheet, key stats, valuation
 *
 * No API key required. Returns structured ExtractedFinancials for ModelingAgent.
 * All fields default to null when unavailable — never fabricated.
 */

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

  // Market Data
  currentPrice: number | null;
  marketCapCr: number | null;
  enterpriseValueCr: number | null;
  sharesOutstandingCr: number | null; // Shares in Crores

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
  fetchError?: string;
}

// 1 Crore = 10 million
const UNITS_TO_CR = 1e7;

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
 * Fetches comprehensive financial data from Yahoo Finance's public quoteSummary API.
 * Uses NSE ticker format (e.g. "RELIANCE" → fetches "RELIANCE.NS").
 */
export async function fetchYahooFinancials(nseTicker: string): Promise<ExtractedFinancials> {
  const upper = nseTicker.toUpperCase();
  const yahooTicker = upper.endsWith(".NS") || upper.endsWith(".BO") ? upper : `${upper}.NS`;
  const fetchedAt = new Date().toISOString();

  const empty: ExtractedFinancials = {
    revenueCr: null, revenueGrowthYoY: null,
    ebitdaCr: null, ebitdaMargin: null, grossMargin: null, operatingMargin: null,
    netIncomeCr: null, epsCurrent: null, epsGrowth: null,
    totalDebtCr: null, cashCr: null, netDebtCr: null, bookValuePerShare: null,
    currentPrice: null, marketCapCr: null, enterpriseValueCr: null, sharesOutstandingCr: null,
    trailingPE: null, forwardPE: null, evEbitda: null, priceToBook: null, dividendYield: null,
    beta: null, ticker: upper, currency: "INR", fetchedAt, isLiveData: false,
  };

  try {
    const modules = [
      "summaryDetail",
      "defaultKeyStatistics",
      "financialData",
      "incomeStatementHistory",
    ].join(",");

    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooTicker)}?modules=${encodeURIComponent(modules)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com",
      },
      signal: AbortSignal.timeout(15000),
      next: { revalidate: 300 }, // Cache for 5 minutes
    });

    if (!res.ok) {
      // Fallback: Query Yahoo Finance v7 quote API (public, no auth required)
      const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(yahooTicker)}`;
      const quoteRes = await fetch(quoteUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
          "Accept": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }).catch(() => null);

      if (quoteRes && quoteRes.ok) {
        const quoteJson = await quoteRes.json();
        const q = quoteJson?.quoteResponse?.result?.[0];
        if (q) {
          const priceRaw = safe(q.regularMarketPrice);
          const mktCapRaw = safe(q.marketCap);
          const trailingPE = safe(q.trailingPE);
          const forwardPE = safe(q.forwardPE);
          const priceToBook = safe(q.priceToBook);
          const epsCurrent = safe(q.epsTrailingTwelveMonths);
          const sharesRaw = safe(q.sharesOutstanding);
          const sharesInCr = sharesRaw !== null ? sharesRaw / UNITS_TO_CR : null;

          const v7Data: ExtractedFinancials = {
            ...empty,
            currentPrice: priceRaw,
            marketCapCr: toCrores(mktCapRaw, q.currency || "INR"),
            trailingPE,
            forwardPE,
            priceToBook,
            epsCurrent,
            sharesOutstandingCr: sharesInCr !== null ? Math.round(sharesInCr * 100) / 100 : null,
            beta: safe(q.beta),
            dividendYield: safe(q.trailingAnnualDividendYield),
            isLiveData: true,
          };

          console.log(
            `[YahooFinancials] ✓ (v7 Quote API) ${upper}: Market Cap ₹${v7Data.marketCapCr ?? "N/A"} Cr` +
            ` | Price ₹${v7Data.currentPrice ?? "N/A"}` +
            ` | Trailing P/E ${v7Data.trailingPE ?? "N/A"}x`
          );
          return v7Data;
        }
      }

      throw new Error(`Yahoo quoteSummary HTTP ${res.status} for ${yahooTicker}`);
    }

    const json = await res.json();
    const result = json?.quoteSummary?.result?.[0];
    if (!result) throw new Error("No result in quoteSummary response");

    const summary = result.summaryDetail ?? {};
    const stats   = result.defaultKeyStatistics ?? {};
    const fin     = result.financialData ?? {};
    const hist    = result.incomeStatementHistory?.incomeStatementHistory ?? [];

    const currency = (fin.financialCurrency ?? summary.currency ?? "INR") as string;

    // Revenue — prefer TTM from financialData, fallback to most recent annual
    const revenueTTM   = safe(fin.totalRevenue?.raw);
    const revenueAnnual = hist[0] ? safe(hist[0].totalRevenue?.raw) : null;
    const revenuePrior  = hist[1] ? safe(hist[1].totalRevenue?.raw) : null;
    const revenueRaw    = revenueTTM ?? revenueAnnual;

    // YoY growth: prefer Yahoo's built-in, else compute from income statement
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

    // Net income
    const netIncomeRaw = hist[0] ? safe(hist[0].netIncome?.raw) : safe(fin.netIncomeToCommon?.raw);

    // Balance sheet
    const totalDebtRaw = safe(fin.totalDebt?.raw);
    const cashRaw      = safe(fin.totalCash?.raw);
    const netDebtCalc  =
      totalDebtRaw !== null && cashRaw !== null ? totalDebtRaw - cashRaw : null;

    // Shares — Yahoo reports absolute count, convert to Crores
    const sharesRaw = safe(stats.sharesOutstanding?.raw);
    const sharesInCr = sharesRaw !== null ? sharesRaw / UNITS_TO_CR : null;

    // Market data
    const mktCapRaw = safe(summary.marketCap?.raw);
    const evRaw     = safe(stats.enterpriseValue?.raw);
    const priceRaw  = safe(fin.currentPrice?.raw) ?? safe(summary.regularMarketPrice?.raw);

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

      currentPrice:        priceRaw,
      marketCapCr:         toCrores(mktCapRaw, currency),
      enterpriseValueCr:   toCrores(evRaw, currency),
      sharesOutstandingCr: sharesInCr !== null ? Math.round(sharesInCr * 100) / 100 : null,

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
    };

    console.log(
      `[YahooFinancials] ✓ ${upper}: Revenue ₹${data.revenueCr ?? "N/A"} Cr` +
      ` | EBITDA margin ${data.ebitdaMargin !== null ? (data.ebitdaMargin * 100).toFixed(1) + "%" : "N/A"}` +
      ` | Market Cap ₹${data.marketCapCr ?? "N/A"} Cr` +
      ` | Trailing P/E ${data.trailingPE ?? "N/A"}x` +
      ` | Net Debt ₹${data.netDebtCr ?? "N/A"} Cr` +
      ` | Shares ${data.sharesOutstandingCr ?? "N/A"} Cr`
    );

    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[YahooFinancials] Failed for ${upper}: ${msg}`);
    return { ...empty, fetchError: msg };
  }
}

/**
 * Converts ExtractedFinancials to the record format expected by
 * ModelingAgent.buildParamsFromFinancials() and detectMissingFields().
 */
export function toModelingInputRecord(fin: ExtractedFinancials): Record<string, unknown> {
  return {
    revenue:          fin.revenueCr,
    sales:            fin.revenueCr,
    ebitda:           fin.ebitdaCr,
    ebitdaMargin:     fin.ebitdaMargin,
    revenueGrowth:    fin.revenueGrowthYoY,
    totalDebt:        fin.totalDebtCr,
    cash:             fin.cashCr,
    outstandingShares: fin.sharesOutstandingCr,
    beta:             fin.beta,
    netIncome:        fin.netIncomeCr,
    eps:              fin.epsCurrent,
    grossMargin:      fin.grossMargin,
    operatingMargin:  fin.operatingMargin,
    currentPrice:     fin.currentPrice,
    marketCapCr:      fin.marketCapCr,
    peRatio:          fin.trailingPE,
    bookValue:        fin.bookValuePerShare,
    // Provenance flags (non-numeric — ModelingAgent ignores unknown keys)
    _source:          "yahoo_finance_quotesummary",
    _fetchedAt:       fin.fetchedAt,
    _isLiveData:      fin.isLiveData,
  };
}

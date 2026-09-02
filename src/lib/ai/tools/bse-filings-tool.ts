/**
 * BSE Filings Tool — Phase 10 (plan4.md)
 *
 * Queries BSE India's public corporate filing APIs to discover
 * annual reports, quarterly results, and exchange announcements.
 *
 * Data source: BSE India public APIs (no auth required for public filings).
 * BSE API base: https://api.bseindia.com/BseIndAPI/api/
 */

export interface BseFiling {
  date: string;           // ISO date string
  type: string;           // "Annual Report" | "Quarterly Results" | "Press Release" | etc.
  title: string;
  url: string;            // Direct PDF/document URL
  sizeKb?: number;
  category: string;       // BSE category code
  scripCode: string;
}

export interface BseFilingsResult {
  scripCode: string;
  companyName: string;
  filings: BseFiling[];
  fetchedAt: string;      // ISO timestamp for provenance
}

/**
 * Known BSE scrip codes for major Indian companies.
 * In production, resolved via BSE search API by ticker/company name.
 */
const TICKER_TO_SCRIP_CODE: Record<string, string> = {
  RELIANCE:    "500325",
  TATAMOTORS:  "500570",
  HDFCBANK:    "500180",
  INFY:        "500209",
  TCS:         "532540",
  WIPRO:       "507685",
  HINDUNILVR:  "500696",
  ICICIBANK:   "532174",
  KOTAKBANK:   "500247",
  BAJFINANCE:  "500034",
  "M_M":       "500520",
  HEROMOTOCO:  "500182",
  MARUTI:      "532500",
  TATASTEEL:   "500470",
  SBIN:        "500112",
};

/**
 * Resolves a BSE scripCode from a ticker symbol via BSE search API.
 * Falls back to known mapping if API is unavailable.
 */
async function resolveScripCode(ticker: string): Promise<string | null> {
  // Check known mapping first (faster, no API call needed)
  const upper = ticker.toUpperCase();
  if (TICKER_TO_SCRIP_CODE[upper]) return TICKER_TO_SCRIP_CODE[upper];

  try {
    // BSE QuoteSearch API
    const url = `https://api.bseindia.com/BseIndAPI/api/DefaultData/w?Type=EQ&code=${encodeURIComponent(ticker)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "EquiGen-Research/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // BSE returns scripCode as "scripCode" or "Scrip_Cd"
    return data?.scripCode ?? data?.Scrip_Cd ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetches corporate filings from BSE India for a given scrip code.
 * Returns announcement-level metadata with direct PDF URLs.
 */
export async function fetchBseFilings(
  ticker: string,
  options: {
    yearsBack?: number;
    categories?: string[]; // BSE categories: "Results" | "Annual Report" | "AGM/EGM" | etc.
    maxResults?: number;
  } = {}
): Promise<BseFilingsResult> {
  const { yearsBack = 4, categories, maxResults = 50 } = options;
  const fetchedAt = new Date().toISOString();

  const scripCode = await resolveScripCode(ticker);
  if (!scripCode) {
    // Return empty result with provenance — caller decides how to handle
    return {
      scripCode: "unknown",
      companyName: ticker,
      filings: [],
      fetchedAt,
    };
  }

  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - yearsBack);
  const fromDateStr = fromDate.toISOString().split("T")[0].split("-").reverse().join("/"); // DD/MM/YYYY

  const toDateStr = new Date().toISOString().split("T")[0].split("-").reverse().join("/");

  try {
    // BSE Announcements API — public endpoint, no auth required
    const apiUrl = `https://api.bseindia.com/BseIndAPI/api/AnnSubCategoryGetData/w?strCat=-1&strPrevDate=${fromDateStr}&strScrip=${scripCode}&strSearch=P&strToDate=${toDateStr}&strType=C`;

    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": "EquiGen-Research/1.0",
        "Accept": "application/json",
        "Referer": "https://www.bseindia.com/",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`BSE API returned HTTP ${res.status}`);
    }

    const raw = await res.json();
    const announcements: Record<string, string>[] = raw?.Table ?? raw?.announcements ?? [];

    const filings: BseFiling[] = [];

    for (const ann of announcements.slice(0, maxResults)) {
      const cat = ann.CATEGORYNAME ?? ann.Category ?? "";
      const subcategory = ann.SUBCATNAME ?? ann.SubCategory ?? "";

      // Filter to financial reporting categories
      if (categories && !categories.some((c) => cat.toLowerCase().includes(c.toLowerCase()))) {
        continue;
      }

      // Build PDF URL from BSE's document server
      const attachId = ann.ATTACHMENTNAME ?? ann.AttachmentName ?? "";
      const pdfUrl = attachId
        ? `https://www.bseindia.com/xml-data/corpfiling/AttachLive/${attachId}`
        : "";

      filings.push({
        date: ann.NEWS_DT ?? ann.Date ?? "",
        type: subcategory || cat,
        title: ann.HEADLINE ?? ann.Subject ?? ann.title ?? subcategory,
        url: pdfUrl,
        category: cat,
        scripCode,
      });
    }

    // Also fetch Annual Reports specifically via the Annual Report API
    const arUrl = `https://api.bseindia.com/BseIndAPI/api/AnnualReports/w?scripcode=${scripCode}`;
    try {
      const arRes = await fetch(arUrl, {
        headers: { "User-Agent": "EquiGen-Research/1.0", "Referer": "https://www.bseindia.com/" },
        signal: AbortSignal.timeout(8000),
      });
      if (arRes.ok) {
        const arRaw = await arRes.json();
        const reports: Record<string, string>[] = arRaw?.Table ?? arRaw?.AnnualReports ?? [];
        for (const r of reports.slice(0, yearsBack)) {
          filings.push({
            date: r.Year ?? r.FYear ?? "",
            type: "Annual Report",
            title: `Annual Report ${r.Year ?? r.FYear ?? ""}`,
            url: r.AnnualReport_PDF ?? r.Link ?? r.url ?? "",
            category: "Annual Report",
            scripCode,
          });
        }
      }
    } catch {
      // Annual Reports sub-API failure is non-fatal
    }

    return {
      scripCode,
      companyName: ticker,
      filings,
      fetchedAt,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[BSEFilingsTool] Failed to fetch filings for ${ticker}: ${message}`);

    // Return empty result with provenance rather than throwing
    return {
      scripCode,
      companyName: ticker,
      filings: [],
      fetchedAt,
    };
  }
}

/**
 * Formats a BseFilingsResult as a Markdown table for agent consumption.
 */
export function formatBseFilingsMarkdown(result: BseFilingsResult): string {
  if (result.filings.length === 0) {
    return `**BSE Filings for ${result.companyName}** (ScripCode: ${result.scripCode})\n\n_No filings found for the requested period._\n\n_Data as of: ${result.fetchedAt}_`;
  }

  const rows = result.filings
    .slice(0, 20)
    .map((f) => `| ${f.date} | ${f.type} | ${f.title.slice(0, 60)} | [PDF](${f.url}) |`)
    .join("\n");

  return `**BSE Filings — ${result.companyName}** (ScripCode: ${result.scripCode})

| Date | Type | Title | Link |
|------|------|-------|------|
${rows}

_${result.filings.length} filing(s) found · Data as of: ${result.fetchedAt}_`;
}

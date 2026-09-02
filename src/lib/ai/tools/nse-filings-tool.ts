/**
 * NSE Filings Tool — Phase 10 (plan4.md)
 *
 * Queries NSE India's public corporate filing APIs for
 * annual reports, quarterly results, and corporate announcements.
 *
 * Data source: NSE India public corporate filings (no auth required).
 * NSE API base: https://www.nseindia.com/api/
 */

export interface NseFiling {
  date: string;          // ISO date string
  type: string;          // "Financial Results" | "Annual Report" | etc.
  title: string;
  url: string;           // Direct PDF URL
  symbol: string;
  period?: string;       // e.g. "Q3 FY25" for quarterly results
}

export interface NseFilingsResult {
  symbol: string;
  companyName: string;
  filings: NseFiling[];
  fetchedAt: string;
}

/**
 * NSE requires specific headers to avoid 403 — must mimic a real browser session.
 * Requests without Referer/Accept headers get blocked.
 */
function nseHeaders(): HeadersInit {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
    "Origin": "https://www.nseindia.com",
  };
}

/**
 * Fetches corporate filings from NSE India for a given symbol.
 * Returns metadata with direct PDF/document URLs.
 */
export async function fetchNseFilings(
  symbol: string,
  options: {
    yearsBack?: number;
    categories?: string[]; // e.g. ["Financial Results", "Annual Report"]
    maxResults?: number;
  } = {}
): Promise<NseFilingsResult> {
  const { yearsBack = 4, maxResults = 50 } = options;
  const fetchedAt = new Date().toISOString();
  const upperSymbol = symbol.toUpperCase();

  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - yearsBack);
  // NSE date format: DD-MM-YYYY
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

  const filings: NseFiling[] = [];

  try {
    // ── 1. Corporate Announcements ──────────────────────────────────────────
    const annUrl = `https://www.nseindia.com/api/corp-info?symbol=${encodeURIComponent(upperSymbol)}&corpType=announcement&market=equities`;
    const annRes = await fetch(annUrl, {
      headers: nseHeaders(),
      signal: AbortSignal.timeout(12000),
    });

    if (annRes.ok) {
      const annData = await annRes.json();
      const announcements: Record<string, string>[] = annData?.data ?? annData?.Table ?? [];

      for (const ann of announcements.slice(0, maxResults)) {
        const attUrl = ann.attchmntFile
          ? `https://archives.nseindia.com/corporate/${ann.attchmntFile}`
          : "";

        filings.push({
          date: ann.an_dt ?? ann.date ?? "",
          type: ann.subject ?? "Announcement",
          title: ann.subject ?? ann.desc ?? "Corporate Announcement",
          url: attUrl,
          symbol: upperSymbol,
        });
      }
    }

    // ── 2. Financial Results (Quarterly) ───────────────────────────────────
    const resultsUrl = `https://www.nseindia.com/api/corp-info?symbol=${encodeURIComponent(upperSymbol)}&corpType=financial_results&market=equities`;
    const resultsRes = await fetch(resultsUrl, {
      headers: nseHeaders(),
      signal: AbortSignal.timeout(12000),
    });

    if (resultsRes.ok) {
      const resultsData = await resultsRes.json();
      const results: Record<string, string>[] = resultsData?.data ?? [];

      for (const r of results.slice(0, 8)) {
        const pdfUrl = r.attchmntFile
          ? `https://archives.nseindia.com/corporate/${r.attchmntFile}`
          : "";

        filings.push({
          date: r.meeting_date ?? r.date ?? "",
          type: "Financial Results",
          title: `Financial Results — ${r.period ?? ""}`.trim(),
          url: pdfUrl,
          symbol: upperSymbol,
          period: r.period ?? undefined,
        });
      }
    }

    // ── 3. Annual Report (via NSE filings archive) ─────────────────────────
    const arUrl = `https://www.nseindia.com/api/annual-reports?index=equities&symbol=${encodeURIComponent(upperSymbol)}`;
    const arRes = await fetch(arUrl, {
      headers: nseHeaders(),
      signal: AbortSignal.timeout(10000),
    });

    if (arRes.ok) {
      const arData = await arRes.json();
      const reports: Record<string, string>[] = arData?.data ?? [];

      for (const r of reports.slice(0, yearsBack)) {
        filings.push({
          date: r.year ?? r.fyear ?? "",
          type: "Annual Report",
          title: `Annual Report ${r.year ?? r.fyear ?? ""}`,
          url: r.fileName
            ? `https://archives.nseindia.com/corporate/${r.fileName}`
            : r.link ?? "",
          symbol: upperSymbol,
        });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[NSEFilingsTool] Error fetching NSE filings for ${symbol}: ${message}`);
  }

  return {
    symbol: upperSymbol,
    companyName: upperSymbol, // resolved by caller or enriched later
    filings: filings.slice(0, maxResults),
    fetchedAt,
  };
}

/**
 * Formats an NseFilingsResult as a Markdown table for agent consumption.
 */
export function formatNseFilingsMarkdown(result: NseFilingsResult): string {
  if (result.filings.length === 0) {
    return `**NSE Filings for ${result.symbol}**\n\n_No filings found for the requested period._\n\n_Data as of: ${result.fetchedAt}_`;
  }

  const rows = result.filings
    .slice(0, 20)
    .map((f) => `| ${f.date} | ${f.type} | ${f.title.slice(0, 60)} | [Link](${f.url}) |`)
    .join("\n");

  return `**NSE Filings — ${result.symbol}**

| Date | Type | Title | Link |
|------|------|-------|------|
${rows}

_${result.filings.length} filing(s) found · Data as of: ${result.fetchedAt}_`;
}

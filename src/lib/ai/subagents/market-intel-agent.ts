/**
 * Market Intelligence Subagent — Phase 12 (plan4.md)
 *
 * Autonomous subagent that:
 * 1. Scrapes Screener profiles for peer comparison & historical multiples
 * 2. Fetches credit agency rating rationales (CRISIL, ICRA, CARE)
 * 3. Aggregates sector news with LLM sentiment scoring
 * 4. Compiles a Markdown peer comparison benchmark table (12+ metrics)
 * 5. Updates SubagentRun record with payload
 */

import { prisma } from "@/lib/db";
import { fetchBseCompanyFinancials, toScreenerProfileShape } from "@/lib/ai/tools/bse-financial-data-tool";
import { fetchCreditRatings, CreditRatingResult } from "@/lib/ai/tools/credit-rating-tool";
import { fetchSectorNews, SectorNewsDigest } from "@/lib/ai/tools/sector-news-deep-tool";
import { fetchYahooFinancials, ExtractedFinancials } from "@/lib/ai/tools/yahoo-financials-tool";
import { PeerBenchmarkMilestone } from "@/types/plan4";

export interface MarketIntelAgentInput {
  planId: string;
  runId: string;
  ticker: string;
  companyName: string;
  milestone: PeerBenchmarkMilestone;
  apiKey?: string;
}

export interface MarketIntelAgentOutput {
  ticker: string;
  peers: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  peerProfiles: any[]; // BSE financial profiles (ScreenerProfile-compatible shape)
  yahooFinancials: ExtractedFinancials | null; // primary ticker data from Yahoo
  creditRatings: CreditRatingResult;
  newsDigest: SectorNewsDigest;
  benchmarkMarkdown: string;
  milestoneCompleted: boolean;
  summary: string;
}

export class MarketIntelAgent {
  /**
   * Runs market intelligence research for a peer benchmark milestone.
   */
  async run(input: MarketIntelAgentInput): Promise<MarketIntelAgentOutput> {
    const { planId: _planId, runId, ticker, companyName: _companyName, milestone, apiKey } = input;
    const { peerTickers } = milestone.config;
    const startTime = Date.now();

    console.log(`[MarketIntelAgent] Benchmarking ${ticker} against peers: ${peerTickers.join(", ")}...`);

    const allTickers = Array.from(new Set([ticker, ...peerTickers]));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const peerProfiles: any[] = [];

    // Step 1: Fetch BSE financial data for peer comparison
    // RC-2: Replaced Screener.in (competitor) with BSE India official APIs.
    // Same underlying data — BSE exchange filings — without competitor dependency.
    for (const t of allTickers) {
      try {
        const bseData = await fetchBseCompanyFinancials(t);
        peerProfiles.push(toScreenerProfileShape(bseData));
      } catch (err) {
        console.warn(`[MarketIntelAgent] Failed to fetch BSE data for ${t}:`, err);
      }
    }

    // Step 1b: Fetch Yahoo Finance financials for primary ticker (reliable, free)
    let yahooFinancials: ExtractedFinancials | null = null;
    try {
      yahooFinancials = await fetchYahooFinancials(ticker);
      if (yahooFinancials.isLiveData) {
        console.log(`[MarketIntelAgent] ✓ Yahoo Finance: P/E=${yahooFinancials.trailingPE ?? "N/A"} | Market Cap=₹${yahooFinancials.marketCapCr ?? "N/A"} Cr | EV/EBITDA=${yahooFinancials.evEbitda ?? "N/A"}x`);
      }
    } catch (err) {
      console.warn(`[MarketIntelAgent] Yahoo Finance fetch failed for ${ticker}:`, err);
    }

    // Step 2: Fetch Credit Ratings
    const creditRatings = await fetchCreditRatings(ticker);

    const companyName = input.companyName;

    // Step 3: Sector News Handling with Strict Filings-Only Governance
    // Filings-only is the default trust requirement. Open web feeds/RSS are bypassed unless explicitly opted-in.
    const isFilingsOnly = milestone.config?.sourcePolicy !== "allow_external_news";
    let newsDigest: SectorNewsDigest;

    if (isFilingsOnly) {
      console.log(`[MarketIntelAgent] 🛡️ Filings-only governance: Open web news & external RSS bypassed to ensure 100% primary source auditability.`);
      newsDigest = {
        ticker,
        sector: "Exchange Corporate Disclosures",
        news: [],
        sentimentBreakdown: { positive: 0, neutral: 0, negative: 0, regulatory_risk: 0 },
        isLiveData: false,
        fetchedAt: new Date().toISOString(),
      };
    } else {
      console.log(`[MarketIntelAgent] 🌐 Opt-in external news policy: Fetching sector RSS headlines with explicit secondary source labeling...`);
      newsDigest = await fetchSectorNews(ticker, { apiKey, companyName });
      if (newsDigest?.news) {
        newsDigest.news = newsDigest.news.map((item) => ({
          ...item,
          source: item.source.startsWith("External Media RSS") ? item.source : `External Media RSS: ${item.source}`,
        }));
      }
    }

    // Step 4: Format Peer Benchmark Markdown table (enriched with Yahoo data for primary)
    const benchmarkMarkdown = this.formatBenchmarkTable(peerProfiles, yahooFinancials);

    const output: MarketIntelAgentOutput = {
      ticker,
      peers: peerTickers,
      peerProfiles,
      yahooFinancials,
      creditRatings,
      newsDigest,
      benchmarkMarkdown,
      milestoneCompleted: true,
      summary: this.buildSummary(ticker, peerProfiles, creditRatings, newsDigest, yahooFinancials, isFilingsOnly),
    };

    // Update SubagentRun record in DB (if record exists)
    try {
      const runExists = await prisma.subagentRun.findUnique({ where: { id: runId } }).catch(() => null);
      if (runExists) {
        await prisma.subagentRun.update({
          where: { id: runId },
          data: {
            status: "completed",
            outputJson: output as unknown as import("@prisma/client").Prisma.JsonObject,
            latencyMs: Date.now() - startTime,
          },
        });
      }
    } catch {
      // ignore
    }

    return output;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatBenchmarkTable(profiles: any[], yahoo?: ExtractedFinancials | null): string {
    if (profiles.length === 0 && !yahoo) return "_No peer profiles benchmarked._";

    // Build display-ready values for primary company (prefer Yahoo data when Screener is null)
    const primaryTicker = yahoo?.ticker ?? (profiles[0]?.ticker ?? "PRIMARY");
    const yahooRow = yahoo?.isLiveData ? [
      `| **${primaryTicker} (Yahoo)** | ` +
      `${yahoo.marketCapCr != null ? `₹${yahoo.marketCapCr.toLocaleString()} Cr` : "N/A"} | ` +
      `${yahoo.trailingPE != null ? `${yahoo.trailingPE.toFixed(1)}x` : "N/A"} | ` +
      `${yahoo.priceToBook != null ? `${yahoo.priceToBook.toFixed(1)}x` : "N/A"} | ` +
      `${yahoo.evEbitda != null ? `${yahoo.evEbitda.toFixed(1)}x` : "N/A"} | ` +
      `${yahoo.ebitdaMargin != null ? `${(yahoo.ebitdaMargin * 100).toFixed(1)}%` : "N/A"} | ` +
      `${yahoo.dividendYield != null ? `${(yahoo.dividendYield * 100).toFixed(2)}%` : "N/A"} | ` +
      `${yahoo.beta != null ? yahoo.beta.toFixed(2) : "N/A"} |`,
    ] : [];

    const screenerRows = profiles.map((p) =>
      `| ${p.ticker} | ` +
      `${p.marketCapCr != null ? `₹${p.marketCapCr.toLocaleString()}` : "N/A"} | ` +
      `${p.peRatio != null ? `${p.peRatio}x` : "N/A"} | ` +
      `${p.pbRatio != null ? `${p.pbRatio}x` : "N/A"} | ` +
      `N/A | ` +
      `N/A | ` +
      `${p.dividendYieldPercent != null ? `${p.dividendYieldPercent}%` : "N/A"} | ` +
      `N/A |`
    );

    const header = "| Company | Market Cap | P/E | P/B | EV/EBITDA | EBITDA Margin | Div Yield | Beta |";
    const divider = "|---------|-----------|-----|-----|-----------|---------------|-----------|------|";

    return `## Valuation & Operational Peer Benchmark\n\n${header}\n${divider}\n${[...yahooRow, ...screenerRows].join("\n")}\n`;
  }

  private buildSummary(
    ticker: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profiles: any[],
    credit: CreditRatingResult,
    news: SectorNewsDigest,
    yahoo?: ExtractedFinancials | null,
    isFilingsOnly = true
  ): string {
    const yahooNote = yahoo?.isLiveData
      ? `• Yahoo Finance: Market Cap ₹${yahoo.marketCapCr ?? "N/A"} Cr | P/E ${yahoo.trailingPE ?? "N/A"}x | EV/EBITDA ${yahoo.evEbitda ?? "N/A"}x`
      : `• Yahoo Finance: data unavailable for ${ticker}`;
    const policyNote = isFilingsOnly
      ? "• Source Policy: Strict Filings-Only (100% primary BSE/NSE filings & disclosures; web news bypassed)"
      : `• Sector News Digest: ${news.news?.length ?? 0} items analyzed (${news.sentimentBreakdown?.positive ?? 0} positive, ${news.sentimentBreakdown?.regulatory_risk ?? 0} regulatory risk)`;
    return [
      `Market Intelligence Research Complete for ${ticker}:`,
      policyNote,
      `• Peer disclosures benchmarked for ${profiles.length} peer(s)`,
      yahooNote,
      `• Credit Rating Profile: ${credit.overallCreditProfile}`,
    ].join("\n");
  }
}

export const marketIntelAgent = new MarketIntelAgent();

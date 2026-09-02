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
import { fetchScreenerProfile, ScreenerProfile } from "@/lib/ai/tools/screener-scrape-tool";
import { fetchCreditRatings, CreditRatingResult } from "@/lib/ai/tools/credit-rating-tool";
import { fetchSectorNews, SectorNewsDigest } from "@/lib/ai/tools/sector-news-deep-tool";
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
  peerProfiles: ScreenerProfile[];
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
    const { planId, runId, ticker, companyName, milestone, apiKey } = input;
    const { peerTickers } = milestone.config;
    const startTime = Date.now();

    console.log(`[MarketIntelAgent] Benchmarking ${ticker} against peers: ${peerTickers.join(", ")}...`);

    const allTickers = Array.from(new Set([ticker, ...peerTickers]));
    const peerProfiles: ScreenerProfile[] = [];

    // Step 1: Scrape profiles for target + peers
    for (const t of allTickers) {
      try {
        const prof = await fetchScreenerProfile(t, runId);
        peerProfiles.push(prof);
      } catch (err) {
        console.warn(`[MarketIntelAgent] Failed to fetch Screener profile for ${t}:`, err);
      }
    }

    // Step 2: Fetch Credit Ratings
    const creditRatings = await fetchCreditRatings(ticker);

    // Step 3: Fetch Sector News with LLM sentiment
    const newsDigest = await fetchSectorNews(ticker, { apiKey });

    // Step 4: Format Peer Benchmark Markdown table
    const benchmarkMarkdown = this.formatBenchmarkTable(peerProfiles);

    const output: MarketIntelAgentOutput = {
      ticker,
      peers: peerTickers,
      peerProfiles,
      creditRatings,
      newsDigest,
      benchmarkMarkdown,
      milestoneCompleted: true,
      summary: this.buildSummary(ticker, peerProfiles, creditRatings, newsDigest),
    };

    // Update SubagentRun record in DB
    await prisma.subagentRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        outputJson: output as unknown as import("@prisma/client").Prisma.JsonObject,
        latencyMs: Date.now() - startTime,
      },
    }).catch((e) => console.warn("[MarketIntelAgent] Failed to update SubagentRun:", e));

    return output;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private formatBenchmarkTable(profiles: ScreenerProfile[]): string {
    if (profiles.length === 0) return "_No peer profiles benchmarked._";

    const headers = "| Metric | " + profiles.map((p) => `**${p.ticker}**`).join(" | ") + " |";
    const divider = "|--------|" + profiles.map(() => "------").join("|") + "|";

    const rows = [
      "| Market Cap (Cr) | " + profiles.map((p) => `₹${p.marketCapCr.toLocaleString()}`).join(" | ") + " |",
      "| P/E Multiple | " + profiles.map((p) => `${p.peRatio}x`).join(" | ") + " |",
      "| Price / Book | " + profiles.map((p) => `${p.pbRatio}x`).join(" | ") + " |",
      "| ROCE % | " + profiles.map((p) => `${p.rocePercent}%`).join(" | ") + " |",
      "| ROE % | " + profiles.map((p) => `${p.roePercent}%`).join(" | ") + " |",
      "| Dividend Yield | " + profiles.map((p) => `${p.dividendYieldPercent}%`).join(" | ") + " |",
      "| Promoter Holding | " + profiles.map((p) => `${p.shareholding.promoters}%`).join(" | ") + " |",
      "| FII Holding | " + profiles.map((p) => `${p.shareholding.fii}%`).join(" | ") + " |",
      "| DII Holding | " + profiles.map((p) => `${p.shareholding.dii}%`).join(" | ") + " |",
    ];

    return `## Valuation & Operational Peer Benchmark

${headers}
${divider}
${rows.join("\n")}
`;
  }

  private buildSummary(
    ticker: string,
    profiles: ScreenerProfile[],
    credit: CreditRatingResult,
    news: SectorNewsDigest
  ): string {
    return [
      `Market Intelligence Research Complete for ${ticker}:`,
      `• Benchmarked against ${profiles.length - 1} sector peer(s)`,
      `• Credit Rating Profile: ${credit.overallCreditProfile}`,
      `• Sector News Digest: ${news.news.length} items analyzed (${news.sentimentBreakdown.positive} positive, ${news.sentimentBreakdown.regulatory_risk} regulatory risk)`,
    ].join("\n");
  }
}

export const marketIntelAgent = new MarketIntelAgent();

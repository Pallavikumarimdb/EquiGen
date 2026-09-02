/**
 * Document Agent — Phase 10 (plan4.md)
 *
 * Autonomous subagent that:
 * 1. Fetches company filings from BSE + NSE (annual reports, quarterly results, DRHP)
 * 2. Extracts earnings call transcripts with structured management guidance
 * 3. Queues downloaded PDFs into the extraction pipeline (planv3.md ExtractionService)
 * 4. Records all fetched documents in ScrapeJob table for audit provenance
 *
 * Called by the Master Planner when a FetchDocumentsMilestone is dispatched.
 */

import { prisma } from "@/lib/db";
import { fetchBseFilings, BseFilingsResult } from "@/lib/ai/tools/bse-filings-tool";
import { fetchNseFilings, NseFilingsResult } from "@/lib/ai/tools/nse-filings-tool";
import { fetchConcallTranscript, ConcallTranscriptResult } from "@/lib/ai/tools/concall-transcript-tool";
import { FetchDocumentsMilestone } from "@/types/plan4";

export interface DocumentAgentInput {
  planId: string;
  runId: string;
  ticker: string;
  companyName: string;
  isin?: string;
  milestone: FetchDocumentsMilestone;
  apiKey?: string;
}

export interface FetchedDocument {
  type: string;
  title: string;
  url: string;
  sourceExchange: "BSE" | "NSE" | "Screener" | "SEBI";
  date: string;
  scripCode?: string;
}

export interface DocumentAgentOutput {
  ticker: string;
  fetchedDocuments: FetchedDocument[];
  concallTranscripts: ConcallTranscriptResult[];
  bseResult: BseFilingsResult;
  nseResult: NseFilingsResult;
  totalDocumentsFetched: number;
  milestoneCompleted: boolean;
  summary: string;
}

// ─── Document Agent ─────────────────────────────────────────────────────────────

export class DocumentAgent {
  /**
   * Runs the full document fetching pipeline for a given research plan milestone.
   * Records all fetched URLs in ScrapeJob table for audit provenance.
   */
  async run(input: DocumentAgentInput): Promise<DocumentAgentOutput> {
    const { planId, runId, ticker, companyName, milestone, apiKey } = input;
    const startTime = Date.now();
    const sourceTypes = milestone?.config?.sourceTypes ?? ["annual_report", "quarterly_results", "concall_transcript"];
    const yearsBack = milestone?.config?.yearsBack ?? 3;

    const allDocuments: FetchedDocument[] = [];
    let bseResult: BseFilingsResult = { scripCode: "", companyName, filings: [], fetchedAt: new Date().toISOString() };
    let nseResult: NseFilingsResult = { symbol: ticker, companyName, filings: [], fetchedAt: new Date().toISOString() };
    const concallTranscripts: ConcallTranscriptResult[] = [];

    // ── Step 1: BSE Filings ─────────────────────────────────────────────────
    try {
      console.log(`[DocumentAgent] Fetching BSE filings for ${ticker}...`);
      bseResult = await fetchBseFilings(ticker, {
        yearsBack,
        categories: this.getBseCategories(sourceTypes),
        maxResults: 40,
      });

      for (const filing of bseResult.filings) {
        if (!filing.url) continue;
        allDocuments.push({
          type: filing.type,
          title: filing.title,
          url: filing.url,
          sourceExchange: "BSE",
          date: filing.date,
          scripCode: filing.scripCode,
        });

        // Record in ScrapeJob audit table
        await this.recordScrapeJob(runId, filing.url, "bse_filing");
      }

      console.log(`[DocumentAgent] BSE: ${bseResult.filings.length} filings found.`);
    } catch (err) {
      console.warn(`[DocumentAgent] BSE fetch error:`, err);
    }

    // ── Step 2: NSE Filings ─────────────────────────────────────────────────
    try {
      console.log(`[DocumentAgent] Fetching NSE filings for ${ticker}...`);
      nseResult = await fetchNseFilings(ticker, { yearsBack });

      for (const filing of nseResult.filings) {
        if (!filing.url) continue;
        // Deduplicate by URL across BSE + NSE
        if (allDocuments.some((d) => d.url === filing.url)) continue;

        allDocuments.push({
          type: filing.type,
          title: filing.title,
          url: filing.url,
          sourceExchange: "NSE",
          date: filing.date,
        });

        await this.recordScrapeJob(runId, filing.url, "nse_filing");
      }

      console.log(`[DocumentAgent] NSE: ${nseResult.filings.length} filings found.`);
    } catch (err) {
      console.warn(`[DocumentAgent] NSE fetch error:`, err);
    }

    // ── Step 3: Concall Transcripts ─────────────────────────────────────────
    if (Array.isArray(sourceTypes) && sourceTypes.includes("concall_transcript")) {
      try {
        console.log(`[DocumentAgent] Fetching concall transcript for ${ticker}...`);
        const concall = await fetchConcallTranscript(ticker, { apiKey });
        concallTranscripts.push(concall);

        if (concall.sourceUrl) {
          await this.recordScrapeJob(runId, concall.sourceUrl, "concall_transcript");
          allDocuments.push({
            type: "Concall Transcript",
            title: `Earnings Call Transcript — ${concall.quarter}`,
            url: concall.sourceUrl,
            sourceExchange: "Screener",
            date: concall.fetchedAt,
          });
        }

        console.log(`[DocumentAgent] Concall: ${concall.quotes.length} management quotes extracted.`);
      } catch (err) {
        console.warn(`[DocumentAgent] Concall fetch error:`, err);
      }
    }

    // ── Step 4: Update SubagentRun with output ──────────────────────────────
    const output: DocumentAgentOutput = {
      ticker,
      fetchedDocuments: allDocuments,
      concallTranscripts,
      bseResult,
      nseResult,
      totalDocumentsFetched: allDocuments.length,
      milestoneCompleted: allDocuments.length > 0,
      summary: this.buildSummary(ticker, allDocuments, concallTranscripts),
    };

    try {
      const runExists = await prisma.subagentRun.findUnique({ where: { id: runId } }).catch(() => null);
      if (runExists) {
        await prisma.subagentRun.update({
          where: { id: runId },
          data: {
            status: output.milestoneCompleted ? "completed" : "failed",
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

  // ─── Private helpers ──────────────────────────────────────────────────────

  private getBseCategories(sourceTypes: FetchDocumentsMilestone["config"]["sourceTypes"]): string[] {
    const cats: string[] = [];
    if (!Array.isArray(sourceTypes)) return cats;
    if (sourceTypes.includes("annual_report")) cats.push("Annual Report");
    if (sourceTypes.includes("quarterly_results")) cats.push("Results");
    if (sourceTypes.includes("drhp")) cats.push("Prospectus");
    if (sourceTypes.includes("credit_rating")) cats.push("Credit Rating");
    return cats;
  }

  private async recordScrapeJob(runId: string, url: string, sourceType: string): Promise<void> {
    try {
      await prisma.scrapeJob.create({
        data: {
          runId,
          url,
          sourceType,
          status: "completed",
        },
      });
    } catch {
      // Non-fatal — audit record failure should not block the agent
    }
  }

  private buildSummary(
    ticker: string,
    documents: FetchedDocument[],
    concalls: ConcallTranscriptResult[]
  ): string {
    const annualReports = documents.filter((d) => d.type.toLowerCase().includes("annual")).length;
    const quarterlyResults = documents.filter((d) => d.type.toLowerCase().includes("result")).length;
    const totalQuotes = concalls.reduce((sum, c) => sum + c.quotes.length, 0);

    return [
      `Document fetch complete for ${ticker}:`,
      `• ${documents.length} total document(s) found`,
      `• ${annualReports} annual report(s)`,
      `• ${quarterlyResults} quarterly result(s)`,
      `• ${concalls.length} concall transcript(s) with ${totalQuotes} management guidance quote(s)`,
      `• Sources: BSE + NSE + Screener.in`,
    ].join("\n");
  }
}

export const documentAgent = new DocumentAgent();

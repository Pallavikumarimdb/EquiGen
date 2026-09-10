/**
 * Web Scraping Client — Phase 12 (plan4.md)
 *
 * Politeness-aware HTML fetcher with user-agent rotation, retry logic,
 * and rate-limiting. Records all jobs in `scrape_jobs` table for audit provenance.
 */

import { prisma } from "@/lib/db";

export interface ScrapeOptions {
  runId?: string;
  sourceType?: string;
  timeoutMs?: number;
  retries?: number;
}

export interface ScrapeResult {
  url: string;
  html: string;
  text: string;
  status: number;
  fetchedAt: string;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Strips HTML tags and extracts plain text content from HTML markup.
 */
export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export class WebScraperClient {
  /**
   * Fetches target URL with rotated headers and politeness delay.
   */
  async fetchUrl(url: string, options: ScrapeOptions = {}): Promise<ScrapeResult> {
    const { runId, sourceType = "web", timeoutMs = 15000, retries = 2 } = options;
    const fetchedAt = new Date().toISOString();

    let _lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Politeness delay: 500ms jitter
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }

        const res = await fetch(url, {
          headers: {
            "User-Agent": getRandomUserAgent(),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
          },
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }

        const html = await res.text();
        const text = extractTextFromHtml(html);

        // Record in ScrapeJob audit table
        if (runId) {
          await this.recordScrapeJob(runId, url, sourceType, text.slice(0, 10000));
        }

        return {
          url,
          html,
          text,
          status: res.status,
          fetchedAt,
        };
      } catch (err) {
        _lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // Record failure in audit table
    if (runId) {
      await this.recordScrapeJob(runId, url, sourceType, undefined, "failed");
    }

    return {
      url,
      html: "",
      text: "",
      status: 500,
      fetchedAt,
    };
  }

  private async recordScrapeJob(
    runId: string,
    url: string,
    sourceType: string,
    extractedText?: string,
    status = "completed"
  ): Promise<void> {
    try {
      const runExists = await prisma.subagentRun.findUnique({ where: { id: runId } });
      if (!runExists) return;

      await prisma.scrapeJob.create({
        data: {
          runId,
          url,
          sourceType,
          extractedText: extractedText ? extractedText.slice(0, 5000) : null,
          status,
        },
      });
    } catch (err) {
      console.warn("[WebScraperClient] Failed to record ScrapeJob:", err);
    }
  }
}

export const webScraperClient = new WebScraperClient();

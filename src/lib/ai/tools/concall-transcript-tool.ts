/**
 * Concall Transcript Tool — Phase 10 (plan4.md)
 *
 * Fetches earnings call transcripts from Screener.in (public endpoint)
 * and exchanges, then extracts structured management guidance using LLM.
 *
 * Extracts:
 * - Verbatim quotes from management on key topics (margin, revenue, capex, guidance)
 * - Speaker role identification (CMD, CFO, CEO, Analyst)
 * - Topic tagging (revenue_guidance | margin_guidance | capex | debt | segment | risk)
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getModelForRequest } from "@/lib/ai/model-router";

export interface ConcallQuote {
  quarter: string;          // e.g. "Q3 FY25"
  speakerRole: string;      // "CMD" | "CFO" | "CEO" | "Analyst" | "Management"
  speakerName?: string;
  quote: string;            // verbatim excerpt
  topic: ConcallTopic;
  sentiment: "positive" | "neutral" | "cautious" | "negative";
}

export type ConcallTopic =
  | "revenue_guidance"
  | "margin_guidance"
  | "capex"
  | "debt_repayment"
  | "segment_performance"
  | "new_product"
  | "risk_factor"
  | "dividend"
  | "expansion"
  | "general";

export interface ConcallTranscriptResult {
  ticker: string;
  quarter: string;
  transcriptText: string;
  quotes: ConcallQuote[];
  sourceUrl: string;
  fetchedAt: string;
}

// ─── Screener.in Transcript Fetcher ───────────────────────────────────────────

/**
 * Fetches a concall transcript text from Screener.in for a given company.
 * Screener.in stores concall PDFs and transcripts at predictable URLs.
 */
async function fetchScreenerTranscript(ticker: string): Promise<{ text: string; url: string } | null> {
  const upperTicker = ticker.toUpperCase();

  try {
    // Screener.in company page — transcripts are linked from here
    const screenerUrl = `https://www.screener.in/company/${upperTicker}/`;
    const res = await fetch(screenerUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Referer": "https://www.screener.in/",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) return null;

    const html = await res.text();

    // Extract transcript links from Screener's "Documents" section
    // Pattern: href="/company/{TICKER}/concalls/{ID}/"
    const concallLinkMatch = html.match(/href="(\/company\/[^"]+\/concalls\/[^"]+)"/) ??
                              html.match(/href="(\/company\/[^"]+\/annual-report[^"]+)"/);

    if (!concallLinkMatch) return null;

    const concallUrl = `https://www.screener.in${concallLinkMatch[1]}`;
    const concallRes = await fetch(concallUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36",
        "Referer": "https://www.screener.in/",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!concallRes.ok) return null;

    const concallHtml = await concallRes.text();

    // Extract readable text from the transcript body
    const bodyMatch = concallHtml.match(/<div[^>]*class="[^"]*transcript[^"]*"[^>]*>([\s\S]+?)<\/div>/i) ??
                      concallHtml.match(/<article[^>]*>([\s\S]+?)<\/article>/i) ??
                      concallHtml.match(/<div[^>]*id="[^"]*content[^"]*"[^>]*>([\s\S]+?)<\/div>/i);

    if (!bodyMatch) return null;

    // Strip HTML tags to get plain text
    const plainText = bodyMatch[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 15000); // cap at 15K chars to stay within LLM context window

    return { text: plainText, url: concallUrl };
  } catch {
    return null;
  }
}

// ─── LLM Guidance Extraction ──────────────────────────────────────────────────

const EXTRACTION_SYSTEM_PROMPT = `You are an expert equity research analyst extracting structured management guidance from earnings call transcripts.

Extract the top 8-12 most important verbatim quotes from management (CMD, CFO, CEO, MD) on these topics:
- Revenue guidance and growth targets
- EBITDA/PAT margin outlook and improvement plans
- Capex plans and capacity expansion
- Debt repayment and balance sheet strength
- Segment-wise performance (especially weak/strong segments)
- New products, services, or market opportunities
- Key risk factors acknowledged by management

Return ONLY valid JSON in this exact format:
{
  "quotes": [
    {
      "quarter": "string (e.g. Q3 FY25)",
      "speakerRole": "CMD|CFO|CEO|MD|Analyst|Management",
      "speakerName": "string or null",
      "quote": "verbatim excerpt from transcript (max 200 chars)",
      "topic": "revenue_guidance|margin_guidance|capex|debt_repayment|segment_performance|new_product|risk_factor|dividend|expansion|general",
      "sentiment": "positive|neutral|cautious|negative"
    }
  ]
}`;

async function extractGuidanceWithLLM(
  transcriptText: string,
  ticker: string,
  quarter: string,
  apiKey: string
): Promise<ConcallQuote[]> {
  try {
    const userMessage = `Company: ${ticker}\nQuarter: ${quarter}\n\nTranscript (excerpt):\n${transcriptText.slice(0, 8000)}`;
    const fullPrompt = `${EXTRACTION_SYSTEM_PROMPT}\n\n${userMessage}`;

    const { model } = await getModelForRequest({ provider: "groq", apiKey }, fullPrompt);

    const response = await model.invoke([
      new SystemMessage(EXTRACTION_SYSTEM_PROMPT),
      new HumanMessage(userMessage),
    ]);

    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.quotes)) return [];

    return parsed.quotes.map((q: Partial<ConcallQuote>) => ({
      quarter: q.quarter ?? quarter,
      speakerRole: q.speakerRole ?? "Management",
      speakerName: q.speakerName ?? undefined,
      quote: q.quote ?? "",
      topic: (q.topic ?? "general") as ConcallTopic,
      sentiment: (q.sentiment ?? "neutral") as ConcallQuote["sentiment"],
    }));
  } catch {
    return [];
  }
}

// ─── Main exported function ────────────────────────────────────────────────────

/**
 * Fetches and parses a concall transcript for a given ticker and quarter.
 * Returns structured ConcallQuote[] with topic/sentiment tagging.
 */
export async function fetchConcallTranscript(
  ticker: string,
  options: {
    quarter?: string;      // e.g. "Q3 FY25". Defaults to latest available.
    apiKey?: string;
  } = {}
): Promise<ConcallTranscriptResult> {
  const { quarter = "Latest", apiKey = process.env.GROQ_API_KEY ?? "" } = options;
  const fetchedAt = new Date().toISOString();

  // Step 1: Fetch transcript text
  const result = await fetchScreenerTranscript(ticker);

  if (!result || !result.text) {
    return {
      ticker: ticker.toUpperCase(),
      quarter,
      transcriptText: "",
      quotes: [],
      sourceUrl: `https://www.screener.in/company/${ticker.toUpperCase()}/`,
      fetchedAt,
    };
  }

  // Step 2: Extract structured guidance with LLM
  const quotes = apiKey
    ? await extractGuidanceWithLLM(result.text, ticker, quarter, apiKey)
    : [];

  return {
    ticker: ticker.toUpperCase(),
    quarter,
    transcriptText: result.text,
    quotes,
    sourceUrl: result.url,
    fetchedAt,
  };
}

/**
 * Formats concall quotes as a Markdown section for report embedding.
 */
export function formatConcallQuotesMarkdown(result: ConcallTranscriptResult): string {
  if (result.quotes.length === 0) {
    return `**Management Q&A Highlights — ${result.ticker} (${result.quarter})**\n\n_No transcript data available._\n\n_Source: ${result.sourceUrl} · As of: ${result.fetchedAt}_`;
  }

  const grouped: Record<string, ConcallQuote[]> = {};
  for (const q of result.quotes) {
    if (!grouped[q.topic]) grouped[q.topic] = [];
    grouped[q.topic].push(q);
  }

  const topicLabel: Record<ConcallTopic, string> = {
    revenue_guidance:    "📈 Revenue Guidance",
    margin_guidance:     "📊 Margin Outlook",
    capex:               "🏗️ Capex & Expansion",
    debt_repayment:      "💳 Debt & Balance Sheet",
    segment_performance: "🔍 Segment Performance",
    new_product:         "🚀 New Products / Markets",
    risk_factor:         "⚠️ Risk Factors",
    dividend:            "💰 Dividend",
    expansion:           "🌏 Geographic Expansion",
    general:             "💬 General Commentary",
  };

  const sections = Object.entries(grouped).map(([topic, quotes]) => {
    const header = topicLabel[topic as ConcallTopic] ?? topic;
    const items = quotes
      .map((q) => `> **${q.speakerRole}${q.speakerName ? ` (${q.speakerName})` : ""}:** "${q.quote}"`)
      .join("\n\n");
    return `### ${header}\n\n${items}`;
  });

  return `## Management Q&A Highlights — ${result.ticker} (${result.quarter})

${sections.join("\n\n---\n\n")}

---
_Source: [Screener.in](${result.sourceUrl}) · Data as of: ${result.fetchedAt}_`;
}

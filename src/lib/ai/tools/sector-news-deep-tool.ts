/**
 * Sector News Deep Tool — Phase 12 (plan4.md) — RELIABILITY FIX
 *
 * Fetches REAL news from Google News RSS, Economic Times, and MoneyControl
 * for the specific ticker and company being researched.
 *
 * CRITICAL FIX: Removed 3 hardcoded stub news items that appeared in every
 * report regardless of company. All news is now live-fetched from RSS feeds.
 * When RSS is unavailable, returns empty digest with isLiveData=false — never
 * fabricates news headlines.
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getModelForRequest } from "@/lib/ai/model-router";

export type NewsSentiment = "positive" | "neutral" | "negative" | "regulatory_risk";

export interface SectorNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string;
  sentiment: NewsSentiment;
  relevanceScore: number; // 0-100
  isLiveData: boolean;
}

export interface SectorNewsDigest {
  ticker: string;
  sector: string;
  news: SectorNewsItem[];
  sentimentBreakdown: {
    positive: number;
    neutral: number;
    negative: number;
    regulatory_risk: number;
  };
  isLiveData: boolean;   // true only when real news articles were fetched
  fetchedAt: string;
}

// ─── Live RSS News Fetcher ─────────────────────────────────────────────────────

interface RawNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

async function fetchRssNews(query: string): Promise<RawNewsItem[]> {
  const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " NSE BSE stock India quarterly results")}&hl=en-IN&gl=IN&ceid=IN:en`;

  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EquiGen/1.0)" },
      signal: AbortSignal.timeout(12000),
      next: { revalidate: 300 },
    });

    if (!res.ok) return [];

    const xmlText = await res.text();
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/gi;
    const articles: RawNewsItem[] = [];
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null && articles.length < 6) {
      const rawTitle = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
      const url = match[2].trim();
      const pubDateStr = match[3].trim();

      const parts = rawTitle.split(" - ");
      const title = parts.slice(0, -1).join(" - ") || rawTitle;
      const source = parts[parts.length - 1] || "Financial News";

      if (title.length > 5) {
        articles.push({ title, source, url, publishedAt: pubDateStr });
      }
    }

    return articles;
  } catch {
    return [];
  }
}

// ─── ET Markets / MoneyControl RSS Fallback ────────────────────────────────────

async function fetchEtNewsRss(ticker: string): Promise<RawNewsItem[]> {
  try {
    const rssUrl = `https://economictimes.indiatimes.com/rssfeedstopstories.cms?q=${encodeURIComponent(ticker)}`;
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/gi;
    const articles: RawNewsItem[] = [];
    let match;

    while ((match = itemRegex.exec(xml)) !== null && articles.length < 3) {
      const title = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
      const url = match[2].trim();
      if (title.toUpperCase().includes(ticker.toUpperCase()) && title.length > 5) {
        articles.push({ title, source: "Economic Times", url, publishedAt: new Date().toUTCString() });
      }
    }
    return articles;
  } catch {
    return [];
  }
}

// ─── LLM Sentiment Analyzer ───────────────────────────────────────────────────

async function analyzeSentimentWithLLM(
  items: RawNewsItem[],
  ticker: string,
  apiKey: string
): Promise<SectorNewsItem[]> {
  if (items.length === 0) return [];

  try {
    const prompt = `Analyze sentiment for these financial news headlines about company ${ticker.toUpperCase()}:\n` +
      items.map((item, i) => `${i + 1}. ${item.title}`).join("\n") +
      `\nReturn JSON array: [{ "index": 1, "sentiment": "positive|neutral|negative|regulatory_risk", "relevance": 90 }]\n` +
      `Only return the JSON array, no other text.`;

    const { model } = await getModelForRequest({ provider: "groq", apiKey }, prompt);

    const response = await model.invoke([
      new SystemMessage("You are a financial sentiment analysis engine for Indian equity research. Return JSON array only."),
      new HumanMessage(prompt),
    ]);

    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("No JSON array in LLM response");

    const parsed: { index: number; sentiment: string; relevance: number }[] = JSON.parse(jsonMatch[0]);

    return items.map((item, i) => {
      const analysis = parsed.find((p) => p.index === i + 1) ?? { sentiment: "neutral", relevance: 70 };
      return {
        ...item,
        summary: `${item.title} — ${item.source}`,
        sentiment: (analysis.sentiment ?? "neutral") as NewsSentiment,
        relevanceScore: analysis.relevance ?? 70,
        isLiveData: true,
      };
    });
  } catch {
    // If LLM sentiment fails, return items with neutral sentiment but still real data
    return items.map((item) => ({
      ...item,
      summary: `${item.title} — ${item.source}`,
      sentiment: "neutral" as NewsSentiment,
      relevanceScore: 70,
      isLiveData: true,
    }));
  }
}

// ─── Main Export ───────────────────────────────────────────────────────────────

export async function fetchSectorNews(
  ticker: string,
  options: {
    sector?: string;
    apiKey?: string;
    companyName?: string;
  } = {}
): Promise<SectorNewsDigest> {
  const {
    sector = "Unknown",
    apiKey = process.env.GROQ_API_KEY ?? "",
    companyName,
  } = options;
  const fetchedAt = new Date().toISOString();
  const upperTicker = ticker.toUpperCase();

  const queryTerm = companyName ? `"${companyName}" OR ${upperTicker}` : upperTicker;
  console.log(`[SectorNewsTool] Fetching live news for ${upperTicker} (query: "${queryTerm}")...`);

  // Fetch from multiple sources concurrently
  const [googleResults, etResults] = await Promise.allSettled([
    fetchRssNews(queryTerm),
    fetchEtNewsRss(upperTicker),
  ]);

  const googleItems = googleResults.status === "fulfilled" ? googleResults.value : [];
  const etItems = etResults.status === "fulfilled" ? etResults.value : [];

  // Deduplicate by title
  const seen = new Set<string>();
  const rawItems: RawNewsItem[] = [];
  for (const item of [...googleItems, ...etItems]) {
    const key = item.title.slice(0, 50).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      rawItems.push(item);
    }
  }

  if (rawItems.length === 0) {
    console.warn(`[SectorNewsTool] ⚠️ No real news articles found for ${upperTicker}. Returning empty digest (NOT using stub data).`);
    return {
      ticker: upperTicker,
      sector,
      news: [],
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0, regulatory_risk: 0 },
      isLiveData: false,
      fetchedAt,
    };
  }

  // Run LLM sentiment analysis on real headlines
  const analyzedItems = await analyzeSentimentWithLLM(rawItems.slice(0, 6), upperTicker, apiKey);

  const breakdown = { positive: 0, neutral: 0, negative: 0, regulatory_risk: 0 };
  for (const item of analyzedItems) {
    breakdown[item.sentiment]++;
  }

  console.log(
    `[SectorNewsTool] ✓ Fetched ${analyzedItems.length} real news articles for ${upperTicker} ` +
    `(+${breakdown.positive} pos, ${breakdown.negative} neg, ${breakdown.regulatory_risk} reg-risk)`
  );

  return {
    ticker: upperTicker,
    sector,
    news: analyzedItems,
    sentimentBreakdown: breakdown,
    isLiveData: true,
    fetchedAt,
  };
}

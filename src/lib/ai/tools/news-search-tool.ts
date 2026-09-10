/**
 * News / Filings Search Tool — Phase 4 Read-only Live Data Tool
 * Searches recent corporate news updates, exchange filings, earnings announcements, and market catalysts.
 * Structurally read-only: outputs into the conversation stream, never mutating report data.
 */

export interface NewsArticle {
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  url?: string;
}

export interface NewsSearchResult {
  query: string;
  articles: NewsArticle[];
  asOf: string;
  rawSummary: string;
}

export async function fetchNewsAndFilings(queryOrCompany: string): Promise<NewsSearchResult> {
  const query = queryOrCompany.trim();
  const timestamp = new Date().toISOString();
  const dateStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  try {
    // Search RSS / public financial news endpoint for Indian market news
    const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " stock india quarterly results BSE NSE")}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 300 },
    });

    if (res.ok) {
      const xmlText = await res.text();
      const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>/gi;
      const articles: NewsArticle[] = [];
      let match;

      while ((match = itemRegex.exec(xmlText)) !== null && articles.length < 5) {
        const rawTitle = match[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1").trim();
        const url = match[2].trim();
        const pubDateStr = match[3].trim();
        
        // Extract publisher name if formatted as "Title - Publisher"
        const parts = rawTitle.split(" - ");
        const title = parts.slice(0, -1).join(" - ") || rawTitle;
        const source = parts[parts.length - 1] || "Financial News";

        articles.push({
          title,
          source,
          publishedAt: pubDateStr,
          url,
          summary: `Headline release regarding ${query} corporate developments.`,
        });
      }

      if (articles.length > 0) {
        const bulletList = articles
          .map((a, i) => `${i + 1}. **${a.title}**\n   *Source:* ${a.source} (${a.publishedAt})\n   *Link:* ${a.url}`)
          .join("\n\n");

        const rawSummary = [
          `📰 **Recent Market News & Corporate Filings for ${query}**`,
          ``,
          bulletList,
          ``,
          `*News search completed as of ${dateStr} IST (Source: Exchange & Press Feeds)*`
        ].join("\n");

        return {
          query,
          articles,
          asOf: timestamp,
          rawSummary,
        };
      }
    }
  } catch (error) {
    console.warn(`[NewsSearchTool] RSS fetch failed for query "${query}", returning structured news summary:`, error);
  }

  // RELIABILITY FIX: When live news feed unavailable, return honest empty result.
  // Never fabricate news headlines or market commentary.
  console.warn(`[NewsSearchTool] ⚠️ Live news feed unavailable for "${query}". Returning empty result.`);
  return {
    query,
    articles: [],
    asOf: timestamp,
    rawSummary: `📰 **News for ${query.toUpperCase()}**\n\n> ⚠️ Live news feed unavailable at ${dateStr} IST.\n> No news articles could be retrieved. Please verify outbound internet access or check again later.`,
  };
}

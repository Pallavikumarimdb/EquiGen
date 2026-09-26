/**
 * Centralized AI Client for EquiGen.
 *
 * Single source of truth for all LLM calls (Chat, Planning, Copilot, Agentic workflows).
 * Replaces scattered, duplicate ad-hoc LLM calls with a single unified router,
 * respecting centralized API keys (OpenRouter / Groq / OpenAI), token rate ceilings,
 * and graceful fallback ladders.
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { createLangChainChatModel } from "./langchain-service";
import { fetchNewsAndFilings, NewsArticle } from "./tools/news-search-tool";

export interface CentralizedChatRequest {
  prompt: string;
  systemPrompt?: string;
  companyName?: string;
  ticker?: string;
  cmp?: number;
  tp?: number;
  rating?: string;
  persona?: string;
  // BYOK & model routing parameters
  provider?: "groq" | "openai" | "openrouter";
  apiKey?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CentralizedChatResponse {
  content: string;
  modelUsed: string;
  source: "openrouter" | "groq" | "openai" | "fallback_synthesis";
  visitedUrls?: string[];
}

/**
 * Builds standard system prompt for equity research analysis
 */
export function buildInstitutionalSystemPrompt(req: CentralizedChatRequest): string {
  const company = req.companyName?.trim() || "";
  const ticker = req.ticker?.trim() ? ` (${req.ticker.trim()})` : "";
  const cmpStr = req.cmp != null ? `₹${req.cmp}` : "Not loaded";
  const tpStr = req.tp != null ? `₹${req.tp}` : "Not specified";
  const ratingStr = req.rating || "Not loaded";
  const upsideStr =
    req.tp != null && req.cmp != null && req.cmp > 0
      ? req.tp > req.cmp
        ? `+${(((req.tp - req.cmp) / req.cmp) * 100).toFixed(1)}%`
        : `${(((req.tp - req.cmp) / req.cmp) * 100).toFixed(1)}%`
      : "N/A";
  const persona = req.persona || "Institutional Research (Buy-Side & Sell-Side)";

  const companyContextBlock = company
    ? `Context of Active Company:
- Company: ${company}${ticker}
- Current Market Price (CMP): ${cmpStr}
- Target Price (TP): ${tpStr}
- Recommendation: ${ratingStr}${upsideStr !== "N/A" ? ` (${upsideStr} upside)` : ""}
- Valuation Methodology: 5-year Discounted Cash Flow (DCF) with sensitivity modeling and Relative Peer Multiples.`
    : `Context: No active company report loaded. Answer general research, analytical, or market inquiries directly based on verified data.`;

  return req.systemPrompt || `You are EquiGen's Senior Equity Research Analyst and Autonomous Financial Agent, operating in the style of ChatGPT/Claude for institutional investors and analysts.

${companyContextBlock}
- Audience Persona: ${persona}

Guidelines:
1. Answer all analytical, financial, accounting, macroeconomic, valuation, and company-specific questions with extreme depth, accuracy, and clarity.
2. For mathematical/valuation questions (e.g., WACC sensitivity, DCF impacts, Cost of Equity Ke, Beta, terminal growth rate g):
   - Explain both the mathematical mechanics (e.g. Enterprise Value discount rate formula, Terminal Value = FCFF / (WACC - g)) and the economic significance.
   - Provide concrete numerical sensitivities (e.g., typically a 100 bps change in WACC impacts fair value by 8% to 15% depending on cash flow duration and debt-to-equity ratio).
   - If the company is a bank (e.g., ICICI Bank, HDFC Bank, SBI), note that banks are typically valued on Cost of Equity (Ke) via Dividend Discount Model (DDM) or Residual Income / Price-to-Adjusted Book Value (P/ABV) rather than firm-level WACC/FCFF, and detail how a 100 bps shift in Ke or RoE affects the justified P/B multiple.
3. Use markdown formatting with clear headings, bullet points, bold highlights, and tables where appropriate.
4. Maintain a professional, objective Wall Street / Dalal Street equity research tone.
5. When asked to pull, summarize, or analyze publicly available equity research reports, broker consensus notes (e.g. Motilal Oswal, ICICI Securities, Kotak Institutional Equities, HDFC Securities, Jefferies, Morgan Stanley), exchange filings, or public buy/sell reports:
   - DO NOT give a canned disclaimer about lacking real-time web browsing.
   - Synthesize the publicly available institutional broker coverage, consensus ratings, target price benchmarks, key investment catalysts, and risk factors in structured tables and bullet points.
   - Never truncate or cut off mid-response; ensure every section and risk table is fully written out.
6. REAL RETRIEVED SOURCES ONLY (STRICTLY NO DUMMY OR PLACEHOLDER URLS):
   - In your '### Sources & Reference Verification' section, format links as markdown: [Article Title or Publisher Name](Exact Reference URL).
   - NEVER invent, hallucinate, or insert generic dummy homepages (e.g. do NOT output generic "bseindia.com" or "moneycontrol.com" homepages).
   - If no external web sources were retrieved (such as for pure valuation math, WACC formula explanations, or internal report updates), state that the analysis is based on the active report's internal financial model and do not attach unvisited web URLs.
7. DIRECT STRUCTURED MARKDOWN OUTPUT ONLY (STRICTLY NO TOOL CALLS):
   - You MUST NEVER invoke or output external tool calls, functions, or execution commands (such as "web.run", browsing actions, or JSON tool syntax).
   - All necessary web research, company filings, and market news context have already been fetched and provided to you directly as reference text.
   - Formulate your entire answer directly as comprehensive institutional markdown text with clear headings, analysis, and tables.`;
}

export type ChatStreamEvent =
  | { type: "meta"; modelUsed: string; source: "groq" | "openai" | "openrouter" | "fallback_synthesis"; visitedUrls: string[] }
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

/**
 * Streams chat tokens from the centralized model router in real-time.
 */
export async function* executeCentralizedAIChatStream(
  req: CentralizedChatRequest,
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const fullSystemPrompt = buildInstitutionalSystemPrompt(req);

  // Proactively check if the user query requires live web data/reports/filings
  const lowerPrompt = req.prompt.toLowerCase();
  const needsLiveSearch =
    lowerPrompt.includes("report") ||
    lowerPrompt.includes("buy") ||
    lowerPrompt.includes("sell") ||
    lowerPrompt.includes("internet") ||
    lowerPrompt.includes("news") ||
    lowerPrompt.includes("consensus") ||
    lowerPrompt.includes("broker") ||
    lowerPrompt.includes("publicly") ||
    lowerPrompt.includes("filing") ||
    lowerPrompt.includes("results") ||
    lowerPrompt.includes("latest") ||
    lowerPrompt.includes("catalyst");

  let liveArticles: NewsArticle[] = [];
  if (needsLiveSearch) {
    try {
      const companyTerm = req.companyName?.trim() || req.ticker?.trim() || "";
      const searchQuery = companyTerm
        ? `${companyTerm} equity research broker report target price`
        : req.prompt.slice(0, 100).replace(/[^\w\s]/g, " ").trim();
      const searchRes = await fetchNewsAndFilings(searchQuery);
      if (searchRes?.articles && searchRes.articles.length > 0) {
        liveArticles = searchRes.articles;
      }
    } catch (searchErr) {
      console.warn("[CentralizedAI] Live search retrieval failed:", searchErr);
    }
  }

  let userContent = req.prompt;
  if (liveArticles.length > 0) {
    userContent += `\n\n[Verified Reference Context & Recent Market News]:\nThe following verified reports, filings, and articles are provided for reference:\n` +
      liveArticles
        .map(
          (a, i) =>
            `${i + 1}. Title: ${a.title}\n   Source/Publisher: ${a.source}\n   Published Date: ${a.publishedAt}\n   Reference URL: ${a.url}`,
        )
        .join("\n\n") +
      `\n\n(IMPORTANT: In '### Sources & Reference Verification', format links as [Article Title or Source](Reference URL) using ONLY the exact Reference URLs above. Do not invent any dummy or unvisited URLs. Do not attempt to invoke web browsing tools or functions; all references are already provided above).`;
  }

  const langChainMessages = [
    new SystemMessage(fullSystemPrompt),
    new HumanMessage(userContent),
  ];

  const visitedUrls = liveArticles.map((a) => a.url).filter(Boolean) as string[];

  // Helper generator to stream from a LangChain BaseChatModel
  async function* streamFromModel(
    model: BaseChatModel,
    modelUsed: string,
    source: "groq" | "openai" | "openrouter" | "fallback_synthesis",
  ) {
    let sentMeta = false;
    let accumulated = "";
    const responseStream = await model.stream(langChainMessages);
    for await (const chunk of responseStream) {
      const text = typeof chunk.content === "string" ? chunk.content : JSON.stringify(chunk.content);
      if (!text) continue;
      accumulated += text;
      if (!sentMeta) {
        yield { type: "meta" as const, modelUsed, source, visitedUrls };
        sentMeta = true;
      }
      yield { type: "delta" as const, text };
    }

    if (!sentMeta && accumulated.trim().length > 0) {
      yield { type: "meta" as const, modelUsed, source, visitedUrls };
    }
    yield { type: "done" as const };
  }

  // 1. Direct BYOK execution (if user passed specific API key or selected provider)
  if (req.apiKey && req.provider) {
    try {
      const byokModel = createLangChainChatModel({
        provider: req.provider,
        apiKey: req.apiKey,
        modelName: req.modelName,
        temperature: req.temperature ?? 0.2,
        maxTokens: req.maxTokens ?? 4096,
      });

      const modelUsed = req.modelName || (req.provider === "groq" ? "openai/gpt-oss-120b" : "custom-model");
      const source = req.provider === "openrouter" ? "openrouter" : req.provider === "openai" ? "openai" : "groq";
      let yieldedAny = false;
      for await (const event of streamFromModel(byokModel, modelUsed, source)) {
        yieldedAny = true;
        yield event;
      }
      if (yieldedAny) return;
    } catch (byokErr) {
      console.warn("[CentralizedAI] User BYOK streaming failed, falling back to central ladder:", byokErr);
    }
  }

  // 2. Centralized Model Ladder using LangChain (Groq 120B -> Groq Qwen 27B -> OpenRouter Fallback)
  const groqKey = process.env.GROQ_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  // Step 2a: Try Groq official high-speed 120B model via LangChain ChatGroq
  if (groqKey) {
    try {
      const groqModel = createLangChainChatModel({
        provider: "groq",
        apiKey: groqKey,
        modelName: "openai/gpt-oss-120b",
        temperature: 0.2,
        maxTokens: 4096,
      });

      let yieldedAny = false;
      for await (const event of streamFromModel(groqModel, "openai/gpt-oss-120b", "groq")) {
        yieldedAny = true;
        yield event;
      }
      if (yieldedAny) return;
    } catch (err) {
      console.warn("[CentralizedAI] Central LangChain Groq 120B stream failed, attempting Groq Qwen 27B fallback:", err);
      // Secondary Groq attempt with Qwen 27B
      try {
        const groqQwenModel = createLangChainChatModel({
          provider: "groq",
          apiKey: groqKey,
          modelName: "qwen/qwen3.8-27b",
          temperature: 0.2,
          maxTokens: 4096,
        });

        let yieldedAny = false;
        for await (const event of streamFromModel(groqQwenModel, "qwen/qwen3.8-27b", "groq")) {
          yieldedAny = true;
          yield event;
        }
        if (yieldedAny) return;
      } catch (qwenErr) {
        console.warn("[CentralizedAI] Groq Qwen 27B stream fallback also failed, attempting OpenRouter:", qwenErr);
      }
    }
  }

  // Step 2b: Try OpenRouter with meta-llama/llama-3.3-70b-instruct via LangChain ChatOpenAI
  if (openRouterKey) {
    try {
      const openRouterModel = createLangChainChatModel({
        provider: "openrouter",
        apiKey: openRouterKey,
        modelName: "meta-llama/llama-3.3-70b-instruct",
        temperature: 0.2,
        maxTokens: 4096,
      });

      let yieldedAny = false;
      for await (const event of streamFromModel(openRouterModel, "meta-llama/llama-3.3-70b-instruct", "openrouter")) {
        yieldedAny = true;
        yield event;
      }
      if (yieldedAny) return;
    } catch (orErr) {
      console.warn("[CentralizedAI] Central LangChain OpenRouter stream attempt failed:", orErr);
    }
  }

  // ACCURACY OVER AVAILABILITY:
  // In a financial research application, never synthesize or fabricate broker ratings,
  // target prices, or financial metrics when primary LLM providers are offline.
  throw new Error(
    `AI Research Service unavailable: Could not establish a connection to verified AI models. To guarantee financial data integrity and avoid misleading predictions, synthetic fallback data is strictly disabled. Please verify your API keys or network connectivity and try again.`
  );
}

/**
 * Non-streaming wrapper that aggregates the streamed tokens into a complete response.
 */
export async function executeCentralizedAIChat(
  req: CentralizedChatRequest,
): Promise<CentralizedChatResponse> {
  let content = "";
  let modelUsed = "openai/gpt-oss-120b";
  let source: "groq" | "openai" | "openrouter" | "fallback_synthesis" = "groq";
  let visitedUrls: string[] = [];

  for await (const event of executeCentralizedAIChatStream(req)) {
    if (event.type === "meta") {
      modelUsed = event.modelUsed;
      source = event.source;
      visitedUrls = event.visitedUrls;
    } else if (event.type === "delta") {
      content += event.text;
    } else if (event.type === "error") {
      throw new Error(event.error);
    }
  }

  return {
    content: content.trim(),
    modelUsed,
    source,
    visitedUrls,
  };
}

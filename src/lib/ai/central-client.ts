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
  // Full report context for agent intelligence
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reportData?: any;
}

export interface CentralizedChatResponse {
  content: string;
  modelUsed: string;
  source: "openrouter" | "groq" | "openai" | "fallback_synthesis";
  visitedUrls?: string[];
}

/**
 * Serializes all sections of the active research report into structured markdown
 * context for the AI Agent.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildReportContextMarkdown(reportData: any, req: CentralizedChatRequest): string {
  if (!reportData) return "";

  const sections: string[] = [];

  // 1. Company & Recommendation Summary
  const comp = reportData.company || {};
  const rec = reportData.recommendation || {};
  const cmp = rec.currentPrice ?? req.cmp ?? null;
  const tp = rec.targetPrice ?? req.tp ?? null;
  const upside =
    rec.upsidePotential ??
    (tp != null && cmp != null && cmp > 0
      ? parseFloat((((tp - cmp) / cmp) * 100).toFixed(1))
      : null);

  sections.push(`### 1. Active Company & Recommendation
- **Company Name**: ${comp.name || req.companyName || "N/A"}
- **Ticker / Symbol**: ${comp.ticker || req.ticker || "N/A"}
- **Sector / Industry**: ${comp.sector || "N/A"} / ${comp.industry || "N/A"}
- **Current Market Price (CMP)**: ${cmp != null ? `₹${cmp}` : "N/A"}
- **Target Price (TP)**: ${tp != null ? `₹${tp}` : "N/A"}
- **Rating / Stance**: ${rec.rating || req.rating || "N/A"}${upside != null ? ` (${upside >= 0 ? `+${upside}%` : `${upside}%`} upside)` : ""}
- **NSE / BSE Code**: ${reportData.nseCode || "N/A"} / ${reportData.bseCode || "N/A"}`);

  // 2. Executive Summary & Investment Thesis
  if (reportData.executiveSummary || reportData.headlineTakeaway || reportData.narrativeSummary) {
    sections.push(`### 2. Executive Summary & Core Thesis
${reportData.headlineTakeaway ? `**Headline Takeaway**: ${reportData.headlineTakeaway}\n\n` : ""}${reportData.executiveSummary ? `**Executive Summary**:\n${reportData.executiveSummary}\n\n` : ""}${reportData.narrativeSummary ? `**Narrative Thesis**:\n${reportData.narrativeSummary}` : ""}`.trim());
  }

  // 3. 5-Year Historical Financials
  if (Array.isArray(reportData.fiveYearSummary) && reportData.fiveYearSummary.length > 0) {
    let table = `### 3. Five-Year Audited Financials Summary\n| Period | Sales (₹ Cr) | YoY Growth | EBITDA (₹ Cr) | EBITDA Margin | Adj PAT (₹ Cr) | Adj EPS (₹) | RoE | D/E | P/E | EV/EBITDA |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const row of reportData.fiveYearSummary) {
      table += `| ${row.period || "FY"} | ${row.sales != null ? `₹${row.sales}` : "-"} | ${row.salesGrowth != null ? `${row.salesGrowth}%` : "-"} | ${row.ebitda != null ? `₹${row.ebitda}` : "-"} | ${row.ebitdaMargin != null ? `${row.ebitdaMargin}%` : "-"} | ${row.patAdjusted != null ? `₹${row.patAdjusted}` : "-"} | ${row.adjEps != null ? `₹${row.adjEps}` : "-"} | ${row.roe != null ? `${row.roe}%` : "-"} | ${row.deRatio != null ? row.deRatio : "-"} | ${row.pe != null ? `${row.pe}x` : "-"} | ${row.evEbitda != null ? `${row.evEbitda}x` : "-"} |\n`;
    }
    sections.push(table.trim());
  }

  // 4. Forensic Accounting & Earnings Quality Audit
  if (reportData.forensicAnalysis) {
    const f = reportData.forensicAnalysis;
    const cfo = f.cfoToPatRatio || {};
    const z = f.altmanZScore || {};
    const m = f.beneishMScore || {};
    const wc = f.workingCapitalStress || {};
    const gov = f.governanceFlags || {};

    let forensicText = `### 4. Forensic Quality & Forensic Accounting Audit
- **Overall Forensic Health Score**: ${f.overallHealthScore ?? "N/A"}/100 (Risk Level: **${f.riskLevel || "MODERATE"}**)
- **CFO-to-PAT Cash Quality**: Ratio ${cfo.ratio != null ? `${cfo.ratio}x` : "N/A"} (${cfo.status || "evaluated"}) · ${cfo.interpretation || "Evaluated against reported earnings"}${cfo.cfoCr != null && cfo.patCr != null ? ` (Reported CFO: ₹${cfo.cfoCr} Cr vs PAT: ₹${cfo.patCr} Cr)` : ""}
- **Altman Z-Score (Insolvency Risk)**: ${z.score != null ? z.score : "N/A"} (Zone: **${z.zone || "Safe"}**, Status: ${z.status || "safe"}) · ${z.interpretation || ""}
- **Beneish M-Score (Earnings Manipulation)**: ${m.score != null ? m.score : "N/A"} (Status: **${m.status || "safe"}**) · ${m.interpretation || ""}
- **Working Capital Stress**: ${wc.interpretation || "Cycle evaluated"}${wc.workingCapitalCycleDays != null ? ` · Working Capital Cycle: ${wc.workingCapitalCycleDays} days` : ""}${wc.receivablesGrowthVsSales ? ` · Receivables vs Sales: ${wc.receivablesGrowthVsSales}` : ""}
- **Governance & Ownership**: Promoter Pledge: ${gov.promoterPledgePct != null ? `${gov.promoterPledgePct}%` : "0%"} · Promoter Holding: ${gov.promoterHoldingPct != null ? `${gov.promoterHoldingPct}%` : "N/A"} · Institutional Holding: ${gov.institutionalHoldingPct != null ? `${gov.institutionalHoldingPct}%` : "N/A"} · Auditor Quality: **${gov.auditorQuality || "Clean"}**`;

    if (Array.isArray(gov.flags) && gov.flags.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      forensicText += `\n- **Identified Red Flags**:\n` + gov.flags.map((fl: any) => `  - [${fl.severity?.toUpperCase() || "FLAG"}] ${fl.title}: ${fl.detail}`).join("\n");
    }
    if (f.summaryAssessment) {
      forensicText += `\n- **Summary Audit Assessment**: ${f.summaryAssessment}`;
    }
    sections.push(forensicText.trim());
  }

  // 5. Valuation Drivers & 3-Statement Modeling Assumptions
  const modeling = reportData.modelingData || {};
  const assumptions = modeling.assumptions || {};
  if (Object.keys(assumptions).length > 0 || modeling.baseTargetPrice) {
    const waccVal = typeof assumptions.wacc === "number"
      ? assumptions.wacc <= 1 ? (assumptions.wacc * 100).toFixed(1) + "%" : assumptions.wacc + "%"
      : "11.5%";
    const tgVal = typeof assumptions.terminalGrowth === "number"
      ? assumptions.terminalGrowth <= 1 ? (assumptions.terminalGrowth * 100).toFixed(1) + "%" : assumptions.terminalGrowth + "%"
      : "4.0%";
    const marginVal = typeof assumptions.ebitdaMargin === "number"
      ? assumptions.ebitdaMargin <= 1 ? (assumptions.ebitdaMargin * 100).toFixed(1) + "%" : assumptions.ebitdaMargin + "%"
      : "18.0%";
    const growthVal = typeof assumptions.revenueGrowthRate === "number"
      ? assumptions.revenueGrowthRate <= 1 ? (assumptions.revenueGrowthRate * 100).toFixed(1) + "%" : assumptions.revenueGrowthRate + "%"
      : "12.0%";
    const dsoVal = assumptions.dso ?? 55;
    const dioVal = assumptions.dio ?? 45;
    const dpoVal = assumptions.dpo ?? 40;
    const cccVal = (typeof dsoVal === "number" && typeof dioVal === "number" && typeof dpoVal === "number")
      ? dsoVal + dioVal - dpoVal
      : "N/A";

    sections.push(`### 5. DCF Valuation & 3-Statement Model Drivers
- **DCF Base Target Price**: ₹${modeling.baseTargetPrice || tp || "N/A"} (Bull: ₹${modeling.bullTargetPrice || "N/A"}, Bear: ₹${modeling.bearTargetPrice || "N/A"})
- **Discount Rate (WACC)**: ${waccVal}
- **Terminal Growth Rate (g)**: ${tgVal}
- **Operating EBITDA Margin**: ${marginVal}
- **Projected Revenue Growth Rate**: ${growthVal}
- **Working Capital Days**: DSO: ${dsoVal} days, DIO: ${dioVal} days, DPO: ${dpoVal} days (Cash Conversion Cycle / CCC: ${cccVal} days)
- **Capex Intensity**: ${assumptions.capexAsPercentRevenue != null ? (assumptions.capexAsPercentRevenue <= 1 ? `${(assumptions.capexAsPercentRevenue * 100).toFixed(1)}%` : `${assumptions.capexAsPercentRevenue}%`) : "5.0% of revenue"}
- **Base Year Revenue**: ₹${assumptions.baseRevenue || assumptions.revenue || "10,000"} Cr | Shares Diluted: ${assumptions.sharesCr || reportData.companyData?.outstandingShares || "50"} Cr`);
  }

  // 6. SWOT Analysis
  if (reportData.swotAnalysis) {
    const swot = reportData.swotAnalysis;
    const s = Array.isArray(swot.strengths) && swot.strengths.length > 0 ? swot.strengths.map((x: string) => `  + ${x}`).join("\n") : "  + Market leader in target category";
    const w = Array.isArray(swot.weaknesses) && swot.weaknesses.length > 0 ? swot.weaknesses.map((x: string) => `  - ${x}`).join("\n") : "  - Raw material cyclicality";
    const o = Array.isArray(swot.opportunities) && swot.opportunities.length > 0 ? swot.opportunities.map((x: string) => `  + ${x}`).join("\n") : "  + Export and capacity expansion";
    const t = Array.isArray(swot.threats) && swot.threats.length > 0 ? swot.threats.map((x: string) => `  - ${x}`).join("\n") : "  - Regulatory or tariff risk";

    sections.push(`### 6. Strategic SWOT Matrix
- **Strengths**:\n${s}
- **Weaknesses**:\n${w}
- **Opportunities**:\n${o}
- **Threats**:\n${t}`);
  }

  // 7. Investment Risks
  if (Array.isArray(reportData.investmentRisks) && reportData.investmentRisks.length > 0) {
    sections.push(`### 7. Key Investment & Downside Risks\n` + reportData.investmentRisks.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n"));
  }

  // 8. Competitor Peers & Multiples
  if (Array.isArray(reportData.competitors) && reportData.competitors.length > 0) {
    let peerTable = `### 8. Peer Benchmarking & Relative Multiples\n| Competitor | CMP (₹) | Target (₹) | Rating | P/E | EV/EBITDA |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    for (const c of reportData.competitors) {
      peerTable += `| ${c.name || "Peer"} | ${c.cmp != null ? `₹${c.cmp}` : "-"} | ${c.targetPrice != null ? `₹${c.targetPrice}` : "-"} | ${c.rating || "-"} | ${c.pe != null ? `${c.pe}x` : "-"} | ${c.evEbitda != null ? `${c.evEbitda}x` : "-"} |\n`;
    }
    sections.push(peerTable.trim());
  }

  return sections.join("\n\n");
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

  const reportContextMarkdown = req.reportData ? buildReportContextMarkdown(req.reportData, req) : "";

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

${reportContextMarkdown ? `\n======================================================\n[FULL ACTIVE REPORT DATA CONTEXT & METRICS]:\n${reportContextMarkdown}\n======================================================\n` : ""}

Guidelines:
1. Answer all analytical, financial, accounting, macroeconomic, valuation, and company-specific questions with extreme depth, accuracy, and clarity.
2. Ground your analysis directly in the active report data provided above:
   - When asked about audited 5-year financials (sales, EBITDA, PAT, EPS, margins), reference the exact numbers and percentages from Section 3.
   - When asked about forensic accounting, health scores, CFO/PAT ratios, Altman Z-Score, or Beneish M-Score, cite the exact figures and zone evaluations from Section 4.
   - When asked about valuation, DCF assumptions, WACC, or working capital cycles (DSO, DIO, DPO), cite the exact drivers from Section 5.
   - When asked about strategic positioning, reference the SWOT analysis from Section 6 and investment risks from Section 7.
3. For mathematical/valuation questions (e.g., WACC sensitivity, DCF impacts, Cost of Equity Ke, Beta, terminal growth rate g):
   - Explain both the mathematical mechanics (e.g. Enterprise Value discount rate formula, Terminal Value = FCFF / (WACC - g)) and the economic significance.
   - Provide concrete numerical sensitivities (e.g., typically a 100 bps change in WACC impacts fair value by 8% to 15% depending on cash flow duration and debt-to-equity ratio).
   - If the company is a bank (e.g., ICICI Bank, HDFC Bank, SBI), note that banks are typically valued on Cost of Equity (Ke) via Dividend Discount Model (DDM) or Residual Income / Price-to-Adjusted Book Value (P/ABV) rather than firm-level WACC/FCFF, and detail how a 100 bps shift in Ke or RoE affects the justified P/B multiple.
4. Use markdown formatting with clear headings, bullet points, bold highlights, and tables where appropriate.
5. Maintain a professional, objective Wall Street / Dalal Street equity research tone.
6. When asked to pull, summarize, or analyze publicly available equity research reports, broker consensus notes (e.g. Motilal Oswal, ICICI Securities, Kotak Institutional Equities, HDFC Securities, Jefferies, Morgan Stanley), exchange filings, or public buy/sell reports:
   - DO NOT give a canned disclaimer about lacking real-time web browsing.
   - Synthesize the publicly available institutional broker coverage, consensus ratings, target price benchmarks, key investment catalysts, and risk factors in structured tables and bullet points.
   - Never truncate or cut off mid-response; ensure every section and risk table is fully written out.
7. REAL RETRIEVED SOURCES ONLY (STRICTLY NO DUMMY OR PLACEHOLDER URLS):
   - In your '### Sources & Reference Verification' section, format links as markdown: [Article Title or Publisher Name](Exact Reference URL).
   - NEVER invent, hallucinate, or insert generic dummy homepages (e.g. do NOT output generic "bseindia.com" or "moneycontrol.com" homepages).
   - If no external web sources were retrieved (such as for pure valuation math, WACC formula explanations, or internal report updates), state that the analysis is based on the active report's internal financial model and do not attach unvisited web URLs.
8. DIRECT STRUCTURED MARKDOWN OUTPUT ONLY (STRICTLY NO TOOL CALLS):
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

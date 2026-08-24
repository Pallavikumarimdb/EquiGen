import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { EquityResearchData } from "@/types";
import { AIExtractionResult } from "./schema";
import { runOrResumeResearchPipeline } from "./langgraph-pipeline";

export interface AIServiceOptions {
  provider: "groq" | "openai";
  modelName?: string;
  apiKey?: string;
}

/**
 * Normalizes a financial metric series to crore (Cr).
 * If the unit is million/mn/m, converts by dividing value by 10 (10 million = 1 crore).
 * Returns the series with values in crore and unit set to "Cr".
 */
function normalizeUnitToCrore(
  series: { period: string; value: string | number; unit?: string }[] | null | undefined,
): { period: string; value: number; unit: string }[] {
  if (!series) return [];
  return series.map((item) => {
    const rawVal = typeof item.value === "number" ? item.value : parseFloat(String(item.value).replace(/[^\d.-]/g, "")) || 0;
    const unit = (item.unit || "Cr").toLowerCase().trim();
    // Common million indicators: million, mn, m, inr mn, inr million, rs mn, rs million
    const isMillion = /^(million|mn|m|inr\s*mn|inr\s*million|rs\.?\s*mn|rs\.?\s*million|₹\s*mn|₹\s*million)$/i.test(unit);
    const valueCr = isMillion ? rawVal / 10 : rawVal;
    return { period: item.period, value: parseFloat(valueCr.toFixed(2)), unit: "Cr" };
  });
}

export class LangChainAIService {
  /**
   * Instantiates the correct LangChain model wrapper based on the selected provider.
   */
  private getModel(options: AIServiceOptions): BaseChatModel {
    const provider = options.provider;
    const apiKey =
      options.apiKey ||
      (provider === "groq"
        ? process.env.GROQ_API_KEY
        : process.env.OPENAI_API_KEY);

    if (!apiKey) {
      throw new Error(`API key for provider "${provider}" is not configured.`);
    }

    switch (provider) {
      case "groq":
        return new ChatGroq({
          apiKey,
          model: options.modelName || "openai/gpt-oss-120b",
          temperature: 0.1,
        });
      case "openai":
        return new ChatOpenAI({
          apiKey,
          model: options.modelName || "gpt-4o-mini",
          temperature: 0.1,
        });
      default:
        throw new Error(`Unsupported AI model provider: ${provider}`);
    }
  }

  /**
   * Maps raw schema outputs to the full EquityResearchData structure.
   */
  private mapToEquityResearchData(
    aiResult: AIExtractionResult,
  ): EquityResearchData {
    const currentPrice = aiResult.currentPrice ?? null;
    const targetPrice = aiResult.targetPrice ?? null;

    let upsidePotential: number | null = null;
    if (currentPrice !== null && targetPrice !== null && currentPrice > 0) {
      upsidePotential = parseFloat(
        (((targetPrice - currentPrice) / currentPrice) * 100).toFixed(2),
      );
    }

    const incomeStatement = [
      ...normalizeUnitToCrore(aiResult.revenue).map((r) => ({
        label: "Revenue",
        value: r.value,
        period: r.period,
        unit: r.unit,
      })),
      ...normalizeUnitToCrore(aiResult.ebitda).map((e) => ({
        label: "EBITDA",
        value: e.value,
        period: e.period,
        unit: e.unit,
      })),
      ...normalizeUnitToCrore(aiResult.pat).map((p) => ({
        label: "PAT",
        value: p.value,
        period: p.period,
        unit: p.unit,
      })),
    ];

    const p1h = aiResult.pageOneHighlights || [];
    const p2h = aiResult.pageTwoHighlights || [];

    // Coalesce companyData from nested object + root-level fallbacks
    // (LLM sometimes emits these at the root level instead of nesting them)
    const resolvedCompanyData = {
      marketCap: aiResult.companyData?.marketCap ?? aiResult.marketCap ?? null,
      highLow52W: aiResult.companyData?.highLow52W ?? aiResult.highLow52W ?? null,
      enterpriseValue: aiResult.companyData?.enterpriseValue ?? aiResult.companyData?.ev ?? aiResult.enterpriseValue ?? aiResult.ev ?? null,
      ev: aiResult.companyData?.ev ?? aiResult.ev ?? null,
      outstandingShares: aiResult.companyData?.outstandingShares ?? aiResult.outstandingShares ?? null,
      freeFloat: aiResult.companyData?.freeFloat ?? aiResult.freeFloat ?? null,
      dividendYield: aiResult.companyData?.dividendYield ?? aiResult.dividendYield ?? null,
      avgVolume6m: aiResult.companyData?.avgVolume6m ?? aiResult.companyData?.avgVolume ?? aiResult.avgVolume6m ?? aiResult.avgVolume ?? null,
      avgVolume: aiResult.companyData?.avgVolume ?? aiResult.avgVolume ?? null,
      beta: aiResult.companyData?.beta ?? aiResult.beta ?? null,
      faceValue: aiResult.companyData?.faceValue ?? aiResult.faceValue ?? null,
    };
    // Only set companyData if at least one field has a real value
    const hasAnyCompanyData = Object.values(resolvedCompanyData).some((v) => v != null);
    const companyData = hasAnyCompanyData ? resolvedCompanyData : null;

    return {
      company: {
        name: aiResult.companyName || "Unknown Company",
        ticker:
          aiResult.ticker ||
          (aiResult.companyName || "UNKN").substring(0, 4).toUpperCase(),
        sector: aiResult.sector || undefined,
        industry: aiResult.industry || undefined,
        reportDate: new Date().toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
      },
      recommendation: {
        rating: aiResult.recommendation,
        currentPrice,
        targetPrice,
        upsidePotential,
        rationale: p1h.slice(0, 3),
        currentPriceSource: aiResult.currentPriceSource ?? null,
      },
      executiveSummary:
        aiResult.investmentThesis || "No investment thesis provided.",
      keyFinancials: {
        incomeStatement,
        balanceSheet: [],
        cashFlow: [],
      },
      valuationAnalysis: aiResult.outlook || "No valuation outlook provided.",
      investmentRisks: aiResult.risks || [],
      swotAnalysis: {
        strengths: p1h.slice(0, 4),
        weaknesses: (aiResult.risks || []).slice(0, 4),
        opportunities: aiResult.futureGrowth ? [aiResult.futureGrowth] : [],
        threats: [],
      },
      narrativeSummary: p2h.join("\n\n") || aiResult.narrativeSummary,
      industryOverview: aiResult.industryOverview,
      businessOverview: aiResult.businessOverview,
      futureGrowth: aiResult.futureGrowth,

      // Map Geojit fields
      nseCode: aiResult.nseCode,
      bseCode: aiResult.bseCode,
      bloombergCode: aiResult.bloombergCode,
      timeFrame: aiResult.timeFrame || "12 Months",
      stockType: aiResult.stockType || "Large Cap",
      companyData,
      shareholding: aiResult.shareholding,
      promoterPledge: aiResult.promoterPledge,
      pricePerformance: aiResult.pricePerformance,
      estimates: aiResult.estimates,
      quarterlyFinancials: aiResult.quarterlyFinancials,
      detailedFinancials: aiResult.detailedFinancials,
      recommendationSummary: aiResult.recommendationSummary,
      sensexValue: aiResult.sensexValue,
      fiveYearSummary: aiResult.fiveYearSummary,
    };
  }

  /**
   * Executes structured data extraction using LangChain and withStructuredOutput.
   */
  public async extractFinancialData(
    companyName: string,
    rawText: string,
    options: AIServiceOptions = { provider: "groq" },
  ): Promise<EquityResearchData> {
    const jobId =
      "job_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
    return this.extractOrResumeFinancialData(
      jobId,
      companyName,
      rawText,
      options,
      false,
    );
  }

  /**
   * Executes or resumes a stateful extraction job using LangGraph intermediate progress checkpointing.
   */
  public async extractOrResumeFinancialData(
    jobId: string,
    companyName?: string,
    rawText?: string,
    options: AIServiceOptions = { provider: "groq" },
    resume = false,
  ): Promise<EquityResearchData> {
    try {
      const response = await runOrResumeResearchPipeline(
        jobId,
        companyName,
        rawText,
        options,
        resume,
      );
      return this.mapToEquityResearchData(response);
    } catch (error) {
      console.error("LangGraph stateful research extraction failed:", error);
      // Let RateLimitError bubble up directly so it can trigger the HTTP 429 response flow
      if (error && typeof error === "object" && "retryAfterSeconds" in error) {
        throw error;
      }
      throw new Error(
        `AI Extraction Pipeline Failed: ${error instanceof Error ? error.message : "Unknown Error"}`,
      );
    }
  }
}

export const langchainAIService = new LangChainAIService();

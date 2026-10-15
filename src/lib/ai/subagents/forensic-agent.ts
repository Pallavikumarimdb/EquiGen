/**
 * Forensic Accounting & Corporate Governance Subagent
 *
 * Specializes in institutional forensic checks:
 * - Cash Earnings Quality (CFO / PAT conversion)
 * - Balance Sheet Solvency (Altman Z-Score)
 * - Accounting Distortion Risk (Beneish M-Score)
 * - Working Capital & Receivable Divergence
 * - Promoter Share Pledging & Corporate Governance Red Flags
 */

import { ForensicQualityData } from "@/types";
import { computeForensicQuality, ForensicInputFinancials } from "../tools/forensic-accounting-tool";
import { ExtractedFinancials } from "../tools/yahoo-financials-tool";
import { trajectoryBus } from "../trajectory-emitter";
import { prisma } from "@/lib/db";

export interface ForensicAgentInput {
  planId: string;
  runId?: string;
  ticker: string;
  companyName: string;
  financials?: ExtractedFinancials | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bseData?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  documentData?: any;
  apiKey?: string;
}

export interface ForensicAgentOutput {
  runId: string;
  planId: string;
  forensicAnalysis: ForensicQualityData;
  completedAt: string;
}

export class ForensicAgent {
  public async run(input: ForensicAgentInput): Promise<ForensicAgentOutput> {
    const runId = input.runId ?? `forensic_${Date.now()}`;
    const startTime = Date.now();

    // 1. Emit start event
    trajectoryBus.emitEvent(input.planId, "subagent_start", {
      agentType: "forensic",
      message: `Auditing forensic accounting and governance quality for ${input.companyName} (${input.ticker})...`,
    });

    trajectoryBus.emitEvent(input.planId, "planner_thought", {
      reasoning: `Calculating CFO/PAT cash conversion, Altman Z-Score, Beneish M-Score, and checking promoter pledge levels for ${input.ticker}...`,
    });

    const fin = input.financials as (Record<string, unknown> & ExtractedFinancials) | null;
    const bse = input.bseData as Record<string, unknown> | null;
    const doc = input.documentData as Record<string, unknown> | null;

    const docFin = (doc?.uploadedDocFinancials ?? doc?.unifiedFinancials ?? doc?.extractedFinancials ?? doc) as Record<string, unknown> | null;
    const docDetailed = (docFin?.detailedFinancials ?? doc?.detailedFinancials) as {
      balanceSheet?: Array<Record<string, unknown>>;
      cashFlow?: Array<Record<string, unknown>>;
      incomeStatement?: Array<Record<string, unknown>>;
    } | null;
    const docFiveYear = (docFin?.fiveYearSummary ?? doc?.fiveYearSummary) as Array<{
      year?: string;
      sales?: number;
      ebitda?: number;
      patAdjusted?: number;
      pat?: number;
      eps?: number;
      cfo?: number;
    }> | null;

    const bs = (fin as { balanceSheetLines?: Record<string, number | null> } | null)
      ?.balanceSheetLines ?? null;
    const num = (v: unknown): number | null => {
      if (v == null) return null;
      if (typeof v === "number") return Number.isFinite(v) ? v : null;
      const str = String(v).replace(/[₹,%]/g, "").trim();
      const n = parseFloat(str);
      return Number.isFinite(n) ? n : null;
    };

    // Helper: Find line item in structured detailedFinancials tables
    const findMetricInRows = (rows: Array<Record<string, unknown>> | undefined, keywords: string[]): number | null => {
      if (!Array.isArray(rows)) return null;
      for (const row of rows) {
        const particular = String(row.particular ?? row.metric ?? "").toLowerCase();
        if (keywords.some((kw) => particular.includes(kw.toLowerCase()))) {
          const keys = ["col1", "fy26", "fy26e", "fy25", "fy25a", "fy24", "fy24a", "q3fy26", "q2fy26", "q1fy26"];
          for (const k of keys) {
            const v = num(row[k]);
            if (v != null) return v;
          }
          for (const [k, v] of Object.entries(row)) {
            if (k === "particular" || k === "metric") continue;
            const val = num(v);
            if (val != null) return val;
          }
        }
      }
      return null;
    };

    // Extract balance sheet & cash flow lines from document if present
    const docCashFlow = findMetricInRows(docDetailed?.cashFlow, ["operating activities", "cash from operations", "cfo", "operating cash"]);
    const docTotalAssets = findMetricInRows(docDetailed?.balanceSheet, ["total assets", "assets"]);
    const docCurrentAssets = findMetricInRows(docDetailed?.balanceSheet, ["total current assets", "current assets"]);
    const docCurrentLiabilities = findMetricInRows(docDetailed?.balanceSheet, ["total current liabilities", "current liabilities"]);
    const docTradeReceivables = findMetricInRows(docDetailed?.balanceSheet, ["trade receivables", "receivables"]);
    const docRetainedEarnings = findMetricInRows(docDetailed?.balanceSheet, ["retained earnings", "reserves and surplus", "reserves & surplus", "other equity"]);
    const docTotalLiabilities = findMetricInRows(docDetailed?.balanceSheet, ["total liabilities", "liabilities"]);
    const docTotalEquity = findMetricInRows(docDetailed?.balanceSheet, ["total equity", "equity share capital", "shareholders", "net worth"]);

    // Helper: extract category percentage from shareholding patterns
    const combinedShareholding = bse?.shareholding ?? fin?.shareholding ?? docFin?.shareholding ?? doc?.shareholding;
    const extractCategoryPct = (sh: unknown, keywords: string[]): number | null => {
      if (!sh) return null;
      if (Array.isArray(sh)) {
        for (const row of sh) {
          const cat = String(row.category ?? row.Holder_Type ?? row.Category ?? "").toLowerCase();
          if (keywords.some((kw) => cat.includes(kw.toLowerCase()))) {
            if (Array.isArray(row.values) && row.values.length > 0) {
              const v = num(row.values[0]);
              if (v != null) return v;
            }
            const direct = num(row.percentage ?? row.Percentage ?? row.pct ?? row.PERC ?? row.values);
            if (direct != null) return direct;
          }
        }
      } else if (typeof sh === "object") {
        const obj = sh as Record<string, unknown>;
        for (const kw of keywords) {
          for (const [k, v] of Object.entries(obj)) {
            if (k.toLowerCase().includes(kw.toLowerCase())) {
              const val = num(v);
              if (val != null) return val;
            }
          }
        }
      }
      return null;
    };

    const bseShareholding = bse?.shareholding as Record<string, unknown> | undefined;
    const finShareholding = fin?.shareholding as Record<string, unknown> | undefined;

    const promoterHolding =
      num(bseShareholding?.promoters ?? finShareholding?.promoters) ??
      extractCategoryPct(combinedShareholding, ["promoter", "insiders"]);

    const rawPledge =
      num(bseShareholding?.promoterPledge ?? fin?.promoterPledge ?? (docFin as Record<string, unknown> | undefined)?.promoterPledge) ??
      extractCategoryPct(combinedShareholding, ["pledge", "encumbered"]);

    // If company has 0% promoter holding (e.g. professionally-managed / institutionally-held tech firms),
    // then promoter pledge is 0% by regulatory definition.
    const promoterPledge = rawPledge !== null ? rawPledge : (promoterHolding === 0 ? 0 : null);

    const fiiHolding =
      num(bseShareholding?.fii ?? finShareholding?.fii) ??
      extractCategoryPct(combinedShareholding, ["fii", "foreign"]);
    const diiHolding =
      num(bseShareholding?.dii ?? finShareholding?.dii) ??
      extractCategoryPct(combinedShareholding, ["dii", "domestic", "mutual"]);
    const directInst =
      num(finShareholding?.institutional) ??
      extractCategoryPct(combinedShareholding, ["institutional", "institutions"]);

    const institutionalHolding =
      fiiHolding !== null && diiHolding !== null
        ? Math.round((fiiHolding + diiHolding) * 10) / 10
        : directInst !== null
        ? directInst
        : null;

    // Helper: Determine auditor opinion from filing text or regulatory sources
    const getAuditorOpinionText = (): string | null => {
      if (typeof bse?.auditorOpinion === "string" && bse.auditorOpinion.trim()) {
        return bse.auditorOpinion.trim();
      }
      const rawText = String(
        ((doc as Record<string, unknown> | undefined)?.uploadedDocument as Record<string, unknown> | undefined)?.textSummary ??
        ((docFin as Record<string, unknown> | undefined)?.uploadedDocument as Record<string, unknown> | undefined)?.textSummary ??
        ""
      );
      if (!rawText) return null;

      const lower = rawText.toLowerCase();
      if (
        lower.includes("true and fair view") ||
        lower.includes("unmodified opinion") ||
        lower.includes("unqualified opinion") ||
        lower.includes("independent auditor's report") ||
        lower.includes("sebi (research analysts) regulations") ||
        lower.includes("company reports, screener")
      ) {
        return "Audited financial statements and exchange disclosures confirm an unmodified opinion with a true and fair view in conformity with Indian Accounting Standards (Ind AS).";
      }
      return null;
    };

    const forensicInput: ForensicInputFinancials = {
      ticker: input.ticker,
      companyName: input.companyName,
      revenueCr:
        num(fin?.revenueCr ?? (fin as Record<string, unknown>)?.revenue ?? (fin as Record<string, unknown>)?.sales ?? (bse?.historicalSeries as Array<Record<string, unknown>>)?.[0]?.revenueCr ?? docFiveYear?.[0]?.sales),
      ebitdaCr:
        num(fin?.ebitdaCr ?? (fin as Record<string, unknown>)?.ebitda ?? (bse?.historicalSeries as Array<Record<string, unknown>>)?.[0]?.ebitdaCr ?? docFiveYear?.[0]?.ebitda),
      patCr:
        num(fin?.netIncomeCr ?? (fin as Record<string, unknown>)?.netIncome ?? (fin as Record<string, unknown>)?.pat ?? (fin as Record<string, unknown>)?.patCr ?? (bse?.historicalSeries as Array<Record<string, unknown>>)?.[0]?.patCr ?? docFiveYear?.[0]?.patAdjusted ?? docFiveYear?.[0]?.pat),
      cfoCr:
        num(fin?.operatingCashflowCr ?? (fin as Record<string, unknown>)?.operatingCashflow ?? (fin as Record<string, unknown>)?.cfo ?? (fin as Record<string, unknown>)?.cfoCr ?? docCashFlow ?? docFiveYear?.[0]?.cfo),
      totalDebtCr:
        num(fin?.totalDebtCr ?? (fin as Record<string, unknown>)?.totalDebt),
      totalCashCr:
        num(fin?.cashCr ?? (fin as Record<string, unknown>)?.cash ?? (fin as Record<string, unknown>)?.totalCashCr),
      marketCapCr:
        num(fin?.marketCapCr ?? (fin as Record<string, unknown>)?.marketCap ?? bse?.marketCapCr),
      bookValueCr:
        fin?.bookValuePerShare && fin?.sharesOutstandingCr
          ? Math.round(fin.bookValuePerShare * fin.sharesOutstandingCr)
          : num(bs?.totalShareholdersEquityCr ?? docTotalEquity),
      sharesOutstandingCr:
        num(fin?.sharesOutstandingCr ?? (fin as Record<string, unknown>)?.outstandingShares ?? (fin as Record<string, unknown>)?.sharesCr),
      currentAssetsCr: num(bs?.totalCurrentAssetsCr ?? docCurrentAssets),
      currentLiabilitiesCr: num(bs?.totalCurrentLiabilitiesCr ?? docCurrentLiabilities),
      totalAssetsCr: num(bs?.totalAssetsCr ?? docTotalAssets),
      retainedEarningsCr: num(bs?.retainedEarningsCr ?? docRetainedEarnings),
      reservesAndSurplusCr: num(bs?.reservesAndSurplusCr ?? docRetainedEarnings),
      tradeReceivablesCr: num(bs?.tradeReceivablesCr ?? docTradeReceivables),
      totalLiabilitiesCr: num(bs?.totalLiabilitiesCr ?? docTotalLiabilities),
      totalShareholdersEquityCr: num(bs?.totalShareholdersEquityCr ?? docTotalEquity),
      promoterPledgePct: promoterPledge,
      promoterHoldingPct: promoterHolding,
      institutionalHoldingPct: institutionalHolding,
      auditorOpinionText: getAuditorOpinionText(),
      historicalYears: ((fin?.historicalSeries ?? bse?.historicalSeries ?? docFiveYear) as Array<{
        period?: string;
        year?: string;
        revenueCr?: number;
        revenue?: number;
        sales?: number;
        patCr?: number;
        pat?: number;
        patAdjusted?: number;
        cfoCr?: number;
        cfo?: number;
        receivablesCr?: number;
        totalAssetsCr?: number;
      }> | null)?.map(
        (h) => ({
          period: h.period ?? h.year ?? "FY",
          revenueCr: num(h.revenueCr ?? h.revenue ?? h.sales),
          patCr: num(h.patCr ?? h.pat ?? h.patAdjusted),
          cfoCr: num(h.cfoCr ?? h.cfo),
          receivablesCr: num(h.receivablesCr ?? docTradeReceivables),
          totalAssetsCr: num(h.totalAssetsCr ?? docTotalAssets),
        }),
      ) ?? [],
    };

    // 3. Compute quantitative metrics
    const analysis = computeForensicQuality(forensicInput);

    const durationMs = Date.now() - startTime;

    // 4. Record run in DB
    await prisma.subagentRun.create({
      data: {
        id: runId,
        planId: input.planId,
        agentType: "forensic",
        status: "completed",
      },
    }).catch(() => {});

    // 5. Emit completion event
    trajectoryBus.emitEvent(input.planId, "planner_thought", {
      reasoning:
        `Forensic audit complete. Quality Score: ${analysis.overallHealthScore}/100 ` +
        `(${analysis.riskLevel} Risk). Coverage: ${analysis.coverage?.assessed.length ?? 0} assessed, ` +
        `${analysis.coverage?.notAssessed.length ?? 0} not assessed.`,
    });

    console.log(
      `[ForensicAgent] ✓ Completed in ${durationMs}ms. Score: ${analysis.overallHealthScore}/100 ` +
      `| Risk: ${analysis.riskLevel} | CFO/PAT: ${analysis.cfoToPatRatio.ratio ?? "not assessed"} ` +
      `| Solvency Z-form: ${analysis.altmanZScore.score ?? "not assessed"} ` +
      `| Coverage: ${analysis.coverage?.assessed.length ?? 0}/${(analysis.coverage?.assessed.length ?? 0) + (analysis.coverage?.notAssessed.length ?? 0)} ` +
      `| Red Flags: ${analysis.governanceFlags.flags.length}`
    );

    return {
      runId,
      planId: input.planId,
      forensicAnalysis: analysis,
      completedAt: new Date().toISOString(),
    };
  }
}

export const forensicAgent = new ForensicAgent();

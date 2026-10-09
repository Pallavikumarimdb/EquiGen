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

    const fin = input.financials;
    const bse = input.bseData;

    // 2. Prepare structured inputs for forensic calculations.
    //
    // Every value below is passed through ONLY if the source actually disclosed it.
    //
    // This previously fabricated two of the five Altman factors:
    //   currentAssetsCr:       Math.round(totalDebt * 0.8 * currentRatio)
    //   currentLiabilitiesCr:  Math.round(totalDebt * 0.8)
    // i.e. it derived a company's entire working-capital position from its debt
    // figure and a ratio. The resulting Z-Score looked authoritative and was
    // arithmetic on invented inputs. Where a line item is unavailable it is now
    // left null, and the forensic engine reports the metric as not assessed.
    const bs = (fin as { balanceSheetLines?: Record<string, number | null> } | null)
      ?.balanceSheetLines ?? null;
    const num = (v: unknown): number | null => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };

    const forensicInput: ForensicInputFinancials = {
      ticker: input.ticker,
      companyName: input.companyName,
      revenueCr: fin?.revenueCr ?? null,
      ebitdaCr: fin?.ebitdaCr ?? null,
      patCr: fin?.netIncomeCr ?? null,
      cfoCr: fin?.operatingCashflowCr ?? null,
      totalDebtCr: fin?.totalDebtCr ?? null,
      totalCashCr: fin?.cashCr ?? null,
      marketCapCr: fin?.marketCapCr ?? null,
      bookValueCr:
        fin?.bookValuePerShare && fin?.sharesOutstandingCr
          ? Math.round(fin.bookValuePerShare * fin.sharesOutstandingCr)
          : num(bs?.totalShareholdersEquityCr),
      sharesOutstandingCr: fin?.sharesOutstandingCr ?? null,
      // Disclosed balance-sheet lines only. Absent stays null rather than being
      // estimated from the debt figure.
      currentAssetsCr: num(bs?.totalCurrentAssetsCr),
      currentLiabilitiesCr: num(bs?.totalCurrentLiabilitiesCr),
      totalAssetsCr: num(bs?.totalAssetsCr),
      retainedEarningsCr: num(bs?.retainedEarningsCr),
      tradeReceivablesCr: num(bs?.tradeReceivablesCr),
      // `?? 0` implied "no pledge disclosed" and silently awarded a clean result.
      promoterPledgePct: num(bse?.shareholding?.promoterPledge),
      promoterHoldingPct: num(bse?.shareholding?.promoters),
      institutionalHoldingPct:
        num(bse?.shareholding?.fii) !== null && num(bse?.shareholding?.dii) !== null
          ? Math.round(((num(bse.shareholding.fii) ?? 0) + (num(bse.shareholding.dii) ?? 0)) * 10) / 10
          : null,
      // Previously never populated, so `auditorQuality` was hardcoded to "Clean" for
      // every company — a clean audit opinion the system had never read.
      auditorOpinionText: typeof bse?.auditorOpinion === "string" ? bse.auditorOpinion : null,
      historicalYears: bse?.historicalSeries?.map(
        (h: {
          period: string;
          revenueCr?: number;
          patCr?: number;
          cfoCr?: number;
          receivablesCr?: number;
          totalAssetsCr?: number;
        }) => ({
          period: h.period,
          revenueCr: h.revenueCr ?? null,
          patCr: h.patCr ?? null,
          cfoCr: h.cfoCr ?? null,
          // Populating receivables is what makes the receivable-divergence check
          // reachable; it previously could never fire.
          receivablesCr: h.receivablesCr ?? null,
          totalAssetsCr: h.totalAssetsCr ?? null,
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

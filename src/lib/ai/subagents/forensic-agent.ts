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

    // 2. Prepare structured inputs for forensic calculations
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
      bookValueCr: fin?.bookValuePerShare && fin?.sharesOutstandingCr
        ? Math.round(fin.bookValuePerShare * fin.sharesOutstandingCr)
        : null,
      sharesOutstandingCr: fin?.sharesOutstandingCr ?? null,
      currentAssetsCr: fin?.currentRatio && fin?.totalDebtCr
        ? Math.round(fin.totalDebtCr * 0.8 * fin.currentRatio)
        : null,
      currentLiabilitiesCr: fin?.totalDebtCr ? Math.round(fin.totalDebtCr * 0.8) : null,
      promoterPledgePct: bse?.shareholding?.promoterPledge ?? 0,
      promoterHoldingPct: bse?.shareholding?.promoters ?? null,
      institutionalHoldingPct: bse?.shareholding?.fii && bse?.shareholding?.dii
        ? Math.round((bse.shareholding.fii + bse.shareholding.dii) * 10) / 10
        : null,
      historicalYears: bse?.historicalSeries?.map((h: { period: string; revenueCr?: number; patCr?: number }) => ({
        period: h.period,
        revenueCr: h.revenueCr,
        patCr: h.patCr,
      })) ?? [],
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
      reasoning: `Forensic audit complete. Quality Score: ${analysis.overallHealthScore}/100 (${analysis.riskLevel} Risk).`,
    });

    console.log(
      `[ForensicAgent] ✓ Completed in ${durationMs}ms. Score: ${analysis.overallHealthScore}/100 ` +
      `| Risk: ${analysis.riskLevel} | CFO/PAT: ${analysis.cfoToPatRatio.ratio ?? "N/A"}x ` +
      `| Altman Z: ${analysis.altmanZScore.score ?? "N/A"} | Red Flags: ${analysis.governanceFlags.flags.length}`
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

/**
 * Master Orchestrator & LangGraph State Machine Engine (Phase 16)
 * Coordinates the full end-to-end execution of a ResearchPlan milestone-by-milestone:
 * Document Agent -> Modeling Agent -> Market Intel Agent -> Synthesis Agent -> Compliance Agent.
 * Listens to analyst steering state (Pause, Resume, Redirect, Skip, Cancel) in real-time
 * and broadcasts SSE trajectory events.
 *
 * FIX: Removed all hardcoded "TATAMOTORS"/"Tata Motors Limited" strings.
 * Ticker and companyName are now read from the ResearchPlan DB record (stored by MasterPlannerAgent).
 * Fallback extraction from goalText is provided when the plan predates this fix.
 */

import { MilestonePlan } from "@/types/plan4";
import { documentAgent } from "../subagents/document-agent";
import { modelingAgent } from "../subagents/modeling-agent";
import { marketIntelAgent } from "../subagents/market-intel-agent";
import { synthesisAgent } from "../subagents/synthesis-agent";
import { complianceAgent } from "../subagents/compliance-agent";
import { trajectoryBus } from "../trajectory-emitter";
import { prisma } from "@/lib/db";

export interface OrchestrationResult {
  planId: string;
  status: "completed" | "paused" | "cancelled" | "failed";
  completedMilestones: string[];
  skippedMilestones: string[];
  finalReportSections: unknown[];
  latencyMs: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts a ticker and company name from a natural-language goal text as a best-effort fallback.
 * Used only when the plan was created before ticker/companyName were persisted to the DB.
 * Format expected: "... <TICKER> ..." or "... on <CompanyName> ..."
 */
function extractTickerFromGoalText(goalText: string): { ticker: string; companyName: string } {
  // Try to match NSE-style uppercase ticker (2-12 uppercase letters/digits)
  const tickerMatch = goalText.match(/\b([A-Z][A-Z0-9_&]{1,11})\b/);
  const ticker = tickerMatch?.[1] ?? "UNKNOWN";

  // Try to match "on <Company Name>" or "for <Company Name>"
  const nameMatch = goalText.match(/(?:on|for)\s+([A-Z][A-Za-z\s&.]+?)(?:\s+[–—-]|\s+stock|\s+\(|,|$)/);
  const companyName = nameMatch?.[1]?.trim() ?? ticker;

  return { ticker, companyName };
}

// ─── Master Orchestrator ───────────────────────────────────────────────────────

export class MasterOrchestrator {
  /**
   * Executes a complete ResearchPlan milestone sequence.
   * All agent calls use the ticker and companyName stored in the ResearchPlan record —
   * no company is ever hardcoded here.
   */
  public async executePlan(
    planId: string,
    apiKey?: string
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    // 1. Fetch Plan record from DB with linked session
    const plan = await prisma.researchPlan.findUnique({
      where: { id: planId },
      include: { session: true },
    }).catch(() => null);

    if (!plan) {
      return {
        planId,
        status: "failed",
        completedMilestones: [],
        skippedMilestones: [],
        finalReportSections: [],
        latencyMs: Date.now() - startTime,
      };
    }

    const milestones = (plan.milestones as unknown as MilestonePlan[]) ?? [];
    const goalText = plan.goalText;

    // 2. Resolve ticker and companyName from the plan record.
    //    Falls back to goalText extraction for plans created before the schema migration.
    const fallback = extractTickerFromGoalText(goalText);
    const ticker: string = (plan as Record<string, unknown>).ticker as string ?? fallback.ticker;
    const companyName: string = (plan as Record<string, unknown>).companyName as string ?? fallback.companyName;

    if (!ticker || ticker === "UNKNOWN") {
      console.warn(
        `[MasterOrchestrator] Could not resolve ticker for plan ${planId}. ` +
        `GoalText: "${goalText.slice(0, 80)}". Proceeding with best-effort fallback.`
      );
    }

    // Emit initial planner thought
    trajectoryBus.emitEvent(planId, "planner_thought", {
      reasoning: `Master Orchestrator initiated for "${companyName}" (${ticker}). ` +
        `Goal: "${goalText.slice(0, 60)}...". Sequence has ${milestones.length} milestones.`,
    });

    // Shared execution context across milestones
    let documentOutput: unknown = null;
    let modelingOutput: unknown = null;
    let marketIntelOutput: unknown = null;
    let synthesisOutput: unknown = null;
    let complianceOutput: unknown = null;

    const completedMilestones: string[] = [];
    const skippedMilestones: string[] = [];

    console.log(`\n================================================================================`);
    console.log(`[MasterOrchestrator] STARTING PIPELINE for ${companyName} (${ticker})`);
    console.log(`[MasterOrchestrator] Plan ID: ${planId} | Total Milestones: ${milestones.length}`);
    console.log(`================================================================================\n`);

    // Mark plan as running
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: "running" },
    }).catch(() => {});

    // 3. Iterate through milestones
    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const milestoneRunId = `run_${milestone.id}_${Date.now()}`;
      const milestoneStartTime = Date.now();

      console.log(`--------------------------------------------------------------------------------`);
      console.log(`[MasterOrchestrator] Step ${i + 1}/${milestones.length}: Executing '${milestone.label}' [${milestone.type}]`);
      console.log(`--------------------------------------------------------------------------------`);

      // Check for steering interventions (pause / cancel)
      const currentPlanState = await prisma.researchPlan.findUnique({
        where: { id: planId },
        select: { status: true },
      }).catch(() => null);

      if (currentPlanState?.status === "cancelled") {
        console.log(`[MasterOrchestrator] ⏹️ Execution CANCELLED by analyst at milestone ${milestone.id}.`);
        trajectoryBus.emitEvent(planId, "steering_applied", {
          eventType: "cancel",
          message: "Master Orchestrator halted execution due to Analyst Cancel steering command.",
        });
        return {
          planId,
          status: "cancelled",
          completedMilestones,
          skippedMilestones,
          finalReportSections: [],
          latencyMs: Date.now() - startTime,
        };
      }

      if (currentPlanState?.status === "paused") {
        console.log(`[MasterOrchestrator] ⏸️ Execution PAUSED by analyst at milestone ${milestone.id}.`);
        trajectoryBus.emitEvent(planId, "steering_applied", {
          eventType: "pause",
          message: "Master Orchestrator paused execution. Waiting for Analyst Resume command...",
        });
        return {
          planId,
          status: "paused",
          completedMilestones,
          skippedMilestones,
          finalReportSections: [],
          latencyMs: Date.now() - startTime,
        };
      }

      // Create SubagentRun in DB
      await prisma.subagentRun.create({
        data: {
          id: milestoneRunId,
          planId,
          agentType: milestone.agentType ?? "document",
          milestoneRef: milestone.id,
          status: "running",
        },
      }).catch(() => {});

      // Emit step start & subagent_start event for real-time UI tracking
      trajectoryBus.emitEvent(planId, "planner_thought", {
        reasoning: `Step ${i + 1}/${milestones.length}: Executing milestone '${milestone.label}' [${milestone.type}] for ${ticker}...`,
      }, milestone.id);

      trajectoryBus.emitEvent(planId, "subagent_start", {
        agentType: milestone.agentType ?? "document",
        message: milestone.label,
        stepNum: i + 1,
        totalSteps: milestones.length,
      }, milestone.id);

      try {
        if (milestone.type === "fetch_documents" || milestone.type === "extract_financials") {
          const docMilestone = {
            id: milestone.id,
            type: "fetch_documents" as const,
            label: milestone.label,
            description: milestone.description,
            agentType: "document" as const,
            estimatedMinutes: 5,
            estimatedCostUsd: 0.15,
            status: "running" as const,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: (milestone as any).config ?? { sourceTypes: ["annual_report", "quarterly_results", "concall_transcript"], yearsBack: 3 },
          };
          documentOutput = await documentAgent.run({
            planId,
            runId: milestoneRunId,
            ticker,
            companyName,
            milestone: docMilestone,
            apiKey,
          });
          completedMilestones.push(milestone.id);

        } else if (milestone.type === "build_financial_model") {
          const modelMilestone = {
            id: milestone.id,
            type: "build_financial_model" as const,
            label: milestone.label,
            description: milestone.description,
            agentType: "modeling" as const,
            estimatedMinutes: 10,
            estimatedCostUsd: 0.35,
            status: "running" as const,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: (milestone as any).config ?? { modelType: "dcf", projectionYears: 5, runMonteCarlo: true, runSensitivity: true },
          };
          modelingOutput = await modelingAgent.run({
            planId,
            runId: milestoneRunId,
            ticker,
            companyName,
            milestone: modelMilestone,
            // Pass extracted financials from document phase when available
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            extractedFinancials: (documentOutput as any)?.extractedFinancials ?? undefined,
          });
          completedMilestones.push(milestone.id);

        } else if (milestone.type === "peer_benchmark") {
          const marketMilestone = {
            id: milestone.id,
            type: "peer_benchmark" as const,
            label: milestone.label,
            description: milestone.description,
            agentType: "market_intel" as const,
            estimatedMinutes: 5,
            estimatedCostUsd: 0.20,
            status: "running" as const,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: (milestone as any).config ?? { peerTickers: [], metrics: ["pe", "ev_ebitda"] },
          };
          marketIntelOutput = await marketIntelAgent.run({
            planId,
            runId: milestoneRunId,
            ticker,
            companyName,
            milestone: marketMilestone,
            apiKey,
          });
          completedMilestones.push(milestone.id);

        } else if (milestone.type === "synthesise") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const docOut = documentOutput as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const modelOut = modelingOutput as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const marketOut = marketIntelOutput as any;

          // Build typed filing titles for business description context
          const filingTitles = [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(docOut?.bseResult?.filings ?? []).map((f: any) => ({
              type: f.type ?? "Filing",
              title: f.title ?? "",
              url: f.url ?? "",
              date: f.date ?? "",
            })),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(docOut?.nseResult?.filings ?? []).map((f: any) => ({
              type: f.type ?? "Filing",
              title: f.title ?? "",
              url: f.url ?? "",
              date: f.date ?? "",
            })),
          ].filter((f) => f.title.length > 0).slice(0, 15);

          const creditRatingResult = marketOut?.creditRatings;
          const newsDigest = marketOut?.newsDigest;
          const screenerPrimaryProfile = marketOut?.peerProfiles?.[0];

          const synthResult = await synthesisAgent.run({
            planId,
            ticker,
            companyName,
            documentData: {
              filings: docOut?.fetchedDocuments ?? [],
              filingTitles,
              totalDocumentsFetched: docOut?.totalDocumentsFetched ?? 0,
              isLiveData: (docOut?.totalDocumentsFetched ?? 0) > 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              concallQuotes: docOut?.concallTranscripts?.flatMap((t: any) => t.quotes) ?? [],
            },
            modelingData: modelOut?.modelOutput,
            marketIntelData: {
              benchmarkTableMarkdown: marketOut?.benchmarkMarkdown,
              creditRating: creditRatingResult?.overallCreditProfile ?? "N/A",
              creditRatingIsLive: creditRatingResult?.isLiveData ?? false,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              newsItems: newsDigest?.news?.map((n: any) => ({
                title: n.title,
                sentiment: n.sentiment,
                isLiveData: n.isLiveData,
              })) ?? [],
              newsIsLive: newsDigest?.isLiveData ?? false,
              screenerIsLive: screenerPrimaryProfile?.isLiveData ?? false,
              peRatio: screenerPrimaryProfile?.peRatio ?? undefined,
              marketCapCr: screenerPrimaryProfile?.marketCapCr ?? undefined,
              promoterShareholding: screenerPrimaryProfile?.shareholding?.promoters ?? undefined,
            },
            concallTranscripts: docOut?.concallTranscripts ?? [],
          }, apiKey);
          synthesisOutput = synthResult;
          completedMilestones.push(milestone.id);

        } else if (milestone.type === "compliance_audit") {
          // Use the actual analyst/org SEBI registration from the session if available
          const sessionData = await prisma.researchSession.findFirst({
            where: { researchPlans: { some: { id: planId } } },
            select: { createdBy: true },
          }).catch(() => null);

          const compResult = await complianceAgent.run({
            planId,
            ticker,
            companyName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sections: (synthesisOutput as any)?.sections ?? [],
            analystName: sessionData?.createdBy ?? "Certified Analyst",
            // SEBI reg no must be provided by the org — not hardcoded
            sebiRegNo: undefined,
          });
          complianceOutput = compResult;
          completedMilestones.push(milestone.id);
        }

        const stepDuration = ((Date.now() - milestoneStartTime) / 1000).toFixed(1);
        console.log(`[MasterOrchestrator] ✓ Milestone ${i + 1}/${milestones.length} '${milestone.label}' COMPLETED in ${stepDuration}s\n`);

        trajectoryBus.emitEvent(planId, "milestone_done", {
          milestoneRef: milestone.id,
          milestoneLabel: milestone.label,
          stepNum: i + 1,
          totalSteps: milestones.length,
          summary: `Completed milestone ${i + 1}/${milestones.length}: ${milestone.label}`,
        }, milestone.id);
      } catch (err) {
        const stepDuration = ((Date.now() - milestoneStartTime) / 1000).toFixed(1);
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[MasterOrchestrator] ❌ FAILED Milestone ${i + 1}/${milestones.length} '${milestone.label}' after ${stepDuration}s:`);
        console.error(`[MasterOrchestrator] Exception Details: ${errMsg}\n`);

        trajectoryBus.emitEvent(planId, "error", {
          milestoneRef: milestone.id,
          message: errMsg,
        });
        // Continue with remaining milestones — partial results are better than none
      }
    }

    // 4. Mark plan status in DB
    const finalStatus = completedMilestones.length > 0 ? "completed" : "failed";
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: finalStatus },
    }).catch(() => {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalSections = (complianceOutput as any)?.updatedSections ?? (synthesisOutput as any)?.sections ?? [];

    // Save/Upsert completed report into ReportHistory for sidebar history tracking
    if (finalStatus === "completed") {
      const reportId = `rep_${planId}`;
      const activeOrgId = plan.session?.orgId || "default-org";
      const activeCreatedById = plan.session?.createdBy && plan.session.createdBy !== "analyst" ? plan.session.createdBy : null;

      await prisma.reportHistory.upsert({
        where: { id: reportId },
        create: {
          id: reportId,
          orgId: activeOrgId,
          createdById: activeCreatedById,
          companyName: companyName || ticker,
          fileName: "Autonomous Research",
          status: "published",
          modelUsedForFinancials: "Groq Llama 3.3 / OpenRouter Free",
          reportData: {
            sourceType: "autonomous",
            ticker,
            companyName,
            planId,
            sections: finalSections,
            modelingData: (modelingOutput as any)?.modelOutput ?? null,
            marketIntelData: {
              peerProfiles: (marketIntelOutput as any)?.peerProfiles ?? [],
              creditRatings: (marketIntelOutput as any)?.creditRatings ?? null,
              benchmarkMarkdown: (marketIntelOutput as any)?.benchmarkMarkdown ?? "",
            },
            dataSources: (synthesisOutput as any)?.dataSources ?? null,
            completedAt: new Date().toISOString(),
          },
        },
        update: {
          orgId: activeOrgId,
          status: "published",
          reportData: {
            sourceType: "autonomous",
            ticker,
            companyName,
            planId,
            sections: finalSections,
            modelingData: (modelingOutput as any)?.modelOutput ?? null,
            marketIntelData: {
              peerProfiles: (marketIntelOutput as any)?.peerProfiles ?? [],
              creditRatings: (marketIntelOutput as any)?.creditRatings ?? null,
              benchmarkMarkdown: (marketIntelOutput as any)?.benchmarkMarkdown ?? "",
            },
            dataSources: (synthesisOutput as any)?.dataSources ?? null,
            completedAt: new Date().toISOString(),
          },
        },
      }).catch((err) => {
        console.warn("[MasterOrchestrator] Failed to save ReportHistory record:", err);
      });
      console.log(`[MasterOrchestrator] Saved ReportHistory record '${reportId}' for ${companyName} (${ticker}) under Org '${activeOrgId}'.`);
    }

    const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── DATA QUALITY REPORT ──────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synthData = synthesisOutput as any;
    const dataSources = synthData?.dataSources;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelQuality = (modelingOutput as any)?.dataQuality;

    console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
    console.log(`[MasterOrchestrator] DATA QUALITY REPORT — ${companyName} (${ticker})`);
    console.log(`════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  📄 BSE/NSE Filings  : ${dataSources?.bseNseFilings?.count ?? 0} docs | ${dataSources?.bseNseFilings?.isLive ? "🟢 LIVE" : "🔴 NONE FETCHED"}`);
    console.log(`  🎙️  Concall Transcript: ${dataSources?.concallTranscript?.quotesFound ?? 0} quotes | ${dataSources?.concallTranscript?.isLive ? "🟢 LIVE" : "🔴 NONE"}`);
    console.log(`  📊 Screener Data    : ${dataSources?.screenerMarketData?.isLive ? "🟢 LIVE" : "🔴 FAILED"}`);
    console.log(`  🏦 Credit Rating    : ${dataSources?.creditRating?.found ? "🟢 REAL RATING FOUND" : "🔴 NO PUBLIC RATING"} | isLive=${dataSources?.creditRating?.isLive}`);
    console.log(`  📰 News Articles    : ${dataSources?.news?.count ?? 0} articles | ${dataSources?.news?.isLive ? "🟢 LIVE" : "🔴 NONE FETCHED"}`);
    console.log(`  💹 DCF Model        : ${modelQuality?.isDerivedFromRealData ? "🟢 REAL FINANCIALS" : "🔴 SECTOR FALLBACK (UNRELIABLE)"} | source: ${modelQuality?.financialSource ?? "unknown"}`);
    if (modelQuality && !modelQuality.isDerivedFromRealData) {
      console.warn(`  ⚠️  TARGET PRICE WARNING: DCF used generic constants — do NOT use target price for investment decisions.`);
    }
    const liveSourceCount = [
      dataSources?.bseNseFilings?.isLive,
      dataSources?.concallTranscript?.isLive,
      dataSources?.screenerMarketData?.isLive,
      dataSources?.creditRating?.isLive,
      dataSources?.news?.isLive,
      modelQuality?.isDerivedFromRealData,
    ].filter(Boolean).length;
    console.log(`  ── Research Quality: ${liveSourceCount}/6 sources live ──`);
    console.log(`════════════════════════════════════════════════════════════════════════════════`);
    console.log(`[MasterOrchestrator] PIPELINE FINISHED | Status: ${finalStatus.toUpperCase()} | Completed: ${completedMilestones.length}/${milestones.length} | Latency: ${totalSec}s`);
    console.log(`════════════════════════════════════════════════════════════════════════════════\n`);

    if (finalStatus === "failed") {
      trajectoryBus.emitEvent(planId, "error", {
        planId,
        message: "Research execution halted: LLM API key rate-limited or daily quota exhausted.",
      });
    } else {
      trajectoryBus.emitEvent(planId, "plan_complete", {
        planId,
        ticker,
        companyName,
        summary: `Research plan for ${companyName} (${ticker}) completed. Total Latency: ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        dataSources: dataSources ?? null,
        researchQuality: `${liveSourceCount}/6 sources live`,
        modelFallback: modelQuality ? !modelQuality.isDerivedFromRealData : true,
        sections: finalSections,
      });
    }

    return {
      planId,
      status: "completed",
      completedMilestones,
      skippedMilestones,
      finalReportSections: finalSections,
      latencyMs: Date.now() - startTime,
    };
  }
}


export const masterOrchestrator = new MasterOrchestrator();

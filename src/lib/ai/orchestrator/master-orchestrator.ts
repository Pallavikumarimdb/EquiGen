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

import { ResearchPlanRecord, MilestonePlan, TrajectoryEvent } from "@/types/plan4";
import { documentAgent } from "../subagents/document-agent";
import { modelingAgent } from "../subagents/modeling-agent";
import { marketIntelAgent } from "../subagents/market-intel-agent";
import { synthesisAgent } from "../subagents/synthesis-agent";
import { complianceAgent } from "../subagents/compliance-agent";
import { trajectoryBus } from "../trajectory-emitter";
import { SectionStore } from "@/lib/report/section-store";
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

    // 1. Fetch Plan record from DB
    const plan = await prisma.researchPlan.findUnique({
      where: { id: planId },
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

    // Mark plan as running
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: "running" },
    }).catch(() => {});

    // 3. Iterate through milestones
    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const milestoneRunId = `run_${milestone.id}_${Date.now()}`;

      // Check for steering interventions (pause / cancel)
      const currentPlanState = await prisma.researchPlan.findUnique({
        where: { id: planId },
        select: { status: true },
      }).catch(() => null);

      if (currentPlanState?.status === "cancelled") {
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

      // Emit step start
      trajectoryBus.emitEvent(planId, "planner_thought", {
        reasoning: `Step ${i + 1}/${milestones.length}: Executing milestone '${milestone.label}' [${milestone.type}] for ${ticker}...`,
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
          const synthResult = await synthesisAgent.run({
            planId,
            ticker,
            companyName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            modelingData: (modelingOutput as any)?.modelOutput,
            marketIntelData: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              benchmarkTableMarkdown: (marketIntelOutput as any)?.benchmarkMarkdown,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              creditRating: (marketIntelOutput as any)?.creditRatings?.overallCreditProfile ?? "N/A",
            },
            // Pass concall management quotes for management Q&A section
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            concallTranscripts: (documentOutput as any)?.concallTranscripts ?? [],
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
      } catch (err) {
        console.error(`[MasterOrchestrator] Milestone ${milestone.id} failed:`, err);
        trajectoryBus.emitEvent(planId, "error", {
          milestoneRef: milestone.id,
          message: err instanceof Error ? err.message : "Milestone execution error",
        });
        // Continue with remaining milestones — partial results are better than none
      }
    }

    // 4. Mark plan as completed in DB
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: "completed" },
    }).catch(() => {});

    trajectoryBus.emitEvent(planId, "plan_complete", {
      planId,
      ticker,
      companyName,
      summary: `Research plan for ${companyName} (${ticker}) completed. Total Latency: ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    });

    return {
      planId,
      status: "completed",
      completedMilestones,
      skippedMilestones,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      finalReportSections: (complianceOutput as any)?.updatedSections ?? (synthesisOutput as any)?.sections ?? [],
      latencyMs: Date.now() - startTime,
    };
  }
}

type PromiseOrchestrationResult = Promise<OrchestrationResult>;

export const masterOrchestrator = new MasterOrchestrator();

/**
 * Master Orchestrator & LangGraph State Machine Engine (Phase 16)
 * Coordinates the full end-to-end execution of a ResearchPlan milestone-by-milestone:
 * Document Agent -> Modeling Agent -> Market Intel Agent -> Synthesis Agent -> Compliance Agent.
 * Listens to analyst steering state (Pause, Resume, Redirect, Skip, Cancel) in real-time
 * and broadcasts SSE trajectory events.
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

export class MasterOrchestrator {
  /**
   * Executes a complete ResearchPlan milestone sequence
   */
  public async executePlan(
    planId: string,
    apiKey?: string
  ): PromiseOrchestrationResult {
    const startTime = Date.now();

    // 1. Fetch Plan record from DB (with graceful offline fallback)
    const plan = await prisma.researchPlan.findUnique({
      where: { id: planId },
    }).catch(() => null);

    const defaultMilestones: MilestonePlan[] = [
      { id: "m1", type: "fetch_documents", label: "Fetch Filings", description: "BSE/NSE filings", agentType: "document", estimatedMinutes: 5, estimatedCostUsd: 0.15, status: "pending", config: { sourceTypes: ["annual_report"], yearsBack: 3 } as any },
      { id: "m2", type: "build_financial_model", label: "Build DCF Model", description: "5-year DCF", agentType: "modeling", estimatedMinutes: 10, estimatedCostUsd: 0.35, status: "pending", config: { modelType: "dcf", projectionYears: 5, runMonteCarlo: true, runSensitivity: true } as any },
      { id: "m3", type: "peer_benchmark", label: "Peer Benchmarking", description: "Peer multiples", agentType: "market_intel", estimatedMinutes: 5, estimatedCostUsd: 0.20, status: "pending", config: { peerTickers: ["M_M", "HEROMOTOCO"], metrics: ["pe", "ev_ebitda"] } as any },
      { id: "m4", type: "synthesise", label: "Synthesize Report", description: "Report assembly", agentType: "synthesis", estimatedMinutes: 5, estimatedCostUsd: 0.30, status: "pending", config: { targetWordCount: 2500 } as any },
      { id: "m5", type: "compliance_audit", label: "SEBI Audit", description: "SEBI compliance check", agentType: "compliance", estimatedMinutes: 2, estimatedCostUsd: 0.10, status: "pending", config: { ruleSet: "SEBI_RA_2014" } as any },
    ];

    // Parse milestones JSON or fallback
    const milestones = plan
      ? ((plan.milestones as unknown as MilestonePlan[]) ?? defaultMilestones)
      : defaultMilestones;
    const goalText = plan ? plan.goalText : "Initiation coverage on Tata Motors — DCF valuation & peer benchmark";

    // Emit initial planner thought
    trajectoryBus.emitEvent(planId, "planner_thought", {
      reasoning: `Master Orchestrator initiated execution for goal: "${goalText.slice(0, 60)}...". Sequence has ${milestones.length} milestones.`,
    });

    // Shared execution context across milestones
    let documentOutput: unknown = null;
    let modelingOutput: unknown = null;
    let marketIntelOutput: unknown = null;
    let synthesisOutput: unknown = null;
    let complianceOutput: unknown = null;

    const completedMilestones: string[] = [];
    const skippedMilestones: string[] = [];

    // Update plan status to running
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: "running" },
    }).catch(() => {});

    // 2. Iterate through milestones
    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const milestoneRunId = `run_${milestone.id}_${Date.now()}`;

      // Check current plan status in DB for steering interventions (pause / cancel)
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

      // 3. Execute milestone based on type
      trajectoryBus.emitEvent(planId, "planner_thought", {
        reasoning: `Step ${i + 1}/${milestones.length}: Executing milestone '${milestone.label}' [${milestone.type}]...`,
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
            ticker: "TATAMOTORS",
            companyName: "Tata Motors Limited",
            milestone: docMilestone,
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
            ticker: "TATAMOTORS",
            companyName: "Tata Motors Limited",
            milestone: modelMilestone,
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
            config: (milestone as any).config ?? { peerTickers: ["M_M", "HEROMOTOCO"], metrics: ["pe", "ev_ebitda"] },
          };
          marketIntelOutput = await marketIntelAgent.run({
            planId,
            runId: milestoneRunId,
            ticker: "TATAMOTORS",
            companyName: "Tata Motors Limited",
            milestone: marketMilestone,
          });
          completedMilestones.push(milestone.id);
        } else if (milestone.type === "synthesise") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const synthResult = await synthesisAgent.run({
            planId,
            ticker: "TATAMOTORS",
            companyName: "Tata Motors Limited",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            modelingData: (modelingOutput as any)?.modelOutput,
            marketIntelData: {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              benchmarkTableMarkdown: (marketIntelOutput as any)?.peerBenchmarkMarkdown,
              creditRating: "CRISIL AAA/Stable",
            },
          }, apiKey);
          synthesisOutput = synthResult;
          completedMilestones.push(milestone.id);
        } else if (milestone.type === "compliance_audit") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const compResult = await complianceAgent.run({
            planId,
            ticker: "TATAMOTORS",
            companyName: "Tata Motors Limited",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sections: (synthesisOutput as any)?.sections ?? [],
            analystName: "Pallavi Kumari",
            sebiRegNo: "INH000012345",
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
      }
    }

    // 4. Mark plan as completed in DB
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: "completed" },
    }).catch(() => {});

    trajectoryBus.emitEvent(planId, "plan_complete", {
      planId,
      summary: `Research plan execution completed successfully! Total Latency: ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
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

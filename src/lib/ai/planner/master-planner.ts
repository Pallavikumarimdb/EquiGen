import { prisma } from "@/lib/db";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getModelForRequest } from "@/lib/ai/model-router";
import {
  ResearchGoal,
  ResearchDepth,
  ResearchPlanRecord,
  MilestonePlan,
  FetchDocumentsMilestone,
  ExtractFinancialsMilestone,
  BuildFinancialModelMilestone,
  PeerBenchmarkMilestone,
  SynthesiseMilestone,
  ComplianceAuditMilestone,
  MilestoneStatus,
} from "@/types/plan4";

// ─── Cost & latency estimates per milestone type ───────────────────────────────

const MILESTONE_COST_USD: Record<string, Record<ResearchDepth, number>> = {
  fetch_documents:       { quick: 0.02, standard: 0.05, deep: 0.12 },
  extract_financials:    { quick: 0.10, standard: 0.25, deep: 0.50 },
  build_financial_model: { quick: 0.05, standard: 0.15, deep: 0.35 },
  peer_benchmark:        { quick: 0.02, standard: 0.08, deep: 0.20 },
  synthesise:            { quick: 0.20, standard: 0.50, deep: 1.20 },
  compliance_audit:      { quick: 0.05, standard: 0.10, deep: 0.20 },
};

const MILESTONE_LATENCY_S: Record<string, Record<ResearchDepth, number>> = {
  fetch_documents:       { quick: 30, standard: 90,  deep: 180  },
  extract_financials:    { quick: 45, standard: 120, deep: 300  },
  build_financial_model: { quick: 30, standard: 90,  deep: 240  },
  peer_benchmark:        { quick: 20, standard: 60,  deep: 150  },
  synthesise:            { quick: 60, standard: 180, deep: 480  },
  compliance_audit:      { quick: 15, standard: 45,  deep: 90   },
};

// ─── Milestone factory helpers ─────────────────────────────────────────────────

function newPending(depth: ResearchDepth): MilestoneStatus {
  void depth; // used for type narrowing at call sites
  return "pending";
}

function makeFetchMilestone(depth: ResearchDepth): FetchDocumentsMilestone {
  const sourceTypes: FetchDocumentsMilestone["config"]["sourceTypes"] =
    depth === "quick"
      ? ["annual_report", "quarterly_results"]
      : depth === "standard"
      ? ["annual_report", "quarterly_results", "concall_transcript"]
      : ["annual_report", "quarterly_results", "concall_transcript", "drhp", "credit_rating"];

  return {
    id: "m_fetch",
    type: "fetch_documents",
    label: "Fetch Company Filings",
    description: `Fetch ${sourceTypes.join(", ")} from BSE/NSE/SEBI archives.`,
    agentType: "document",
    estimatedMinutes: Math.ceil(MILESTONE_LATENCY_S.fetch_documents[depth] / 60),
    estimatedCostUsd: MILESTONE_COST_USD.fetch_documents[depth],
    status: newPending(depth),
    config: {
      sourceTypes,
      yearsBack: depth === "quick" ? 2 : depth === "standard" ? 4 : 6,
    },
  };
}

function makeExtractMilestone(depth: ResearchDepth): ExtractFinancialsMilestone {
  return {
    id: "m_extract",
    type: "extract_financials",
    label: "Extract Financial Data",
    description: "Parse financials, KPIs, and management guidance from fetched documents.",
    agentType: "document",
    estimatedMinutes: Math.ceil(MILESTONE_LATENCY_S.extract_financials[depth] / 60),
    estimatedCostUsd: MILESTONE_COST_USD.extract_financials[depth],
    dependsOn: ["m_fetch"],
    status: newPending(depth),
    config: {
      fieldsToExtract: ["revenue", "ebitda", "pat", "eps", "debt", "cash_flow", "roe", "roce"],
      fiscalYears: depth === "quick" ? ["FY24", "FY25"] : ["FY22", "FY23", "FY24", "FY25"],
    },
  };
}

function makeModelingMilestone(depth: ResearchDepth): BuildFinancialModelMilestone {
  return {
    id: "m_model",
    type: "build_financial_model",
    label: "Build Financial Model",
    description: `Run ${depth === "quick" ? "EV/EBITDA comparable" : depth === "standard" ? "DCF valuation" : "DCF + 3-statement + Monte Carlo"} model in Python sandbox.`,
    agentType: "modeling",
    estimatedMinutes: Math.ceil(MILESTONE_LATENCY_S.build_financial_model[depth] / 60),
    estimatedCostUsd: MILESTONE_COST_USD.build_financial_model[depth],
    dependsOn: ["m_extract"],
    status: newPending(depth),
    config: {
      modelType: depth === "quick" ? "ev_ebitda" : "dcf",
      projectionYears: depth === "deep" ? 5 : 3,
      runMonteCarlo: depth === "deep",
      runSensitivity: depth !== "quick",
    },
  };
}

function makePeerMilestone(depth: ResearchDepth, peerTickers: string[]): PeerBenchmarkMilestone {
  return {
    id: "m_peer",
    type: "peer_benchmark",
    label: "Peer Benchmarking",
    description: `Compare against ${peerTickers.length > 0 ? peerTickers.join(", ") : "sector peers"} on key valuation multiples.`,
    agentType: "market_intel",
    estimatedMinutes: Math.ceil(MILESTONE_LATENCY_S.peer_benchmark[depth] / 60),
    estimatedCostUsd: MILESTONE_COST_USD.peer_benchmark[depth],
    dependsOn: ["m_extract"],
    status: newPending(depth),
    config: {
      peerTickers,
      metrics: ["pe", "ev_ebitda", "pb", "roe", "revenue_growth", "ebitda_margin"],
    },
  };
}

function makeSynthesisMilestone(depth: ResearchDepth): SynthesiseMilestone {
  return {
    id: "m_synthesise",
    type: "synthesise",
    label: "Synthesise Research Report",
    description: "Draft all report sections from research corpus.",
    agentType: "synthesis",
    estimatedMinutes: Math.ceil(MILESTONE_LATENCY_S.synthesise[depth] / 60),
    estimatedCostUsd: MILESTONE_COST_USD.synthesise[depth],
    dependsOn: ["m_model", "m_peer"],
    status: newPending(depth),
    config: {
      sections: [
        "executive_summary",
        "business_description",
        "financial_analysis",
        "valuation",
        "investment_catalysts",
        "key_risks",
        "swot",
        "management_qa_highlights",
        "disclosures",
      ],
    },
  };
}

function makeComplianceMilestone(depth: ResearchDepth): ComplianceAuditMilestone {
  return {
    id: "m_compliance",
    type: "compliance_audit",
    label: "SEBI Compliance Audit",
    description: "Automated SEBI regulation check, math audit, and watermark verification.",
    agentType: "compliance",
    estimatedMinutes: Math.ceil(MILESTONE_LATENCY_S.compliance_audit[depth] / 60),
    estimatedCostUsd: MILESTONE_COST_USD.compliance_audit[depth],
    dependsOn: ["m_synthesise"],
    status: newPending(depth),
    config: {
      checkSEBIRules: true,
      checkMathAudit: true,
      checkWatermark: true,
    },
  };
}

// ─── LLM-assisted peer extraction ─────────────────────────────────────────────

async function extractPeerTickers(
  goalText: string,
  ticker: string,
  apiKey?: string
): Promise<string[]> {
  try {
    const systemPrompt = `You extract peer/competitor stock tickers from a research goal description. Return JSON only: { "peers": string[] }. Max 5 peers. Use NSE ticker format (e.g. "M_M", "HEROMOTOCO"). If no peers are mentioned, return relevant sector peers for the given company.`;
    const userPrompt = `Company: ${ticker}\nGoal: ${goalText}`;
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const { model } = await getModelForRequest(
      { provider: "groq", apiKey },
      fullPrompt
    );

    const response = await model.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userPrompt),
    ]);

    const content = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    return Array.isArray(parsed.peers) ? parsed.peers.slice(0, 5) : [];
  } catch {
    return []; // Non-fatal: peer benchmark runs with empty list
  }
}

// ─── Master Planner Agent ──────────────────────────────────────────────────────

export class MasterPlannerAgent {
  /**
   * Decomposes a natural-language research goal into an ordered ResearchPlan.
   * Persists the plan to the database with status="pending".
   */
  async createPlan(
    goal: ResearchGoal,
    apiKey?: string
  ): Promise<ResearchPlanRecord> {
    const { depth, ticker, goalText, sessionId } = goal;

    // Step 1: Extract peer tickers from the goal text (LLM-assisted)
    const peerTickers = await extractPeerTickers(goalText, ticker, apiKey);

    // Step 2: Build ordered milestone list
    const milestones: MilestonePlan[] = [
      makeFetchMilestone(depth),
      makeExtractMilestone(depth),
      makeModelingMilestone(depth),
      makePeerMilestone(depth, peerTickers),
      makeSynthesisMilestone(depth),
      makeComplianceMilestone(depth),
    ];

    // Step 3: Compute aggregate cost + latency estimates
    const costEstimate = parseFloat(
      milestones.reduce((sum, m) => sum + m.estimatedCostUsd, 0).toFixed(4)
    );
    const latencyEstS = milestones
      .map((m) => MILESTONE_LATENCY_S[m.type][depth])
      .reduce((sum, s) => sum + s, 0);

    // Step 4: Persist to DB (with graceful offline fallback)
    try {
      const plan = await prisma.researchPlan.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          sessionId,
          goalText,
          ticker,
          companyName: goal.companyName,
          milestones: milestones as unknown as import("@prisma/client").Prisma.JsonArray,
          depth,
          costEstimate,
          latencyEstS,
          status: "pending",
        } as any,
      });

      return {
        id: plan.id,
        sessionId: plan.sessionId,
        goalText: plan.goalText,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ticker: (plan as any).ticker ?? ticker,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        companyName: (plan as any).companyName ?? goal.companyName,
        milestones,
        depth: plan.depth as ResearchDepth,
        costEstimate: plan.costEstimate ?? 0,
        latencyEstS: plan.latencyEstS ?? 0,
        status: plan.status as ResearchPlanRecord["status"],
        approvedBy: plan.approvedBy,
        approvedAt: plan.approvedAt?.toISOString() ?? null,
        createdAt: plan.createdAt.toISOString(),
      };
    } catch (e) {
      console.warn("[MasterPlannerAgent] DB persist offline fallback:", e);
      return {
        id: `plan_offline_${Date.now()}`,
        sessionId,
        goalText,
        ticker,
        companyName: goal.companyName,
        milestones,
        depth,
        costEstimate,
        latencyEstS,
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        createdAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Approves a pending research plan (sets status to "approved").
   */
  async approvePlan(planId: string, actorId: string): Promise<ResearchPlanRecord> {
    const plan = await prisma.researchPlan.update({
      where: { id: planId },
      data: {
        status: "approved",
        approvedBy: actorId,
        approvedAt: new Date(),
      },
    });

    await prisma.steeringEvent.create({
      data: {
        planId,
        actorId,
        eventType: "approve_milestone",
        payload: { action: "approved_plan" },
      },
    });

    return {
        id: plan.id,
        sessionId: plan.sessionId,
        goalText: plan.goalText,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ticker: (plan as any).ticker ?? undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        companyName: (plan as any).companyName ?? undefined,
        milestones: (plan.milestones as unknown as MilestonePlan[]) ?? [],
        depth: plan.depth as ResearchDepth,
        costEstimate: plan.costEstimate ?? 0,
        latencyEstS: plan.latencyEstS ?? 0,
        status: plan.status as ResearchPlanRecord["status"],
        approvedBy: plan.approvedBy,
        approvedAt: plan.approvedAt?.toISOString() ?? null,
        createdAt: plan.createdAt.toISOString(),
      };
  }

  /**
   * Cancels an in-progress or pending research plan.
   */
  async cancelPlan(planId: string, actorId: string): Promise<void> {
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: "cancelled" },
    });

    await prisma.steeringEvent.create({
      data: {
        planId,
        actorId,
        eventType: "cancel",
        payload: { action: "cancelled_plan" },
      },
    });
  }

  /**
   * Retrieves a research plan by ID with its milestones deserialized.
   */
  async getPlan(planId: string): Promise<ResearchPlanRecord | null> {
    const plan = await prisma.researchPlan.findUnique({ where: { id: planId } });
    if (!plan) return null;

    return {
      id: plan.id,
      sessionId: plan.sessionId,
      goalText: plan.goalText,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ticker: (plan as any).ticker ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      companyName: (plan as any).companyName ?? undefined,
      milestones: (plan.milestones as unknown as MilestonePlan[]) ?? [],
      depth: plan.depth as ResearchDepth,
      costEstimate: plan.costEstimate ?? 0,
      latencyEstS: plan.latencyEstS ?? 0,
      status: plan.status as ResearchPlanRecord["status"],
      approvedBy: plan.approvedBy,
      approvedAt: plan.approvedAt?.toISOString() ?? null,
      createdAt: plan.createdAt.toISOString(),
    };
  }
}

export const masterPlannerAgent = new MasterPlannerAgent();

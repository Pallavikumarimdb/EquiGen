import { NextRequest, NextResponse } from "next/server";
import { modelingAgent } from "@/lib/ai/subagents/modeling-agent";
import { requireApiSecret } from "@/lib/utils/auth";
import { prisma } from "@/lib/db";
import { BuildFinancialModelMilestone } from "@/types/plan4";

/**
 * POST /api/agent/run-modeling
 * Triggers the ModelingAgent for a given research plan's BuildFinancialModel milestone.
 *
 * Body: { planId, ticker, companyName, extractedFinancials? }
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { planId, ticker, companyName, extractedFinancials } = body as {
      planId: string;
      ticker: string;
      companyName: string;
      extractedFinancials?: Record<string, unknown>;
    };

    if (!planId || !ticker || !companyName) {
      return NextResponse.json(
        { message: "planId, ticker, and companyName are required." },
        { status: 400 }
      );
    }

    const plan = await prisma.researchPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      return NextResponse.json({ message: "Research plan not found." }, { status: 404 });
    }

    const milestones = (plan.milestones as unknown as BuildFinancialModelMilestone[]) ?? [];
    const modelMilestone = milestones.find((m) => m.type === "build_financial_model") as BuildFinancialModelMilestone | undefined;

    if (!modelMilestone) {
      return NextResponse.json(
        { message: "No build_financial_model milestone found in this plan." },
        { status: 400 }
      );
    }

    const subagentRun = await prisma.subagentRun.create({
      data: {
        planId,
        agentType: "modeling",
        milestoneRef: modelMilestone.id,
        status: "running",
        inputJson: { ticker, companyName, modelConfig: modelMilestone.config } as import("@prisma/client").Prisma.JsonObject,
      },
    });

    const output = await modelingAgent.run({
      planId,
      runId: subagentRun.id,
      ticker,
      companyName,
      milestone: modelMilestone,
      extractedFinancials,
    });

    return NextResponse.json({
      success: true,
      runId: subagentRun.id,
      output,
      latencyMs: Date.now() - startTime,
    });
  } catch (error: unknown) {
    console.error("[/api/agent/run-modeling POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

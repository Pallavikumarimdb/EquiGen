import { NextRequest, NextResponse } from "next/server";
import { masterPlannerAgent } from "@/lib/ai/planner/master-planner";
import { requireApiSecret } from "@/lib/utils/auth";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PUT /api/agent/plan/[id]/approve
 * Approves a pending research plan and queues it for execution.
 * Body: { actorId }
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const { id: planId } = await params;
    const body = await req.json().catch(() => ({}));
    const actorId = body.actorId ?? "analyst";

    const existing = await masterPlannerAgent.getPlan(planId);
    if (!existing) {
      return NextResponse.json({ message: "Plan not found." }, { status: 404 });
    }
    if (existing.status !== "pending") {
      return NextResponse.json(
        { message: `Plan is already in status '${existing.status}' and cannot be approved.` },
        { status: 409 }
      );
    }

    const plan = await masterPlannerAgent.approvePlan(planId, actorId);
    return NextResponse.json({ success: true, plan });
  } catch (error: unknown) {
    console.error("[/api/agent/plan/[id]/approve] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

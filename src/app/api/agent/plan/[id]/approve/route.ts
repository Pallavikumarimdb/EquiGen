import { NextRequest, NextResponse } from "next/server";
import { masterPlannerAgent } from "@/lib/ai/planner/master-planner";
import {
  assertPlanOwnership,
  hasRole,
  isTenantFailure,
  requireTenantSession,
  roleForbidden,
} from "@/lib/utils/tenant";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * PUT /api/agent/plan/[id]/approve
 * Approves a pending research plan and queues it for execution.
 */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    const { id: planId } = await params;

    // SECURITY: the guard's session was discarded and `getPlan` is an unscoped
    // `findUnique`, so any authenticated user could approve any tenant's pending
    // plan. `actorId` was also read from the request body, making the `approvedBy`
    // record forgeable.
    if (!(await assertPlanOwnership(session, planId))) {
      return NextResponse.json(
        { message: "Forbidden. This research plan belongs to another organization." },
        { status: 403 }
      );
    }

    // Approving a plan authorises a full research run and its API spend.
    if (!hasRole(session, "reviewer", "admin", "research_analyst")) {
      return roleForbidden("reviewer");
    }

    const actorId = session.userId;

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
    // Do not echo the raw error: Prisma errors leak schema detail.
    return NextResponse.json({ message: "Internal Server Error." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
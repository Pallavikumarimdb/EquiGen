import { NextRequest, NextResponse } from "next/server";
import { masterOrchestrator } from "@/lib/ai/orchestrator/master-orchestrator";
import { getDecryptedApiKey } from "@/lib/utils/api-keys";
import { assertPlanOwnership, isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/agent/execute
 * Triggers the background execution of an approved ResearchPlan.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    // The tenant guard guarantees a concrete orgId; tenancy fails closed rather than defaulting.
    const orgId = session.orgId;
    const body = await req.json();
    const { planId } = body;

    if (!planId) {
      return NextResponse.json({ message: "planId is required." }, { status: 400 });
    }

    // SECURITY: the tenant guard ran, but `orgId` was used ONLY for key lookup.
    // `executePlan` does a bare `researchPlan.findUnique({ id: planId })` and then
    // writes a `reportHistory` row, so any authenticated user could execute and
    // overwrite any tenant's research plan by id. Ownership must be proven first.
    if (!(await assertPlanOwnership(session, planId))) {
      return NextResponse.json(
        { message: "Forbidden. This research plan belongs to another organization." },
        { status: 403 }
      );
    }

    let apiKey = req.headers.get("x-groq-api-key") ?? process.env.GROQ_API_KEY;
    if (!apiKey) {
      const dbKey = await getDecryptedApiKey(orgId, "groq").catch(() => null);
      if (dbKey) apiKey = dbKey;
    }

    // Trigger execution asynchronously so client receives immediate 200 response
    masterOrchestrator.executePlan(planId, apiKey ?? undefined).catch((err) => {
      console.error("[/api/agent/execute] MasterOrchestrator background execution error:", err);
    });

    return NextResponse.json({
      success: true,
      message: `Research plan ${planId} execution started in background. Monitor progress via SSE stream at /api/agent/stream?planId=${planId}`,
    });
  } catch (error: unknown) {
    console.error("[/api/agent/execute POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

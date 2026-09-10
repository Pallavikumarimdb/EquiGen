import { NextRequest, NextResponse } from "next/server";
import { masterOrchestrator } from "@/lib/ai/orchestrator/master-orchestrator";
import { requireApiSecret } from "@/lib/utils/auth";

/**
 * POST /api/agent/execute
 * Triggers the background execution of an approved ResearchPlan.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { planId } = body;

    if (!planId) {
      return NextResponse.json({ message: "planId is required." }, { status: 400 });
    }

    const apiKey = req.headers.get("x-groq-api-key") ?? process.env.GROQ_API_KEY;

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

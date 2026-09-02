import { NextRequest, NextResponse } from "next/server";
import { masterPlannerAgent } from "@/lib/ai/planner/master-planner";
import { requireApiSecret } from "@/lib/utils/auth";
import { ResearchGoal } from "@/types/plan4";
import { prisma } from "@/lib/db";

/**
 * POST /api/agent/plan
 * Creates a new research plan from a natural-language goal.
 * Body: { goalText, ticker, companyName, depth, sessionId, isin? }
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { goalText, ticker, companyName, depth, sessionId, isin } = body as Partial<ResearchGoal>;

    if (!goalText || !ticker || !companyName || !sessionId) {
      return NextResponse.json(
        { message: "goalText, ticker, companyName, and sessionId are required." },
        { status: 400 }
      );
    }

    // Fetch API key from settings for the requesting org
    const session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      select: { orgId: true },
    });
    if (!session) {
      return NextResponse.json({ message: "Session not found." }, { status: 404 });
    }

    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: { orgId: session.orgId ?? "default-org", provider: "groq" },
    });

    const apiKey = apiKeyRecord?.encryptedKey ?? process.env.GROQ_API_KEY ?? "";

    const goal: ResearchGoal = {
      goalText,
      ticker: ticker.toUpperCase(),
      companyName,
      depth: depth ?? "standard",
      sessionId,
      isin,
    };

    const plan = await masterPlannerAgent.createPlan(goal, apiKey);

    return NextResponse.json({ success: true, plan });
  } catch (error: unknown) {
    console.error("[/api/agent/plan POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

/**
 * GET /api/agent/plan?planId=X
 * Retrieves a specific research plan.
 */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const planId = req.nextUrl.searchParams.get("planId");
    if (!planId) {
      return NextResponse.json({ message: "planId query parameter is required." }, { status: 400 });
    }

    const plan = await masterPlannerAgent.getPlan(planId);
    if (!plan) {
      return NextResponse.json({ message: "Plan not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, plan });
  } catch (error: unknown) {
    console.error("[/api/agent/plan GET] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

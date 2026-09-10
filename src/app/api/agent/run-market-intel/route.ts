import { NextRequest, NextResponse } from "next/server";
import { marketIntelAgent } from "@/lib/ai/subagents/market-intel-agent";
import { requireApiSecret } from "@/lib/utils/auth";
import { prisma } from "@/lib/db";
import { PeerBenchmarkMilestone } from "@/types/plan4";

/**
 * POST /api/agent/run-market-intel
 * Triggers the MarketIntelAgent for a given research plan's PeerBenchmark milestone.
 *
 * Body: { planId, ticker, companyName }
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { planId, ticker, companyName } = body as {
      planId: string;
      ticker: string;
      companyName: string;
    };

    if (!planId || !ticker || !companyName) {
      return NextResponse.json(
        { message: "planId, ticker, and companyName are required." },
        { status: 400 }
      );
    }

    const plan = await prisma.researchPlan.findUnique({
      where: { id: planId },
      include: { session: { select: { orgId: true } } },
    }).catch(() => null);

    if (!plan) {
      return NextResponse.json({ message: "Research plan not found." }, { status: 404 });
    }

    const milestones = (plan.milestones as unknown as PeerBenchmarkMilestone[]) ?? [];
    const peerMilestone = milestones.find((m) => m.type === "peer_benchmark") as PeerBenchmarkMilestone | undefined;

    if (!peerMilestone) {
      return NextResponse.json(
        { message: "No peer_benchmark milestone found in this plan." },
        { status: 400 }
      );
    }

    const orgId = plan.session?.orgId ?? "default-org";
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: { orgId, provider: "groq" },
    }).catch(() => null);
    const apiKey = apiKeyRecord?.encryptedKey ?? process.env.GROQ_API_KEY ?? "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subagentRunData: any = {
      planId,
      agentType: "market_intel",
      milestoneRef: peerMilestone.id,
      status: "running",
      inputJson: { ticker, companyName, peerConfig: peerMilestone.config },
    };

    const subagentRun = await prisma.subagentRun.create({
      data: subagentRunData,
    }).catch(() => ({ id: `run_offline_${Date.now()}` }));

    const output = await marketIntelAgent.run({
      planId,
      runId: subagentRun.id,
      ticker,
      companyName,
      milestone: peerMilestone,
      apiKey,
    });

    return NextResponse.json({
      success: true,
      runId: subagentRun.id,
      output,
      latencyMs: Date.now() - startTime,
    });
  } catch (error: unknown) {
    console.error("[/api/agent/run-market-intel POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { documentAgent } from "@/lib/ai/subagents/document-agent";
import { requireApiSecret } from "@/lib/utils/auth";
import { prisma } from "@/lib/db";
import { FetchDocumentsMilestone } from "@/types/plan4";

/**
 * POST /api/agent/run-document
 * Triggers the DocumentAgent for a given research plan's FetchDocuments milestone.
 *
 * Body: { planId, ticker, companyName, isin? }
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  const startTime = Date.now();

  try {
    const body = await req.json();
    const { planId, ticker, companyName, isin } = body as {
      planId: string;
      ticker: string;
      companyName: string;
      isin?: string;
    };

    if (!planId || !ticker || !companyName) {
      return NextResponse.json(
        { message: "planId, ticker, and companyName are required." },
        { status: 400 }
      );
    }

    // Fetch plan to get session + milestone config
    const plan = await prisma.researchPlan.findUnique({
      where: { id: planId },
      include: { session: { select: { orgId: true } } },
    });

    if (!plan) {
      return NextResponse.json({ message: "Research plan not found." }, { status: 404 });
    }

    if (plan.status !== "approved" && plan.status !== "running") {
      return NextResponse.json(
        { message: `Plan status is '${plan.status}'. Must be 'approved' or 'running' to execute.` },
        { status: 409 }
      );
    }

    // Find the FetchDocuments milestone in the plan
    const milestones = (plan.milestones as unknown as FetchDocumentsMilestone[]) ?? [];
    const fetchMilestone = milestones.find((m) => m.type === "fetch_documents") as FetchDocumentsMilestone | undefined;

    if (!fetchMilestone) {
      return NextResponse.json(
        { message: "No fetch_documents milestone found in this plan." },
        { status: 400 }
      );
    }

    // Get API key for the org
    const orgId = plan.session?.orgId ?? "default-org";
    const apiKeyRecord = await prisma.apiKey.findFirst({
      where: { orgId, provider: "groq" },
    });
    const apiKey = apiKeyRecord?.encryptedKey ?? process.env.GROQ_API_KEY ?? "";

    // Create SubagentRun record
    const subagentRun = await prisma.subagentRun.create({
      data: {
        planId,
        agentType: "document",
        milestoneRef: fetchMilestone.id,
        status: "running",
        inputJson: { ticker, companyName, isin } as import("@prisma/client").Prisma.JsonObject,
      },
    });

    // Update plan status to running
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: "running" },
    });

    // Run the Document Agent
    const output = await documentAgent.run({
      planId,
      runId: subagentRun.id,
      ticker,
      companyName,
      isin,
      milestone: fetchMilestone,
      apiKey,
    });

    // Update run latency
    await prisma.subagentRun.update({
      where: { id: subagentRun.id },
      data: { latencyMs: Date.now() - startTime },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      runId: subagentRun.id,
      output: {
        ticker: output.ticker,
        totalDocumentsFetched: output.totalDocumentsFetched,
        milestoneCompleted: output.milestoneCompleted,
        summary: output.summary,
        bseFilingsCount: output.bseResult.filings.length,
        nseFilingsCount: output.nseResult.filings.length,
        concallsCount: output.concallTranscripts.length,
        managementQuotesCount: output.concallTranscripts.reduce((sum, c) => sum + c.quotes.length, 0),
        documents: output.fetchedDocuments.slice(0, 20), // cap for response size
      },
      latencyMs: Date.now() - startTime,
    });
  } catch (error: unknown) {
    console.error("[/api/agent/run-document POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

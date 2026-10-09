import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getDecryptedApiKey } from "@/lib/utils/api-keys";
import { resumeBackgroundJob } from "@/lib/queue/worker";
import { canAccessTenantRecord, isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

const ResumePayloadSchema = z.object({
  jobId: z.string().min(1, "Job ID is required to resume"),
  provider: z.enum(["groq", "openai"]).optional().default("groq"),
  modelName: z.string().optional(),
});

/**
 * POST /api/extract/resume
 * Resumes a failed pipeline run starting from the checkpointed step index saved in the database.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  let activeJobId = "";
  try {
    // The tenant guard guarantees a concrete orgId; tenancy fails closed rather than defaulting.
    const orgId = session.orgId;

    const body = await req.json();
    const parsedPayload = ResumePayloadSchema.safeParse(body);

    if (!parsedPayload.success) {
      return NextResponse.json(
        { message: "Invalid payload", errors: parsedPayload.error.flatten() },
        { status: 400 },
      );
    }

    const { jobId, provider, modelName } = parsedPayload.data;
    activeJobId = jobId;

    // SECURITY: no ownership check at all. `resumeBackgroundJob` does an unscoped
    // findUnique and, for `blocked_financials`, deletes the job's chunk-extraction
    // rows, so any authenticated user could restart -- or wipe -- another tenant's
    // extraction in progress. Proved before any work is scheduled.
    const job = await prisma.extractionJob.findUnique({
      where: { id: jobId },
      select: { id: true, orgId: true },
    });
    if (!job || !canAccessTenantRecord(session, job)) {
      return NextResponse.json({ message: "Job not found." }, { status: 404 });
    }

    // The caller may not supply an arbitrary API key: doing so would let one tenant
    // bill another's LLM account, or exfiltrate a key to a provider of their choice.
    // Keys come from the org's own BYOK record.
    const dbKey = await getDecryptedApiKey(orgId, provider);
    const resolvedApiKey = dbKey ?? undefined;

    if (!resolvedApiKey) {
      return NextResponse.json(
        { message: "No API key is configured for this organization." },
        { status: 400 },
      );
    }

    // Trigger background resumption worker
    resumeBackgroundJob(activeJobId, {
      provider,
      modelName,
      apiKey: resolvedApiKey,
    });

    return NextResponse.json(
      {
        success: true,
        jobId: activeJobId,
        status: "running",
        message: "Job recovery initialized in the background.",
      },
      { status: 202 },
    );
  } catch (error: unknown) {
    console.error("API Error: /api/extract/resume failed:", error);
    const errMsg =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { message: errMsg, jobId: activeJobId },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

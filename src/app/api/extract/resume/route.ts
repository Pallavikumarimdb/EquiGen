import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDecryptedApiKey } from "@/lib/utils/api-keys";
import { resumeBackgroundJob } from "@/lib/queue/worker";
import { requireApiSecret } from "@/lib/utils/auth";

const ResumePayloadSchema = z.object({
  jobId: z.string().min(1, "Job ID is required to resume"),
  provider: z.enum(["groq", "openai"]).optional().default("groq"),
  modelName: z.string().optional(),
  apiKey: z.string().optional(),
});

/**
 * POST /api/extract/resume
 * Resumes a failed pipeline run starting from the checkpointed step index saved in the database.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  let activeJobId = "";
  try {
    const body = await req.json();
    const parsedPayload = ResumePayloadSchema.safeParse(body);

    if (!parsedPayload.success) {
      return NextResponse.json(
        { message: "Invalid payload", errors: parsedPayload.error.flatten() },
        { status: 400 },
      );
    }

    const { jobId, provider, modelName, apiKey } = parsedPayload.data;
    activeJobId = jobId;

    // Resolve API key: check database (BYOK) first, then fallback to request payload
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const dbKey = await getDecryptedApiKey("default-org", provider);
      if (dbKey) resolvedApiKey = dbKey;
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

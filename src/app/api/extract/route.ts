import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getDecryptedApiKey } from "@/lib/utils/api-keys";
import { triggerBackgroundJob } from "@/lib/queue/worker";
import { currentSchemaVersion } from "@/lib/ai/versions";
import { canAccessTenantRecord, isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

const MAX_RAW_TEXT_BYTES = 100 * 1024 * 1024; // 100 MB — matches the upload cap for large filings

const ExtractPayloadSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  rawText: z.string().min(1, "Document content raw text is required"),
  fileName: z.string().optional().default("uploaded_document.pdf"),
  provider: z.enum(["groq", "openai"]).optional().default("groq"),
  modelName: z.string().optional(),
  apiKey: z.string().optional(),
  jobId: z.string().optional(),
  /** Optional: parsed-document id from /api/upload (document pipeline). Null when persistence was skipped/failed. */
  documentId: z.string().optional().nullable(),
  /** Optional: section-detector verdict from /api/upload. */
  targetingVerdict: z.string().optional().nullable(),
});

/**
 * POST /api/extract
 * Validates request payload and triggers extractor service to pull structured metadata via LangChain.
 * On rate-limit, returns status 429 with retryAfterSeconds so the client can auto-resume.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  let activeJobId = "";
  try {
    // The tenant guard guarantees a concrete orgId; tenancy fails closed rather than defaulting.
    const orgId = session.orgId;
    const userId = session?.userId || null;

    const body = await req.json();
    const parsedPayload = ExtractPayloadSchema.safeParse(body);

    if (!parsedPayload.success) {
      return NextResponse.json(
        { message: "Invalid payload", errors: parsedPayload.error.flatten() },
        { status: 400 },
      );
    }

    const {
      companyName,
      rawText,
      fileName,
      provider,
      modelName,
      apiKey,
      jobId,
      documentId,
      targetingVerdict,
    } = parsedPayload.data;

    activeJobId = jobId || "job_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();

    if (rawText.length > MAX_RAW_TEXT_BYTES) {
      return NextResponse.json(
        {
          message: `Document text exceeds the 100 MB limit (received ${Math.round(rawText.length / (1024 * 1024))} MB).`,
        },
        { status: 413 },
      );
    }

    // Resolve API key: check database (BYOK) first, then fallback to request payload
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const dbKey = await getDecryptedApiKey(orgId, provider);
      if (dbKey) resolvedApiKey = dbKey;
    }

    // Initialize job record in database as running, storing the real filename
    // When a client-supplied jobId targets an existing job, keep the stored
    // document authoritative so re-triggers can't stomp in-flight work.
    const existingJob = jobId
      ? await prisma.extractionJob.findUnique({ where: { id: activeJobId } })
      : null;

    // SECURITY: `existingJob` was fetched without an org predicate, and the upsert's
    // `update` branch REASSIGNED `orgId` and `createdById` to the caller. Submitting
    // another tenant's jobId therefore transferred ownership of that job -- including
    // its stored `rawText`, the full uploaded filing -- into the attacker's org.
    if (existingJob && !canAccessTenantRecord(session, existingJob)) {
      return NextResponse.json(
        { message: "A job with this id already exists." },
        { status: 409 },
      );
    }

    const effectiveCompanyName = existingJob?.companyName ?? companyName;
    const effectiveFileName = existingJob?.fileName ?? fileName;
    const effectiveRawText = existingJob?.rawText ?? rawText;

    // Verify if userId actually exists in the database to prevent foreign key violations (e.g. agent-user)
    let validUserId: string | null = null;
    if (userId) {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      }).catch(() => null);
      if (userExists) {
        validUserId = userExists.id;
      }
    }

    await prisma.extractionJob.upsert({
      where: { id: activeJobId },
      update: {
        orgId,
        createdById: validUserId,
        companyName: effectiveCompanyName,
        fileName: effectiveFileName,
        rawText: effectiveRawText,
        status: "running",
        stepIndex: 0,
        errorMessage: null,
        retryAfterSeconds: null,
        waitMessage: null,
        waitUntil: null,
        documentId: documentId ?? undefined,
        targetingVerdict: targetingVerdict ?? undefined,
        schemaVersion: currentSchemaVersion(),
      },
      create: {
        id: activeJobId,
        orgId,
        createdById: validUserId,
        companyName: effectiveCompanyName,
        fileName: effectiveFileName,
        rawText: effectiveRawText,
        status: "running",
        stepIndex: 0,
        documentId: documentId ?? null,
        targetingVerdict: targetingVerdict ?? null,
        schemaVersion: currentSchemaVersion(),
      },
    });

    // Fire background execution trigger without waiting
    triggerBackgroundJob(activeJobId, effectiveCompanyName, effectiveRawText, {
      provider,
      modelName,
      apiKey: resolvedApiKey,
    });

    return NextResponse.json(
      {
        success: true,
        jobId: activeJobId,
        status: "running",
        message: "Extraction job initialized in the background.",
      },
      { status: 202 },
    );
  } catch (error: unknown) {
    console.error("API Error: /api/extract failed:", error);
    // Log the raw cause for operators; return a generic message so Prisma/PDFKit
    // internals (schema names, filesystem paths) are not disclosed to the client.
    return NextResponse.json(
      { message: "Internal Server Error.", jobId: activeJobId },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

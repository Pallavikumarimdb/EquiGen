import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { batchProcessorService } from "@/lib/queue/batch-processor";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/extract/batch
 * Submits a multi-document extraction batch.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    // The tenant guard guarantees a concrete orgId; tenancy fails closed rather than defaulting.
    const orgId = session.orgId;
    const userId = session.userId;

    const body = await req.json();
    const { items } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { message: "Missing or invalid items array for batch processing." },
        { status: 400 }
      );
    }

    const batchResult = await batchProcessorService.submitBatch(items, userId, orgId);

    return NextResponse.json({
      success: true,
      batchId: batchResult.batchId,
      totalItems: items.length,
      jobIds: batchResult.jobIds,
    });
  } catch (error: unknown) {
    console.error("API Error: /api/extract/batch failed:", error);
    const errMsg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

/**
 * GET /api/extract/batch?jobIds=job1,job2,job3
 * Returns live batch processing status.
 */
export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    const { searchParams } = new URL(req.url);
    const jobIdsParam = searchParams.get("jobIds");

    if (!jobIdsParam) {
      return NextResponse.json(
        { message: "Missing required jobIds parameter." },
        { status: 400 }
      );
    }

    // SECURITY: the POST branch of this route is correctly tenant-scoped, but GET was
    // not -- it passed an arbitrary, caller-supplied id list straight into
    // `getBatchProgress`, letting any authenticated user enumerate job ids and learn
    // which existed and whether they completed or failed. Only ids owned by the
    // caller are reported.
    const requested = jobIdsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (requested.length === 0) {
      return NextResponse.json(
        { message: "No valid job ids supplied." },
        { status: 400 }
      );
    }
    if (requested.length > 200) {
      return NextResponse.json(
        { message: "Too many job ids in one request." },
        { status: 400 }
      );
    }

    const owned = await prisma.extractionJob.findMany({
      where: {
        id: { in: requested },
        ...(session.isPlatformOperator ? {} : { orgId: session.orgId }),
      },
      select: { id: true },
    });
    const ownedIds = owned.map((j) => j.id);

    const progress = await batchProcessorService.getBatchProgress(ownedIds);

    return NextResponse.json({
      success: true,
      progress,
    });
  } catch (error: unknown) {
    console.error("API Error: /api/extract/batch (GET) failed:", error);
    return NextResponse.json({ message: "Internal Server Error." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

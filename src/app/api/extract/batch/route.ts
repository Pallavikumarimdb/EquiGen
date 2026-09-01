import { NextRequest, NextResponse } from "next/server";
import { batchProcessorService } from "@/lib/queue/batch-processor";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";

/**
 * POST /api/extract/batch
 * Submits a multi-document extraction batch.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";
    const userId = session?.userId;

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
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(req.url);
    const jobIdsParam = searchParams.get("jobIds");

    if (!jobIdsParam) {
      return NextResponse.json(
        { message: "Missing required jobIds parameter." },
        { status: 400 }
      );
    }

    const jobIds = jobIdsParam.split(",").map((id) => id.trim()).filter(Boolean);
    const progress = await batchProcessorService.getBatchProgress(jobIds);

    return NextResponse.json({
      success: true,
      progress,
    });
  } catch (error: unknown) {
    console.error("API Error: /api/extract/batch (GET) failed:", error);
    const errMsg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

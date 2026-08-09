import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/extract/status?jobId=...
 * Returns the current progress, status, and intermediate checkpoints of an extraction job.
 * Uses the `reportId` field stored directly on the job record for reliable report linking
 * (avoids the fragile companyName+fileName compound lookup that breaks on multiple uploads).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ message: 'Missing jobId parameter.' }, { status: 400 });
    }

    const job = await prisma.extractionJob.findUnique({
      where: { id: jobId }
    });

    if (!job) {
      return NextResponse.json({ message: 'Job not found.' }, { status: 404 });
    }

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      stepIndex: job.stepIndex,
      errorMessage: job.errorMessage,
      retryAfterSeconds: job.retryAfterSeconds,
      reportId: job.reportId ?? null,   // directly from the job record — no secondary lookup needed
      updatedAt: job.updatedAt
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('API Error: /api/extract/status failed:', error);
    return NextResponse.json({ message: 'Failed to fetch job status.' }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

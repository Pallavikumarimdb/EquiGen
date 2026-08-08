import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { langchainAIService } from '@/lib/ai';

const ResumePayloadSchema = z.object({
  jobId: z.string().min(1, 'Job ID is required to resume'),
  provider: z.enum(['groq', 'openai']).optional().default('groq'),
  modelName: z.string().optional(),
  apiKey: z.string().optional()
});

/**
 * POST /api/extract/resume
 * Resumes a failed pipeline run starting from the checkpointed step index saved in the database.
 */
export async function POST(req: NextRequest) {
  let activeJobId = '';
  try {
    const body = await req.json();
    const parsedPayload = ResumePayloadSchema.safeParse(body);

    if (!parsedPayload.success) {
      return NextResponse.json(
        { message: 'Invalid payload', errors: parsedPayload.error.flatten() },
        { status: 400 }
      );
    }

    const { jobId, provider, modelName, apiKey } = parsedPayload.data;
    activeJobId = jobId;

    const extractedData = await langchainAIService.extractOrResumeFinancialData(
      activeJobId,
      undefined,
      undefined,
      { provider, modelName, apiKey },
      true
    );

    return NextResponse.json({
      success: true,
      jobId: activeJobId,
      reportData: extractedData
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('API Error: /api/extract/resume failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { message: errMsg, jobId: activeJobId },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

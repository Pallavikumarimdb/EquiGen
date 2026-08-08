import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { langchainAIService } from '@/lib/ai';
import { RateLimitError } from '@/lib/ai/retry-wrapper';

const ExtractPayloadSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  rawText: z.string().min(1, 'Document content raw text is required'),
  provider: z.enum(['groq', 'openai']).optional().default('groq'),
  modelName: z.string().optional(),
  apiKey: z.string().optional(),
  jobId: z.string().optional()
});

/**
 * POST /api/extract
 * Validates request payload and triggers extractor service to pull structured metadata via LangChain.
 * On rate-limit, returns status 429 with retryAfterSeconds so the client can auto-resume.
 */
export async function POST(req: NextRequest) {
  let activeJobId = 'job_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
  try {
    const body = await req.json();
    const parsedPayload = ExtractPayloadSchema.safeParse(body);

    if (!parsedPayload.success) {
      return NextResponse.json(
        { message: 'Invalid payload', errors: parsedPayload.error.flatten() },
        { status: 400 }
      );
    }

    const { companyName, rawText, provider, modelName, apiKey, jobId } = parsedPayload.data;
    if (jobId) {
      activeJobId = jobId;
    }

    const extractedData = await langchainAIService.extractOrResumeFinancialData(activeJobId, companyName, rawText, {
      provider,
      modelName,
      apiKey
    }, false);

    return NextResponse.json({
      success: true,
      jobId: activeJobId,
      reportData: extractedData
    }, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error: /api/extract failed:', error);

    // Rate-limit errors: job is throttled (resumable), not permanently failed
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        {
          message: `Rate limited — auto-resume in ${error.retryAfterSeconds}s`,
          status: 'throttled',
          retryAfterSeconds: error.retryAfterSeconds,
          jobId: activeJobId
        },
        { status: 429 }
      );
    }

    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { message: errMsg, jobId: activeJobId },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

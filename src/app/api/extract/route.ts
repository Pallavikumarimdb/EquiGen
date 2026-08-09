import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getDecryptedApiKey } from '@/lib/utils/api-keys';
import { triggerBackgroundJob } from '@/lib/queue/worker';

const ExtractPayloadSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  rawText: z.string().min(1, 'Document content raw text is required'),
  fileName: z.string().optional().default('uploaded_document.pdf'),
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

    const { companyName, rawText, fileName, provider, modelName, apiKey, jobId } = parsedPayload.data;
    if (jobId) {
      activeJobId = jobId;
    }

    // Resolve API key: check database (BYOK) first, then fallback to request payload
    let resolvedApiKey = apiKey;
    if (!resolvedApiKey) {
      const dbKey = await getDecryptedApiKey('default-org', provider);
      if (dbKey) resolvedApiKey = dbKey;
    }

    // Initialize job record in database as running, storing the real filename
    await prisma.extractionJob.upsert({
      where: { id: activeJobId },
      update: {
        companyName,
        fileName,
        rawText,
        status: 'running',
        stepIndex: 0,
        errorMessage: null,
        retryAfterSeconds: null
      },
      create: {
        id: activeJobId,
        companyName,
        fileName,
        rawText,
        status: 'running',
        stepIndex: 0
      }
    });

    // Fire background execution trigger without waiting
    triggerBackgroundJob(activeJobId, companyName, rawText, {
      provider,
      modelName,
      apiKey: resolvedApiKey
    });

    return NextResponse.json({
      success: true,
      jobId: activeJobId,
      status: 'running',
      message: 'Extraction job initialized in the background.'
    }, { status: 202 });
  } catch (error: unknown) {
    console.error('API Error: /api/extract failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { message: errMsg, jobId: activeJobId },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

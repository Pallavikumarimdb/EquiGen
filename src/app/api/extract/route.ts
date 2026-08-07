import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { langchainAIService } from '@/lib/ai';

const ExtractPayloadSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  rawText: z.string().min(1, 'Document content raw text is required'),
  provider: z.enum(['groq', 'openai']).optional().default('groq'),
  modelName: z.string().optional(),
  apiKey: z.string().optional()
});

/**
 * POST /api/extract
 * Validates request payload and triggers extractor service to pull structured metadata via LangChain.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsedPayload = ExtractPayloadSchema.safeParse(body);

    if (!parsedPayload.success) {
      return NextResponse.json(
        { message: 'Invalid payload', errors: parsedPayload.error.flatten() },
        { status: 400 }
      );
    }

    const { companyName, rawText, provider, modelName, apiKey } = parsedPayload.data;

    const extractedData = await langchainAIService.extractFinancialData(companyName, rawText, {
      provider,
      modelName,
      apiKey
    });

    return NextResponse.json(extractedData, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error: /api/extract failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { message: errMsg },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

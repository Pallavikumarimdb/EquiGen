import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractorService } from '@/lib/extractors';

const ExtractPayloadSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  rawText: z.string().min(1, 'Document content raw text is required')
});

/**
 * POST /api/extract
 * Validates request payload and triggers extractor service to pull structured metadata via Groq.
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

    const { companyName, rawText } = parsedPayload.data;

    // Simulate calling the Extractor service
    // Note: AI logic is currently stubbed/mocked within the service.
    const extractedData = await extractorService.extract(companyName, {
      text: rawText,
      tables: [],
      metadata: { fileName: 'document' }
    });

    return NextResponse.json(extractedData, { status: 200 });
  } catch (error: any) {
    console.error('API Error: /api/extract failed:', error);
    return NextResponse.json(
      { message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

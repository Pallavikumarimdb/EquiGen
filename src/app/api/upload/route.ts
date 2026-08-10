import { NextRequest, NextResponse } from 'next/server';
import { parserService } from '@/lib/parsers';
import { requireApiSecret } from '@/lib/utils/auth';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/upload
 * Accepts a file in FormData, parses it (PDF, CSV, TXT), and returns the raw parsed text.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded.' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { message: `File exceeds the 10 MB upload limit (received ${Math.round(file.size / (1024 * 1024))} MB).` },
        { status: 413 }
      );
    }

    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    const allowedExtensions = ['.pdf', '.csv', '.txt'];

    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        { message: `Unsupported file format: ${fileExtension}. Please upload a PDF, CSV, or TXT document.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Parse using parser service
    const parseResult = await parserService.parseFile(buffer, file.name, file.type);

    return NextResponse.json(parseResult, { status: 200 });
  } catch (error: unknown) {
    console.error('API Error: /api/upload failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { message: errMsg },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

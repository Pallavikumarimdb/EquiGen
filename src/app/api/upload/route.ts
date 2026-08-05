import { NextRequest, NextResponse } from 'next/server';
import { parserService } from '@/lib/parsers';

/**
 * POST /api/upload
 * Accepts a file in FormData, parses it (PDF, CSV, TXT), and returns the raw parsed text.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ message: 'No file uploaded.' }, { status: 400 });
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
  } catch (error: any) {
    console.error('API Error: /api/upload failed:', error);
    return NextResponse.json(
      { message: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

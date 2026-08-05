import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/download
 * Returns the downloadable PDF report matching the requested report ID/ticker.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'Missing report id query parameter.' }, { status: 400 });
    }

    const reportId = id.toUpperCase();
    const pdfPath = path.join(process.cwd(), 'public', 'temp', 'reports', `${reportId}.pdf`);

    if (!fs.existsSync(pdfPath)) {
      return NextResponse.json(
        { message: `Report PDF for ID "${reportId}" not found. Please generate the report first.` },
        { status: 404 }
      );
    }

    const pdfBuffer = await fs.promises.readFile(pdfPath);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="equity-report-${reportId.toLowerCase()}.pdf"`
      }
    });
  } catch (error: unknown) {
    console.error('API Error: /api/download failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { message: errMsg },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';

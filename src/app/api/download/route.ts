import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/db';

/**
 * GET /api/download?id=<reportId>
 * Returns the downloadable PDF for a report.
 *
 * Resolution order:
 *  1. Check local filesystem (public/temp/reports/<ID>.pdf) — works for `/api/report`-generated files.
 *  2. Check the ReportHistory database record's pdfBase64 column — covers approve-regenerated PDFs
 *     and background-pipeline reports that were never written to disk.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ message: 'Missing report id query parameter.' }, { status: 400 });
    }

    // 1. Try filesystem first (fast path for local/Docker with writable storage)
    const reportId = id.toUpperCase();
    const pdfPath = path.join(process.cwd(), 'public', 'temp', 'reports', `${reportId}.pdf`);

    if (fs.existsSync(pdfPath)) {
      const pdfBuffer = await fs.promises.readFile(pdfPath);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="equity-report-${reportId.toLowerCase()}.pdf"`
        }
      });
    }

    // 2. Fall back to database — covers approved/published reports and background-pipeline reports
    if (process.env.DATABASE_URL) {
      const report = await prisma.reportHistory.findUnique({
        where: { id },
        select: { id: true, companyName: true, pdfBase64: true }
      });

      if (report?.pdfBase64) {
        const pdfBuffer = Buffer.from(report.pdfBase64, 'base64');
        const safeName = report.companyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        return new NextResponse(new Uint8Array(pdfBuffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="equity-report-${safeName}.pdf"`
          }
        });
      }

      // Record exists but no PDF yet (e.g., draft before first compile)
      if (report && !report.pdfBase64) {
        return NextResponse.json(
          { message: 'PDF not yet generated for this report. Please compile it first.' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { message: `Report PDF for ID "${id}" not found. Please generate the report first.` },
      { status: 404 }
    );
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

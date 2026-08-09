import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { pdfGenerationService } from '@/lib/pdf';
import { EquityResearchData } from '@/types';
import { requireApiSecret } from '@/lib/utils/auth';

/**
 * POST /api/approve
 * Captures SEBI RA sign-off credentials, regenerates the PDF with attestation/disclosures,
 * and updates the report status to "published" in the database.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ message: 'Database not configured' }, { status: 400 });
    }
    const body = await req.json();
    const { reportId, reviewerName, sebiRegNo } = body;

    if (!reportId || !reviewerName || !sebiRegNo) {
      return NextResponse.json({ message: 'Missing required sign-off parameters.' }, { status: 400 });
    }

    // Find the draft report
    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId }
    });

    if (!dbReport) {
      return NextResponse.json({ message: 'Report not found.' }, { status: 404 });
    }

    const reportData = dbReport.reportData as unknown as EquityResearchData;
    const approvedAt = new Date();

    // Recompile the PDF in published state with attestation metadata
    const reportBuffer = await pdfGenerationService.generateReportPDF(reportData, 'published', {
      reviewerName,
      sebiRegNo,
      approvedAt
    });

    // Update report in database to published status
    const updatedReport = await prisma.reportHistory.update({
      where: { id: reportId },
      data: {
        status: 'published',
        reviewerName,
        sebiRegNo,
        approvedAt,
        pdfBase64: reportBuffer.toString('base64')
      }
    });

    return NextResponse.json({
      success: true,
      reportId: updatedReport.id,
      pdfBase64: updatedReport.pdfBase64,
      status: updatedReport.status,
      reviewerName: updatedReport.reviewerName,
      sebiRegNo: updatedReport.sebiRegNo,
      approvedAt: updatedReport.approvedAt
    });

  } catch (error: unknown) {
    console.error('API Error: /api/approve failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

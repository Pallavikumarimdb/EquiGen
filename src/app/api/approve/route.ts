import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { pdfGenerationService } from '@/lib/pdf';
import { EquityResearchData } from '@/types';
import { requireApiSecret } from '@/lib/utils/auth';
import { transitionReportStatus } from '@/lib/report/state-machine';
import { computeSHA256 } from '@/lib/utils/hash';

/**
 * POST /api/approve
 * Captures SEBI RA sign-off credentials, recalculates/records SHA-256 integrity hash,
 * transitions state to approved & published, renders attested PDF, and writes audit trail.
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

    // Find the report
    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId }
    });

    if (!dbReport) {
      return NextResponse.json({ message: 'Report not found.' }, { status: 404 });
    }

    const reportData = dbReport.reportData as unknown as EquityResearchData;
    const contentHash = computeSHA256(reportData);
    const approvedAt = new Date();

    // Get request IP
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';

    // Transition state from current status (should be under_review/draft etc.) to approved
    await transitionReportStatus(reportId, 'approved', {
      actorId: reviewerName,
      actorType: 'human',
      ipAddress,
      metadata: {
        reviewerName,
        sebiRegNo,
        contentHash,
        approvedAt
      }
    });

    // Recompile the PDF in published state with attestation metadata
    const reportBuffer = await pdfGenerationService.generateReportPDF(reportData, 'published', {
      reviewerName,
      sebiRegNo,
      approvedAt
    });

    // Transition state from approved to published (auto publish transition)
    const updatedReport = await transitionReportStatus(reportId, 'published', {
      actorId: 'system',
      actorType: 'system',
      ipAddress,
      metadata: {
        reviewerName,
        sebiRegNo,
        contentHash,
        approvedAt,
        pdfBase64: reportBuffer.toString('base64').substring(0, 100) + '...' // trim log size
      }
    });

    // Update ReportHistory to save the generated PDF buffer
    const finalReport = await prisma.reportHistory.update({
      where: { id: reportId },
      data: {
        pdfBase64: reportBuffer.toString('base64'),
        contentHash
      }
    });

    // Log the publication / sign_off action to AuditLog
    await prisma.auditLog.create({
      data: {
        reportId,
        userId: reviewerName,
        actorType: 'human',
        action: 'sign_off',
        metadata: {
          reviewerName,
          sebiRegNo,
          contentHash,
          ip: ipAddress,
          approvedAt
        }
      }
    });

    return NextResponse.json({
      success: true,
      reportId: finalReport.id,
      pdfBase64: finalReport.pdfBase64,
      status: finalReport.status,
      reviewerName: finalReport.reviewerName,
      sebiRegNo: finalReport.sebiRegNo,
      approvedAt: finalReport.approvedAt,
      contentHash: finalReport.contentHash
    });

  } catch (error: unknown) {
    console.error('API Error: /api/approve failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pdfGenerationService } from "@/lib/pdf";
import { EquityResearchData } from "@/types";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";
import { transitionReportStatus } from "@/lib/report/state-machine";
import { computeSHA256 } from "@/lib/utils/hash";

/**
 * POST /api/approve
 * Captures SEBI RA sign-off credentials from the user session, recalculates/records SHA-256 integrity hash,
 * transitions state to approved & published, renders attested PDF, and writes audit trail.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { message: "Database not configured" },
        { status: 400 },
      );
    }

    const session = getAuthSession(req);
    if (!session) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 },
      );
    }

    // Role-based Access Control (RBAC): Only Reviewers can sign off
    if (session.role !== "reviewer") {
      return NextResponse.json(
        { message: "Forbidden. Only SEBI Registered Research Analysts (Reviewers) are authorized to perform report sign-offs." },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { reportId } = body;

    if (!reportId) {
      return NextResponse.json(
        { message: "Missing required reportId parameter." },
        { status: 400 },
      );
    }

    // Find the report
    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    });

    if (!dbReport) {
      return NextResponse.json(
        { message: "Report not found." },
        { status: 404 },
      );
    }

    // Tenant Isolation Check
    const orgId = session.orgId || "default-org";
    if (dbReport.orgId !== orgId) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    const reviewerName = session.name;
    const sebiRegNo = session.sebiRegNo;

    if (!sebiRegNo) {
      return NextResponse.json(
        { message: "Bad request. Your user account does not have a configured SEBI Research Analyst registration number." },
        { status: 400 },
      );
    }

    const reportData = dbReport.reportData as unknown as EquityResearchData;
    const contentHash = computeSHA256(reportData);
    const approvedAt = new Date();

    // Get request IP
    const ipAddress =
      req.headers.get("x-forwarded-for") ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";

    // Transition state from current status (should be under_review/draft etc.) to approved
    await transitionReportStatus(reportId, "approved", {
      actorId: session.userId,
      actorType: "human",
      ipAddress,
      metadata: {
        reviewerName,
        sebiRegNo,
        contentHash,
        approvedAt,
      },
    });

    // Recompile the PDF in published state with attestation metadata
    const reportBuffer = await pdfGenerationService.generateReportPDF(
      reportData,
      "published",
      {
        reviewerName,
        sebiRegNo,
        approvedAt,
      },
    );

    // Transition state from approved to published (auto publish transition)
    await transitionReportStatus(reportId, "published", {
      actorId: "system",
      actorType: "system",
      ipAddress,
      metadata: {
        reviewerName,
        sebiRegNo,
        contentHash,
        approvedAt,
        pdfBase64: reportBuffer.toString("base64").substring(0, 100) + "...", // trim log size
      },
    });

    // Update ReportHistory to save the generated PDF buffer and reviewer info
    const finalReport = await prisma.reportHistory.update({
      where: { id: reportId },
      data: {
        pdfBase64: reportBuffer.toString("base64"),
        contentHash,
        reviewerName,
        sebiRegNo,
        approvedAt,
        approvedByIp: ipAddress,
      },
    });

    // Log the publication / sign_off action to AuditLog
    await prisma.auditLog.create({
      data: {
        reportId,
        userId: session.userId,
        actorType: "human",
        action: "sign_off",
        metadata: {
          reviewerName,
          sebiRegNo,
          contentHash,
          ip: ipAddress,
          approvedAt,
        },
      },
    });

    return NextResponse.json({
      success: true,
      reportId: finalReport.id,
      pdfBase64: finalReport.pdfBase64,
      status: finalReport.status,
      reviewerName: finalReport.reviewerName,
      sebiRegNo: finalReport.sebiRegNo,
      approvedAt: finalReport.approvedAt,
      contentHash: finalReport.contentHash,
    });
  } catch (error: unknown) {
    console.error("API Error: /api/approve failed:", error);
    const errMsg =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

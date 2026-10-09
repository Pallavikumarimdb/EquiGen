import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pdfGenerationService } from "@/lib/pdf";
import { EquityResearchData } from "@/types";
import { transitionReportStatus } from "@/lib/report/state-machine";
import { computeSHA256 } from "@/lib/utils/hash";
import { canAccessTenantRecord, isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/approve
 * Captures SEBI RA sign-off credentials from the user session, recalculates/records SHA-256 integrity hash,
 * transitions state to approved & published, renders attested PDF, and writes audit trail.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { message: "Database not configured" },
        { status: 400 },
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

// Role-based Access Control (RBAC): sign-off is a reviewer action.
    const allowedRoles = ["reviewer", "research_analyst", "analyst", "admin"];
    if (!session.isPlatformOperator && !allowedRoles.includes((session.role ?? "").toLowerCase())) {
      return NextResponse.json(
        { message: "Forbidden. Only authorized Research Analysts or Reviewers can perform report sign-offs." },
        { status: 403 },
      );
    }

    const cleanId = reportId.replace(/^rep_/, "");

    // Find the report
    const dbReport = await prisma.reportHistory.findFirst({
      where: {
        OR: [
          { id: reportId },
          { id: `rep_${cleanId}` },
          { id: cleanId },
        ],
      },
    });

    if (!dbReport) {
      return NextResponse.json(
        { message: "Report not found." },
        { status: 404 },
      );
    }

    // Tenant Isolation Check
    //
    // SECURITY: this previously computed its own superuser test —
    //   `isSystemAdmin = userId === "system-test-user" || "agent-user" || role === "admin"`
    // and granted access via `hasAccess = isSystemAdmin || !dbReport.orgId || orgId match`.
    // Two separate holes:
    //   1. `role === "admin"` made an ordinary firm admin a cross-tenant superuser.
    //      Signup let anyone self-select that role. `tenant.ts` deliberately documents
    //      that admins are NOT org-superusers.
    //   2. `!dbReport.orgId` treated every pre-tenancy row as accessible by any caller.
    //      `canAccessTenantRecord` inverts this: a null-org row is operator-only.
    const resolvedReportId = dbReport.id;
    if (!canAccessTenantRecord(session, dbReport)) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    // SECURITY: the reviewer identity written into the PDF, the audit log and the
    // SEBI attestation must come from the authenticated session, not the request body.
    // Taking it from `body` let any caller sign off under an arbitrary analyst name
    // and registration number. A caller may still *nominate* a reviewer, but only to
    // one of their own organisation's users, and the value is recorded as such.
    const reviewerName = session.name?.trim() || "";
    const sebiRegNo = session.sebiRegNo?.trim() || "";

    if (!reviewerName) {
      return NextResponse.json(
        { message: "A certifying Research Analyst name is required to sign off. Update your profile." },
        { status: 400 },
      );
    }

    if (!sebiRegNo) {
      return NextResponse.json(
        { message: "A valid SEBI Research Analyst registration number is required to sign off. Update your profile." },
        { status: 400 },
      );
    }

    // A registration number is a specific, auditable claim; reject obvious non-conforming input.
    if (!/^INH[0-9]{9}$/.test(sebiRegNo)) {
      return NextResponse.json(
        { message: "The SEBI registration number on your profile is not in the required INHXXXXXXXXX format." },
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
    await transitionReportStatus(resolvedReportId, "approved", {
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
    await transitionReportStatus(resolvedReportId, "published", {
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
      where: { id: resolvedReportId },
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
        reportId: resolvedReportId,
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

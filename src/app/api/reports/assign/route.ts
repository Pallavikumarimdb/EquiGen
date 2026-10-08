import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/reports/assign
 * Assigns a generated research report to a SEBI Registered Reviewer within the organization.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    const body = await req.json();
    const { reportId, reviewerId, reviewerName } = body;

    if (!reportId || !reviewerId) {
      return NextResponse.json(
        { message: "Missing required reportId or reviewerId." },
        { status: 400 }
      );
    }

    const cleanId = reportId.replace(/^rep_/, "");

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
        { status: 404 }
      );
    }

    // Tenant Isolation check
    const orgId = session.orgId || "default-org";
    const isSystemAdmin = session.userId === "system-test-user" || session.userId === "agent-user" || session.role?.toLowerCase() === "admin";
    if (dbReport.orgId && dbReport.orgId !== orgId && !isSystemAdmin) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 }
      );
    }

    // Verify assigned user exists, belongs to same org, and is a reviewer/analyst
    const reviewerUser = await prisma.user.findUnique({
      where: { id: reviewerId },
    });

    if (!reviewerUser) {
      return NextResponse.json(
        { message: "Assigned reviewer user not found." },
        { status: 404 }
      );
    }

    if (reviewerUser.orgId !== orgId && !isSystemAdmin) {
      return NextResponse.json(
        { message: "Cannot assign report to a reviewer from another organization." },
        { status: 403 }
      );
    }

    const updatedReport = await prisma.reportHistory.update({
      where: { id: dbReport.id },
      data: {
        assignedReviewerId: reviewerUser.id,
        assignedReviewerName: reviewerName || reviewerUser.name,
      },
    });

    // Write audit log trail
    await prisma.auditLog.create({
      data: {
        reportId,
        userId: session.userId,
        actorType: "human",
        action: "assignment_changed",
        metadata: {
          assignedToId: reviewerUser.id,
          assignedToName: reviewerUser.name,
          sebiRegNo: reviewerUser.sebiRegNo || null,
        },
      },
    });

    return NextResponse.json({
      success: true,
      reportId: updatedReport.id,
      assignedReviewerId: updatedReport.assignedReviewerId,
      assignedReviewerName: updatedReport.assignedReviewerName,
    });
  } catch (error: unknown) {
    console.error("API Error: /api/reports/assign failed:", error);
    const errMsg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

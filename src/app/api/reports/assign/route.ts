import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";

/**
 * POST /api/reports/assign
 * Assigns a generated research report to a SEBI Registered Reviewer within the organization.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const session = getAuthSession(req);
    if (!session) {
      return NextResponse.json(
        { message: "Unauthorized. Please log in." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { reportId, reviewerId, reviewerName } = body;

    if (!reportId || !reviewerId) {
      return NextResponse.json(
        { message: "Missing required reportId or reviewerId." },
        { status: 400 }
      );
    }

    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    });

    if (!dbReport) {
      return NextResponse.json(
        { message: "Report not found." },
        { status: 404 }
      );
    }

    // Tenant Isolation check
    const orgId = session.orgId || "default-org";
    if (dbReport.orgId && dbReport.orgId !== orgId) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 }
      );
    }

    // Verify assigned user exists and is a reviewer
    const reviewerUser = await prisma.user.findUnique({
      where: { id: reviewerId },
    });

    if (!reviewerUser) {
      return NextResponse.json(
        { message: "Assigned reviewer user not found." },
        { status: 404 }
      );
    }

    const updatedReport = await prisma.reportHistory.update({
      where: { id: reportId },
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

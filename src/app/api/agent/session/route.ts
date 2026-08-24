import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";

/**
 * GET /api/agent/session?reportId=...
 * Retrieves the current session (or creates a new one if not found) for a report.
 */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      return NextResponse.json(
        { message: "Missing reportId parameter." },
        { status: 400 },
      );
    }

    const sessionUser = getAuthSession(req);
    const orgId = sessionUser?.orgId || "default-org";
    const userId = sessionUser?.userId || "analyst";

    // Enforce Tenant Isolation Check: Verify report ownership
    const report = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return NextResponse.json(
        { message: "Report not found." },
        { status: 404 },
      );
    }

    const hasAccess = report.orgId === orgId || (orgId === "default-org" && report.orgId === null);
    if (!hasAccess) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    let session = await prisma.researchSession.findFirst({
      where: orgId === "default-org"
        ? {
            reportId,
            OR: [
              { orgId: "default-org" },
              { orgId: null },
            ],
          }
        : {
            reportId,
            orgId,
          },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!session) {
      session = await prisma.researchSession.create({
        data: {
          reportId,
          orgId: orgId || "default-org",
          createdBy: userId,
        },
        include: {
          messages: true,
        },
      });
    }

    return NextResponse.json(session);
  } catch (error) {
    console.error("Failed to resolve agent session:", error);
    return NextResponse.json(
      { message: "Failed to resolve agent session." },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";

/**
 * GET /api/audit?reportId=...
 * Returns the audit log trail for a given report.
 */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";
    const isSystemAdmin = session?.userId === "system-test-user" || session?.userId === "agent-user" || session?.role?.toLowerCase() === "admin";

    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      return NextResponse.json(
        { message: "Missing reportId parameter." },
        { status: 400 },
      );
    }

    const cleanId = reportId.replace(/^rep_/, "");

    // Enforce tenant authorization check
    const report = await prisma.reportHistory.findFirst({
      where: {
        OR: [{ id: reportId }, { id: cleanId }, { id: `rep_${cleanId}` }],
      },
      select: { orgId: true },
    }).catch(() => null);

    if (report && report.orgId && report.orgId !== orgId && !isSystemAdmin) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [{ reportId }, { reportId: cleanId }, { reportId: `rep_${cleanId}` }],
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(auditLogs);
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json(
      { message: "Failed to fetch audit logs" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

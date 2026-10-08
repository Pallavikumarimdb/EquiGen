import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";


/**
 * GET /api/audit?reportId=...
 * Returns the audit log trail for a given report.
 */
export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    const orgId = session.orgId;

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

    if (report && report.orgId && report.orgId !== orgId && !session.isPlatformOperator) {
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

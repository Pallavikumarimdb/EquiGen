import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canAccessTenantRecord, isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";


/**
 * GET /api/audit?reportId=...
 * Returns the audit log trail for a given report.
 */
export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {

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
    //
    // SECURITY: this failed open three ways.
    //  1. `report.orgId === null` passed the check, so every legacy report was
    //     readable by any tenant.
    //  2. `report === null` ALSO passed -- the `.catch(() => null)` turned a database
    //     error into "no check performed".
    //  3. `auditLog` rows outlive their report, so guessing an arbitrary reportId (or
    //     one belonging to a deleted report) exposed a full audit trail containing
    //     reviewer identities, SEBI registration numbers, content hashes and
    //     approving IPs.
    const report = await prisma.reportHistory.findFirst({
      where: {
        OR: [{ id: reportId }, { id: cleanId }, { id: `rep_${cleanId}` }],
      },
      select: { id: true, orgId: true },
    }).catch(() => null);

    // Fail closed: an unknown report, an unreadable lookup, or a report owned by
    // another tenant is refused rather than treated as authorised.
    if (!report || !canAccessTenantRecord(session, report)) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        OR: [{ reportId: report.id }, { reportId: cleanId }, { reportId: `rep_${cleanId}` }],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
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

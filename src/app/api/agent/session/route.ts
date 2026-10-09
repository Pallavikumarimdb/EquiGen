import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  canAccessTenantRecord,
  isTenantFailure,
  requireTenantSession,
  tenantForbidden,
} from "@/lib/utils/tenant";

/**
 * GET /api/agent/session?reportId=...
 * Retrieves the current session (or creates a new one if not found) for a report.
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

    const orgId = session.orgId;
    const userId = session.userId;

    // Enforce Tenant Isolation Check: Verify report ownership
    const report = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    }).catch(() => null);

    if (!report) {
      // Check if this is an autonomous ResearchPlan ID.
      //
      // SECURITY: this branch returned BEFORE the `canAccessTenantRecord` check, so
      // passing a `researchPlan` id instead of a `reportHistory` id disclosed the
      // goalText, ticker and companyName of any tenant's plan. The `.catch(() => null)`
      // on both lookups had the same fail-open shape as the audit route.
      const plan = await prisma.researchPlan.findUnique({
        where: { id: reportId },
        include: { session: { select: { orgId: true } } },
      }).catch(() => null);

      if (plan) {
        if (!canAccessTenantRecord(session, { orgId: plan.session?.orgId ?? null })) {
          return tenantForbidden();
        }
        return NextResponse.json({
          id: plan.id,
          reportId: plan.id,
          status: plan.status,
          goalText: plan.goalText,
          createdAt: plan.createdAt,
        });
      }

      return NextResponse.json({ success: true, session: null }, { status: 200 });
    }

    // Legacy `orgId: null` reports were previously readable by ANY caller, because
    // `!report.orgId` short-circuited the check. They are now platform-operator only.
    if (!canAccessTenantRecord(session, report)) return tenantForbidden();

    let researchSession = await prisma.researchSession.findFirst({
      where: {
        reportId,
        ...(session.isPlatformOperator ? {} : { orgId }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!researchSession) {
      researchSession = await prisma.researchSession.create({
        data: {
          reportId,
          orgId,
          createdBy: userId,
        },
        include: {
          messages: true,
        },
      });
    }

    return NextResponse.json(researchSession);
  } catch (error) {
    console.error("Failed to resolve agent session:", error);
    return NextResponse.json(
      { message: "Failed to resolve agent session." },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";


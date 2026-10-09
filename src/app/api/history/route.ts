import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  canAccessTenantRecord,
  isTenantFailure,
  requireTenantSession,
  tenantForbidden,
} from "@/lib/utils/tenant";
import { computeSHA256 } from "@/lib/utils/hash";

const ALLOWED_STATUSES = new Set([
  "draft",
  "under_review",
  "changes_requested",
  "approved",
  "published",
]);

export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json([]);
    }

    const userId = session.userId;
    const orgId = session.orgId;

    let reportWhere: Prisma.ReportHistoryWhereInput;
    let planWhere: Prisma.ResearchPlanWhereInput;
    let jobWhere: Prisma.ExtractionJobWhereInput;

    if (session.isPlatformOperator) {
      // Platform operator (internal service credential): cross-tenant view, needed for
      // support and CI. This is the ONLY path that may read beyond one organisation.
      reportWhere = {};
      planWhere = { session: {} };
      jobWhere = {};
    } else {
      // Organisation isolation for every human session, INCLUDING default-org.
      //
      // Previously `default-org` was treated as a super-tenant: any caller whose org
      // resolved to default-org matched `OR: [{ orgId: "default-org" }, { orgId: null }]`
      // and therefore saw every pre-tenancy and demo report. A member of the default
      // organisation is now pinned to that organisation exactly like any other, and
      // legacy `orgId: null` rows are visible only to a platform operator.
      reportWhere = {
        OR: [{ orgId }, ...(userId ? [{ createdById: userId }] : [])],
      };
      planWhere = {
        session: {
          OR: [{ orgId }, ...(userId ? [{ createdBy: userId }] : [])],
        },
      };
      jobWhere = {
        OR: [{ orgId }, ...(userId ? [{ createdById: userId }] : [])],
      };
    }

    const reports = await prisma.reportHistory.findMany({
      where: reportWhere,
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        companyName: true,
        fileName: true,
        reportData: true,
        pdfBase64: true,
        status: true,
        reviewerName: true,
        sebiRegNo: true,
        approvedAt: true,
        contentHash: true,
        versionNo: true,
        modelUsedForFinancials: true,
        createdAt: true,
      },
    });

    // Also fetch active/recent ResearchPlan records (including running, failed, approved) for this user/org
    const activePlans = await prisma.researchPlan.findMany({
      where: planWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        companyName: true,
        ticker: true,
        status: true,
        createdAt: true,
        goalText: true,
      },
    }).catch(() => []);

    // Auto-mark stale extraction jobs running for > 30 minutes as failed so they don't linger forever
    const staleCutoff = new Date(Date.now() - 30 * 60 * 1000);
    await prisma.extractionJob.updateMany({
      where: {
        status: { in: ["running", "pending"] },
        updatedAt: { lt: staleCutoff },
      },
      data: {
        status: "failed",
        errorMessage: "Process timed out after exceeding maximum duration.",
      },
    }).catch(() => null);

    // Also fetch active/recent ExtractionJob records for this user/org
    const activeJobs = await prisma.extractionJob.findMany({
      where: jobWhere,
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        companyName: true,
        fileName: true,
        status: true,
        stepIndex: true,
        reportId: true,
        createdAt: true,
      },
    }).catch(() => []);

    const existingReportIds = new Set(reports.map((r) => r.id));
    const existingCleanIds = new Set(reports.map((r) => r.id.replace(/^rep_/, "")));

    const activeJobItems = activeJobs
      .filter((j) => !j.reportId || (!existingReportIds.has(j.reportId) && !existingCleanIds.has(j.reportId)))
      .map((j) => ({
        id: j.id,
        companyName: j.companyName || "Uploaded Document",
        fileName: j.fileName || "Financial Document",
        reportData: {
          sourceType: "upload",
          companyName: j.companyName,
          fileName: j.fileName,
          jobId: j.id,
          status: j.status,
          stepIndex: j.stepIndex,
        },
        pdfBase64: null,
        status: j.status || "running",
        reviewerName: null,
        sebiRegNo: null,
        approvedAt: null,
        contentHash: null,
        versionNo: 1,
        modelUsedForFinancials: "Document Extraction Pipeline",
        createdAt: j.createdAt.toISOString(),
      }));

    const activePlanItems = activePlans
      .filter((p) => !existingReportIds.has(p.id) && !existingReportIds.has(`rep_${p.id}`) && !existingCleanIds.has(p.id))
      .map((p) => ({
        id: p.id,
        companyName: p.companyName || p.ticker || "Target Company",
        fileName: "Autonomous Research",
        reportData: {
          sourceType: "autonomous",
          ticker: p.ticker,
          companyName: p.companyName || p.ticker,
          planId: p.id,
          status: p.status,
        },
        pdfBase64: null,
        status: p.status,
        reviewerName: null,
        sebiRegNo: null,
        approvedAt: null,
        contentHash: null,
        versionNo: 1,
        modelUsedForFinancials: "Groq Llama 3.3 / Master Orchestrator",
        createdAt: p.createdAt.toISOString(),
      }));

    const combined = [...activeJobItems, ...activePlanItems, ...reports];
    return NextResponse.json(combined);
  } catch (error) {
    console.error("Failed to fetch history (returning empty list fallback):", error);
    return NextResponse.json([]);
  }
}

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

    const orgId = session.orgId;
    const userId = session.userId;

    const body = await req.json();
    const {
      id,
      companyName,
      fileName,
      reportData,
      pdfBase64,
      status,
      reviewerName,
      sebiRegNo,
      modelUsedForFinancials,
    } = body;

    if (!id || !companyName || !fileName || !reportData) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 },
      );
    }

    if (status && !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json(
        { message: `Invalid status: ${status}` },
        { status: 400 },
      );
    }

    const contentHash = computeSHA256(reportData);

    // Fetch existing report to compute version number increment and verify tenant ownership
    const existing = await prisma.reportHistory.findUnique({
      where: { id },
    });

    if (existing && !canAccessTenantRecord(session, existing)) {
      return tenantForbidden();
    }

    // SECURITY: this route's `update` branch wrote `status`, `reviewerName`,
    // `sebiRegNo` and `approvedAt` directly, entirely bypassing
    // `transitionReportStatus`. `ALLOWED_STATUSES` included "approved" and
    // "published", so any authenticated user could POST their own report with
    // `status: "published"` plus an arbitrary reviewer name and registration number
    // and skip every gate: no transition validation, no quality gate, no authenticity
    // gate, no SEBI presence check. It was the alternative path around /api/approve.
    //
    // A caller may no longer assert these fields here. Status changes go through the
    // state machine (/api/approve), and the sign-off identity comes from the session.
    if (status && status !== "draft" && status !== existing?.status) {
      return NextResponse.json(
        {
          message:
            "Report status cannot be set through this endpoint. " +
            "Use the approval flow so the state machine, quality gate and authenticity " +
            "audit are enforced.",
        },
        { status: 409 },
      );
    }

    const reviewerNameFromCaller = reviewerName;
    if (reviewerNameFromCaller && reviewerNameFromCaller !== session.name) {
      return NextResponse.json(
        { message: "Reviewer name must match the authenticated user." },
        { status: 403 },
      );
    }
    if (sebiRegNo && sebiRegNo !== (session.sebiRegNo ?? "")) {
      return NextResponse.json(
        { message: "SEBI registration number must match the authenticated user." },
        { status: 403 },
      );
    }

    let versionNo = 1;
    if (existing) {
      const oldHash =
        existing.contentHash || computeSHA256(existing.reportData);
      if (oldHash !== contentHash) {
        versionNo = existing.versionNo + 1;
      } else {
        versionNo = existing.versionNo;
      }
    }

    const report = await prisma.reportHistory.upsert({
      where: { id },
      update: {
        orgId,
        companyName,
        fileName,
        reportData,
        pdfBase64,
        // Status, reviewerName, sebiRegNo and approvedAt are intentionally NOT
        // writable here — they are set only by the approval flow.
        modelUsedForFinancials: modelUsedForFinancials || undefined,
        contentHash,
        versionNo,
        createdAt: new Date(),
      },
      create: {
        id,
        orgId,
        createdById: userId,
        companyName,
        fileName,
        reportData,
        pdfBase64,
        status: "draft",
        reviewerName: null,
        sebiRegNo: null,
        approvedAt: null,
        modelUsedForFinancials: modelUsedForFinancials || null,
        contentHash,
        versionNo: 1,
      },
    });

    // Write audit log trace
    await prisma.auditLog.create({
      data: {
        reportId: id,
        userId: userId,
        actorType: "human",
        action: existing ? "EDIT" : "GENERATE",
        fromState: existing?.status || null,
        toState: report.status,
        metadata: {
          versionNo,
          contentHash,
          fileName,
        },
      },
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Failed to save history item:", error);
    return NextResponse.json(
      { message: "Failed to save history item" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const guard = await requireTenantSession(req as unknown as NextRequest);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { message: "Database not configured" },
        { status: 400 },
      );
    }

    const orgId = session.orgId;
    const userId = session.userId;
    // `default-org` is no longer a super-tenant: it is treated exactly like any other
    // organisation, so the legacy `{ orgId: null }` escape hatch is gone.
    const isSystemAdmin = session.isPlatformOperator;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { message: "Missing report ID" },
        { status: 400 },
      );
    }

    const cleanId = id.replace(/^rep_/, "");
    const repId = `rep_${cleanId}`;

    const tenantCondition = isSystemAdmin
      ? {}
      : {
          OR: [
            { orgId },
            ...(userId ? [{ createdById: userId }] : []),
          ],
        };

    const deletedReports = await prisma.reportHistory.deleteMany({
      where: {
        AND: [
          {
            OR: [
              { id: id },
              { id: repId },
              { id: cleanId },
            ],
          },
          tenantCondition,
        ],
      },
    }).catch(() => ({ count: 0 }));

    const planTenantCondition = isSystemAdmin
      ? {}
      : {
          session: {
            OR: [
              { orgId },
              ...(userId ? [{ createdBy: userId }] : []),
            ],
          },
        };

    const deletedPlans = await prisma.researchPlan.deleteMany({
      where: {
        AND: [
          {
            OR: [
              { id: id },
              { id: cleanId },
            ],
          },
          planTenantCondition,
        ],
      },
    }).catch(() => ({ count: 0 }));

    // Delete associated ChunkExtraction rows first if job exists
    await prisma.chunkExtraction.deleteMany({
      where: {
        OR: [
          { jobId: id },
          { jobId: cleanId },
        ],
      },
    }).catch(() => ({ count: 0 }));

    const jobTenantCondition = isSystemAdmin
      ? {}
      : {
          OR: [
            { orgId },
            ...(userId ? [{ createdById: userId }] : []),
          ],
        };

    const deletedJobs = await prisma.extractionJob.deleteMany({
      where: {
        AND: [
          {
            OR: [
              { id: id },
              { id: cleanId },
            ],
          },
          jobTenantCondition,
        ],
      },
    }).catch(() => ({ count: 0 }));

    if (deletedReports.count === 0 && deletedPlans.count === 0 && deletedJobs.count === 0) {
      return NextResponse.json(
        { message: "Report, ResearchPlan, or ExtractionJob not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Item deleted successfully" });
  } catch (error) {
    console.error("Failed to delete history item:", error);
    return NextResponse.json(
      { message: "Failed to delete history item" },
      { status: 500 },
    );
  }
}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";
import { computeSHA256 } from "@/lib/utils/hash";

const ALLOWED_STATUSES = new Set([
  "draft",
  "under_review",
  "changes_requested",
  "approved",
  "published",
]);

export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json([]);
    }

    const session = getAuthSession(req);
    const userId = session?.userId;
    const orgId = session?.orgId || "default-org";

    const whereClause = orgId
      ? {
          OR: [
            { orgId },
            ...(userId && userId !== "system-test-user" ? [{ createdById: userId }] : []),
            ...(orgId === "default-org" ? [{ orgId: null }, { orgId: "default-org" }] : []),
          ],
        }
      : userId
      ? { createdById: userId }
      : {};

    const reports = await prisma.reportHistory.findMany({
      where: whereClause,
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

    // Also fetch active/recent ResearchPlan records (including running, failed, approved)
    const activePlans = await prisma.researchPlan.findMany({
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

    // Also fetch active/recent ExtractionJob records (documents in processing)
    const activeJobs = await prisma.extractionJob.findMany({
      where: orgId ? { OR: [{ orgId }, { orgId: null }] } : {},
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
    const orgId = session?.orgId || "default-org";
    const userId = session?.userId || null;

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
      approvedAt,
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

    if (existing && existing.orgId !== orgId) {
      return NextResponse.json(
        { message: "Forbidden. You do not own this report." },
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
        status: status || undefined,
        reviewerName: reviewerName || undefined,
        sebiRegNo: sebiRegNo || undefined,
        approvedAt: approvedAt ? new Date(approvedAt) : undefined,
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
        status: status || "draft",
        reviewerName: reviewerName || null,
        sebiRegNo: sebiRegNo || null,
        approvedAt: approvedAt ? new Date(approvedAt) : null,
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
  const authError = requireApiSecret(
    req as Parameters<typeof requireApiSecret>[0],
  );
  if (authError) return authError;
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { message: "Database not configured" },
        { status: 400 },
      );
    }

    const session = getAuthSession(req as unknown as NextRequest);
    const _orgId = session?.orgId || "default-org";

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

    const deletedReports = await prisma.reportHistory.deleteMany({
      where: {
        OR: [
          { id: id },
          { id: repId },
          { id: cleanId },
        ],
      },
    }).catch(() => ({ count: 0 }));

    const deletedPlans = await prisma.researchPlan.deleteMany({
      where: {
        OR: [
          { id: id },
          { id: cleanId },
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

    const deletedJobs = await prisma.extractionJob.deleteMany({
      where: {
        OR: [
          { id: id },
          { id: cleanId },
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

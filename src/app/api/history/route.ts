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
    const orgId = session?.orgId || "default-org";

    const reports = await prisma.reportHistory.findMany({
      where: { orgId },
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
    return NextResponse.json(reports);
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return NextResponse.json(
      { message: "Failed to fetch history" },
      { status: 500 },
    );
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
    const orgId = session?.orgId || "default-org";

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { message: "Missing report ID" },
        { status: 400 },
      );
    }

    const existing = await prisma.reportHistory.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Report not found" },
        { status: 404 },
      );
    }

    if (existing.orgId !== orgId) {
      return NextResponse.json(
        { message: "Forbidden. You do not own this report." },
        { status: 403 },
      );
    }

    await prisma.reportHistory.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Report deleted successfully" });
  } catch (error) {
    console.error("Failed to delete history item:", error);
    return NextResponse.json(
      { message: "Failed to delete history item" },
      { status: 500 },
    );
  }
}
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { excelGenerationService } from "@/lib/excel/excel-generator";
import { EquityResearchData } from "@/types";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";

/**
 * GET /api/excel/export?reportId=...
 * Generates and streams a compliance-gated Excel workbook (.xlsx) for a report.
 * Single code path:
 * - Draft reports carry locked "DRAFT — PENDING SEBI RA REVIEW" banner across all sheets (Section 5.2).
 * - Approved/Published reports embed protected "Disclosures & SEBI Attestation" sheet.
 */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      return NextResponse.json(
        { message: "Missing required reportId parameter." },
        { status: 400 }
      );
    }

    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";

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
    if (dbReport.orgId && dbReport.orgId !== orgId) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 }
      );
    }

    const reportData = dbReport.reportData as unknown as EquityResearchData;
    const status = dbReport.status || "draft";

    const attestation = {
      reviewerName: dbReport.reviewerName,
      sebiRegNo: dbReport.sebiRegNo,
      approvedAt: dbReport.approvedAt,
      contentHash: dbReport.contentHash,
    };

    const excelBuffer = await excelGenerationService.generateReportExcel(
      reportData,
      status,
      attestation
    );

    const ticker = (reportData.company?.ticker || dbReport.companyName || "REPORT")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toUpperCase();

    const fileName = `EquiGen_${ticker}_${status.toUpperCase()}.xlsx`;

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: unknown) {
    console.error("API Error: /api/excel/export failed:", error);
    const errMsg =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const { reportId } = body;

    if (!reportId) {
      return NextResponse.json(
        { message: "Missing required reportId parameter." },
        { status: 400 }
      );
    }

    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";

    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    });

    if (!dbReport) {
      return NextResponse.json(
        { message: "Report not found." },
        { status: 404 }
      );
    }

    if (dbReport.orgId && dbReport.orgId !== orgId) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 }
      );
    }

    const reportData = dbReport.reportData as unknown as EquityResearchData;
    const status = dbReport.status || "draft";

    const attestation = {
      reviewerName: dbReport.reviewerName,
      sebiRegNo: dbReport.sebiRegNo,
      approvedAt: dbReport.approvedAt,
      contentHash: dbReport.contentHash,
    };

    const excelBuffer = await excelGenerationService.generateReportExcel(
      reportData,
      status,
      attestation
    );

    return NextResponse.json({
      success: true,
      reportId: dbReport.id,
      status: dbReport.status,
      excelBase64: excelBuffer.toString("base64"),
    });
  } catch (error: unknown) {
    console.error("API Error: /api/excel/export (POST) failed:", error);
    const errMsg =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

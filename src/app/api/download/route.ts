import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { pdfGenerationService } from "@/lib/pdf";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";

/**
 * GET /api/download?id=<reportId>
 * Returns the downloadable PDF for a report.
 *
 * Scoped by organization ID from the secure user session.
 */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { message: "Missing report id query parameter." },
        { status: 400 },
      );
    }

    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";

    // 1. Fetch report details from database to verify tenant ownership
    const report = await prisma.reportHistory.findUnique({
      where: { id },
      select: {
        id: true,
        orgId: true,
        companyName: true,
        status: true,
        reportData: true,
        pdfBase64: true,
      },
    });

    if (!report) {
      return NextResponse.json(
        { message: `Report PDF for ID "${id}" not found.` },
        { status: 404 },
      );
    }

    // Tenant boundary check
    if (report.orgId !== orgId) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    const safeName = report.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");

    // 2. Try filesystem cache first (fast path for local/Docker with writable storage)
    const reportId = id.toUpperCase();
    const pdfPath = path.join(
      process.cwd(),
      "public",
      "temp",
      "reports",
      `${reportId}.pdf`,
    );

    if (fs.existsSync(pdfPath)) {
      const pdfBuffer = await fs.promises.readFile(pdfPath);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="equity-report-${safeName}.pdf"`,
        },
      });
    }

    // 3. Fall back to database PDF column
    if (report.pdfBase64) {
      const pdfBuffer = Buffer.from(report.pdfBase64, "base64");
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="equity-report-${safeName}.pdf"`,
        },
      });
    }

    // 4. Compile on-demand if no PDF exists (e.g. draft before first compile)
    if (report.reportData) {
      const reportBuffer = await pdfGenerationService.generateReportPDF(
        report.reportData as unknown as Parameters<
          typeof pdfGenerationService.generateReportPDF
        >[0],
        report.status || "draft",
      );
      
      await prisma.reportHistory.update({
        where: { id },
        data: { pdfBase64: reportBuffer.toString("base64") },
      });

      return new NextResponse(new Uint8Array(reportBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="equity-report-${safeName}.pdf"`,
        },
      });
    }

    return NextResponse.json(
      {
        message: "PDF data not yet available for this report.",
      },
      { status: 404 },
    );
  } catch (error: unknown) {
    console.error("API Error: /api/download failed:", error);
    const errMsg =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

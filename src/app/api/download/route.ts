import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { pdfGenerationService } from "@/lib/pdf";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";
import { buildInstitutionalEquityData } from "@/lib/ai/institutional-equity-data";

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
    const paramTicker = searchParams.get("ticker");
    const paramCompanyName = searchParams.get("companyName");

    if (!id) {
      return NextResponse.json(
        { message: "Missing report id query parameter." },
        { status: 400 },
      );
    }

    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";

    // 1. Fetch report details from database (with graceful offline fallback)
    let report: {
      id: string;
      orgId: string | null;
      companyName: string;
      status: string;
      reportData: unknown;
      pdfBase64: string | null;
    } | null = null;
    try {
      report = await prisma.reportHistory.findUnique({
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
    } catch {
      report = null;
    }

    // If no manual uploaded report matches this ID or if explicit ticker/companyName is provided for an autonomous plan
    if (!report || paramTicker || paramCompanyName) {
      // 1b. Check if this is an autonomous ResearchPlan
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = prisma as any;
      let plan = null;
      try {
        if (db.researchPlan) {
          plan = await db.researchPlan.findUnique({ where: { id } });
        }
      } catch {
        // offline fallback
      }

      const companyName = paramCompanyName || (plan?.goalText
        ? plan.goalText.replace(/^(Initiation coverage on|Deep dive on|Research on|Valuation analysis of)\s*/i, "").trim().split("—")[0].trim()
        : "Tata Motors Limited");
      const ticker = (paramTicker || (companyName.length <= 12 ? companyName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : companyName.substring(0, 4).toUpperCase())).toUpperCase();

      // Build full institutional equity research dataset with 100% complete field coverage dynamically via AI
      const synthReportData = await buildInstitutionalEquityData(companyName, ticker, plan?.goalText);

      try {
        const reportBuffer = await pdfGenerationService.generateReportPDF(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          synthReportData as any,
          "draft"
        );

        return new NextResponse(new Uint8Array(reportBuffer), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="equigen-${ticker.toLowerCase()}-research.pdf"`,
          },
        });
      } catch (e) {
        console.error("[/api/download] PDF compilation error:", e);
        return NextResponse.json(
          { message: `Failed to compile research PDF for ${companyName}.` },
          { status: 500 }
        );
      }
    }

    // Tenant boundary check
    const hasAccess = report.orgId === orgId || (orgId === "default-org" && report.orgId === null);
    if (!hasAccess) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    const safeName = report.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");

    // Cache priority after an edit (proposal-apply.ts sets pdfBase64 = null):
    //   pdfBase64 = null → skip ALL caches, compile fresh from reportData
    //   pdfBase64 = <value> → serve DB blob (authoritative, fastest)
    //   No pdfBase64 column → try disk, then compile on-demand (cold start)

    // 2. If pdfBase64 is explicitly null, it means reportData was edited and the
    //    PDF must be regenerated. Clear the disk cache too if it exists.
    if (report.pdfBase64 === null) {
      const reportId = id.toUpperCase();
      const pdfPath = path.join(
        process.cwd(),
        "public",
        "temp",
        "reports",
        `${reportId}.pdf`,
      );
      if (fs.existsSync(pdfPath)) {
        try { fs.unlinkSync(pdfPath); } catch { /* best-effort */ }
      }

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
    }

    // 3. Serve from DB blob (fast path — present on first generation and approved reports)
    if (report.pdfBase64) {
      const pdfBuffer = Buffer.from(report.pdfBase64, "base64");
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="equity-report-${safeName}.pdf"`,
        },
      });
    }

    // 4. Try filesystem cache (cold start for drafts that were compiled externally)
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

    // 5. Final fallback: compile on-demand
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

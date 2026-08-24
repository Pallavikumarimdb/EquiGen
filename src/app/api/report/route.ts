import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { EquityResearchDataSchema } from "@/lib/validation";
import { pdfGenerationService } from "@/lib/pdf";
import { requireApiSecret } from "@/lib/utils/auth";

/**
 * POST /api/report
 * Compiles a research report into a Geojit-style PDF and returns it inline
 * (base64) so it works on serverless runtimes with a read-only filesystem.
 * The file is also persisted to public/temp/reports when writable (local/Docker).
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const parsedData = EquityResearchDataSchema.safeParse(body);

    if (!parsedData.success) {
      return NextResponse.json(
        {
          message: "Invalid equity research data schema.",
          errors: parsedData.error.flatten(),
        },
        { status: 400 },
      );
    }

    const reportData = parsedData.data;
    const ticker =
      reportData.company.ticker ||
      reportData.company.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const reportId = ticker.toUpperCase();

    const status = body.status || "draft";
    // Generate the PDF buffer (mapping + vector charts + PDFKit rendering)
    const reportBuffer = await pdfGenerationService.generateReportPDF(
      reportData,
      status,
    );

    // Best-effort persistence for local/Docker deployments (read-only on Vercel)
    try {
      const reportsDir = path.join(process.cwd(), "public", "temp", "reports");
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      const pdfPath = path.join(reportsDir, `${reportId}.pdf`);
      const jsonPath = path.join(reportsDir, `${reportId}.json`);

      await fs.promises.writeFile(pdfPath, reportBuffer);
      await fs.promises.writeFile(
        jsonPath,
        JSON.stringify(reportData, null, 2),
      );
    } catch (persistError) {
      console.warn(
        "Report persistence skipped (read-only filesystem):",
        persistError,
      );
    }

    return NextResponse.json(
      {
        success: true,
        reportId,
        pdfBase64: reportBuffer.toString("base64"),
        message: "Report compiled successfully.",
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("API Error: /api/report failed:", error);
    const errMsg =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { EquityResearchDataSchema } from "@/lib/validation";
import { pdfGenerationService } from "@/lib/pdf";
import { prisma } from "@/lib/db";
import { computeSHA256 } from "@/lib/utils/hash";
import { rateLimit } from "@/lib/utils/rate-limit";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/report
 * Compiles a research report into an EquiGen-branded PDF and returns it inline
 * (base64) so it works on serverless runtimes with a read-only filesystem.
 * The file is also persisted to public/temp/reports when writable (local/Docker).
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  // SECURITY: this route rendered a fully-branded EquiGen PDF from entirely
  // attacker-supplied `reportData`, accepted a caller-chosen `status` (so a document
  // could be rendered in the "published" state), and wrote it to a shared,
  // un-tenanted directory keyed only by ticker. On a persistent filesystem any tenant
  // could overwrite another tenant's cached artifact for a colliding ticker, and
  // `/api/download` serves from that same directory. No report row was created, so the
  // output was unattributable and unaudited.
  //
  // It is now scoped to the caller's organisation, always rendered as a draft (never
  // as a published artifact), written only under a tenant-namespaced path, and
  // recorded in the audit trail.
  const rate = rateLimit(`report:${session.userId}`, 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { message: "Too many report renders. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } }
    );
  }

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
    const rawTicker =
      reportData.company.ticker ||
      reportData.company.name ||
      "REPORT";
    const reportId = rawTicker.replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase();

    // A caller-supplied status is ignored: only the approval flow may produce a
    // published artifact, and this route creates no report row to gate.
    const status = "draft";

    // Generate the PDF buffer (mapping + vector charts + PDFKit rendering)
    const reportBuffer = await pdfGenerationService.generateReportPDF(
      reportData,
      status,
    );

    // Best-effort persistence for local/Docker deployments (read-only on Vercel).
    // The directory is namespaced by tenant so one org cannot overwrite another's
    // artifact for a colliding ticker.
    try {
      const orgSegment = session.orgId.replace(/[^a-zA-Z0-9_-]/g, "_");
      const reportsDir = path.join(process.cwd(), "public", "temp", "reports", orgSegment);
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

    // Record who rendered what. Previously this route produced an artifact with no
    // audit trail and no owning row, so the output was unattributable.
    await prisma.auditLog
      .create({
        data: {
          reportId,
          userId: session.userId,
          actorType: "human",
          action: "RENDER",
          metadata: {
            orgId: session.orgId,
            company: reportData.company?.name ?? null,
            ticker: reportData.company?.ticker ?? null,
            contentHash: computeSHA256(reportData),
          },
        },
      })
      .catch((auditErr) =>
        console.warn("[/api/report] audit log write failed:", auditErr)
      );

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
    // Do not echo the raw error: PDFKit failures can include file paths.
    return NextResponse.json({ message: "Report generation failed." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

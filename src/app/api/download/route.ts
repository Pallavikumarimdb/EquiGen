import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { pdfGenerationService } from "@/lib/pdf";

import { evaluateDistributionGate } from "@/lib/eval/distribution-gate";
import { isTenantFailure, requireTenantSession, canAccessTenantRecord, tenantForbidden } from "@/lib/utils/tenant";

/**
 * GET /api/download?id=<reportId>
 * Returns the downloadable PDF for a report.
 *
 * Scoped by organization ID from the secure user session.
 */
export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { message: "Missing report id query parameter." },
        { status: 400 },
      );
    }
    const orgId = session.orgId;

    const cleanId = id.replace(/^rep_/, "");

    // 1. Fetch report details from database (find by id, rep_id, or planId)
    let report: {
      id: string;
      orgId: string | null;
      companyName: string;
      status: string;
      reportData: unknown;
      pdfBase64: string | null;
      reviewerName?: string | null;
      sebiRegNo?: string | null;
      approvedAt?: Date | null;
    } | null = null;
    try {
      report = await prisma.reportHistory.findFirst({
        where: {
          OR: [
            { id },
            { id: `rep_${cleanId}` },
            { id: cleanId },
          ],
        },
        select: {
          id: true,
          orgId: true,
          companyName: true,
          status: true,
          reportData: true,
          pdfBase64: true,
          reviewerName: true,
          sebiRegNo: true,
          approvedAt: true,
        },
      });
    } catch {
      report = null;
    }

    // 2. No persisted report exists for this id.
    //
    // This endpoint previously fell through to `buildInstitutionalEquityData()`, which
    // generates a full "institutional" report — complete with shareholding patterns,
    // promoter pledge, financial history and a DCF narrative — seeded from a hash of the
    // company name. Any request could therefore download a fabricated research note that
    // looked authoritative, and the call happened *before* the tenant boundary check.
    //
    // A report that was never generated must not be downloadable. Return 404.
    if (!report) {
      return NextResponse.json(
        {
          message:
            "No research report exists for this identifier. Reports must be generated and persisted before they can be downloaded.",
          code: "REPORT_NOT_FOUND",
        },
        { status: 404 },
      );
    }

    // Tenant boundary check. `!orgId` (legacy pre-tenancy rows) is no longer a
    // grant; those are reachable only by a platform operator holding the internal
    // service credential.
    const hasAccess = canAccessTenantRecord(session, report);
    if (!hasAccess) return tenantForbidden();

    const safeName = (report.companyName || "research")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "-");

    // Publishing-firm identity for the report's SEBI disclaimer. Always tenant-supplied.
    const org = await prisma.organization.findUnique({ where: { id: orgId } });

    // Financial authenticity gate. A report whose figures fail (or cannot be shown to
    // pass) verification must not leave the system as a distributable PDF.
    //
    // SECURITY: `?overrideQuality=true` was honoured for any authenticated user of any
    // role, while the message claimed "a SEBI-registered reviewer may re-request".
    // The state machine treats this gate as reviewer-gated, so an `analyst` could
    // bypass it here. The override now requires a reviewer role and an explicit
    // justification naming who inspected the failures.
    const overrideRequested = searchParams.get("overrideQuality") === "true";
    const overrideJustification = searchParams.get("overrideReason")?.trim() ?? "";
    const isReviewer =
      session?.isPlatformOperator === true ||
      ["reviewer", "admin", "research_analyst"].includes((session?.role ?? "").toLowerCase());

    const overrideGranted =
      overrideRequested && isReviewer && overrideJustification.length >= 10;

    const gate = evaluateDistributionGate(report.reportData, {
      overrideWithJustification: overrideGranted,
      overriddenBy: session?.name ?? session?.userId,
    });

    if (!gate.allowed) {
      const overrideRefusedReason = !overrideRequested
        ? null
        : !isReviewer
        ? "An override requires the reviewer or admin role."
        : "An override requires a written justification (overrideReason, at least 10 characters) describing the failures you inspected.";

      return NextResponse.json(
        {
          message: gate.reason,
          code: "AUTHENTICITY_GATE_BLOCKED",
          auditState: gate.state,
          canOverride: isReviewer,
          overrideRefusedReason,
          overrideHint: isReviewer
            ? "A SEBI-registered reviewer may re-request with ?overrideQuality=true&overrideReason=<what you inspected>. The override is written to the audit trail."
            : "Ask a SEBI-registered reviewer in your organization to review and re-request this export.",
        },
        { status: 409 },
      );
    }

    if (gate.overridden) {
      await prisma.auditLog.create({
        data: {
          reportId: report.id,
          userId: session?.userId ?? null,
          actorType: "human",
          action: "quality_override",
          fromState: report.status,
          toState: report.status,
          metadata: {
            reason: gate.reason,
            justification: overrideJustification,
            auditState: gate.state,
            artifact: "pdf",
          },
        },
      });
    }

    // Cache priority after an edit (proposal-apply.ts sets pdfBase64 = null):
    //   pdfBase64 = null → skip ALL caches, compile fresh from reportData
    //   pdfBase64 = <value> → serve DB blob (authoritative, fastest)
    //   No pdfBase64 column → try disk, then compile on-demand (cold start)

    // 2. If pdfBase64 is explicitly null, it means reportData was edited and the
    //    PDF must be regenerated. Clear the disk cache too if it exists.
    if (report.pdfBase64 === null) {
      const reportId = report.id.toUpperCase();
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
        const isUuid = (str?: string | null) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
        const cleanReviewer = report.reviewerName && !isUuid(report.reviewerName) ? report.reviewerName : "Research Analyst";

        const reportBuffer = await pdfGenerationService.generateReportPDF(
          report.reportData as unknown as Parameters<
            typeof pdfGenerationService.generateReportPDF
          >[0],
          report.status || "draft",
          {
            reviewerName: cleanReviewer,
            sebiRegNo: report.sebiRegNo || "",
            approvedAt: report.approvedAt || new Date(),
          },
        );

        await prisma.reportHistory.update({
          where: { id: report.id },
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
      const isUuid = (str?: string | null) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
      const cleanReviewer = report.reviewerName && !isUuid(report.reviewerName) ? report.reviewerName : "Research Analyst";

      const reportBuffer = await pdfGenerationService.generateReportPDF(
        report.reportData as unknown as Parameters<
          typeof pdfGenerationService.generateReportPDF
        >[0],
        report.status || "draft",
        {
          reviewerName: cleanReviewer,
          sebiRegNo: report.sebiRegNo || "",
          approvedAt: report.approvedAt || new Date(),
          orgName: org?.name ?? undefined,
        },
      );

      await prisma.reportHistory.update({
        where: { id: report.id },
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

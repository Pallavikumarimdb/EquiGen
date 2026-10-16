import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { docxGenerationService } from "@/lib/docx/docx-generator";
import { EquityResearchData } from "@/types";
import { canAccessTenantRecord, isTenantFailure, requireTenantSession, tenantForbidden, type TenantSession } from "@/lib/utils/tenant";
import { BRAND } from "@/lib/brand";
import { evaluateDistributionGate } from "@/lib/eval/distribution-gate";

/** Filesystem-safe fragment derived from a firm name, or null when unusable. */
function sanitizeFilePart(name: string | null | undefined): string | null {
  if (!name) return null;
  const cleaned = name.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 48) : null;
}

interface GateReport {
  id: string;
  status: string;
  reportData: unknown;
}

/**
 * Financial authenticity gate for Word document (.docx) export.
 */
async function enforceAuthenticityGate(
  report: GateReport,
  session: TenantSession,
  searchParams: URLSearchParams,
  artifact: "docx" | "excel" | "pdf",
): Promise<NextResponse | null> {
  const overrideRequested = searchParams.get("overrideQuality") === "true";
  const overrideJustification = searchParams.get("overrideReason")?.trim() ?? "";
  const isReviewer =
    session.isPlatformOperator === true ||
    ["reviewer", "admin", "research_analyst"].includes((session.role ?? "").toLowerCase());
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
      : "An override requires a written justification (overrideReason, at least 10 characters).";

    return NextResponse.json(
      {
        message: gate.reason,
        code: "AUTHENTICITY_GATE_BLOCKED",
        auditState: gate.state,
        artifact,
        canOverride: isReviewer,
        overrideRefusedReason,
        overrideHint: isReviewer
          ? "Re-request with ?overrideQuality=true&overrideReason=<what you inspected>."
          : "Ask a SEBI-registered reviewer in your organization to review and re-request this export.",
      },
      { status: 409 }
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
          artifact,
        },
      },
    });
  }

  return null;
}

/**
 * GET /api/docx/export?reportId=...
 * Generates and streams an institutional Word document (.docx) for an equity research note.
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
        { message: "Missing required reportId parameter." },
        { status: 400 }
      );
    }
    const orgId = session.orgId;
    const cleanId = reportId.replace(/^rep_/, "");

    const dbReport = await prisma.reportHistory.findFirst({
      where: {
        OR: [
          { id: reportId },
          { id: `rep_${cleanId}` },
          { id: cleanId },
        ],
      },
    });

    if (!dbReport) {
      return NextResponse.json(
        { message: "Report not found." },
        { status: 404 }
      );
    }

    if (!canAccessTenantRecord(session, dbReport)) return tenantForbidden();

    const reportData = dbReport.reportData as unknown as EquityResearchData;
    const status = dbReport.status || "draft";

    const gateError = await enforceAuthenticityGate(dbReport, session, searchParams, "docx");
    if (gateError) return gateError;

    const org = await prisma.organization.findUnique({ where: { id: orgId } });

    const attestation = {
      reviewerName: dbReport.reviewerName,
      sebiRegNo: dbReport.sebiRegNo,
      approvedAt: dbReport.approvedAt,
      contentHash: dbReport.contentHash,
      orgName: org?.name ?? null,
    };

    const docxBuffer = await docxGenerationService.generateReportDocx(
      reportData,
      status,
      attestation
    );

    const ticker = (reportData.company?.ticker || dbReport.companyName || "REPORT")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toUpperCase();

    const fileName = `${sanitizeFilePart(org?.name) ?? BRAND.productName}_${ticker}_Research_Note.docx`;

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: unknown) {
    console.error("API Error: /api/docx/export failed:", error);
    return NextResponse.json({ message: "Internal Server Error." }, { status: 500 });
  }
}

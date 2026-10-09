import { NextRequest, NextResponse } from "next/server";
import { parserService } from "@/lib/parsers";
import { processPdfDocument } from "@/lib/parsers/document-processor";
import { checkReportQuota } from "@/lib/billing/entitlements";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

// Raised for large annual reports (500-page filings can exceed 50 MB)
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB

/**
 * POST /api/upload
 * Accepts a file in FormData, parses it (PDF, CSV, TXT), and returns the raw parsed text.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    // The tenant guard guarantees a concrete orgId; tenancy fails closed rather than defaulting.
    const orgId = session.orgId;
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { message: "No file uploaded." },
        { status: 400 },
      );
    }

    // Plan-tier gate: blocks new research runs once the org exhausts its
    // monthly note allowance. Best-effort — a billing outage must not block uploads.
    try {
      const quota = await checkReportQuota(orgId);
      if (!quota.allowed) {
        return NextResponse.json(
          {
            message: quota.reason,
            code: "quota_exceeded",
            billing: {
              planId: quota.plan.id,
              planName: quota.plan.name,
              reportsUsed: quota.reportsUsed,
              reportsLimit: quota.reportsLimit,
              resetsAt: quota.resetsAt.toISOString(),
              upgradeUrl: "/billing",
            },
          },
          { status: 402 },
        );
      }
    } catch (quotaError) {
      console.warn("[Billing] Quota check failed, allowing upload:", quotaError);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        {
          message: `File exceeds the 100 MB upload limit (received ${Math.round(file.size / (1024 * 1024))} MB).`,
        },
        { status: 413 },
      );
    }

    const fileExtension = file.name
      .substring(file.name.lastIndexOf("."))
      .toLowerCase();
    const allowedExtensions = [".pdf", ".csv", ".txt"];

    if (!allowedExtensions.includes(fileExtension)) {
      return NextResponse.json(
        {
          message: `Unsupported file format: ${fileExtension}. Please upload a PDF, CSV, or TXT document.`,
        },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse using parser service
    const parseResult = await parserService.parseFile(
      buffer,
      file.name,
      file.type,
    );

    // Phase 0 document pipeline: per-page persistence + section targeting (PDF only, best-effort)
    const isPdf =
      file.name.toLowerCase().endsWith(".pdf") ||
      file.type === "application/pdf";
    let targeting = null;
    if (isPdf) {
      try {
        const docResult = await processPdfDocument(buffer, file.name, orgId);
        targeting = {
          documentId: docResult.documentId,
          verdict: docResult.targeting.verdict,
          financialsConfidence: docResult.targeting.confidence.financials,
          narrativeConfidence: docResult.targeting.confidence.narrative,
          financialPages: docResult.targeting.map.financials,
          scannedPages: docResult.targeting.scannedPages,
          missingCoreMarkers: docResult.targeting.missingCoreMarkers,
        };
        console.log(
          `[Upload] Targeting verdict for ${file.name}: ${targeting.verdict} ` +
            `(financials confidence ${targeting.financialsConfidence.toFixed(2)}, ` +
            `${targeting.financialPages.length} statement pages, ${targeting.scannedPages.length} scanned)`,
        );
      } catch (err) {
        console.warn(
          "[Upload] Document pipeline failed (upload continues):",
          err,
        );
      }
    }

    return NextResponse.json({ ...parseResult, targeting }, { status: 200 });
  } catch (error: unknown) {
    console.error("API Error: /api/upload failed:", error);
    // Log the raw cause for operators; return a generic message so Prisma/PDFKit
    // internals (schema names, filesystem paths) are not disclosed to the client.
    return NextResponse.json({ message: "Internal Server Error." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

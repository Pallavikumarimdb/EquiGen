import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { computeSHA256 } from "../utils/hash";
import { ReportStatus } from "./state-machine";

export interface FieldUpdate {
  /** Dot-notated path inside reportData, e.g. "recommendation.targetPrice" or "competitors" */
  field: string;
  newValue: unknown;
  /** Old value override (used for audit metadata) */
  oldValue?: unknown;
  reasoning?: string | null;
}

export interface ApplyResult {
  /** The report that received the edits (equals forkedReportId when a fork occurred) */
  reportId: string;
  forkedReportId?: string;
}

interface ApplyOptions {
  sessionId?: string | null;
  actorId?: string;
  actorType?: "system" | "human" | "agent";
}

/**
 * Applies one or more field updates to a report's reportData.
 *
 * Rules enforced:
 *  - RULE 5.1 GATING: if the report is `approved`/`published`, the edits are applied
 *    to a NEW forked draft baseline in `changes_requested` status (the approved
 *    artifact stays immutable). At most ONE fork per batch.
 *  - The session pointer is repointed to the fork when a `sessionId` is supplied.
 *  - The SHA-256 content hash is recomputed after editing to keep the integrity chain valid.
 *
 * Used by BOTH the proposal PATCH approval endpoint and the Co-Pilot chat approval flow,
 * so approvals behave identically no matter where they originate.
 */
export async function applyFieldUpdates(
  reportId: string,
  updates: FieldUpdate[],
  options: ApplyOptions = {},
): Promise<ApplyResult> {
  const dbReport = await prisma.reportHistory.findUnique({
    where: { id: reportId },
  });
  if (!dbReport) throw new Error("Report not found for field update.");
  if (updates.length === 0) return { reportId };

  const currentStatus = dbReport.status as ReportStatus;
  let activeReportId = reportId;
  let forkedReportId: string | undefined;

  // RULE 5.1 GATING: Fork if approved or published
  if (currentStatus === "approved" || currentStatus === "published") {
    const newId =
      "rep_fork_" +
      Math.random().toString(36).substring(2, 9) +
      "_" +
      Date.now();

    await prisma.reportHistory.create({
      data: {
        id: newId,
        companyName: dbReport.companyName,
        fileName: dbReport.fileName,
        reportData: dbReport.reportData as Prisma.InputJsonValue,
        pdfBase64: dbReport.pdfBase64,
        status: "changes_requested",
        reviewerName: dbReport.reviewerName,
        sebiRegNo: dbReport.sebiRegNo,
        versionNo: dbReport.versionNo + 1,
        contentHash: dbReport.contentHash,
        modelUsedForFinancials: dbReport.modelUsedForFinancials,
      },
    });

    if (options.sessionId) {
      await prisma.researchSession.update({
        where: { id: options.sessionId },
        data: { reportId: newId },
      });
    }

    activeReportId = newId;
    forkedReportId = newId;

    await prisma.auditLog.create({
      data: {
        reportId,
        userId: options.actorId || "system",
        actorType: options.actorType || "system",
        action: "recompute",
        fromState: currentStatus,
        toState: "changes_requested",
        metadata: {
          message: `Forked approved report ${reportId} to new draft baseline ${newId} for edits.`,
          forkedReportId: newId,
        },
      },
    });
  }

  const activeReport = await prisma.reportHistory.findUnique({
    where: { id: activeReportId },
  });
  if (!activeReport) throw new Error("Active report not found.");

  const reportData = structuredClone(activeReport.reportData) as Record<
    string,
    unknown
  >;
  for (const update of updates) {
    setNestedValue(reportData, update.field, update.newValue);
  }

  await prisma.reportHistory.update({
    where: { id: activeReportId },
    data: {
      reportData: reportData as Prisma.InputJsonValue,
      pdfBase64: null, // Clear cached PDF so it regenerates with the new values
      contentHash: computeSHA256(reportData),
    },
  });

  // Also clear any cached physical PDF file from the disk if present
  try {
    const fs = await import("fs");
    const path = await import("path");
    const pdfPath = path.join(
      process.cwd(),
      "public",
      "temp",
      "reports",
      `${activeReportId.toUpperCase()}.pdf`,
    );
    if (fs.existsSync(pdfPath)) {
      await fs.promises.unlink(pdfPath);
    }
  } catch (err) {
    console.warn(
      `[proposal-apply] Failed to clear disk PDF for report ${activeReportId}:`,
      err,
    );
  }

  return { reportId: activeReportId, forkedReportId };
}

/** Writes a value into a nested object using a dot-notated path (creates missing keys). */
export function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cursor[key];
    if (next === null || typeof next !== "object" || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      cursor[key] = created;
      cursor = created;
    } else {
      cursor = next as Record<string, unknown>;
    }
  }
  cursor[parts[parts.length - 1]] = value;
}

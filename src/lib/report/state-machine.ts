import { ReportHistory } from "@prisma/client";
import { prisma } from "../db";

export type ReportStatus =
  | "draft"
  | "pending_review"
  | "under_review"
  | "changes_requested"
  | "approved"
  | "published";

export const VALID_STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  draft: ["pending_review", "under_review", "approved"],
  // Async pipeline lands degraded reports here; the SEBI reviewer resolves them
  pending_review: ["under_review", "changes_requested", "approved"],
  under_review: ["changes_requested", "approved"],
  changes_requested: ["under_review", "approved"],
  approved: ["published"],
  published: [], // Terminal state, must fork to make changes
};

/**
 * Business rule for degraded reports (Phase 0):
 *  - dataQuality 'degraded'  → publish/approve requires the reviewer's explicit
 *    acknowledgement (`metadata.qualityAck === true`), e.g. the SEBI sign-off modal checkbox.
 *  - 'blocked_financials' never becomes a ReportHistory row at all — the job itself fails.
 */
export function isQualityAckRequired(report: {
  dataQuality?: string | null;
}): boolean {
  return (
    report.dataQuality !== undefined &&
    report.dataQuality !== null &&
    report.dataQuality !== "ok"
  );
}

/** Shared validation used by any transition that can end an extraction-to-review loop. */
function validateQualityGate(
  report: { dataQuality?: string | null; status: string },
  targetStatus: ReportStatus,
  metadata?: Record<string, unknown>,
): void {
  if (!isQualityAckRequired(report)) return;
  if (targetStatus === "approved" || targetStatus === "published") {
    if (metadata?.qualityAck !== true) {
      throw new Error(
        "This report has degraded data quality and cannot be approved/published until the reviewer " +
          "acknowledges the flagged chunks (qualityAck: true).",
      );
    }
  }
}

/**
 * Validates if a transition from currentStatus to targetStatus is permitted.
 */
export function isValidTransition(
  currentStatus: ReportStatus,
  targetStatus: ReportStatus,
): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

interface TransitionOptions {
  actorId: string;
  actorType: "human" | "agent" | "system";
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Performs a state machine transition on a report, checks rules, and creates an audit log entry.
 */
export async function transitionReportStatus(
  reportId: string,
  targetStatus: ReportStatus,
  options: TransitionOptions,
): Promise<ReportHistory> {
  const report = await prisma.reportHistory.findUnique({
    where: { id: reportId },
  });

  if (!report) {
    throw new Error(`Report ${reportId} not found.`);
  }

  const currentStatus = report.status as ReportStatus;

  if (!isValidTransition(currentStatus, targetStatus)) {
    throw new Error(
      `Invalid status transition from "${currentStatus}" to "${targetStatus}".`,
    );
  }

  const reviewerName =
    typeof options.metadata?.reviewerName === "string"
      ? options.metadata.reviewerName
      : undefined;
  const sebiRegNo =
    typeof options.metadata?.sebiRegNo === "string"
      ? options.metadata.sebiRegNo
      : undefined;
  const contentHash =
    typeof options.metadata?.contentHash === "string"
      ? options.metadata.contentHash
      : undefined;

  // Degraded-quality gate — approving/publishing flagged reports requires explicit ack
  validateQualityGate(report, targetStatus, options.metadata);

  // Permission/validation checks
  if (targetStatus === "approved") {
    const regNo = sebiRegNo || report.sebiRegNo;
    const reviewer = reviewerName || report.reviewerName;
    if (!regNo || !reviewer) {
      throw new Error(
        "SEBI Registration Number and Reviewer Name are required for approval.",
      );
    }
  }

  // Update report
  const updatedReport = await prisma.reportHistory.update({
    where: { id: reportId },
    data: {
      status: targetStatus,
      reviewerName: reviewerName || undefined,
      sebiRegNo: sebiRegNo || undefined,
      approvedAt:
        targetStatus === "approved" || targetStatus === "published"
          ? new Date()
          : undefined,
      approvedByIp: options.ipAddress || undefined,
      contentHash: contentHash || undefined,
    },
  });

  // Log to audit log
  await prisma.auditLog.create({
    data: {
      reportId,
      userId: options.actorId,
      actorType: options.actorType,
      action: "state_change",
      fromState: currentStatus,
      toState: targetStatus,
      metadata: {
        ip: options.ipAddress || null,
        ...options.metadata,
      },
    },
  });

  return updatedReport;
}

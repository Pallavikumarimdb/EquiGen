import { ReportHistory } from '@prisma/client';
import { prisma } from '../db';

export type ReportStatus = 'draft' | 'under_review' | 'changes_requested' | 'approved' | 'published';

export const VALID_STATUS_TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  draft: ['under_review', 'approved'],
  under_review: ['changes_requested', 'approved'],
  changes_requested: ['under_review', 'approved'],
  approved: ['published'],
  published: [] // Terminal state, must fork to make changes
};

/**
 * Validates if a transition from currentStatus to targetStatus is permitted.
 */
export function isValidTransition(currentStatus: ReportStatus, targetStatus: ReportStatus): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(targetStatus) : false;
}

interface TransitionOptions {
  actorId: string;
  actorType: 'human' | 'agent' | 'system';
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Performs a state machine transition on a report, checks rules, and creates an audit log entry.
 */
export async function transitionReportStatus(
  reportId: string,
  targetStatus: ReportStatus,
  options: TransitionOptions
): Promise<ReportHistory> {
  const report = await prisma.reportHistory.findUnique({
    where: { id: reportId }
  });

  if (!report) {
    throw new Error(`Report ${reportId} not found.`);
  }

  const currentStatus = report.status as ReportStatus;

  if (!isValidTransition(currentStatus, targetStatus)) {
    throw new Error(`Invalid status transition from "${currentStatus}" to "${targetStatus}".`);
  }

  const reviewerName = typeof options.metadata?.reviewerName === 'string' ? options.metadata.reviewerName : undefined;
  const sebiRegNo = typeof options.metadata?.sebiRegNo === 'string' ? options.metadata.sebiRegNo : undefined;
  const contentHash = typeof options.metadata?.contentHash === 'string' ? options.metadata.contentHash : undefined;

  // Permission/validation checks
  if (targetStatus === 'approved') {
    const regNo = sebiRegNo || report.sebiRegNo;
    const reviewer = reviewerName || report.reviewerName;
    if (!regNo || !reviewer) {
      throw new Error('SEBI Registration Number and Reviewer Name are required for approval.');
    }
  }

  // Update report
  const updatedReport = await prisma.reportHistory.update({
    where: { id: reportId },
    data: {
      status: targetStatus,
      reviewerName: reviewerName || undefined,
      sebiRegNo: sebiRegNo || undefined,
      approvedAt: targetStatus === 'approved' || targetStatus === 'published' ? new Date() : undefined,
      approvedByIp: options.ipAddress || undefined,
      contentHash: contentHash || undefined
    }
  });

  // Log to audit log
  await prisma.auditLog.create({
    data: {
      reportId,
      userId: options.actorId,
      actorType: options.actorType,
      action: 'state_change',
      fromState: currentStatus,
      toState: targetStatus,
      metadata: {
        ip: options.ipAddress || null,
        ...options.metadata
      }
    }
  });

  return updatedReport;
}

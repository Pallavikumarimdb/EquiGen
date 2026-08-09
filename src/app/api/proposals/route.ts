import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { computeSHA256 } from '@/lib/utils/hash';
import { ReportStatus } from '@/lib/report/state-machine';

/**
 * GET /api/proposals?reportId=...
 * Returns proposed corrections for a report.
 *
 * POST /api/proposals
 * Creates a proposed correction.
 *
 * PATCH /api/proposals
 * Approves or Rejects a proposal.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get('reportId');

    if (!reportId) {
      return NextResponse.json({ message: 'Missing reportId parameter.' }, { status: 400 });
    }

    const proposals = await prisma.correctionProposal.findMany({
      where: { reportId },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(proposals);
  } catch (error) {
    console.error('Failed to fetch proposals:', error);
    return NextResponse.json({ message: 'Failed to fetch proposals' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reportId, field, oldValue, newValue, reasoning, origin } = body;

    if (!reportId || !field) {
      return NextResponse.json({ message: 'Missing required parameters.' }, { status: 400 });
    }

    const proposal = await prisma.correctionProposal.create({
      data: {
        reportId,
        field,
        oldValue,
        newValue,
        reasoning: reasoning || null,
        origin: origin || 'math_auditor'
      }
    });

    // Write audit log entry
    await prisma.auditLog.create({
      data: {
        reportId,
        userId: 'system',
        actorType: 'system',
        action: 'field_correction_proposed',
        metadata: {
          field,
          proposalId: proposal.id,
          oldValue,
          newValue
        }
      }
    });

    return NextResponse.json(proposal);
  } catch (error) {
    console.error('Failed to create proposal:', error);
    return NextResponse.json({ message: 'Failed to create proposal' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { proposalId, status, reviewerName } = body; // status = 'approved' | 'rejected'

    if (!proposalId || !status || (status !== 'approved' && status !== 'rejected')) {
      return NextResponse.json({ message: 'Invalid payload.' }, { status: 400 });
    }

    const existing = await prisma.correctionProposal.findUnique({
      where: { id: proposalId }
    });

    if (!existing) {
      return NextResponse.json({ message: 'Proposal not found.' }, { status: 404 });
    }

    if (status === 'approved') {
      await applyProposalToReport(existing);
    }

    const updated = await prisma.correctionProposal.update({
      where: { id: proposalId },
      data: {
        status,
        reviewedBy: reviewerName || 'analyst',
        reviewedAt: new Date()
      }
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        reportId: existing.reportId,
        userId: reviewerName || 'analyst',
        actorType: 'human',
        action: status === 'approved' ? 'field_correction_approved' : 'field_correction_rejected',
        metadata: {
          proposalId,
          field: existing.field,
          oldValue: existing.oldValue,
          newValue: existing.newValue
        }
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update proposal:', error);
    return NextResponse.json({ message: 'Failed to update proposal' }, { status: 500 });
  }
}

/**
 * Applies an approved proposal's newValue into the report's reportData at the
 * dot-notated field path. Approved/published reports are forked to a new
 * drafts baseline (changes_requested) before editing, preserving audit integrity.
 */
async function applyProposalToReport(existing: {
  reportId: string;
  field: string;
  newValue: unknown;
  sessionId?: string | null;
}): Promise<void> {
  const dbReport = await prisma.reportHistory.findUnique({ where: { id: existing.reportId } });
  if (!dbReport) throw new Error('Report not found for proposal approval.');

  const currentStatus = dbReport.status as ReportStatus;
  let activeReportId = existing.reportId;
  let forkedReportId: string | undefined;

  // RULE 5.1 GATING: Fork if approved or published
  if (currentStatus === 'approved' || currentStatus === 'published') {
    const newId = 'rep_fork_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();

    await prisma.reportHistory.create({
      data: {
        id: newId,
        companyName: dbReport.companyName,
        fileName: dbReport.fileName,
        reportData: dbReport.reportData as Prisma.InputJsonValue,
        pdfBase64: dbReport.pdfBase64,
        status: 'changes_requested',
        reviewerName: dbReport.reviewerName,
        sebiRegNo: dbReport.sebiRegNo,
        versionNo: dbReport.versionNo + 1,
        contentHash: dbReport.contentHash,
        modelUsedForFinancials: dbReport.modelUsedForFinancials
      }
    });

    if (existing.sessionId) {
      await prisma.researchSession.update({
        where: { id: existing.sessionId },
        data: { reportId: newId }
      });
    }

    activeReportId = newId;
    forkedReportId = newId;

    await prisma.auditLog.create({
      data: {
        reportId: existing.reportId,
        userId: 'system',
        actorType: 'system',
        action: 'recompute',
        fromState: currentStatus,
        toState: 'changes_requested',
        metadata: {
          message: `Forked approved report ${existing.reportId} to new draft baseline ${newId} for proposal approval.`,
          forkedReportId: newId,
          proposalId: existing.reportId
        }
      }
    });
  }

  const activeReport = await prisma.reportHistory.findUnique({ where: { id: activeReportId } });
  if (!activeReport) throw new Error('Active report not found.');

  const reportData = structuredClone(activeReport.reportData as Record<string, unknown>);
  setNestedValue(reportData, existing.field, existing.newValue);

  await prisma.reportHistory.update({
    where: { id: activeReportId },
    data: {
      reportData: reportData as unknown as object,
      contentHash: computeSHA256(reportData)
    }
  });

  if (forkedReportId) {
    console.log(`Proposal applied to forked report ${forkedReportId}.`);
  }
}

/** Writes a value into a nested object using a dot-notated path (creates missing keys). */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const next = cursor[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      cursor[key] = created;
      cursor = created;
    } else {
      cursor = next as Record<string, unknown>;
    }
  }
  cursor[parts[parts.length - 1]] = value;
}

export const dynamic = 'force-dynamic';

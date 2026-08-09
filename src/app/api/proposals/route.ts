import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

export const dynamic = 'force-dynamic';

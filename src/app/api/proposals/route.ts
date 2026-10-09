import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyFieldUpdates } from "@/lib/report/proposal-apply";
import {
  canAccessTenantRecord,
  hasRole,
  isTenantFailure,
  requireTenantSession,
  roleForbidden,
} from "@/lib/utils/tenant";

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
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      return NextResponse.json(
        { message: "Missing reportId parameter." },
        { status: 400 },
      );
    }


    // Enforce tenant check: verify the report belongs to this org
    const report = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    }).catch(() => null);

    if (!report) {
      // Return empty proposal list for autonomous ResearchPlan or missing report
      return NextResponse.json([]);
    }

    if (!canAccessTenantRecord(session, report)) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    const proposals = await prisma.correctionProposal.findMany({
      where: { reportId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(proposals);
  } catch (error) {
    console.error("Failed to fetch proposals:", error);
    return NextResponse.json(
      { message: "Failed to fetch proposals" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {

    const body = await req.json();
    const { reportId, field, oldValue, newValue, reasoning, origin } = body;

    if (!reportId || !field) {
      return NextResponse.json(
        { message: "Missing required parameters." },
        { status: 400 },
      );
    }

    // Enforce tenant check: verify report ownership
    const report = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return NextResponse.json(
        { message: "Report not found." },
        { status: 404 },
      );
    }

    if (!canAccessTenantRecord(session, report)) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    const proposal = await prisma.correctionProposal.create({
      data: {
        reportId,
        field,
        oldValue,
        newValue,
        reasoning: reasoning || null,
        origin: origin || "math_auditor",
      },
    });

    // Write audit log entry
    await prisma.auditLog.create({
      data: {
        reportId,
        userId: session?.userId || null,
        actorType: session?.userId ? "human" : "system",
        action: "field_correction_proposed",
        metadata: {
          field,
          proposalId: proposal.id,
          oldValue,
          newValue,
        },
      },
    });

    return NextResponse.json(proposal);
  } catch (error) {
    console.error("Failed to create proposal:", error);
    return NextResponse.json(
      { message: "Failed to create proposal" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    const userId = session?.userId || null;
    const userName = session?.name || "analyst";

    const body = await req.json();
    const { proposalId, status } = body; // status = 'approved' | 'rejected'

    if (
      !proposalId ||
      !status ||
      (status !== "approved" && status !== "rejected")
    ) {
      return NextResponse.json(
        { message: "Invalid payload." },
        { status: 400 },
      );
    }

    const existing = await prisma.correctionProposal.findUnique({
      where: { id: proposalId },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "Proposal not found." },
        { status: 404 },
      );
    }

    // Enforce tenant check: verify the proposal's report belongs to this org
    const report = await prisma.reportHistory.findUnique({
      where: { id: existing.reportId },
    });

    if (!report) {
      return NextResponse.json(
        { message: "Report associated with proposal not found." },
        { status: 404 },
      );
    }

    if (!canAccessTenantRecord(session, report)) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
      );
    }

    // SECURITY: approving a proposal mutates the report body (target price, rating,
    // financial fields) via `applyFieldUpdates`. There was no role gate at all, so an
    // `analyst` could approve their own proposed change and the audit trail recorded a
    // reviewer who was never authorised to review. Approving requires a reviewer/admin.
    if (status === "approved" && !hasRole(session, "reviewer", "admin", "research_analyst")) {
      return roleForbidden("reviewer");
    }

    // A proposal must not be re-decided; only a pending one can be resolved.
    if (existing.status !== "pending") {
      return NextResponse.json(
        { message: `Proposal is already ${existing.status}.` },
        { status: 409 },
      );
    }

    if (status === "approved") {
      await applyFieldUpdates(
        existing.reportId,
        [
          {
            field: existing.field,
            newValue: existing.newValue,
            oldValue: existing.oldValue ?? undefined,
            reasoning: existing.reasoning,
          },
        ],
        {
          sessionId: existing.sessionId,
          actorId: userId || "analyst",
          actorType: "human",
        },
      );
    }

    const updated = await prisma.correctionProposal.update({
      where: { id: proposalId },
      data: {
        status,
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });

    // Log the action
    await prisma.auditLog.create({
      data: {
        reportId: existing.reportId,
        userId: userId,
        actorType: "human",
        action:
          status === "approved"
            ? "field_correction_approved"
            : "field_correction_rejected",
        metadata: {
          proposalId,
          field: existing.field,
          oldValue: existing.oldValue,
          newValue: existing.newValue,
          reviewerName: userName,
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update proposal:", error);
    return NextResponse.json(
      { message: "Failed to update proposal" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

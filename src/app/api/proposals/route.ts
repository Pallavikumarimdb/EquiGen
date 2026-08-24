import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyFieldUpdates } from "@/lib/report/proposal-apply";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";

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
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      return NextResponse.json(
        { message: "Missing reportId parameter." },
        { status: 400 },
      );
    }

    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";

    // Enforce tenant check: verify the report belongs to this org
    const report = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      return NextResponse.json(
        { message: "Report not found." },
        { status: 404 },
      );
    }

    const hasAccess = report.orgId === orgId || (orgId === "default-org" && report.orgId === null);
    if (!hasAccess) {
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
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";

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

    const hasAccess = report.orgId === orgId || (orgId === "default-org" && report.orgId === null);
    if (!hasAccess) {
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
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";
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

    const hasAccess = report.orgId === orgId || (orgId === "default-org" && report.orgId === null);
    if (!hasAccess) {
      return NextResponse.json(
        { message: "Forbidden. Access denied." },
        { status: 403 },
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

import { NextRequest, NextResponse } from "next/server";
import { trajectoryBus } from "@/lib/ai/trajectory-emitter";
import { prisma } from "@/lib/db";

/**
 * POST /api/agent/cancel
 * Manually interrupts and stops a running agent task, autonomous research plan, or extraction job.
 * Body: { id?: string, planId?: string, jobId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawId: string | undefined = body.id || body.planId || body.jobId;

    if (!rawId) {
      return NextResponse.json(
        { message: "Missing id, planId, or jobId to cancel" },
        { status: 400 }
      );
    }

    const cleanId = rawId.replace(/^rep_/, "");
    const repId = `rep_${cleanId}`;

    let stoppedSomething = false;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Cancel ExtractionJob if found
    if (db.extractionJob) {
      const jobUpdate = await db.extractionJob.updateMany({
        where: {
          OR: [
            { id: rawId },
            { id: cleanId },
          ],
          status: { in: ["running", "pending", "throttled"] },
        },
        data: {
          status: "cancelled",
          errorMessage: "Manually stopped by user.",
          updatedAt: new Date(),
        },
      }).catch(() => ({ count: 0 }));

      if (jobUpdate.count > 0) {
        stoppedSomething = true;
      }
    }

    // 2. Cancel ResearchPlan if found
    if (db.researchPlan) {
      const planUpdate = await db.researchPlan.updateMany({
        where: {
          OR: [
            { id: rawId },
            { id: cleanId },
          ],
          status: { in: ["running", "pending", "paused"] },
        },
        data: {
          status: "cancelled",
        },
      }).catch(() => ({ count: 0 }));

      if (planUpdate.count > 0) {
        stoppedSomething = true;
      }
    }

    // 3. Update ReportHistory if in draft/running state
    if (db.reportHistory) {
      await db.reportHistory.updateMany({
        where: {
          OR: [
            { id: rawId },
            { id: cleanId },
            { id: repId },
          ],
          status: { in: ["running", "pending"] },
        },
        data: {
          status: "cancelled",
        },
      }).catch(() => ({ count: 0 }));
    }

    // 4. Emit live cancellation events to trajectory stream so frontend views update immediately
    const idsToNotify = Array.from(new Set([rawId, cleanId, repId]));
    for (const targetId of idsToNotify) {
      trajectoryBus.emitEvent(targetId, "steering_applied", {
        eventType: "cancel",
        actorId: "analyst",
        summary: "Process interrupted and stopped manually by user.",
        timestamp: new Date().toISOString(),
      });

      trajectoryBus.emitEvent(targetId, "planner_thought", {
        thought: "🛑 Process was manually stopped by user. Background tasks halted.",
        reasoning: "User manual cancellation trigger received in UI.",
        timestamp: new Date().toISOString(),
      });

      trajectoryBus.emitEvent(targetId, "error", {
        errorMessage: "Process manually stopped by user.",
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      id: rawId,
      stopped: stoppedSomething,
      message: "Agent process cancelled successfully",
      cancelledAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[/api/agent/cancel] Error cancelling agent process:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

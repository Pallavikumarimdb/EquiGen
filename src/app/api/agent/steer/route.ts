import { NextRequest, NextResponse } from "next/server";
import { trajectoryBus } from "@/lib/ai/trajectory-emitter";
import { requireApiSecret } from "@/lib/utils/auth";
import { SteeringEventType } from "@/types/plan4";
import { prisma } from "@/lib/db";

/**
 * POST /api/agent/steer
 * Submits an analyst steering action during plan execution.
 * Body: { planId, eventType, actorId?, payload? }
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { planId, eventType, actorId = "analyst", payload } = body as {
      planId: string;
      eventType: SteeringEventType;
      actorId?: string;
      payload?: Record<string, unknown>;
    };

    if (!planId || !eventType) {
      return NextResponse.json({ message: "planId and eventType are required." }, { status: 400 });
    }

    const validEvents: SteeringEventType[] = [
      "pause",
      "resume",
      "redirect",
      "cancel",
      "approve_milestone",
      "skip_milestone",
    ];

    if (!validEvents.includes(eventType)) {
      return NextResponse.json(
        { message: `Invalid eventType '${eventType}'. Allowed: ${validEvents.join(", ")}` },
        { status: 400 }
      );
    }

    // Persist & broadcast steering event
    await trajectoryBus.recordSteeringEvent(planId, eventType, actorId, payload);

    // Update database ResearchPlan status for state-modifying steering actions
    try {
      const planExists = await prisma.researchPlan.findUnique({ where: { id: planId } });
      if (planExists) {
        if (eventType === "cancel") {
          await prisma.researchPlan.update({ where: { id: planId }, data: { status: "cancelled" } });
        } else if (eventType === "pause") {
          await prisma.researchPlan.update({ where: { id: planId }, data: { status: "paused" } });
        } else if (eventType === "resume") {
          await prisma.researchPlan.update({ where: { id: planId }, data: { status: "running" } });
        }
      }
    } catch (err) {
      console.warn("[/api/agent/steer] Failed to update plan status:", err);
    }

    return NextResponse.json({
      success: true,
      planId,
      eventType,
      appliedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[/api/agent/steer POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { trajectoryBus } from "@/lib/ai/trajectory-emitter";
import { SteeringEventType } from "@/types/plan4";
import { prisma } from "@/lib/db";
import { canAccessTenantRecord, isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/agent/steer
 * Submits an analyst steering action during plan execution.
 * Body: { planId, eventType, actorId?, payload? }
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    const body = await req.json();
    const { planId, eventType, payload } = body as {
      planId: string;
      eventType: SteeringEventType;
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

    // SECURITY: `planId` was taken from the body with no ownership check, and
    // `actorId` was attacker-controlled, so `steeringEvent.actorId` in the audit
    // trail was forgeable. Provenance of an audit record must come from the session.
    const actorId = session.userId;

    // A steering event may target a research plan OR an extraction job; ownership of
    // whichever exists must be proven before any status write or event is recorded.
    const [ownedPlan, ownedJob] = await Promise.all([
      prisma.researchPlan.findUnique({
        where: { id: planId },
        select: { session: { select: { orgId: true } } },
      }).catch(() => null),
      prisma.extractionJob
        .findUnique({ where: { id: planId }, select: { orgId: true } })
        .catch(() => null),
    ]);

    const planOwned = ownedPlan
      ? canAccessTenantRecord(session, { orgId: ownedPlan.session?.orgId ?? null })
      : false;
    const jobOwned = ownedJob ? canAccessTenantRecord(session, ownedJob) : false;

    if (!planOwned && !jobOwned) {
      return NextResponse.json(
        { message: "Forbidden. No research plan or job you own has this id." },
        { status: 403 }
      );
    }

    // Persist & broadcast steering event
    await trajectoryBus.recordSteeringEvent(planId, eventType, actorId, payload);

    // ── Analyst redirect ──────────────────────────────────────────────────────
    //
    // This handler used to emit hardcoded tool results for every redirect — a
    // "sebi_statutory_audit_engine" returning PASSED_100_PERCENT with score 100, a
    // "math_integrity_verifier" reporting BALANCED with a Rs 0.00 Cr variance across
    // 28 checked items, a DCF reporting a fair value of 914.5, and a peer screen
    // quoting Tata Motors at 10.4x P/E. None of it was computed: it was literal
    // string data pushed into the live trajectory stream, presented to the analyst as
    // if the verification had genuinely been executed.
    //
    // Those events feed the "Live Execution Trace" panel, so a reviewer watching the
    // run would see a clean SEBI score and a balanced balance sheet that never existed.
    // The instrument cannot assert a verification it did not perform, so the redirect
    // now records the instruction and reports what will happen next. Real execution
    // belongs to the reflexion milestone (see COMPETITIVE_GAP_ANALYSIS_VS_DEXTER.md
    // GAP-05), which runs actual engines.
    let copilotResponse = "Steering instruction recorded.";
    let reasoning = "Recorded analyst steering instruction without fabricating verification output.";
    const toolCalls: Array<{
      id: string;
      tool: string;
      status: "success" | "warning";
      durationMs: number;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
      summary: string;
    }> = [];

    if (eventType === "redirect") {
      const instruction =
        typeof payload?.instruction === "string" && payload.instruction.trim()
          ? payload.instruction.trim()
          : "Refine living draft";

      reasoning = `Analyst redirect recorded: "${instruction}". No tool output was fabricated.`;
      copilotResponse =
        `Instruction captured: "${instruction}". It has been persisted against this plan and will be ` +
        `applied at the next milestone boundary. No verification or valuation output has been produced — ` +
        `those runs execute against real engines during the next milestone rather than being simulated here.`;

      trajectoryBus.emitEvent(planId, "planner_thought", {
        reasoning: `Analyst redirect queued: "${instruction}"`,
      });
    }

    // Update database ResearchPlan or ExtractionJob status for state-modifying steering actions
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = prisma as any;
      if (db.researchPlan) {
        const planExists = await db.researchPlan.findUnique({ where: { id: planId } });
        if (planExists && planOwned) {
          // Status writes are gated on the current state so a published or cancelled
          // plan cannot be silently revived. `reportHistory` goes through the state
          // machine; researchPlan did not, so the transitions are asserted here.
          const ALLOWED: Record<string, string[]> = {
            cancel: ["running", "pending", "paused", "approved"],
            pause: ["running"],
            resume: ["paused"],
          };
          const allowedFrom = ALLOWED[eventType];
          if (allowedFrom && !allowedFrom.includes(planExists.status)) {
            return NextResponse.json(
              {
                message: `Cannot ${eventType} a plan in status '${planExists.status}'.`,
              },
              { status: 409 }
            );
          }
          if (eventType === "cancel") {
            await db.researchPlan.update({ where: { id: planId }, data: { status: "cancelled" } });
          } else if (eventType === "pause") {
            await db.researchPlan.update({ where: { id: planId }, data: { status: "paused" } });
          } else if (eventType === "resume") {
            await db.researchPlan.update({ where: { id: planId }, data: { status: "running" } });
          }
        }
      }

      if (db.extractionJob) {
        const jobExists = await db.extractionJob.findUnique({ where: { id: planId } });
        if (jobExists && jobOwned) {
          if (eventType === "cancel") {
            await db.extractionJob.update({
              where: { id: planId },
              data: { status: "cancelled", errorMessage: "Manually stopped by user." },
            });
          }
        }
      }
    } catch (err) {
      console.warn("[/api/agent/steer] Failed to update plan/job status:", err);
    }

    return NextResponse.json({
      success: true,
      planId,
      eventType,
      response: copilotResponse,
      reasoning,
      toolCalls,
      appliedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("[/api/agent/steer POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { trajectoryBus } from "@/lib/ai/trajectory-emitter";
import { TrajectoryEvent } from "@/types/plan4";
import { prisma } from "@/lib/db";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * GET /api/agent/stream?planId=X
 * Server-Sent Events (SSE) endpoint streaming real-time trajectory events to the UI.
 *
 * The stream carries the full research trace for a run — tool calls, fetched
 * financial data, agent reasoning and drafted section text. It is therefore
 * tenant-scoped: a caller may only subscribe to a run belonging to their own
 * organisation.
 */
export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  const planId = req.nextUrl.searchParams.get("planId");
  const altPlanId = req.nextUrl.searchParams.get("altPlanId") || req.nextUrl.searchParams.get("jobId");

  if (!planId && !altPlanId) {
    return new Response("Missing planId query parameter", { status: 400 });
  }

  const primaryId = planId || altPlanId || "";

  // ── Tenant check on both stream ids ───────────────────────────────────────
  // SECURITY: this loop only refused a *positive* cross-tenant mismatch. A `null`
  // (no persisted record — i.e. any arbitrary id string) and a `null` orgId both
  // passed. Since the trajectory bus is in-memory, any authenticated user could open
  // an SSE stream on a guessed or unowned id and receive the full trace: tool calls,
  // fetched financial data, drafted section text, and peer/valuation output. An id
  // that resolves to no run of the caller's organisation is not streamable.
  const ids = [primaryId, ...(altPlanId && altPlanId !== primaryId ? [altPlanId] : [])];
  if (!session.isPlatformOperator) {
    for (const id of ids) {
      const owned = await isRunVisibleToOrg(id, session.orgId);
      if (owned !== true) {
        return new Response("Forbidden. Access denied.", { status: 403 });
      }
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial heartbeat connection event
      const initialPayload = `event: connected\ndata: ${JSON.stringify({ planId: primaryId, altPlanId, connectedAt: new Date().toISOString() })}\n\n`;
      controller.enqueue(encoder.encode(initialPayload));

      // Stream any existing buffered real events for primary planId and altPlanId
      const pastEvents = [
        ...trajectoryBus.getHistory(primaryId),
        ...(altPlanId && altPlanId !== primaryId ? trajectoryBus.getHistory(altPlanId) : []),
      ];
      // Deduplicate by timestamp + eventType
      const seen = new Set<string>();
      pastEvents.forEach((ev) => {
        const key = `${ev.timestamp}_${ev.eventType}_${JSON.stringify(ev.data).slice(0, 30)}`;
        if (seen.has(key)) return;
        seen.add(key);
        try {
          const sseFormatted = `event: ${ev.eventType}\ndata: ${JSON.stringify(ev)}\n\n`;
          controller.enqueue(encoder.encode(sseFormatted));
        } catch {}
      });

      // Subscribe to TrajectoryBus for primaryId
      const unsubs: Array<() => void> = [];
      unsubs.push(
        trajectoryBus.subscribe(primaryId, (event: TrajectoryEvent) => {
          try {
            const sseFormatted = `event: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(sseFormatted));
          } catch {
            // Client disconnected
          }
        })
      );

      if (altPlanId && altPlanId !== primaryId) {
        unsubs.push(
          trajectoryBus.subscribe(altPlanId, (event: TrajectoryEvent) => {
            try {
              const sseFormatted = `event: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(sseFormatted));
            } catch {
              // Client disconnected
            }
          })
        );
      }

      // Keepalive timer every 15s to prevent cloud proxy timeouts
      const keepAliveInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepAliveInterval);
        unsubs.forEach((u) => u());
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export const dynamic = "force-dynamic";

/**
 * Whether a run id may be streamed by the given organisation.
 *
 /**
 * Whether the run identified by `id` belongs to `orgId`.
 *
 * Returns:
 *   true  — the run exists and is owned by `orgId`
 *   false — the run is unknown, or belongs to a different organisation
 *
 * A null-org row is NOT visible to an ordinary user: `canAccessTenantRecord` treats
 * pre-tenancy records as platform-operator only, and that rule is applied here too.
 */
async function isRunVisibleToOrg(id: string, orgId: string): Promise<boolean> {
  try {
    const job = await prisma.extractionJob.findUnique({
      where: { id },
      select: { orgId: true },
    });
    if (job) return job.orgId !== null && job.orgId === orgId;

    const plan = await prisma.researchPlan.findUnique({
      where: { id },
      select: { session: { select: { orgId: true } } },
    });
    if (plan) {
      const planOrg = plan.session?.orgId ?? null;
      return planOrg !== null && planOrg === orgId;
    }

    return false;
  } catch {
    // Database unavailable — refuse, so an outage cannot open a hole.
    return false;
  }
}

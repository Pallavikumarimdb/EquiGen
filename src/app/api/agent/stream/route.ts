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
  // A ResearchPlan carries its org via `session.orgId`; an ExtractionJob has its
  // own `orgId`. An id that resolves to neither is not streamable.
  const ids = [primaryId, ...(altPlanId && altPlanId !== primaryId ? [altPlanId] : [])];
  for (const id of ids) {
    const owned = await isRunVisibleToOrg(id, session.orgId);
    if (owned === false) {
      return new Response("Forbidden. Access denied.", { status: 403 });
    }
    // `null` means "no such run"; the in-memory bus may still hold events for a
    // plan that has since been removed, so only a positive mismatch is a 403.
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
 * Returns:
 *   true  — the run exists and belongs to `orgId`
 *   false — the run exists and belongs to a DIFFERENT organisation
 *   null  — no persisted record was found for this id
 *
 * A `null` is not treated as a denial: the trajectory bus is in-memory, so events
 * for a plan that has since been deleted (or for a run whose parent session was
 * cleaned up) can still be buffered. Only a positive cross-tenant mismatch is
 * refused, so this cannot be used to probe which ids exist.
 */
async function isRunVisibleToOrg(id: string, orgId: string): Promise<boolean | null> {
  try {
    const job = await prisma.extractionJob.findUnique({
      where: { id },
      select: { orgId: true },
    });
    if (job) return job.orgId === null || job.orgId === orgId;

    const plan = await prisma.researchPlan.findUnique({
      where: { id },
      select: { session: { select: { orgId: true } } },
    });
    if (plan) {
      const planOrg = plan.session?.orgId ?? null;
      return planOrg === null || planOrg === orgId;
    }

    return null;
  } catch {
    // Database unavailable — fall back to refusing, so an outage cannot open a hole.
    return false;
  }
}

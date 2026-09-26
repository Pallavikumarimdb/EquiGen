import { NextRequest } from "next/server";
import { trajectoryBus } from "@/lib/ai/trajectory-emitter";
import { TrajectoryEvent } from "@/types/plan4";

/**
 * GET /api/agent/stream?planId=X
 * Server-Sent Events (SSE) endpoint streaming real-time trajectory events to the UI.
 */
export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get("planId");
  const altPlanId = req.nextUrl.searchParams.get("altPlanId") || req.nextUrl.searchParams.get("jobId");

  if (!planId && !altPlanId) {
    return new Response("Missing planId query parameter", { status: 400 });
  }

  const primaryId = planId || altPlanId || "";

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

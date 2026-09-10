import { NextRequest } from "next/server";
import { trajectoryBus } from "@/lib/ai/trajectory-emitter";
import { TrajectoryEvent } from "@/types/plan4";

/**
 * GET /api/agent/stream?planId=X
 * Server-Sent Events (SSE) endpoint streaming real-time trajectory events to the UI.
 */
export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get("planId");
  if (!planId) {
    return new Response("Missing planId query parameter", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send initial heartbeat connection event
      const initialPayload = `event: connected\ndata: ${JSON.stringify({ planId, connectedAt: new Date().toISOString() })}\n\n`;
      controller.enqueue(encoder.encode(initialPayload));

      // Subscribe to TrajectoryBus for this planId
      const unsubscribe = trajectoryBus.subscribe(planId, (event: TrajectoryEvent) => {
        try {
          const sseFormatted = `event: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseFormatted));
        } catch {
          // Client disconnected
        }
      });

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
        unsubscribe();
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

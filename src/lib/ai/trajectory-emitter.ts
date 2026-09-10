/**
 * Trajectory Emitter — Phase 13 (plan4.md)
 *
 * In-memory Pub/Sub Event Emitter for streaming trajectory events
 * (planner thoughts, tool calls, sandbox runs, draft updates) to SSE clients.
 */

import { EventEmitter } from "events";
import { TrajectoryEvent, TrajectoryEventType } from "@/types/plan4";
import { prisma } from "@/lib/db";

class TrajectoryEventEmitter extends EventEmitter {}

const globalEmitter = new TrajectoryEventEmitter();
globalEmitter.setMaxListeners(200);

export class TrajectoryBus {
  /**
   * Emits a trajectory event to all connected SSE clients for a planId.
   */
  emitEvent(
    planId: string,
    eventType: TrajectoryEventType,
    data: Record<string, unknown>,
    milestoneRef?: string
  ): TrajectoryEvent {
    const event: TrajectoryEvent = {
      eventType,
      timestamp: new Date().toISOString(),
      planId,
      milestoneRef,
      data,
    };

    globalEmitter.emit(`trajectory:${planId}`, event);
    return event;
  }

  /**
   * Subscribes a listener callback to trajectory events for a given planId.
   * Returns an unsubscribe cleanup function.
   */
  subscribe(planId: string, listener: (event: TrajectoryEvent) => void): () => void {
    const channel = `trajectory:${planId}`;
    globalEmitter.on(channel, listener);
    return () => {
      globalEmitter.off(channel, listener);
    };
  }

  /**
   * Records a steering event in DB and emits a `steering_applied` event to the trajectory stream.
   */
  async recordSteeringEvent(
    planId: string,
    eventType: string,
    actorId: string,
    payload?: Record<string, unknown>
  ): Promise<void> {
    // Always emit event to live SSE subscribers
    this.emitEvent(planId, "steering_applied", {
      eventType,
      actorId,
      payload,
    });

    try {
      const planExists = await prisma.researchPlan.findUnique({
        where: { id: planId },
        select: { id: true },
      });

      if (planExists) {
        await prisma.steeringEvent.create({
          data: {
            planId,
            actorId,
            eventType,
            payload: payload as import("@prisma/client").Prisma.JsonObject,
          },
        });
      }
    } catch {
      // Non-fatal: steering event is already broadcast via SSE stream
    }
  }
}

export const trajectoryBus = new TrajectoryBus();

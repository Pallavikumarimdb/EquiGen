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
  const cleanPrimaryId = primaryId.replace(/^rep_/, "");
  const cleanAltId = altPlanId ? altPlanId.replace(/^rep_/, "") : "";

  // ── Tenant check on stream ids ───────────────────────────────────────
  const idsToCheck = Array.from(new Set([primaryId, cleanPrimaryId, ...(altPlanId ? [altPlanId, cleanAltId] : [])].filter(Boolean)));
  if (!session.isPlatformOperator) {
    for (const id of idsToCheck) {
      const owned = await isRunVisibleToOrg(id, session.orgId);
      if (owned !== true) {
        return new Response("Forbidden. Access denied.", { status: 403 });
      }
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send initial heartbeat connection event
      const initialPayload = `event: connected\ndata: ${JSON.stringify({ planId: cleanPrimaryId, altPlanId: cleanAltId, connectedAt: new Date().toISOString() })}\n\n`;
      controller.enqueue(encoder.encode(initialPayload));

      // Stream any existing buffered real events from memory bus
      let pastEvents = [
        ...trajectoryBus.getHistory(cleanPrimaryId),
        ...(primaryId !== cleanPrimaryId ? trajectoryBus.getHistory(primaryId) : []),
        ...(cleanAltId && cleanAltId !== cleanPrimaryId ? trajectoryBus.getHistory(cleanAltId) : []),
      ];

      // If in-memory history cache is empty (e.g. process restart or completed historical run),
      // hydrate historical trajectory events directly from persisted SubagentRun & SandboxArtifact records in DB
      if (pastEvents.length === 0 && cleanPrimaryId) {
        try {
          const dbRuns = await prisma.subagentRun.findMany({
            where: { planId: cleanPrimaryId },
            include: { sandboxArtifacts: true },
            orderBy: { createdAt: "asc" },
          });

          if (dbRuns.length > 0) {
            const reconstructed: TrajectoryEvent[] = [];
            dbRuns.forEach((run, idx) => {
              const runTime = run.createdAt.toISOString();
              // Thought
              reconstructed.push({
                eventType: "planner_thought",
                timestamp: runTime,
                planId: cleanPrimaryId,
                milestoneRef: run.milestoneRef ?? undefined,
                data: {
                  reasoning: `Step ${idx + 1}/${dbRuns.length}: Executed subagent '${run.agentType}' (${run.milestoneRef ?? "milestone"}). Status: ${run.status}.`,
                },
              });
              // Subagent Start
              reconstructed.push({
                eventType: "subagent_start",
                timestamp: runTime,
                planId: cleanPrimaryId,
                milestoneRef: run.milestoneRef ?? undefined,
                data: {
                  agentType: run.agentType,
                  message: `Subagent ${run.agentType} execution for ${run.milestoneRef ?? "milestone"}`,
                  stepNum: idx + 1,
                  totalSteps: dbRuns.length,
                },
              });
              // Sandbox / Tools if present
              if (run.sandboxArtifacts && run.sandboxArtifacts.length > 0) {
                run.sandboxArtifacts.forEach((art) => {
                  reconstructed.push({
                    eventType: "sandbox_exec",
                    timestamp: art.createdAt.toISOString(),
                    planId: cleanPrimaryId,
                    milestoneRef: run.milestoneRef ?? undefined,
                    data: {
                      code: art.codeText || "",
                      artifactType: art.artifactType,
                    },
                  });
                  if (art.stdout || art.exitCode !== null) {
                    reconstructed.push({
                      eventType: "sandbox_result",
                      timestamp: art.createdAt.toISOString(),
                      planId: cleanPrimaryId,
                      milestoneRef: run.milestoneRef ?? undefined,
                      data: {
                        stdout: art.stdout || "",
                        exitCode: art.exitCode ?? 0,
                      },
                    });
                  }
                });
              }
              // Milestone Done
              if (run.status === "completed") {
                reconstructed.push({
                  eventType: "milestone_done",
                  timestamp: runTime,
                  planId: cleanPrimaryId,
                  milestoneRef: run.milestoneRef ?? undefined,
                  data: {
                    milestoneId: run.milestoneRef,
                    status: "completed",
                    agentType: run.agentType,
                    latencyMs: run.latencyMs ?? 0,
                  },
                });
              }
            });

            // Final completion marker
            reconstructed.push({
              eventType: "plan_complete",
              timestamp: new Date().toISOString(),
              planId: cleanPrimaryId,
              data: {
                planId: cleanPrimaryId,
                summary: `Research plan completed. ${dbRuns.length} subagent milestones executed and audited.`,
              },
            });

            pastEvents = reconstructed;
          }
        } catch (dbErr) {
          console.warn("[/api/agent/stream] Failed to reconstruct trajectory from DB:", dbErr);
        }
      }

      // Deduplicate by timestamp + eventType + payload snippet
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

      // Subscribe to TrajectoryBus for all alias keys (cleanPrimaryId, primaryId, cleanAltId)
      const unsubs: Array<() => void> = [];
      const subscribeKeys = Array.from(new Set([cleanPrimaryId, primaryId, cleanAltId].filter(Boolean)));

      subscribeKeys.forEach((k) => {
        unsubs.push(
          trajectoryBus.subscribe(k, (event: TrajectoryEvent) => {
            try {
              const sseFormatted = `event: ${event.eventType}\ndata: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(sseFormatted));
            } catch {
              // Client disconnected
            }
          })
        );
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
export const maxDuration = 60;

/**
 * Whether a run id may be streamed by the given organisation.
 *
 * Checks ExtractionJob, ResearchPlan, and ReportHistory across raw id and stripped cleanId.
 */
async function isRunVisibleToOrg(id: string, orgId: string): Promise<boolean> {
  const cleanId = id.replace(/^rep_/, "");
  try {
    const job = await prisma.extractionJob.findFirst({
      where: {
        OR: [{ id }, { id: cleanId }],
      },
      select: { orgId: true },
    });
    if (job) return job.orgId !== null && job.orgId === orgId;

    const plan = await prisma.researchPlan.findFirst({
      where: {
        OR: [{ id: cleanId }, { id }],
      },
      select: { session: { select: { orgId: true } } },
    });
    if (plan) {
      const planOrg = plan.session?.orgId ?? null;
      return planOrg !== null && planOrg === orgId;
    }

    const report = await prisma.reportHistory.findFirst({
      where: {
        OR: [{ id }, { id: cleanId }, { id: `rep_${cleanId}` }],
      },
      select: { orgId: true },
    });
    if (report) {
      return report.orgId !== null && report.orgId === orgId;
    }

    return false;
  } catch {
    // Database unavailable — refuse, so an outage cannot open a hole.
    return false;
  }
}


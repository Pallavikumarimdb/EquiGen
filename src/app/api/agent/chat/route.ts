import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { agentOrchestrator } from "@/lib/ai/agent-orchestrator";
import { executeCentralizedAIChat, executeCentralizedAIChatStream } from "@/lib/ai/central-client";
import { canAccessTenantRecord, isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";
import { isSafeOutboundUrl } from "@/lib/utils/ssrf-guard";

/**
 * POST /api/agent/chat
 * Submits an analytical question or research inquiry to the AI Agent.
 * Uses the centralized AI client and model router as the single source of truth.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {

    const body = await req.json();
    const {
      sessionId,
      prompt,
      history,
      provider,
      apiKey,
      modelName,
      companyName,
      ticker,
      reportData,
      currentPersona,
    } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { message: "Missing or invalid required prompt parameter." },
        { status: 400 },
      );
    }

    // Input bounds: clamp prompt to 20,000 characters max to prevent payload DOS
    const cleanPrompt = prompt.trim().slice(0, 20000);

    // Validate provider allowlist
    const validProviders = ["groq", "openai", "openrouter", "ollama", "anthropic"] as const;
    const validatedProvider =
      typeof provider === "string" && validProviders.includes(provider as typeof validProviders[number])
        ? (provider as typeof validProviders[number])
        : undefined;

    const validatedApiKey = typeof apiKey === "string" && apiKey.trim().length > 5 ? apiKey.trim() : undefined;
    let validatedBaseUrl: string | undefined = undefined;
    if (typeof body.baseUrl === "string" && body.baseUrl.trim().length > 0) {
      const candidateUrl = body.baseUrl.trim();
      if (!isSafeOutboundUrl(candidateUrl)) {
        return NextResponse.json(
          { message: "Invalid or prohibited baseUrl. Requests targeting internal networks or cloud metadata are blocked." },
          { status: 400 },
        );
      }
      validatedBaseUrl = candidateUrl;
    }
    const validatedModelName = typeof modelName === "string" && modelName.trim().length > 0 ? modelName.trim() : undefined;

    // Validate & sanitize incoming conversation history turns
    const validatedHistory = Array.isArray(history)
      ? history
          .filter(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (h: any) =>
              h &&
              typeof h === "object" &&
              typeof h.content === "string" &&
              h.content.trim().length > 0 &&
              (h.role === "user" || h.role === "agent" || h.role === "assistant" || h.role === "system")
          )
          .map((h: { role: "user" | "agent" | "assistant" | "system"; content: string }) => ({
            role: h.role,
            content: h.content.slice(0, 15000),
          }))
      : undefined;

    // Resolve active ResearchSession if valid in database
    let dbSession = null;
    if (sessionId && !sessionId.startsWith("session-demo") && !sessionId.startsWith("rep_")) {
      dbSession = await prisma.researchSession.findUnique({
        where: { id: sessionId },
      }).catch(() => null);

      if (dbSession) {
        const hasAccess = canAccessTenantRecord(session, dbSession);
        if (!hasAccess) {
          return NextResponse.json(
            { message: "Forbidden. This research session belongs to another organization." },
            { status: 403 },
          );
        }

        // Persist user prompt to DB session
        await prisma.conversationMessage.create({
          data: {
            sessionId: dbSession.id,
            role: "user",
            content: cleanPrompt,
          },
        }).catch((err) => console.warn("[Chat API] Failed to log user message:", err));
      }
    }

    // 1. If a valid DB ResearchSession exists and no custom history is provided, try agent orchestrator
    if (dbSession && (!validatedHistory || validatedHistory.length === 0)) {
      try {
        const result = await agentOrchestrator.handleAgentTurn(sessionId, cleanPrompt, {
          provider: (validatedProvider as "groq" | "openai") || "groq",
          apiKey: validatedApiKey,
          modelName: validatedModelName,
        });

        if (result && result.response) {
          return NextResponse.json({
            success: true,
            response: result.response,
            forkedReportId: result.forkedReportId || null,
            correctionsApplied: result.correctionsApplied || false,
            visitedUrls: [],
          });
        }
      } catch (orchErr) {
        console.warn("[Chat API] agentOrchestrator failed, falling back to centralized AI:", orchErr);
      }
    }

    // 2. Execute via Centralized AI Client with full multi-turn context
    const rec = reportData?.recommendation;
    const chatParams = {
      prompt: cleanPrompt,
      history: validatedHistory,
      signal: req.signal,
      provider: validatedProvider,
      apiKey: validatedApiKey,
      baseUrl: validatedBaseUrl,
      modelName: validatedModelName,
      companyName: companyName || reportData?.company?.name || undefined,
      ticker: ticker || reportData?.company?.ticker || undefined,
      cmp: rec?.currentPrice ?? undefined,
      tp: rec?.targetPrice ?? undefined,
      rating: rec?.rating ?? undefined,
      persona: currentPersona || "Institutional Research",
      reportData: reportData || undefined,
    };

    const wantsStream = body.stream !== false;

    if (wantsStream) {
      const generator = executeCentralizedAIChatStream(chatParams);
      const encoder = new TextEncoder();
      let accumulatedReply = "";

      const readableStream = new ReadableStream({
        async start(controller) {
          const onAbort = () => {
            try {
              controller.close();
            } catch {}
          };

          if (req.signal.aborted) {
            onAbort();
            return;
          }

          req.signal.addEventListener("abort", onAbort, { once: true });

          try {
            for await (const event of generator) {
              if (req.signal.aborted) break;
              if (event.type === "delta" && typeof event.text === "string") {
                accumulatedReply += event.text;
              }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            controller.close();
          } catch (err: unknown) {
            if (!req.signal.aborted) {
              console.error("[Chat API Stream Error]:", err);
              const errMsg = err instanceof Error ? err.message : "Chat streaming failed";
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`)
              );
            }
            controller.close();
          } finally {
            req.signal.removeEventListener("abort", onAbort);
            // Persist agent response turn (even if interrupted) if session exists
            if (dbSession && accumulatedReply.trim().length > 0) {
              await prisma.conversationMessage.create({
                data: {
                  sessionId: dbSession.id,
                  role: "agent",
                  content: accumulatedReply.trim(),
                },
              }).catch(() => null);
            }
          }
        },
      });

      return new Response(readableStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    const result = await executeCentralizedAIChat(chatParams);

    if (dbSession && result.content.trim().length > 0) {
      await prisma.conversationMessage.create({
        data: {
          sessionId: dbSession.id,
          role: "agent",
          content: result.content.trim(),
        },
      }).catch(() => null);
    }

    return NextResponse.json({
      success: true,
      response: result.content,
      modelUsed: result.modelUsed,
      source: result.source,
      visitedUrls: result.visitedUrls || [],
    });
  } catch (error: unknown) {
    console.error("API Error: /api/agent/chat failed:", error);
    const errMessage =
      error instanceof Error && error.message.includes("AI Research Service")
        ? error.message
        : "I encountered an error processing your query. Please verify your connection or try again.";
    return NextResponse.json(
      {
        success: false,
        message: "AI Processing Error",
        response: errMessage,
      },
      { status: 500 },
    );
  }
}

/**
 * GET /api/agent/chat?sessionId=...
 * Retrieves persistent conversation history for a given ResearchSession.
 */
export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId || sessionId.startsWith("session-demo") || sessionId.startsWith("rep_")) {
      return NextResponse.json({ messages: [] });
    }

    const dbSession = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    }).catch(() => null);

    if (!dbSession) {
      return NextResponse.json({ messages: [] });
    }

    if (!canAccessTenantRecord(session, dbSession)) {
      return NextResponse.json(
        { message: "Forbidden. Access to this research session is restricted." },
        { status: 403 },
      );
    }

    const formattedMessages = dbSession.messages.map((m) => ({
      id: m.id,
      role: m.role as "user" | "agent",
      content: m.content,
      timestamp: m.createdAt.toISOString(),
    }));

    return NextResponse.json({ messages: formattedMessages });
  } catch (err) {
    console.error("[Chat API GET Error]:", err);
    return NextResponse.json({ messages: [] });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { agentOrchestrator } from "@/lib/ai/agent-orchestrator";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";
import { executeCentralizedAIChat, executeCentralizedAIChatStream } from "@/lib/ai/central-client";

/**
 * POST /api/agent/chat
 * Submits an analytical question or research inquiry to the AI Agent.
 * Uses the centralized AI client and model router as the single source of truth.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const sessionUser = getAuthSession(req);
    const orgId = sessionUser?.orgId || "default-org";

    const body = await req.json();
    const {
      sessionId,
      prompt,
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
    const validProviders = ["groq", "openai", "openrouter"] as const;
    const validatedProvider =
      typeof provider === "string" && validProviders.includes(provider as typeof validProviders[number])
        ? (provider as typeof validProviders[number])
        : undefined;

    const validatedApiKey = typeof apiKey === "string" && apiKey.trim().length > 5 ? apiKey.trim() : undefined;
    const validatedModelName = typeof modelName === "string" && modelName.trim().length > 0 ? modelName.trim() : undefined;

    // 1. If a valid DB ResearchSession exists, try agent orchestrator first
    if (sessionId && !sessionId.startsWith("session-demo") && !sessionId.startsWith("rep_")) {
      const dbSession = await prisma.researchSession.findUnique({
        where: { id: sessionId },
      }).catch(() => null);

      if (dbSession) {
        const hasAccess = !dbSession.orgId || dbSession.orgId === orgId || orgId === "default-org";
        if (hasAccess) {
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
      }
    }

    // 2. Execute via Centralized AI Client (Single source of truth for models, budget & API keys)
    const rec = reportData?.recommendation;
    const chatParams = {
      prompt: cleanPrompt,
      provider: validatedProvider,
      apiKey: validatedApiKey,
      modelName: validatedModelName,
      companyName: companyName || reportData?.company?.name || undefined,
      ticker: ticker || reportData?.company?.ticker || undefined,
      cmp: rec?.currentPrice ?? undefined,
      tp: rec?.targetPrice ?? undefined,
      rating: rec?.rating ?? undefined,
      persona: currentPersona || "Institutional Research",
    };

    const wantsStream = body.stream !== false;

    if (wantsStream) {
      const generator = executeCentralizedAIChatStream(chatParams);
      const encoder = new TextEncoder();
      const readableStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const event of generator) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            }
            controller.close();
          } catch (err: unknown) {
            console.error("[Chat API Stream Error]:", err);
            const errMsg = err instanceof Error ? err.message : "Chat streaming failed";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`)
            );
            controller.close();
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

export const dynamic = "force-dynamic";

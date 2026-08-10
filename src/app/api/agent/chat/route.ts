import { NextRequest, NextResponse } from 'next/server';
import { agentOrchestrator } from '@/lib/ai/agent-orchestrator';
import { RateLimitError } from '@/lib/ai/retry-wrapper';
import { requireApiSecret } from '@/lib/utils/auth';

/**
 * POST /api/agent/chat
 * Submits a chat message to the Agent orchestrator and triggers the ReAct workflow.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const { sessionId, prompt, provider, apiKey, modelName } = body;

    if (!sessionId || !prompt) {
      return NextResponse.json({ message: 'Missing required parameters.' }, { status: 400 });
    }

    const result = await agentOrchestrator.handleAgentTurn(sessionId, prompt, {
      provider: provider || 'groq',
      apiKey: apiKey || undefined,
      modelName: modelName || undefined
    });

    return NextResponse.json({
      success: true,
      response: result.response,
      forkedReportId: result.forkedReportId || null,
      correctionsApplied: result.correctionsApplied || false
    });
  } catch (error: unknown) {
    console.error('API Error: /api/agent/chat failed:', error);

    if (error instanceof RateLimitError) {
      return NextResponse.json({
        error: 'rate_limited',
        message: 'The AI model is rate-limited right now (daily token quota reached). Co-Pilot automatically retries on the 8B fallback model — please try again shortly.',
        retryAfterSeconds: error.retryAfterSeconds
      }, { status: 429 });
    }

    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { agentOrchestrator } from '@/lib/ai/agent-orchestrator';

/**
 * POST /api/agent/chat
 * Submits a chat message to the Agent orchestrator and triggers the ReAct workflow.
 */
export async function POST(req: NextRequest) {
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
      forkedReportId: result.forkedReportId || null
    });
  } catch (error: unknown) {
    console.error('API Error: /api/agent/chat failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';

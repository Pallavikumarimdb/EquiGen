import { NextRequest, NextResponse } from "next/server";
import { synthesisAgent, SynthesisInput } from "@/lib/ai/subagents/synthesis-agent";
import { requireApiSecret } from "@/lib/utils/auth";

/**
 * POST /api/agent/run-synthesis
 * Triggers the Synthesis & Report Generation Subagent.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { planId, runId, ticker, companyName, depth, documentData, modelingData, marketIntelData } = body;

    if (!planId || !ticker || !companyName) {
      return NextResponse.json(
        { message: "planId, ticker, and companyName are required fields." },
        { status: 400 }
      );
    }

    const input: SynthesisInput = {
      planId,
      runId,
      ticker: ticker.toUpperCase(),
      companyName,
      depth: depth ?? "standard",
      documentData,
      modelingData,
      marketIntelData,
    };

    const apiKey = req.headers.get("x-groq-api-key") ?? process.env.GROQ_API_KEY;
    const result = await synthesisAgent.run(input, apiKey ?? undefined);

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("[/api/agent/run-synthesis POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

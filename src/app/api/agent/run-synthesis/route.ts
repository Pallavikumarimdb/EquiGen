import { NextRequest, NextResponse } from "next/server";
import { synthesisAgent, SynthesisInput } from "@/lib/ai/subagents/synthesis-agent";
import { getDecryptedApiKey } from "@/lib/utils/api-keys";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/agent/run-synthesis
 * Triggers the Synthesis & Report Generation Subagent.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    // The tenant guard guarantees a concrete orgId; tenancy fails closed rather than defaulting.
    const orgId = session.orgId;
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

    let apiKey = req.headers.get("x-groq-api-key") ?? process.env.GROQ_API_KEY;
    if (!apiKey) {
      const dbKey = await getDecryptedApiKey(orgId, "groq").catch(() => null);
      if (dbKey) apiKey = dbKey;
    }
    const result = await synthesisAgent.run(input, apiKey ?? undefined);

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("[/api/agent/run-synthesis POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

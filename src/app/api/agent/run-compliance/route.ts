import { NextRequest, NextResponse } from "next/server";
import { complianceAgent, ComplianceInput } from "@/lib/ai/subagents/compliance-agent";
import { requireApiSecret } from "@/lib/utils/auth";

/**
 * POST /api/agent/run-compliance
 * Triggers the Automated Compliance & SEBI Rule Checking Subagent.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { planId, runId, ticker, companyName, sections, analystName, sebiRegNo, orgName } = body;

    if (!planId || !ticker || !companyName || !Array.isArray(sections)) {
      return NextResponse.json(
        { message: "planId, ticker, companyName, and sections array are required fields." },
        { status: 400 }
      );
    }

    const input: ComplianceInput = {
      planId,
      runId,
      ticker: ticker.toUpperCase(),
      companyName,
      sections,
      analystName,
      sebiRegNo,
      orgName,
    };

    const result = await complianceAgent.run(input);

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("[/api/agent/run-compliance POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { complianceAgent, ComplianceInput } from "@/lib/ai/subagents/compliance-agent";
import { assertPlanOwnership, isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/agent/run-compliance
 * Triggers the Automated Compliance & SEBI Rule Checking Subagent.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    const body = await req.json();
    const { planId, runId, ticker, companyName, sections, analystName, sebiRegNo, orgName } = body;

    if (!planId || !ticker || !companyName || !Array.isArray(sections)) {
      return NextResponse.json(
        { message: "planId, ticker, companyName, and sections array are required fields." },
        { status: 400 }
      );
    }

    // SECURITY: no plan lookup at all — any authenticated user could write a
    // subagentRun into another tenant's plan.
    if (!(await assertPlanOwnership(session, planId))) {
      return NextResponse.json(
        { message: "Forbidden. This research plan belongs to another organization." },
        { status: 403 }
      );
    }

    // SECURITY: `analystName`, `sebiRegNo` and `orgName` were taken from the request
    // body and are written into the statutory SEBI attestation. The compliance
    // attestation must identify the *calling* analyst, not an attacker-authored one.
    const input: ComplianceInput = {
      planId,
      runId,
      ticker: ticker.toUpperCase(),
      companyName,
      sections,
      analystName: session.name || analystName,
      sebiRegNo: session.sebiRegNo || sebiRegNo,
      orgName,
    };

    const result = await complianceAgent.run(input);

    return NextResponse.json({ success: true, result });
  } catch (error: unknown) {
    console.error("[/api/agent/run-compliance POST] Error:", error);
    return NextResponse.json({ message: "Internal Server Error." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

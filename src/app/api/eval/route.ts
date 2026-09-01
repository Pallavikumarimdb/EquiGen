import { NextRequest, NextResponse } from "next/server";
import { evaluationService } from "@/lib/eval/eval-service";
import { EquityResearchData } from "@/types";
import { requireApiSecret } from "@/lib/utils/auth";

const sampleGroundTruth: EquityResearchData = {
  company: {
    name: "Reliance Industries Ltd",
    ticker: "RELIANCE",
    sector: "Oil, Gas & Consumable Fuels",
    reportDate: "01 September 2026",
  },
  recommendation: {
    rating: "BUY",
    currentPrice: 1309,
    targetPrice: 1650,
    upsidePotential: 26.05,
    rationale: ["Strong retail growth"],
  },
  executiveSummary: "Reliance Industries demonstrates robust growth across Jio and retail.",
  keyFinancials: {
    incomeStatement: [
      { label: "Revenue", period: "FY24", value: 900000, unit: "Cr" },
      { label: "EBITDA", period: "FY24", value: 178000, unit: "Cr" },
      { label: "PAT", period: "FY24", value: 79000, unit: "Cr" },
    ],
    balanceSheet: [],
    cashFlow: [],
  },
  valuationAnalysis: "DCF analysis yields target price of ₹1,650/share.",
  investmentRisks: ["Brent crude volatility"],
  swotAnalysis: {
    strengths: ["Market leader"],
    weaknesses: ["Debt burden"],
    opportunities: ["Green energy"],
    threats: ["Competition"],
  },
};

/**
 * POST /api/eval
 * Runs offline evaluation suite and returns benchmark accuracy scores.
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const body = await req.json().catch(() => ({}));
    const predicted = (body.predicted || sampleGroundTruth) as EquityResearchData;

    const report = evaluationService.runFullEvaluationSuite(predicted, sampleGroundTruth);

    return NextResponse.json({
      success: true,
      benchmark: report,
    });
  } catch (error: unknown) {
    console.error("API Error: /api/eval failed:", error);
    const errMsg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

/**
 * GET /api/eval
 * Returns current evaluation suite configuration.
 */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    return NextResponse.json({
      success: true,
      evalMetrics: [
        "Field Extraction Accuracy %",
        "Math Auditor Catch-Rate %",
        "Agent Task Success Rate %",
      ],
      dataset: "EquiGen Golden Benchmark Suite v1",
    });
  } catch (error: unknown) {
    console.error("API Error: /api/eval (GET) failed:", error);
    const errMsg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

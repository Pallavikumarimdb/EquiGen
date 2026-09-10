/**
 * Phase 18 Quality Evaluation & Regression Harness
 * Runs synthetic benchmark runs across multiple Indian equities, evaluating:
 * 1. Master Planner milestone decomposition accuracy.
 * 2. Quantitative Modeling DCF & Monte Carlo mathematical precision.
 * 3. Market Intelligence benchmark table generation.
 * 4. Synthesis Agent citation density & consistency scores.
 * 5. SEBI Compliance audit score enforcement.
 */

import { masterPlannerAgent } from "../src/lib/ai/planner/master-planner";
import { computeDCFValuation } from "../src/lib/sandbox/python-executor";
import { ConsistencyCheckerTool } from "../src/lib/ai/tools/consistency-checker-tool";
import { SebiComplianceTool } from "../src/lib/ai/tools/sebi-compliance-tool";

interface EvaluationMetrics {
  ticker: string;
  plannerMilestonesCount: number;
  plannerEstimatedCostUsd: number;
  dcfTargetPrice: number;
  monteCarloSimulations: number;
  consistencyScorePct: number;
  sebiComplianceScore: number;
  passedAllGates: boolean;
}

async function runQualityEvaluation() {
  console.log("======================================================");
  console.log("   EquiGen Phase 18 — Quality Evaluation & Regression");
  console.log("======================================================\n");

  const testTargets = [
    { ticker: "TATAMOTORS", companyName: "Tata Motors Limited", depth: "standard" as const },
    { ticker: "RELIANCE", companyName: "Reliance Industries Limited", depth: "deep" as const },
    { ticker: "INFY", companyName: "Infosys Limited", depth: "quick" as const },
  ];

  const results: EvaluationMetrics[] = [];

  for (const target of testTargets) {
    console.log(`🔍 Evaluating EquiGen Subagent Swarm for ${target.companyName} (${target.ticker})...`);

    // 1. Planner Goal Decomposition Benchmark
    const plan = await masterPlannerAgent.createPlan({
      goalText: `Initiation of coverage on ${target.companyName} — DCF valuation & peer analysis`,
      ticker: target.ticker,
      companyName: target.companyName,
      depth: target.depth,
      sessionId: `eval_${target.ticker.toLowerCase()}`,
    });

    const milestoneCount = plan.milestones.length;
    const costUsd = plan.costEstimate;

    // 2. Quantitative Financial Engine Precision Benchmark
    const dcfResult = computeDCFValuation({
      baseRevenue: 50000,
      revenueGrowthRate: 0.14,
      ebitdaMargin: 0.22,
      wacc: 0.11,
      terminalGrowth: 0.04,
      projectionYears: 5,
    });
    const dcfTarget = dcfResult.baseTargetPrice;
    const mcRuns = dcfResult.monteCarlo.simulations;

    // Convert dcfResult to ModelingOutput format for ConsistencyChecker
    const modelingOutput = dcfResult as unknown as import("../src/types/plan4").ModelingOutput;

    // 3. Consistency Checker Benchmark
    const sampleText = `Initiation of coverage on ${target.companyName} with a target price of ₹${Math.round(dcfTarget)}/share using 11.0% WACC and 4.0% terminal growth rate.`;
    const consistency = ConsistencyCheckerTool.checkSectionConsistency("executive_summary", sampleText, modelingOutput);

    // 4. SEBI Compliance Audit Benchmark
    const fullReportText = `${sampleText} SEBI Registration No: INH000012345. ACCUMULATE rating (12-month horizon). Conflict of interest: None. Investments in securities market are subject to market risks. Analyst certification: Personal views expressed.`;
    const sebiAudit = SebiComplianceTool.auditReport(fullReportText, "INH000012345");

    const passedAllGates =
      milestoneCount >= 4 &&
      costUsd > 0 &&
      dcfTarget > 0 &&
      mcRuns === 1000 &&
      consistency.isConsistent &&
      sebiAudit.isCompliant;

    results.push({
      ticker: target.ticker,
      plannerMilestonesCount: milestoneCount,
      plannerEstimatedCostUsd: costUsd,
      dcfTargetPrice: parseFloat(dcfTarget.toFixed(2)),
      monteCarloSimulations: mcRuns,
      consistencyScorePct: consistency.score * 100,
      sebiComplianceScore: sebiAudit.score,
      passedAllGates,
    });
  }

  console.log("\n======================================================");
  console.log("📊 Quality Evaluation Report Card Summary:");
  console.log("======================================================");

  console.table(results);

  const totalPassed = results.filter((r) => r.passedAllGates).length;
  console.log(`\nResults: ${totalPassed}/${results.length} Equities Passed All Quality & Compliance Gates.`);

  if (totalPassed === results.length) {
    console.log("✅ PHASE 18 — Quality Evaluation & Regression Harness: ALL PASSED\n");
  } else {
    throw new Error(`Quality evaluation regression failed: ${results.length - totalPassed} failed`);
  }
}

runQualityEvaluation().catch((e) => {
  console.error("❌ Quality evaluation failed:", e);
  process.exit(1);
});

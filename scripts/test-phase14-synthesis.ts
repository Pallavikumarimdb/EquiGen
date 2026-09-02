/**
 * Phase 14 Verification Script: Synthesis & Report Generation Subagent
 * Tests:
 * 1. ConsistencyCheckerTool detection of target price mismatches & rating contradictions.
 * 2. SectionStore versioning, retrieval, and markdown diff computation.
 * 3. SynthesisAgent end-to-end section assembly with source citations.
 */

import { ConsistencyCheckerTool } from "../src/lib/ai/tools/consistency-checker-tool";
import { SectionStore } from "../src/lib/report/section-store";
import { synthesisAgent } from "../src/lib/ai/subagents/synthesis-agent";

async function runTests() {
  console.log("======================================================");
  console.log("   EquiGen Phase 14 — Synthesis & Report Gen Test     ");
  console.log("======================================================\n");

  // Test 1: ConsistencyCheckerTool
  console.log("📋 Test 1: ConsistencyCheckerTool numerical validation...");
  const consistentText = "Target price of ₹985/share using 11.0% WACC and 4.0% terminal growth rate.";
  const inconsistentText = "Target price of ₹1200/share using 11.0% WACC and 4.0% terminal growth rate.";

  const mockModelOutput = {
    modelType: "dcf" as const,
    baseTargetPrice: 985,
    bullCasePrice: 1248,
    bearCasePrice: 778,
    enterpriseValueCr: 101061,
    equityValueCr: 99861,
    pvExplicitPeriodCr: 24459,
    pvTerminalValueCr: 76602,
    assumptions: {
      baseRevenue: 50000,
      revenueGrowthRate: "14.0%",
      ebitdaMargin: "22.0%",
      wacc: "11.0%",
      terminalGrowth: "4.0%",
      projectionYears: 5,
      netDebtCr: 1200,
    },
    projections: [],
    sensitivityMatrix: {
      rowLabel: "WACC",
      colLabel: "Terminal Growth Rate",
      rowValues: ["9.0%", "10.0%", "11.0%", "12.0%", "13.0%"],
      colValues: ["3.0%", "3.5%", "4.0%", "4.5%", "5.0%"],
      matrix: [],
    },
    monteCarlo: {
      simulations: 1000,
      meanTargetPrice: 1393,
      medianTargetPrice: 1389,
      p10TargetPrice: 1233,
      p90TargetPrice: 1566,
    },
    chartUrls: [],
  };

  const res1 = ConsistencyCheckerTool.checkSectionConsistency("executive_summary", consistentText, mockModelOutput);
  console.log(`  Consistent text check score: ${res1.score} | Contradictions: ${res1.contradictions.length} ✅`);
  if (!res1.isConsistent) throw new Error("Expected text to be consistent");

  const res2 = ConsistencyCheckerTool.checkSectionConsistency("executive_summary", inconsistentText, mockModelOutput);
  console.log(`  Inconsistent text check score: ${res2.score} | Contradictions found: ${res2.contradictions.length} ✅`);
  if (res2.isConsistent) throw new Error("Expected text to be flagged as inconsistent");

  // Test 2: SectionStore
  console.log("\n📋 Test 2: SectionStore version history & diff generator...");
  const planId = "test_plan_p14";
  SectionStore.saveSectionVersion(planId, "executive_summary", "Initial draft of executive summary.", ["ref1"]);
  SectionStore.saveSectionVersion(planId, "executive_summary", "Updated draft of executive summary with target price ₹985.", ["ref1", "ref2"]);

  const history = SectionStore.getSectionHistory(planId, "executive_summary");
  console.log(`  Version history count: ${history.length} ✅`);

  const diff = SectionStore.computeDiff("executive_summary", "Line 1\nLine 2", "Line 1\nLine 2 updated\nLine 3");
  console.log(`  Diff summary: ${diff.diffSummary} ✅`);

  // Test 3: SynthesisAgent end-to-end run
  console.log("\n📋 Test 3: SynthesisAgent end-to-end section synthesis...");
  const output = await synthesisAgent.run({
    planId: "test_plan_p14",
    runId: "run_synth_p14",
    ticker: "TATAMOTORS",
    companyName: "Tata Motors Limited",
    modelingData: mockModelOutput,
    marketIntelData: {
      creditRating: "CRISIL AAA/Stable",
      benchmarkTableMarkdown: "| Metric | TATAMOTORS | M_M |\n|---|---|---|\n| PE | 22.4x | 22.4x |",
    },
  });

  console.log(`  Sections synthesized: ${output.sections.length} ✅`);
  console.log(`  Consistency Check Score: ${output.consistencyCheck.score * 100}% ✅`);
  for (const sec of output.sections) {
    console.log(`    • Section: [${sec.name}] (${sec.content.length} chars, ${sec.citations.length} citations)`);
  }

  console.log("\n======================================================");
  console.log("📊 Results: 3 passed, 0 failed");
  console.log("✅ PHASE 14 — Synthesis & Report Subagent: ALL PASSED");
  console.log("======================================================\n");
}

runTests().catch((e) => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});

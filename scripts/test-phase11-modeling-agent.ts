/**
 * Phase 11 Test Script — Python Sandbox & Quantitative Financial Modeling Engine
 *
 * Tests:
 * 1. PythonExecutor dual-engine execution strategy (pure TS engine + Python fallback)
 * 2. DCF Calculation Engine & WACC x Terminal Growth Rate (5x5) Sensitivity Matrix
 * 3. Monte Carlo Simulation Engine (1,000 iterations)
 * 4. ModelingAgent subagent execution and payload structure
 * 5. ReAct python_execute tool wrapper surface
 */

import { pythonExecutor, computeDCFValuation } from "../src/lib/sandbox/python-executor";
import { modelingAgent } from "../src/lib/ai/subagents/modeling-agent";
import { pythonRunTool } from "../src/lib/ai/tools/python-run-tool";
import { BuildFinancialModelMilestone } from "../src/types/plan4";

const TEST_TICKER = "TATAMOTORS";
const MOCK_PLAN_ID = "test-plan-phase11";
const MOCK_RUN_ID  = "test-run-phase11";

async function runTests() {
  console.log("======================================================");
  console.log("   EquiGen Phase 11 — Quantitative Modeling Test      ");
  console.log("======================================================\n");

  let passed = 0;
  let failed = 0;

  // ─── Test 1: Pure TS DCF Engine & Valuation Math ───────────────────────
  console.log("📋 Test 1: DCF Valuation & Sensitivity Matrix Engine...");
  try {
    const dcfResult = computeDCFValuation({
      baseRevenue: 430000, // Tata Motors FY24 Rev ~4.3L Cr
      revenueGrowthRate: 0.12,
      ebitdaMargin: 0.14,
      wacc: 0.11,
      terminalGrowth: 0.04,
      projectionYears: 5,
      netDebt: 35000,
      sharesOutstandingCr: 368,
    });

    if (typeof dcfResult.baseTargetPrice !== "number" || dcfResult.baseTargetPrice <= 0) {
      throw new Error("Invalid baseTargetPrice returned");
    }
    if (dcfResult.bullCasePrice <= dcfResult.baseTargetPrice) {
      throw new Error("Bull case price must be higher than base price");
    }
    if (dcfResult.bearCasePrice >= dcfResult.baseTargetPrice) {
      throw new Error("Bear case price must be lower than base price");
    }

    // Check Sensitivity Matrix (5x5)
    const sens = dcfResult.sensitivityMatrix;
    if (!sens || sens.matrix.length !== 5 || sens.matrix[0].length !== 5) {
      throw new Error("Sensitivity matrix must be exactly 5x5");
    }

    // Check Monte Carlo stats
    const mc = dcfResult.monteCarlo;
    if (!mc || mc.simulations !== 1000 || typeof mc.medianTargetPrice !== "number") {
      throw new Error("Monte Carlo simulation output invalid");
    }

    console.log(`  Target Price: ₹${dcfResult.baseTargetPrice}/share`);
    console.log(`  Bull Case: ₹${dcfResult.bullCasePrice} | Bear Case: ₹${dcfResult.bearCasePrice}`);
    console.log(`  5x5 Sensitivity Matrix: ${sens.rowLabel} vs ${sens.colLabel} ✅`);
    console.log(`  Monte Carlo (1,000 runs): Median ₹${mc.medianTargetPrice} (P10: ₹${mc.p10TargetPrice}, P90: ₹${mc.p90TargetPrice}) ✅`);
    passed++;
  } catch (e) {
    console.error("  ❌ DCF Valuation test failed:", e);
    failed++;
  }

  // ─── Test 2: PythonExecutor Execution ──────────────────────────────────
  console.log("\n📋 Test 2: PythonExecutor Sandbox...");
  try {
    const pythonCode = `import json; print(json.dumps({"targetPrice": 985.50, "wacc": 0.105}))`;
    const res = await pythonExecutor.execute(pythonCode, { inputs: { revenue: 50000 } });

    if (res.exitCode !== 0) throw new Error(`Exit code ${res.exitCode}`);
    if (typeof res.executionTimeMs !== "number") throw new Error("executionTimeMs missing");

    console.log(`  Exit code: ${res.exitCode} ✅`);
    console.log(`  Execution time: ${res.executionTimeMs}ms ✅`);
    console.log(`  Data parsed: ${JSON.stringify(res.data ?? {})} ✅`);
    passed++;
  } catch (e) {
    console.error("  ❌ PythonExecutor test failed:", e);
    failed++;
  }

  // ─── Test 3: ModelingAgent Subagent Execution ──────────────────────────
  console.log("\n📋 Test 3: ModelingAgent subagent execution...");
  try {
    const mockMilestone: BuildFinancialModelMilestone = {
      id: "m_model",
      type: "build_financial_model",
      label: "Build Financial Model",
      description: "Test DCF modeling milestone",
      agentType: "modeling",
      estimatedMinutes: 3,
      estimatedCostUsd: 0.15,
      status: "pending",
      config: {
        modelType: "dcf",
        projectionYears: 5,
        runMonteCarlo: true,
        runSensitivity: true,
      },
    };

    const agentOut = await modelingAgent.run({
      planId: MOCK_PLAN_ID,
      runId: MOCK_RUN_ID,
      ticker: TEST_TICKER,
      companyName: "Tata Motors Limited",
      milestone: mockMilestone,
      extractedFinancials: { revenue: 430000, ebitdaMargin: 0.14 },
    });

    if (!agentOut.milestoneCompleted) throw new Error("milestoneCompleted should be true");
    if (typeof agentOut.modelOutput.baseTargetPrice !== "number") throw new Error("baseTargetPrice missing in agent output");
    if (!agentOut.summary.includes("TATAMOTORS")) throw new Error("Summary must include ticker");

    console.log("  ✅ ModelingAgent.run() completed successfully ✅");
    console.log(`  Summary excerpt:\n  ${agentOut.summary.replace(/\n/g, "\n  ")}`);
    passed++;
  } catch (e) {
    console.error("  ❌ ModelingAgent test failed:", e);
    failed++;
  }

  // ─── Test 4: ReAct Tool Wrapper Surface ────────────────────────────────
  console.log("\n📋 Test 4: python_execute ReAct Tool wrapper...");
  try {
    if (pythonRunTool.name !== "python_execute") throw new Error("Tool name mismatch");
    const toolCallRes = await pythonRunTool.func({
      codeText: "print('Hello EquiGen')",
    });
    const parsedToolRes = JSON.parse(toolCallRes);
    if (parsedToolRes.success !== true) throw new Error("Tool call should return success=true");

    console.log("  ✅ python_execute Tool name & schema: ✅ Valid");
    console.log(`  Tool execution output: success=${parsedToolRes.success} ✅`);
    passed++;
  } catch (e) {
    console.error("  ❌ ReAct Tool test failed:", e);
    failed++;
  }

  console.log("\n======================================================");
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("❌ PHASE 11 — Modeling Agent: SOME TESTS FAILED");
    process.exit(1);
  } else {
    console.log("✅ PHASE 11 — Modeling Agent: ALL TESTS PASSED");
  }
  console.log("======================================================\n");
}

runTests().catch((e) => {
  console.error("❌ Phase 11 test runner error:", e);
  process.exit(1);
});

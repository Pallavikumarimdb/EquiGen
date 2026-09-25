/**
 * Unit tests for consistency-checker-tool.ts
 */

import { describe, it, expect } from "vitest";
import { ConsistencyCheckerTool } from "@/lib/ai/tools/consistency-checker-tool";
import { ModelingOutput } from "@/types/plan4";

describe("ConsistencyCheckerTool", () => {
  it("passes when narrative matches model output perfectly", () => {
    const modelOutput: Partial<ModelingOutput> = {
      baseTargetPrice: 3500,
      assumptions: {
        baseRevenue: 100000,
        ebitdaMargin: "20.0%",
        revenueGrowthRate: "12.0%",
        wacc: "11.0%",
        terminalGrowth: "4.0%",
        projectionYears: 5,
        netDebtCr: 0,
      },
    };

    const text = "We initiate coverage with a target price of ₹3,500 based on our DCF model.";
    const result = ConsistencyCheckerTool.checkSectionConsistency(
      "valuation",
      text,
      modelOutput as ModelingOutput
    );

    expect(result.isConsistent).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.contradictions).toHaveLength(0);
  });

  it("detects target price mismatch when text contradicts model output by >5%", () => {
    const modelOutput: Partial<ModelingOutput> = {
      baseTargetPrice: 3500,
    };

    const text = "We project a target price of ₹2,800 per share.";
    const result = ConsistencyCheckerTool.checkSectionConsistency(
      "valuation",
      text,
      modelOutput as ModelingOutput
    );

    expect(result.isConsistent).toBe(false);
    expect(result.contradictions.length).toBeGreaterThan(0);

    const tpContradiction = result.contradictions.find((c) => c.field === "target_price");
    expect(tpContradiction).toBeDefined();
    expect(tpContradiction?.severity).toBe("high");
    expect(tpContradiction?.expectedValue).toBe("₹3500");
    expect(tpContradiction?.foundValue).toBe("₹2800");
  });

  it("handles empty section text gracefully", () => {
    const result = ConsistencyCheckerTool.checkSectionConsistency("executive_summary", "");
    expect(result.isConsistent).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

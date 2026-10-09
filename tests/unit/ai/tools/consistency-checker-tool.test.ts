/**
 * Unit tests for the consistency checker.
 *
 * The checker previously ran on `executive_summary` only, was passed `undefined`
 * for the extracted financials (so the rating-vs-upside check could never fire),
 * and its result was written to the DB and then ignored. These tests pin the
 * behaviours that make it a real verification step.
 */

import { describe, it, expect } from "vitest";
import {
  ConsistencyCheckerTool,
  type ConsistencyCheckResult,
} from "@/lib/ai/tools/consistency-checker-tool";
import type { ModelingOutput } from "@/types/plan4";

const model: ModelingOutput = {
  modelType: "dcf",
  baseTargetPrice: 1000,
  bullCasePrice: 1220,
  bearCasePrice: 810,
  assumptions: {
    wacc: 0.115,
    terminalGrowth: 0.04,
    baseRevenue: 240893,
    sharesCr: 362,
    netDebtCr: -88500,
  },
  chartUrls: [],
};

const financials = {
  currentPrice: 948,
  revenueCr: 240893,
  ebitdaCr: 63000,
  netIncomeCr: 46000,
  netDebtCr: -88500,
  sharesOutstandingCr: 362,
  ebitdaMargin: 0.262,
};

describe("target price consistency", () => {
  it("passes when the section states the model's target price", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "valuation",
      "We initiate with a target price of ₹1,000 based on DCF.",
      model,
      financials,
    );
    expect(r.isConsistent).toBe(true);
    expect(r.contradictions).toHaveLength(0);
  });

  it("flags a target price that deviates more than 5%", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "valuation",
      "Our fair value estimate is ₹1,300 per share.",
      model,
      financials,
    );
    expect(r.isConsistent).toBe(false);
    expect(r.contradictions).toHaveLength(1);
    expect(r.contradictions[0].field).toBe("target_price");
    expect(r.contradictions[0].severity).toBe("high");
    expect(r.contradictions[0].expectedValue).toContain("1,000");
    expect(r.contradictions[0].foundValue).toContain("1,300");
  });

  it("tolerates rounding within 5%", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "valuation",
      "Target price of ₹1,020.",
      model,
      financials,
    );
    expect(r.isConsistent).toBe(true);
  });

  it("does not flag a section that is silent on target price", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "key_risks",
      "Competition in the EV segment remains intense.",
      model,
      financials,
    );
    expect(r.contradictions.filter((c) => c.field === "target_price")).toHaveLength(0);
  });
});

describe("rating vs upside coherence", () => {
  /**
   * This check could never fire in production: the synthesis agent passed
   * `undefined` for the extracted financials, so `currentPrice` was always missing.
   */
  it("flags a SELL recommendation against a large modelled upside", () => {
    const highTargetModel: ModelingOutput = {
      ...model,
      baseTargetPrice: 1500,
      bullCasePrice: 1830,
      bearCasePrice: 1215,
    };
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "executive_summary",
      "We recommend SELL on this stock.",
      highTargetModel,
      financials,
    );
    expect(r.contradictions.some((c) => c.field === "recommendation_rating")).toBe(true);
  });

  it("flags a BUY recommendation against a modelled downside", () => {
    const downsideModel: ModelingOutput = {
      ...model,
      baseTargetPrice: 800,
      bearCasePrice: 648,
      bullCasePrice: 976,
    };
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "executive_summary",
      "We recommend BUY with strong conviction.",
      downsideModel,
      financials,
    );
    expect(r.contradictions.some((c) => c.field === "recommendation_rating")).toBe(true);
  });

  it("does not fire when the rating agrees with the modelled upside", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "executive_summary",
      "We recommend BUY on the stock.",
      model,
      financials,
    );
    expect(r.contradictions.some((c) => c.field === "recommendation_rating")).toBe(false);
  });

  it("does not fire when the current price is unknown", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "executive_summary",
      "We recommend SELL.",
      model,
      {},
    );
    expect(r.contradictions.some((c) => c.field === "recommendation_rating")).toBe(false);
  });
});

describe("numeric field probes", () => {
  it("flags a revenue figure that contradicts the extracted financials", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "financial_analysis",
      "Revenue stood at ₹3,00,000 Cr for the year.",
      model,
      financials,
    );
    expect(r.contradictions.some((c) => c.field === "revenue")).toBe(true);
  });

  it("flags a WACC stated with the wrong scale", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "valuation",
      "We discount at a WACC of 115%.",
      model,
      financials,
    );
    expect(r.contradictions.some((c) => c.field === "wacc")).toBe(true);
  });

  it("accepts a WACC stated in the same units as the model", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "valuation",
      "Our WACC of 11.5% reflects a 7% risk-free rate.",
      model,
      financials,
    );
    expect(r.contradictions.some((c) => c.field === "wacc")).toBe(false);
  });

  it("flags a net debt figure that contradicts the model", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "financial_analysis",
      "The company carries net debt of ₹50,000 Cr.",
      model,
      financials,
    );
    expect(r.contradictions.some((c) => c.field === "net_debt")).toBe(true);
  });

  it("does not flag fields the section does not mention", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "business_description",
      "The company operates across IT services and consulting.",
      model,
      financials,
    );
    expect(r.contradictions).toHaveLength(0);
  });
});

describe("checkAllSections", () => {
  const sections = [
    { name: "executive_summary", content: "We recommend BUY with a target price of ₹1,000." },
    { name: "valuation", content: "DCF fair value of ₹1,000 at a WACC of 11.5%." },
    { name: "key_risks", content: "EV competition remains intense." },
  ];

  it("checks every section, not just the executive summary", () => {
    const r = ConsistencyCheckerTool.checkAllSections(sections, model, financials);
    expect(r.sectionsChecked).toEqual([
      "executive_summary",
      "valuation",
      "key_risks",
    ]);
  });

  it("aggregates contradictions across sections", () => {
    const r = ConsistencyCheckerTool.checkAllSections(
      [
        { name: "executive_summary", content: "Target price of ₹1,000." },
        { name: "valuation", content: "Fair value of ₹1,400." },
      ],
      model,
      financials,
    );
    expect(r.isConsistent).toBe(false);
    expect(r.contradictions.length).toBeGreaterThanOrEqual(1);
  });

  it("reports a contradiction in a non-executive section", () => {
    const r = ConsistencyCheckerTool.checkAllSections(
      [
        { name: "executive_summary", content: "Target price of ₹1,000." },
        { name: "financial_analysis", content: "Revenue of ₹9,99,999 Cr." },
      ],
      model,
      financials,
    );
    expect(r.contradictions.some((c) => c.sectionName === "financial_analysis")).toBe(true);
  });

  it("averages the per-section scores", () => {
    const r = ConsistencyCheckerTool.checkAllSections(sections, model, financials);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe("describeForRepair", () => {
  it("produces a prompt fragment naming the field and both values", () => {
    const result: ConsistencyCheckResult = {
      isConsistent: false,
      score: 0.4,
      contradictions: [
        {
          sectionName: "valuation",
          field: "target_price",
          expectedValue: "₹1,000",
          foundValue: "₹1,300",
          description: "Target price stated in valuation (₹1300) disagrees with the model value (₹1000) by 30.0%.",
          severity: "high",
        },
      ],
      warnings: [],
      sectionsChecked: ["valuation"],
    };

    const fragment = ConsistencyCheckerTool.describeForRepair(result);
    expect(fragment).toContain("target_price");
    expect(fragment).toContain("₹1,000");
    expect(fragment).toContain("₹1,300");
  });

  it("returns an empty string when there is nothing to repair", () => {
    const result: ConsistencyCheckResult = {
      isConsistent: true,
      score: 1,
      contradictions: [],
      warnings: [],
      sectionsChecked: ["valuation"],
    };
    expect(ConsistencyCheckerTool.describeForRepair(result)).toBe("");
  });
});

describe("empty and degenerate input", () => {
  it("treats an empty section as consistent but warns", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency("valuation", "", model, financials);
    expect(r.isConsistent).toBe(true);
    expect(r.warnings).toContain("Section text is empty.");
  });

  it("does not throw when the model output is absent", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "executive_summary",
      "We recommend BUY with a target price of ₹1,000.",
      undefined,
      financials,
    );
    expect(r.sectionsChecked).toEqual(["executive_summary"]);
  });

  it("does not throw when the financials are absent", () => {
    const r = ConsistencyCheckerTool.checkSectionConsistency(
      "executive_summary",
      "We recommend BUY with a target price of ₹1,000.",
      model,
      undefined,
    );
    expect(r.sectionsChecked).toEqual(["executive_summary"]);
  });
});

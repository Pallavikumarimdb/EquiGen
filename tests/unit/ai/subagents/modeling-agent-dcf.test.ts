/**
 * Unit tests for the modeling agent's discount-rate derivation (P0-8).
 *
 * The previous implementation computed `wacc = rf + beta * erp` and labelled it WACC.
 * That formula is the CAPM cost of *equity*; as a "WACC" it overstated the discount
 * rate for any company carrying debt, because it omitted the cost of debt and the
 * capital-structure weights. Net debt was separately clamped to `Math.max(0, ...)`,
 * discarding the cash pile for every net-cash company.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ModelingAgent, sanitisedBeta } from "@/lib/ai/subagents/modeling-agent";
import type { BuildFinancialModelMilestone } from "@/types/plan4";

vi.mock("@/lib/ai/tools/yahoo-financials-tool", () => ({
  fetchYahooFinancials: vi.fn(),
  toModelingInputRecord: vi.fn(() => ({ _isLiveData: false })),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    subagentRun: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "run-123" }),
    },
  },
}));

const MILESTONE: BuildFinancialModelMilestone = {
  id: "m-modeling",
  label: "DCF Modeling",
  type: "build_financial_model",
  description: "DCF",
  agentType: "modeling",
  estimatedMinutes: 2,
  estimatedCostUsd: 0.05,
  config: { modelType: "dcf", projectionYears: 5, runMonteCarlo: true, runSensitivity: true },
  status: "pending",
};

async function runWith(financials: Record<string, unknown>) {
  const agent = new ModelingAgent();
  return agent.run({
    planId: "plan-1",
    runId: "run-1",
    ticker: "INFY",
    companyName: "Infosys Ltd",
    milestone: MILESTONE,
    extractedFinancials: financials,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sanitisedBeta", () => {
  it("keeps plausible betas", async () => {
    expect(sanitisedBeta(0.95)).toBe(0.95);
    expect(sanitisedBeta(1.4)).toBe(1.4);
  });

  it("falls back to the market beta for implausible or missing values", async () => {
    expect(sanitisedBeta(0)).toBe(1.0);
    expect(sanitisedBeta(-2)).toBe(1.0);
    expect(sanitisedBeta(5)).toBe(1.0);
    expect(sanitisedBeta(undefined)).toBe(1.0);
    expect(sanitisedBeta("abc")).toBe(1.0);
  });
});

describe("discount rate", () => {
  it("is not simply rf + beta x ERP", async () => {
    const out = await runWith({
      revenue: 153670,
      ebitda: 36000,
      totalDebt: 8000,
      cash: 18000,
      outstandingShares: 415,
      beta: 0.95,
    });
    const wacc = Number(String(out.modelOutput.assumptions.wacc).replace("%", "")) / 100;
    const costOfEquityOnly = 0.07 + 0.95 * 0.055; // 12.225%
    expect(wacc).not.toBeCloseTo(costOfEquityOnly, 5);
  });

  it("reports the cost of equity separately so the derivation is auditable", async () => {
    const out = await runWith({
      revenue: 153670,
      ebitda: 36000,
      totalDebt: 8000,
      cash: 18000,
      outstandingShares: 415,
      beta: 0.95,
    });
    expect(String(out.modelOutput.assumptions.costOfEquity)).toMatch(/%/);
    expect(String(out.modelOutput.assumptions.waccDerivation)).toMatch(/WACC/);
  });

  it("weights cost of debt below cost of equity, so leverage lowers WACC", async () => {
    const base = { revenue: 100000, ebitda: 20000, outstandingShares: 100, beta: 1.0 };
    const ungeared = await runWith({ ...base, totalDebt: 0, cash: 0 });
    const geared = await runWith({ ...base, totalDebt: 40000, cash: 0 });
    const pct = (o: { modelOutput: { assumptions: Record<string, number | string> } }) =>
      Number(String(o.modelOutput.assumptions.wacc).replace("%", "")) / 100;

    // With rf 7% + ERP 5.5% the cost of equity is 12.5%; an unrated issuer's
    // after-tax cost of debt is 8.6%. Blending the two means adding leverage
    // REDUCES WACC — the opposite of the old "rf + beta x erp" constant, which
    // ignored the capital structure entirely and was 12.5% for every company.
    expect(pct(ungeared)).toBeCloseTo(0.125, 3);
    expect(pct(geared)).toBeLessThan(pct(ungeared));
    expect(pct(geared)).toBeGreaterThan(0.07 + 0.045 * 0.75); // floor: after-tax cost of debt
  });

  it("produces a WACC strictly between the after-tax cost of debt and the cost of equity", async () => {
    const out = await runWith({
      revenue: 100000,
      ebitda: 20000,
      totalDebt: 30000,
      cash: 5000,
      outstandingShares: 100,
      beta: 1.2,
    });
    const wacc = Number(String(out.modelOutput.assumptions.wacc).replace("%", "")) / 100;
    const costOfEquity = 0.07 + sanitisedBeta(1.2) * 0.055;
    const afterTaxCostOfDebt = (0.07 + 0.045) * (1 - 0.25);
    expect(wacc).toBeGreaterThan(afterTaxCostOfDebt);
    expect(wacc).toBeLessThan(costOfEquity);
  });

  it("stays within a sane band", async () => {
    const out = await runWith({
      revenue: 100000,
      ebitda: 20000,
      totalDebt: 90000,
      cash: 0,
      outstandingShares: 100,
      beta: 2.5,
    });
    const wacc = Number(String(out.modelOutput.assumptions.wacc).replace("%", "")) / 100;
    expect(wacc).toBeGreaterThan(0.08);
    expect(wacc).toBeLessThanOrEqual(0.30);
  });
});

describe("net cash is carried through", () => {
  it("values a net-cash company above an identical net-debt one", async () => {
    const shape = { revenue: 100000, ebitda: 20000, outstandingShares: 100, beta: 1.0 };
    const netCash = await runWith({ ...shape, totalDebt: 5000, cash: 25000 });
    const netDebt = await runWith({ ...shape, totalDebt: 25000, cash: 5000 });
    expect(netCash.modelOutput.baseTargetPrice).toBeGreaterThan(
      netDebt.modelOutput.baseTargetPrice,
    );
  });

  it("records the negative net debt in the assumptions", async () => {
    const out = await runWith({
      revenue: 100000,
      ebitda: 20000,
      totalDebt: 5000,
      cash: 25000,
      outstandingShares: 100,
      beta: 1.0,
    });
    expect(Number(out.modelOutput.assumptions.netDebtCr)).toBeLessThan(0);
  });
});

describe("missing share count fails closed", () => {
  it("emits no target price rather than inventing a share count", async () => {
    const out = await runWith({
      revenue: 100000,
      ebitda: 20000,
      totalDebt: 5000,
      cash: 5000,
      // no outstandingShares, no marketCapCr/currentPrice to derive it from
      beta: 1.0,
    });

    // The DCF engine refuses a zero share count; the milestone still completes but
    // reports no valuation and states why.
    expect(out.milestoneCompleted).toBe(true);
    expect(out.modelOutput.baseTargetPrice).toBe(0);
    expect(String(out.modelOutput.assumptions.valuationStatus)).toBe("NOT_COMPUTED");
    expect(String(out.modelOutput.assumptions.valuationError)).toMatch(/sharesOutstandingCr/i);
  });
});

describe("valuation failure never crashes the run", () => {
  it("completes the milestone with an explicit not-computed valuation", async () => {
    // A negative revenue drives baseRevenue to the fallback constant, so use an
    // input that is non-positive to force the engine's guard.
    const out = await runWith({
      revenue: -5,
      ebitda: -5,
      totalDebt: 1000,
      cash: 0,
      outstandingShares: 10,
      beta: 1.0,
    });
    expect(out.milestoneCompleted).toBe(true);
    expect(out.modelOutput.baseTargetPrice).toBe(0);
    expect(Number.isFinite(out.modelOutput.baseTargetPrice)).toBe(true);
  }, 30000);
});
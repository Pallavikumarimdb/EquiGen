/**
 * Unit tests for DCF valuation correctness (P0-8).
 *
 * Every case here was a silently wrong *number* rather than a visible failure:
 *  - the displayed sensitivity grid disagreed with the headline target price,
 *  - `wacc <= terminalGrowth` produced a negative enterprise value reported as a ₹1 target,
 *  - `sharesOutstandingCr: 0` produced a target price of `Infinity`,
 *  - net cash was discarded, so cash-rich companies were valued as if they had neither
 *    cash nor debt,
 *  - Monte Carlo used `Math.random()`, so no valuation could be reproduced.
 */

import { describe, it, expect } from "vitest";
import { computeDCFValuation } from "@/lib/sandbox/python-executor";
import {
  runThreeStatementModel,
  validateDcfDrivers,
  InvalidValuationInputError,
} from "@/lib/financial-modeling/three-statement-engine";

const BASE = {
  baseRevenue: 100000,
  revenueGrowthRate: 0.12,
  ebitdaMargin: 0.2,
  taxRate: 0.25,
  dso: 55,
  dio: 45,
  dpo: 40,
  capexAsPercentRevenue: 0.05,
  wacc: 0.11,
  terminalGrowth: 0.04,
  projectionYears: 5,
  netDebt: 10000,
  sharesOutstandingCr: 100,
};

describe("sensitivity grid is consistent with the headline valuation", () => {
  it("centre cell equals the headline target price", () => {
    const r = computeDCFValuation(BASE);
    // Previously the centre cell read 1502.34 against a headline of 1819.81 for
    // identical inputs, because the grid re-derived FCFF without the
    // working-capital and capex schedules.
    expect(r.sensitivityMatrix.matrix[2][2]).toBeCloseTo(r.baseTargetPrice, 1);
  });

  it("matches the standalone engine at the base parameters", () => {
    const dcf = computeDCFValuation(BASE);
    const engine = runThreeStatementModel({
      baseRevenue: BASE.baseRevenue,
      sharesOutstandingCr: BASE.sharesOutstandingCr,
      revenueGrowthRate: BASE.revenueGrowthRate,
      ebitdaMargin: BASE.ebitdaMargin,
      taxRate: BASE.taxRate,
      dso: BASE.dso,
      dio: BASE.dio,
      dpo: BASE.dpo,
      capexAsPercentRevenue: BASE.capexAsPercentRevenue,
      wacc: BASE.wacc,
      terminalGrowth: BASE.terminalGrowth,
      projectionYears: BASE.projectionYears,
      baseDebt: BASE.netDebt,
      baseCash: 0,
    });
    expect(dcf.baseTargetPrice).toBeCloseTo(engine.targetPrice, 1);
  });

  it("falls monotonically: a lower WACC gives a higher target price", () => {
    const grid = computeDCFValuation(BASE).sensitivityMatrix.matrix;
    const col = 2;
    const ascending = [grid[0][col], grid[1][col], grid[2][col], grid[3][col], grid[4][col]];
    for (let i = 1; i < ascending.length; i++) {
      expect(ascending[i]!).toBeLessThan(ascending[i - 1]!);
    }
  });

  it("rises monotonically with terminal growth", () => {
    const grid = computeDCFValuation(BASE).sensitivityMatrix.matrix;
    const row = 2;
    const rowVals = [grid[row][0], grid[row][1], grid[row][2], grid[row][3], grid[row][4]];
    for (let i = 1; i < rowVals.length; i++) {
      expect(rowVals[i]!).toBeGreaterThan(rowVals[i - 1]!);
    }
  });

  it("reports null, not 0, where the terminal value is undefined", () => {
    // A narrow headline spread still produces grid cells where WACC <= terminal
    // growth. Those cells must be null ("not computable"), never 0 — a 0 would
    // assert the company is worth nothing.
    const narrow = runThreeStatementModel({
      baseRevenue: 100000,
      sharesOutstandingCr: 100,
      revenueGrowthRate: 0.12,
      ebitdaMargin: 0.2,
      dso: 55, dio: 45, dpo: 40,
      capexAsPercentRevenue: 0.05,
      wacc: 0.05,
      terminalGrowth: 0.045,
      projectionYears: 5,
    });

    const flat = narrow.sensitivityMatrix.flat();
    expect(flat.some((v) => v === null)).toBe(true);
    expect(flat.some((v) => v === 0)).toBe(false);

    // Every non-null cell must be a real, finite price.
    for (const v of flat) {
      if (v !== null) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).not.toBe(0);
      }
    }
  });
});

describe("enterprise to equity bridge", () => {
  it("subtracts net debt exactly once", () => {
    const r = computeDCFValuation(BASE);
    expect(r.equityValueCr).toBe(r.enterpriseValueCr - BASE.netDebt);
  });

  it("adds net cash to equity value rather than discarding it", () => {
    const debt = computeDCFValuation({ ...BASE, netDebt: 20000 });
    const cash = computeDCFValuation({ ...BASE, netDebt: -20000 });
    const flat = computeDCFValuation({ ...BASE, netDebt: 0 });

    // Equity value must differ by the full amount of the net-debt shift.
    expect(debt.equityValueCr).toBe(flat.equityValueCr - 20000);
    expect(cash.equityValueCr).toBe(flat.equityValueCr + 20000);
  });

  it("values a net-cash company above the same company with no net debt", () => {
    const cash = computeDCFValuation({ ...BASE, netDebt: -20000 });
    const flat = computeDCFValuation({ ...BASE, netDebt: 0 });
    expect(cash.baseTargetPrice).toBeGreaterThan(flat.baseTargetPrice);
  });
});

describe("input guards (fail closed, never a placeholder price)", () => {
  it("refuses when WACC does not exceed terminal growth", () => {
    // Previously: enterpriseValue -1,135,220, clamped to a ₹1 target price.
    expect(() => computeDCFValuation({ ...BASE, wacc: 0.04, terminalGrowth: 0.05 })).toThrow(
      InvalidValuationInputError,
    );
    expect(() => computeDCFValuation({ ...BASE, wacc: 0.04, terminalGrowth: 0.05 })).toThrow(
      /must exceed terminalGrowth/i,
    );
  });

  it("refuses equal WACC and terminal growth", () => {
    expect(() => runThreeStatementModel({
      baseRevenue: 100000,
      sharesOutstandingCr: 100,
      revenueGrowthRate: 0.12,
      ebitdaMargin: 0.2,
      dso: 55, dio: 45, dpo: 40,
      capexAsPercentRevenue: 0.05,
      wacc: 0.04,
      terminalGrowth: 0.04,
    })).toThrow(InvalidValuationInputError);
  });

  it("refuses a zero share count instead of returning Infinity", () => {
    // Previously: target price === Infinity.
    expect(() => computeDCFValuation({ ...BASE, sharesOutstandingCr: 0 })).toThrow(
      InvalidValuationInputError,
    );
  });

  it("refuses a negative share count", () => {
    expect(() => computeDCFValuation({ ...BASE, sharesOutstandingCr: -5 })).toThrow(
      InvalidValuationInputError,
    );
  });

  it("refuses a non-positive revenue", () => {
    expect(() => computeDCFValuation({ ...BASE, baseRevenue: 0 })).toThrow(
      InvalidValuationInputError,
    );
    expect(() => computeDCFValuation({ ...BASE, baseRevenue: -100 })).toThrow(
      InvalidValuationInputError,
    );
  });

  it("refuses non-finite inputs", () => {
    expect(() => computeDCFValuation({ ...BASE, baseRevenue: NaN })).toThrow(
      InvalidValuationInputError,
    );
    expect(() => computeDCFValuation({ ...BASE, wacc: Infinity })).toThrow(
      InvalidValuationInputError,
    );
  });

  it("lists every problem rather than only the first", () => {
    const issues = validateDcfDrivers({
      baseRevenue: 0,
      sharesOutstandingCr: 0,
      revenueGrowthRate: 0.1,
      ebitdaMargin: 0.2,
      dso: 55, dio: 45, dpo: 40,
      capexAsPercentRevenue: 0.05,
      wacc: 0.01,
      terminalGrowth: 0.05,
    });
    expect(issues.length).toBeGreaterThanOrEqual(3);
    expect(issues.join(" ")).toMatch(/baseRevenue/);
    expect(issues.join(" ")).toMatch(/sharesOutstandingCr/);
    expect(issues.join(" ")).toMatch(/terminalGrowth/);
  });

  it("returns no issues for a valid driver set", () => {
    expect(
      validateDcfDrivers({
        baseRevenue: 100000,
        sharesOutstandingCr: 100,
        revenueGrowthRate: 0.12,
        ebitdaMargin: 0.2,
        dso: 55, dio: 45, dpo: 40,
        capexAsPercentRevenue: 0.05,
        wacc: 0.11,
        terminalGrowth: 0.04,
        projectionYears: 5,
      }),
    ).toEqual([]);
  });
});

describe("no fabricated floor price", () => {
  it("reports a negative target price rather than clamping to 1", () => {
    // Heavily indebted relative to enterprise value => negative equity value.
    const r = computeDCFValuation({ ...BASE, netDebt: 400000, baseRevenue: 10000 });
    expect(r.equityValueCr).toBeLessThan(0);
    expect(r.baseTargetPrice).toBeLessThan(1);
    expect(Number.isFinite(r.baseTargetPrice)).toBe(true);
  });

  it("never emits Infinity or NaN for any valid input", () => {
    for (const netDebt of [-50000, -1, 0, 1, 50000]) {
      for (const shares of [1, 50, 1000]) {
        const r = computeDCFValuation({ ...BASE, netDebt, sharesOutstandingCr: shares });
        expect(Number.isFinite(r.baseTargetPrice)).toBe(true);
        expect(Number.isFinite(r.equityValueCr)).toBe(true);
        expect(Number.isNaN(r.baseTargetPrice)).toBe(false);
      }
    }
  });
});

describe("Monte Carlo reproducibility", () => {
  it("produces identical results for the same seed", () => {
    const a = computeDCFValuation({ ...BASE, monteCarloSeed: 4242 });
    const b = computeDCFValuation({ ...BASE, monteCarloSeed: 4242 });
    expect(a.monteCarlo.p10TargetPrice).toBe(b.monteCarlo.p10TargetPrice);
    expect(a.monteCarlo.p90TargetPrice).toBe(b.monteCarlo.p90TargetPrice);
    expect(a.bullCasePrice).toBe(b.bullCasePrice);
    expect(a.bearCasePrice).toBe(b.bearCasePrice);
  });

  it("produces different results for a different seed", () => {
    const a = computeDCFValuation({ ...BASE, monteCarloSeed: 1 });
    const b = computeDCFValuation({ ...BASE, monteCarloSeed: 999 });
    expect(a.monteCarlo.p90TargetPrice).not.toBe(b.monteCarlo.p90TargetPrice);
  });

  it("is deterministic by default across calls", () => {
    const a = computeDCFValuation(BASE);
    const b = computeDCFValuation(BASE);
    expect(a.baseTargetPrice).toBe(b.baseTargetPrice);
    expect(a.bullCasePrice).toBe(b.bullCasePrice);
  });

  it("records the seed so the run can be re-derived", () => {
    const r = computeDCFValuation({ ...BASE, monteCarloSeed: 77 });
    expect(r.monteCarlo.seed).toBe(77);
    expect(r.monteCarlo.simulations).toBe(1000);
  });

  it("derives bull and bear from the simulation percentiles, not fixed multipliers", () => {
    const r = computeDCFValuation(BASE);
    expect(r.bullCasePrice).toBeCloseTo(r.monteCarlo.p90TargetPrice, 1);
    expect(r.bearCasePrice).toBeCloseTo(r.monteCarlo.p10TargetPrice, 1);
  });

  it("orders the percentiles correctly", () => {
    const mc = computeDCFValuation(BASE).monteCarlo;
    expect(mc.p10TargetPrice).toBeLessThanOrEqual(mc.medianTargetPrice);
    expect(mc.medianTargetPrice).toBeLessThanOrEqual(mc.p90TargetPrice);
    expect(mc.p10TargetPrice).toBeLessThanOrEqual(mc.meanTargetPrice + 1);
  });
});
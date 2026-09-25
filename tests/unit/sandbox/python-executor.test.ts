/**
 * Unit tests for python-executor.ts (Financial calculation engine and sandbox)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeDCFValuation, PythonExecutor } from "@/lib/sandbox/python-executor";

// Mock child_process exec so we can test execution and fallback deterministically
vi.mock("child_process", () => ({
  exec: vi.fn((cmd, opts, callback) => {
    if (typeof opts === "function") {
      callback = opts;
    }
    // Simulate error to trigger TS financial engine fallback
    callback(new Error("Python runtime not in path"), null, null);
  }),
}));

// Mock prisma so database writes don't hit Postgres during unit tests
vi.mock("@/lib/db", () => ({
  prisma: {
    subagentRun: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    sandboxArtifact: {
      create: vi.fn().mockResolvedValue({ id: "mock-artifact-id" }),
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeDCFValuation", () => {
  it("calculates realistic equity value, target price and sensitivity matrix", () => {
    const result = computeDCFValuation({
      baseRevenue: 100000, // ₹1,00,000 Cr
      revenueGrowthRate: 0.12,
      ebitdaMargin: 0.20,
      taxRate: 0.25,
      capexAsPercentRevenue: 0.05,
      wacc: 0.11,
      terminalGrowth: 0.04,
      projectionYears: 5,
      netDebt: 10000,
      sharesOutstandingCr: 100, // 100 Cr shares
    });

    expect(result.projections).toHaveLength(5);
    expect(result.projections[0].revenue).toBeGreaterThan(100000);
    expect(result.enterpriseValueCr).toBeGreaterThan(0);
    expect(result.equityValueCr).toBe(result.enterpriseValueCr - 10000);
    expect(result.baseTargetPrice).toBeGreaterThan(0);

    // Bull case must exceed base target price; bear case must be below
    expect(result.bullCasePrice).toBeGreaterThan(result.baseTargetPrice);
    expect(result.bearCasePrice).toBeLessThan(result.baseTargetPrice);

    // Sensitivity matrix: 5 rows (WACC) x 5 columns (TGR)
    expect(result.sensitivityMatrix.matrix).toHaveLength(5);
    expect(result.sensitivityMatrix.matrix[0]).toHaveLength(5);

    // Monte Carlo percentiles
    expect(result.monteCarlo.simulations).toBe(1000);
    expect(result.monteCarlo.p10TargetPrice).toBeLessThanOrEqual(result.monteCarlo.medianTargetPrice);
    expect(result.monteCarlo.medianTargetPrice).toBeLessThanOrEqual(result.monteCarlo.p90TargetPrice);
  });

  it("handles debt-free companies with cash balances (negative net debt)", () => {
    const result = computeDCFValuation({
      baseRevenue: 50000,
      netDebt: -5000, // ₹5,000 Cr net cash
      sharesOutstandingCr: 50,
    });

    // Equity value should be greater than enterprise value when cash > debt
    expect(result.equityValueCr).toBe(result.enterpriseValueCr + 5000);
    expect(result.baseTargetPrice).toBeGreaterThan(0);
  });
});

describe("PythonExecutor", () => {
  it("falls back gracefully to TS financial calculation engine when python runtime fails", async () => {
    const executor = new PythonExecutor();
    const result = await executor.execute("print('Hello')", {
      inputs: {
        revenue: 80000,
        ebitdaMargin: 0.22,
        wacc: 0.105,
        sharesCr: 60,
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.data).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = result.data as any;
    expect(data.baseTargetPrice).toBeGreaterThan(0);
    expect(result.stdout).toContain("Financial Engine Execution Output");
  });
});

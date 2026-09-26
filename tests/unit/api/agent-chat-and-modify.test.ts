/**
 * Unit tests for AI Agent Chat context serialization and Report Modification API
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/agent/modify/route";
import { buildReportContextMarkdown } from "@/lib/ai/central-client";
import { prisma } from "@/lib/db";
import { EquityResearchData } from "@/types";

vi.mock("@/lib/db", () => ({
  prisma: {
    reportHistory: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/ai/central-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/central-client")>();
  return {
    ...actual,
    executeCentralizedAIChat: vi.fn().mockResolvedValue({
      content: JSON.stringify({ changes: [] }),
      modelUsed: "mock-model",
      source: "groq",
    }),
  };
});

const sampleReport: EquityResearchData = {
  company: {
    name: "Tata Steel Ltd",
    ticker: "TATASTEEL",
    sector: "Metals & Mining",
    industry: "Steel",
  },
  recommendation: {
    rating: "BUY",
    targetPrice: 165,
    currentPrice: 145,
    upsidePotential: 13.8,
    rationale: ["Strong domestic demand", "Deleveraging in UK operations"],
  },
  executiveSummary: "Tata Steel is well positioned for domestic capacity expansion.",
  keyFinancials: {
    incomeStatement: [],
    balanceSheet: [],
    cashFlowStatement: [],
  },
  valuationAnalysis: "Valued using 5-year FCFF DCF model.",
  investmentRisks: ["Coking coal price volatility", "European energy costs"],
  swotAnalysis: {
    strengths: ["Lowest cost iron ore backward integration in India"],
    weaknesses: ["Legacy UK blast furnace liabilities"],
    opportunities: ["Kalinganagar phase 2 capacity ramp-up"],
    threats: ["Cheap steel imports dumping"],
  },
  fiveYearSummary: [
    {
      period: "FY24",
      sales: 229171,
      salesGrowth: -5.8,
      ebitda: 23402,
      ebitdaMargin: 10.2,
      patAdjusted: 4000,
      patGrowth: -50,
      adjEps: 3.2,
      epsGrowth: -50,
      roe: 4.5,
      deRatio: 0.8,
      pe: 45.3,
      evEbitda: 11.2,
    },
  ],
  forensicAnalysis: {
    overallHealthScore: 78,
    riskLevel: "LOW",
    cfoToPatRatio: {
      ratio: 2.1,
      status: "safe",
      interpretation: "Strong cash generation vs reported earnings",
      cfoCr: 21000,
      patCr: 10000,
    },
    altmanZScore: {
      score: 2.85,
      zone: "Safe",
      status: "safe",
      interpretation: "Solvent with low default probability",
    },
    beneishMScore: {
      score: -2.8,
      status: "safe",
      interpretation: "Unlikely manipulator",
    },
    workingCapitalStress: {
      receivablesGrowthVsSales: "Aligned",
      workingCapitalCycleDays: 45,
      status: "safe",
      interpretation: "Disciplined collections",
    },
    governanceFlags: {
      promoterPledgePct: 0.0,
      promoterHoldingPct: 33.2,
      institutionalHoldingPct: 44.5,
      auditorQuality: "Clean",
      flags: [],
    },
    summaryAssessment: "High accounting quality across statements.",
  },
  competitors: [
    {
      name: "JSW Steel",
      cmp: 920,
      targetPrice: 1050,
      rating: "BUY",
      pe: 22.4,
      evEbitda: 10.5,
    },
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelingData: {
    baseTargetPrice: 165,
    assumptions: {
      baseRevenue: 229000,
      sharesCr: 1248,
      wacc: 0.115,
      terminalGrowth: 0.04,
      ebitdaMargin: 0.14,
      revenueGrowthRate: 0.08,
      dso: 35,
      dio: 65,
      dpo: 50,
      capexAsPercentRevenue: 0.07,
    },
  } as any,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI Agent Full Context Serialization", () => {
  it("serializes 5-year financials, forensic audits, DCF drivers, SWOT, and peer multiples into structured markdown", () => {
    const md = buildReportContextMarkdown(sampleReport, {
      prompt: "Analyze the company",
      companyName: "Tata Steel Ltd",
      ticker: "TATASTEEL",
      cmp: 145,
      tp: 165,
      rating: "BUY",
    });

    // 1. Company & Recommendation
    expect(md).toContain("Tata Steel Ltd");
    expect(md).toContain("TATASTEEL");
    expect(md).toContain("₹145");
    expect(md).toContain("₹165");
    expect(md).toContain("BUY");

    // 2. Executive Summary & Thesis
    expect(md).toContain("Tata Steel is well positioned");

    // 3. 5-Year Financials
    expect(md).toContain("Five-Year Audited Financials Summary");
    expect(md).toContain("FY24");
    expect(md).toContain("229171");
    expect(md).toContain("10.2%");

    // 4. Forensic Quality & Accounting
    expect(md).toContain("Overall Forensic Health Score**: 78/100");
    expect(md).toContain("Risk Level: **LOW**");
    expect(md).toContain("2.1x");
    expect(md).toContain("Altman Z-Score (Insolvency Risk)**: 2.85");
    expect(md).toContain("Beneish M-Score (Earnings Manipulation)**: -2.8");
    expect(md).toContain("Promoter Pledge: 0%");

    // 5. DCF Valuation Drivers
    expect(md).toContain("DCF Valuation & 3-Statement Model Drivers");
    expect(md).toContain("11.5%");
    expect(md).toContain("4.0%");
    expect(md).toContain("DSO: 35 days");

    // 6. SWOT
    expect(md).toContain("Lowest cost iron ore backward integration");
    expect(md).toContain("Legacy UK blast furnace liabilities");

    // 7. Investment Risks
    expect(md).toContain("Coking coal price volatility");

    // 8. Competitor Peers
    expect(md).toContain("JSW Steel");
    expect(md).toContain("₹920");
  });
});

describe("POST /api/agent/modify", () => {
  const testHeaders = {
    "Content-Type": "application/json",
    "x-user-id": "analyst-1",
    "x-org-id": "org-test",
  };

  it("modifies target price and recalculates upside", async () => {
    const req = new Request("http://localhost:3000/api/agent/modify", {
      method: "POST",
      headers: testHeaders,
      body: JSON.stringify({
        prompt: "Update target price to 180",
        currentReport: sampleReport,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.updatedReport.recommendation.targetPrice).toBe(180);
    // CMP is 145, new upside = ((180-145)/145)*100 = 24.1%
    expect(data.updatedReport.recommendation.upsidePotential).toBe(24.1);
    expect(data.appliedChanges.some((c: any) => c.field === "recommendation.targetPrice")).toBe(true);
  });

  it("modifies rating to ACCUMULATE", async () => {
    const req = new Request("http://localhost:3000/api/agent/modify", {
      method: "POST",
      headers: testHeaders,
      body: JSON.stringify({
        prompt: "Change rating to ACCUMULATE",
        currentReport: sampleReport,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.updatedReport.recommendation.rating).toBe("ACCUMULATE");
  });

  it("modifies WACC discount rate and dynamically recalculates DCF target price via 3-statement model", async () => {
    const req = new Request("http://localhost:3000/api/agent/modify", {
      method: "POST",
      headers: testHeaders,
      body: JSON.stringify({
        prompt: "Set WACC to 10.5%",
        currentReport: sampleReport,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.updatedReport.modelingData.assumptions.wacc).toBe(0.105);
    expect(data.appliedChanges.some((c: any) => c.field === "modelingData.assumptions.wacc")).toBe(true);
    // Lower WACC from 11.5% to 10.5% recalculates model and yields a valid target price
    expect(data.updatedReport.modelingData.baseTargetPrice).toBeGreaterThan(0);
    expect(data.updatedReport.recommendation.targetPrice).toBeGreaterThan(0);
  });

  it("modifies EBITDA margin and terminal growth rate", async () => {
    const req = new Request("http://localhost:3000/api/agent/modify", {
      method: "POST",
      headers: testHeaders,
      body: JSON.stringify({
        prompt: "Set EBITDA margin to 16% and terminal growth to 4.5%",
        currentReport: sampleReport,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.updatedReport.modelingData.assumptions.ebitdaMargin).toBe(0.16);
    expect(data.updatedReport.modelingData.assumptions.terminalGrowth).toBe(0.045);
  });

  it("adds a new investment risk factor into risk profile and SWOT threats", async () => {
    const req = new Request("http://localhost:3000/api/agent/modify", {
      method: "POST",
      headers: testHeaders,
      body: JSON.stringify({
        prompt: "Add a risk about carbon border adjustment mechanism (CBAM) tariffs in Europe",
        currentReport: sampleReport,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.updatedReport.investmentRisks.some((r: string) => r.includes("carbon border adjustment"))).toBe(true);
    expect(data.updatedReport.swotAnalysis.threats.some((t: string) => t.includes("carbon border adjustment"))).toBe(true);
  });

  it("enforces multi-tenant authorization when reportId belongs to another tenant", async () => {
    vi.mocked(prisma.reportHistory.findUnique).mockResolvedValue({
      id: "rep_other_123",
      orgId: "tenant_xyz",
    } as any);

    const req = new Request("http://localhost:3000/api/agent/modify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": "user-abc",
        "x-org-id": "tenant_abc",
      },
      body: JSON.stringify({
        reportId: "rep_other_123",
        prompt: "Update target price to 200",
        currentReport: sampleReport,
      }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.message).toContain("Forbidden");
  });
});

/**
 * Unit tests for GET /api/eval/run route
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/eval/run/route";
import { prisma } from "@/lib/db";
import { pipelineEval } from "@/lib/eval/pipeline-eval";

vi.mock("@/lib/db", () => ({
  prisma: {
    reportHistory: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/eval/pipeline-eval", () => ({
  pipelineEval: {
    run: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/eval/run", () => {
  it("returns 400 when ticker query param is missing", async () => {
    const req = new Request("http://localhost:3000/api/eval/run");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Missing required query param: ticker");
  });

  it("returns 404 when no report exists for the given ticker", async () => {
    vi.mocked(prisma.reportHistory.findFirst).mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/eval/run?ticker=UNKNOWN_XYZ");
    const res = await GET(req);

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("No agent run found for ticker \"UNKNOWN_XYZ\"");
  });

  it("runs pipelineEval and returns 200 with eval report when report history exists", async () => {
    vi.mocked(prisma.reportHistory.findFirst).mockResolvedValue({
      id: "rep-1",
      companyName: "Reliance Industries",
      createdAt: new Date(),
      reportData: {
        companyData: {
          currentPrice: 2950,
          marketCap: 1990000,
        },
        modelingData: {
          baseTargetPrice: 3450,
          assumptions: {
            baseRevenue: 900000,
          },
        },
        sections: [
          { name: "executive_summary", content: "A".repeat(150) },
        ],
      },
    } as any);

    vi.mocked(pipelineEval.run).mockResolvedValue({
      ticker: "RELIANCE",
      timestamp: "2026-09-25T12:00:00Z",
      overallStatus: "PASS",
      checks: [],
      score: 100,
      dataQualityScore: 1.0,
      hasFallbackData: false,
      recommendation: "Approved for publication",
    });

    const req = new Request("http://localhost:3000/api/eval/run?ticker=RELIANCE");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eval.ticker).toBe("RELIANCE");
    expect(json.eval.score).toBe(100);
    expect(json.eval.overallStatus).toBe("PASS");
  });
});

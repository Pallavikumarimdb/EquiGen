/**
 * Unit tests for GET /api/eval/run
 *
 * This route originally performed no auth call and no org filter, so any
 * authenticated tenant could read any tenant's report payload — including its
 * forensic analysis and authenticity audit — by guessing a company name. These
 * tests pin both the authorisation and the tenant scoping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/eval/run/route";
import { prisma } from "@/lib/db";
import { pipelineEval } from "@/lib/eval/pipeline-eval";
import { signJWT } from "@/lib/utils/jwt";

/**
 * `requireTenantSession` verifies the presented cookie against a live `userSession`
 * row so a signed-out cookie cannot be replayed; `sessionRequest` seeds one.
 */
const userSessionStore = new Map<string, { userId: string; expiresAt: Date }>();

vi.mock("@/lib/db", () => ({
  prisma: {
    reportHistory: {
      findFirst: vi.fn(),
    },
    userSession: {
      findUnique: vi.fn(({ where }: { where: { token: string } }) =>
        Promise.resolve(userSessionStore.get(where.token) ?? null),
      ),
    },
  },
}));

vi.mock("@/lib/eval/pipeline-eval", () => ({
  pipelineEval: {
    run: vi.fn(),
  },
}));

/** A request carrying a signed session cookie for the given tenant. */
async function sessionRequest(orgId: string, query = ""): Promise<NextRequest> {
  const expiresAt = new Date(Date.now() + 60_000);
  const token = await signJWT(
    {
      userId: `user-${orgId}`,
      email: `a@${orgId}.example`,
      name: "Test Analyst",
      role: "analyst",
      orgId,
      sebiRegNo: null,
    },
    expiresAt,
  );
  const req = new NextRequest(`http://localhost:3000/api/eval/run${query}`);
  req.cookies.set("session_token", token);
  userSessionStore.set(token, { userId: `user-${orgId}`, expiresAt });
  return req;
}

/** A request carrying the internal service credential. */
function operatorRequest(query = ""): NextRequest {
  const req = new NextRequest(`http://localhost:3000/api/eval/run${query}`);
  req.headers.set("x-api-secret", process.env.INTERNAL_API_SECRET ?? "");
  req.headers.set("x-org-id", "default-org");
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  userSessionStore.clear();
  // The internal service secret is no longer a hardcoded literal; it must be configured.
  vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/eval/run — authorisation", () => {
  it("returns 401 when no session and no service credential are present", async () => {
    const req = new NextRequest("http://localhost:3000/api/eval/run?ticker=RELIANCE");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(prisma.reportHistory.findFirst).not.toHaveBeenCalled();
  });

  it("returns 401 for a forged session cookie with an invalid signature", async () => {
    const req = new NextRequest("http://localhost:3000/api/eval/run?ticker=RELIANCE");
    req.cookies.set("session_token", "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJoYWNrZXIifQ.badsig");
    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(prisma.reportHistory.findFirst).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing ticker once authenticated", async () => {
    const res = await GET(await sessionRequest("acme", ""));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("Missing required query param: ticker");
  });
});

describe("GET /api/eval/run — tenant scoping", () => {
  it("scopes the report lookup to the caller's org", async () => {
    vi.mocked(prisma.reportHistory.findFirst).mockResolvedValue(null);

    await GET(await sessionRequest("acme", "?ticker=RELIANCE"));

    const firstCall = vi.mocked(prisma.reportHistory.findFirst).mock.calls[0]![0]!;
    expect(firstCall.where).toMatchObject({ orgId: "acme" });
  });

  it("does not widen the lookup for a platform operator", async () => {
    vi.mocked(prisma.reportHistory.findFirst).mockResolvedValue(null);

    await GET(operatorRequest("?ticker=RELIANCE"));

    const firstCall = vi.mocked(prisma.reportHistory.findFirst).mock.calls[0]![0]!;
    expect(firstCall.where).not.toHaveProperty("orgId");
  });

  it("returns 403 when the report exists only in another tenant", async () => {
    // First lookup (scoped) misses; the existence probe (unscoped) hits.
    vi.mocked(prisma.reportHistory.findFirst)
      .mockResolvedValueOnce(null) // scoped lookup -> miss
      .mockResolvedValueOnce({ id: "rep-other" } as never); // existence probe -> hit

    const res = await GET(await sessionRequest("acme", "?ticker=RELIANCE"));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toContain("Forbidden");
    expect(pipelineEval.run).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) when the report genuinely does not exist anywhere", async () => {
    vi.mocked(prisma.reportHistory.findFirst).mockResolvedValue(null);

    const res = await GET(await sessionRequest("acme", "?ticker=UNKNOWN_XYZ"));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain('No agent run found for ticker "UNKNOWN_XYZ"');
    expect(json.error).toContain("in your workspace");
  });
});

describe("GET /api/eval/run — snapshot honesty", () => {
  it("runs pipelineEval and returns the eval report when the report exists", async () => {
    vi.mocked(prisma.reportHistory.findFirst).mockResolvedValue({
      id: "rep-1",
      companyName: "Reliance Industries",
      createdAt: new Date(),
      reportData: {
        financialAudit: {
          provenance: { isLiveData: true, evaluatedAt: "2026-09-25T12:00:00.000Z" },
        },
        companyData: { currentPrice: 2950, marketCap: 1990000 },
        modelingData: { baseTargetPrice: 3450, assumptions: { baseRevenue: 900000 } },
        sections: [{ name: "executive_summary", content: "A".repeat(150) }],
      },
    } as unknown as Awaited<ReturnType<typeof prisma.reportHistory.findFirst>>);

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

    const res = await GET(await sessionRequest("acme", "?ticker=RELIANCE"));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.eval.ticker).toBe("RELIANCE");
    expect(json.eval.score).toBe(100);
  });

  it("reads liveness and fetch time from the audit rather than inferring them", async () => {
    // companyData is populated but the audit records a non-live, fallback source.
    vi.mocked(prisma.reportHistory.findFirst).mockResolvedValue({
      id: "rep-2",
      companyName: "Tata Motors",
      createdAt: new Date(),
      reportData: {
        financialAudit: {
          provenance: { isLiveData: false, evaluatedAt: "2026-09-25T12:00:00.000Z" },
        },
        companyData: { currentPrice: 948, marketCap: 348500 },
        modelingData: { baseTargetPrice: 0, assumptions: { baseRevenue: 10000 } },
        sections: [],
      },
    } as unknown as Awaited<ReturnType<typeof prisma.reportHistory.findFirst>>);

    vi.mocked(pipelineEval.run).mockResolvedValue({
      ticker: "TATAMOTORS",
      timestamp: "2026-09-25T12:00:00Z",
      overallStatus: "FAIL",
      checks: [],
      score: 0,
      dataQualityScore: 0,
      hasFallbackData: true,
      recommendation: "Blocked",
    });

    await GET(await sessionRequest("acme", "?ticker=TATAMOTORS"));

    const snapshot = vi.mocked(pipelineEval.run).mock.calls[0][1];
    // A populated marketCap must NOT be read as proof of live data.
    expect(snapshot.yahoo?.isLiveData).toBe(false);
    // The recorded evaluation time is used, not `new Date()`.
    expect(snapshot.yahoo?.fetchedAt).toBe("2026-09-25T12:00:00.000Z");
  });

  it("leaves fetchedAt null when the report records no fetch time", async () => {
    vi.mocked(prisma.reportHistory.findFirst).mockResolvedValue({
      id: "rep-3",
      companyName: "Unknown Co",
      createdAt: new Date(),
      reportData: {
        companyData: { currentPrice: 100, marketCap: 500 },
        sections: [],
      },
    } as unknown as Awaited<ReturnType<typeof prisma.reportHistory.findFirst>>);

    vi.mocked(pipelineEval.run).mockResolvedValue({
      ticker: "UNKNOWN",
      timestamp: "2026-09-25T12:00:00Z",
      overallStatus: "WARN",
      checks: [],
      score: 50,
      dataQualityScore: 0.5,
      hasFallbackData: true,
      recommendation: "Review",
    });

    await GET(await sessionRequest("acme", "?ticker=UNKNOWN"));

    const snapshot = vi.mocked(pipelineEval.run).mock.calls[0][1];
    expect(snapshot.yahoo?.fetchedAt).toBeNull();
  });
});

/**
 * Security regression tests for the tenant-isolation and authentication fixes.
 *
 * Each test corresponds to a concrete defect found in an end-to-end review. They are
 * grouped by the property they protect rather than by route, because the recurring
 * failure mode was a route re-deriving its own weaker check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  requireTenantSession,
  isTenantFailure,
  canAccessTenantRecord,
  hasRole,
  type TenantSession,
} from "@/lib/utils/tenant";
import { signJWT } from "@/lib/utils/jwt";
import { rateLimit, resetRateLimits } from "@/lib/utils/rate-limit";

const userSessionStore = new Map<string, { userId: string; expiresAt: Date }>();

vi.mock("@/lib/db", () => ({
  prisma: {
    userSession: {
      findUnique: vi.fn(({ where }: { where: { token: string } }) =>
        Promise.resolve(userSessionStore.get(where.token) ?? null),
      ),
    },
    reportHistory: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    researchPlan: { findUnique: vi.fn(), findMany: vi.fn() },
    extractionJob: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    subagentRun: { findUnique: vi.fn() },
  },
}));

async function sessionFor(
  orgId: string,
  role = "analyst",
  opts: { revoked?: boolean; expiresAt?: Date } = {},
): Promise<NextRequest> {
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + 60_000);
  const token = await signJWT(
    {
      userId: `u-${orgId}`,
      email: `a@${orgId}.example`,
      name: "Analyst",
      role,
      orgId,
      sebiRegNo: "INH000000123",
    },
    expiresAt,
  );
  const req = new NextRequest("http://localhost:3000/api/x");
  req.cookies.set("session_token", token);
  if (!opts.revoked) {
    userSessionStore.set(token, { userId: `u-${orgId}`, expiresAt });
  }
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  userSessionStore.clear();
  resetRateLimits();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const sessionOf = (orgId: string, role = "analyst", operator = false): TenantSession => ({
  userId: `u-${orgId}`,
  orgId,
  role,
  name: "Analyst",
  sebiRegNo: null,
  isPlatformOperator: operator,
  isUserSession: !operator,
});

describe("a firm admin is not a cross-tenant superuser", () => {
  it("denies an admin access to another organisation's report", () => {
    // The four routes that computed their own check used
    // `role === "admin"` as a superuser test. tenant.ts documents that admins are
    // not org-superusers, and signup previously let anyone self-select that role.
    const admin = sessionOf("acme", "admin");
    const victimReport = { orgId: "competitor-co" };
    expect(canAccessTenantRecord(admin, victimReport)).toBe(false);
  });

  it("still allows an admin into their own organisation", () => {
    expect(canAccessTenantRecord(sessionOf("acme", "admin"), { orgId: "acme" })).toBe(true);
  });

  it("grants cross-tenant read only to a platform operator", () => {
    expect(
      canAccessTenantRecord(sessionOf("acme", "admin", true), { orgId: "competitor-co" }),
    ).toBe(true);
  });

  it("denies ordinary users access to a legacy null-org report", () => {
    // Previously `!report.orgId` granted access to any caller.
    expect(canAccessTenantRecord(sessionOf("acme"), { orgId: null })).toBe(false);
  });

  it("denies access when the record does not exist", () => {
    expect(canAccessTenantRecord(sessionOf("acme"), null)).toBe(false);
    expect(canAccessTenantRecord(sessionOf("acme"), undefined)).toBe(false);
  });
});

describe("role checks", () => {
  it("matches roles case-insensitively", () => {
    expect(hasRole(sessionOf("acme", "Reviewer"), "reviewer")).toBe(true);
    expect(hasRole(sessionOf("acme", "ADMIN"), "admin", "reviewer")).toBe(true);
  });

  it("refuses a role the caller does not hold", () => {
    expect(hasRole(sessionOf("acme", "analyst"), "reviewer")).toBe(false);
  });

  it("treats a platform operator as holding any role", () => {
    expect(hasRole(sessionOf("acme", "analyst", true), "reviewer")).toBe(true);
  });
});

describe("session revocation", () => {
  it("refuses a token whose session row was deleted at sign-out", async () => {
    const req = await sessionFor("acme", "analyst", { revoked: true });
    const result = await requireTenantSession(req);
    expect(isTenantFailure(result)).toBe(true);
    expect((result as { response: { status: number } }).response.status).toBe(401);
  });

  it("refuses a token whose session row has expired", async () => {
    const req = await sessionFor("acme", "analyst", {
      expiresAt: new Date(Date.now() + 60_000),
    });
    // Replace the stored row with an already-expired one.
    const token = req.cookies.get("session_token")!.value;
    userSessionStore.set(token, {
      userId: "u-acme",
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await requireTenantSession(req);
    expect(isTenantFailure(result)).toBe(true);
  });

  it("refuses a validly-signed token whose subject does not match its row", async () => {
    const req = await sessionFor("acme");
    const token = req.cookies.get("session_token")!.value;
    userSessionStore.set(token, { userId: "someone-else", expiresAt: new Date(Date.now() + 60_000) });

    const result = await requireTenantSession(req);
    expect(isTenantFailure(result)).toBe(true);
  });

  it("accepts the token while its session row is live", async () => {
    const req = await sessionFor("acme", "analyst");
    const result = await requireTenantSession(req);
    expect(isTenantFailure(result)).toBe(false);
    expect((result as TenantSession).orgId).toBe("acme");
  });
});

describe("rate limiting", () => {
  it("permits requests up to the limit and refuses beyond it", () => {
    expect(rateLimit("k", 3, 60_000).allowed).toBe(true);
    expect(rateLimit("k", 3, 60_000).allowed).toBe(true);
    expect(rateLimit("k", 3, 60_000).allowed).toBe(true);
    const fourth = rateLimit("k", 3, 60_000);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterMs).toBeGreaterThan(0);
  });

  it("buckets independently per key", () => {
    for (let i = 0; i < 3; i++) rateLimit("a", 3, 60_000);
    expect(rateLimit("a", 3, 60_000).allowed).toBe(false);
    expect(rateLimit("b", 3, 60_000).allowed).toBe(true);
  });

  it("starts a fresh window after the previous one elapses", async () => {
    expect(rateLimit("k", 1, 20).allowed).toBe(true);
    expect(rateLimit("k", 1, 20).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(rateLimit("k", 1, 20).allowed).toBe(true);
  });
});
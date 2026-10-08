/**
 * Unit tests for the tenant authorisation guard.
 *
 * These pin the three tenancy failures the guard exists to prevent:
 *  1. header trust  — client-supplied x-org-id being honoured as identity
 *  2. org defaulting — a session with no orgId silently becoming `default-org`
 *  3. super-tenant magic — `default-org` acting as a cross-tenant wildcard
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";
import {
  hasValidApiSecret,
  requireTenantSession,
  isTenantFailure,
  canAccessTenantRecord,
  tenantWhereClause,
  type TenantSession,
} from "@/lib/utils/tenant";
import { signJWT } from "@/lib/utils/jwt";

const SECRET = "unit-test-internal-secret";

function url(path = "/api/history") {
  return `http://localhost:3000${path}`;
}

async function signedRequest(opts: {
  orgId?: string | null;
  role?: string;
  withCookie?: boolean;
}): Promise<NextRequest> {
  const req = new NextRequest(url());
  if (opts.withCookie !== false && opts.orgId) {
    const token = await signJWT(
      {
        userId: "u-1",
        email: "a@b.example",
        name: "Analyst",
        role: opts.role ?? "analyst",
        orgId: opts.orgId,
        sebiRegNo: null,
      },
      new Date(Date.now() + 60_000),
    );
    req.cookies.set("session_token", token);
  }
  return req;
}

function operatorRequest(secret = SECRET): NextRequest {
  const req = new NextRequest(url());
  req.headers.set("x-api-secret", secret);
  req.headers.set("x-org-id", "default-org");
  req.headers.set("x-user-id", "agent-user");
  req.headers.set("x-user-role", "ADMIN");
  return req;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("hasValidApiSecret", () => {
  it("accepts the configured internal secret", () => {
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    expect(hasValidApiSecret(operatorRequest())).toBe(true);
  });

  it("rejects a wrong secret", () => {
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    expect(hasValidApiSecret(operatorRequest("nope"))).toBe(false);
  });

  it("rejects everything when no secret is configured — no default value", () => {
    vi.stubEnv("INTERNAL_API_SECRET", "");
    expect(hasValidApiSecret(operatorRequest())).toBe(false);
    expect(hasValidApiSecret(operatorRequest(""))).toBe(false);
  });

  it("rejects the previously hardcoded literal", () => {
    vi.stubEnv("INTERNAL_API_SECRET", "something-else");
    expect(hasValidApiSecret(operatorRequest("equigen-internal"))).toBe(false);
  });

  it("refuses the internal secret in production even when NODE_ENV is unset-ish", () => {
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    vi.stubEnv("NODE_ENV", "production");
    // API_SECRET is a separate knob and remains valid in production.
    expect(hasValidApiSecret(operatorRequest("equigen-internal"))).toBe(false);
  });

  it("returns false when no x-api-secret header is present", () => {
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    expect(hasValidApiSecret(new NextRequest(url()))).toBe(false);
  });
});

describe("requireTenantSession", () => {
  it("resolves identity from a signed session cookie", async () => {
    const result = await requireTenantSession(await signedRequest({ orgId: "acme" }));

    expect(isTenantFailure(result)).toBe(false);
    const s = result as TenantSession;
    expect(s.orgId).toBe("acme");
    expect(s.userId).toBe("u-1");
    expect(s.isUserSession).toBe(true);
    expect(s.isPlatformOperator).toBe(false);
  });

  it("refuses a request whose only credential is a forged identity header", async () => {
    const req = new NextRequest(url());
    req.headers.set("x-user-id", "attacker");
    req.headers.set("x-org-id", "victim-co");

    const result = await requireTenantSession(req);

    expect(isTenantFailure(result)).toBe(true);
    expect((result as { response: { status: number } }).response.status).toBe(401);
  });

  it("refuses a request with only an x-org-id header", async () => {
    const req = new NextRequest(url());
    req.headers.set("x-org-id", "victim-co");

    const result = await requireTenantSession(req);
    expect(isTenantFailure(result)).toBe(true);
  });

  it("refuses an unsigned/garbage session cookie", async () => {
    const req = new NextRequest(url());
    req.cookies.set("session_token", "not.a.jwt");

    const result = await requireTenantSession(req);
    expect(isTenantFailure(result)).toBe(true);
  });

  it("grants platform-operator identity for a valid service credential", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    const result = await requireTenantSession(operatorRequest());

    expect(isTenantFailure(result)).toBe(false);
    const s = result as TenantSession;
    expect(s.isPlatformOperator).toBe(true);
    expect(s.isUserSession).toBe(false);
  });

  it("prefers a real user session over the service credential", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    const req = await signedRequest({ orgId: "acme" });
    req.headers.set("x-api-secret", SECRET);

    const s = (await requireTenantSession(req)) as TenantSession;
    expect(s.orgId).toBe("acme");
    expect(s.isPlatformOperator).toBe(false);
    expect(s.isUserSession).toBe(true);
  });

  it("can require a platform operator", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);

    const userResult = await requireTenantSession(await signedRequest({ orgId: "acme" }), {
      requirePlatformOperator: true,
    });
    expect(isTenantFailure(userResult)).toBe(true);
    expect((userResult as { response: { status: number } }).response.status).toBe(403);

    const opResult = await requireTenantSession(operatorRequest(), { requirePlatformOperator: true });
    expect(isTenantFailure(opResult)).toBe(false);
  });
});

const user = (orgId: string): TenantSession => ({
  userId: "u",
  orgId,
  role: "analyst",
  name: "A",
  sebiRegNo: null,
  isPlatformOperator: false,
  isUserSession: true,
});

const operator: TenantSession = {
  userId: "agent-user",
  orgId: "default-org",
  role: "ADMIN",
  name: "Agent",
  sebiRegNo: null,
  isPlatformOperator: true,
  isUserSession: false,
};

describe("canAccessTenantRecord", () => {
  it("allows an exact org match", () => {
    expect(canAccessTenantRecord(user("acme"), { orgId: "acme" })).toBe(true);
  });

  it("denies a different org", () => {
    expect(canAccessTenantRecord(user("acme"), { orgId: "globex" })).toBe(false);
  });

  it("denies legacy orgId:null rows to ordinary users", () => {
    expect(canAccessTenantRecord(user("acme"), { orgId: null })).toBe(false);
    expect(canAccessTenantRecord(user("acme"), { orgId: undefined })).toBe(false);
  });

  it("allows a platform operator to read legacy and cross-tenant rows", () => {
    expect(canAccessTenantRecord(operator, { orgId: null })).toBe(true);
    expect(canAccessTenantRecord(operator, { orgId: "globex" })).toBe(true);
  });

  it("does not treat a firm's own admin as a cross-tenant reader", () => {
    const admin = { ...user("acme"), role: "ADMIN" };
    expect(canAccessTenantRecord(admin, { orgId: "globex" })).toBe(false);
    expect(canAccessTenantRecord(admin, { orgId: "acme" })).toBe(true);
  });

  it("denies a missing record", () => {
    expect(canAccessTenantRecord(user("acme"), null)).toBe(false);
    expect(canAccessTenantRecord(user("acme"), undefined)).toBe(false);
  });
});

describe("tenantWhereClause", () => {
  it("pins an ordinary user to their org", () => {
    expect(tenantWhereClause(user("acme"))).toEqual({ orgId: "acme" });
  });

  it("does not filter for a platform operator", () => {
    expect(tenantWhereClause(operator)).toEqual({});
  });

  it("never treats default-org as a wildcard", () => {
    // A user whose org IS default-org must still be pinned to it.
    expect(tenantWhereClause(user("default-org"))).toEqual({ orgId: "default-org" });
  });
});

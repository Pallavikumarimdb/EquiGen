/**
 * Tenant authorisation guard.
 *
 * Before this module, twenty-odd routes each resolved identity with
 *   `getAuthSession(req)` then `session?.orgId || "default-org"`
 * and five of them additionally treated `default-org` as a super-tenant that could
 * read every report with `orgId: null`. `GET /api/eval/run` performed no auth and
 * no org filter at all, so any caller could read any tenant's full report payload,
 * forensic analysis and authenticity audit by guessing a ticker.
 *
 * Three failures are fixed here:
 *
 *  1. HEADER TRUST. `requireApiSecret` accepted a request if it merely *carried*
 *     `x-user-id` and `x-org-id`. Those headers are middleware-injected, but any
 *     route outside the middleware matcher would honour client-supplied values.
 *     This module verifies the session JWT itself and only accepts middleware
 *     headers when the caller has also presented a valid `API_SECRET`.
 *
 *  2. ORG DEFAULTING. A session without an orgId silently became `default-org`.
 *     Tenancy must fail closed: no orgId means no authorised tenant.
 *
 *  3. SUPER-TENANT MAGIC. `orgId === "default-org"` is no longer a wildcard. Only
 *     the explicit platform-operator identity (the `API_SECRET` agent identity) may
 *     read across tenants, and only for legacy rows that predate tenancy.
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyJWT } from "./jwt";
import { prisma } from "@/lib/db";

export interface TenantSession {
  userId: string;
  orgId: string;
  role: string;
  name: string;
  sebiRegNo: string | null;
  /**
   * True only for the platform-operator identity established by a valid
   * `API_SECRET`. These may read across tenants; ordinary users never can.
   */
  isPlatformOperator: boolean;
  /** True when identity came from a signed session cookie rather than the API secret. */
  isUserSession: boolean;
}

/** The userId the middleware assigns to API_SECRET-authenticated service calls. */
const PLATFORM_OPERATOR_USER_IDS = new Set(["agent-user", "system-test-user"]);

/**
 * Whether the request presented a valid API_SECRET.
 *
 * The development fallback secret is read from `INTERNAL_API_SECRET` rather than
 * hardcoded, so it cannot leak through a shared constant, and it is refused
 * outright in production.
 */
export function hasValidApiSecret(req: NextRequest): boolean {
  const provided = req.headers.get("x-api-secret");
  if (!provided) return false;

  const configured = process.env.API_SECRET;
  if (configured && provided === configured) return true;

  if (process.env.NODE_ENV !== "production") {
    const internal = process.env.INTERNAL_API_SECRET;
    if (internal && provided === internal) return true;
  }

  return false;
}

export interface TenantGuardFailure {
  response: NextResponse;
}

/**
 * Resolves the caller's tenant identity, or returns a 401.
 *
 * Order of authority:
 *  1. Signed `session_token` cookie, verified here with the JWT secret.
 *  2. Middleware-injected headers — accepted ONLY alongside a valid API_SECRET.
 *
 * @param opts.requirePlatformOperator when true, ordinary user sessions are refused.
 */
export async function requireTenantSession(
  req: NextRequest,
  opts: { requirePlatformOperator?: boolean } = {},
): Promise<TenantSession | TenantGuardFailure> {
  // NextRequest exposes a parsed cookie jar. Read defensively so a malformed or
  // partially-constructed request degrades to "unauthenticated" instead of throwing.
  const cookieJar = (req as NextRequest | undefined)?.cookies;
  const token =
    cookieJar && typeof cookieJar.get === "function"
      ? cookieJar.get("session_token")?.value
      : undefined;

  if (token) {
    const payload = await verifyJWT(token);
    if (payload?.userId && payload.orgId) {
      // Session revocation.
      //
      // SECURITY: sign-out deletes the `userSession` row, but nothing ever read that
      // table back, so a signed-out or stolen cookie stayed valid for its full 7-day
      // lifetime. A token is honoured only while its `userSession` row exists and has
      // not expired.
      //
      // Platform-operator calls carry no userSession row and are authenticated by
      // API_SECRET instead, so they never reach this branch.
      const sessionRow = await prisma.userSession
        .findUnique({ where: { token }, select: { expiresAt: true, userId: true } })
        .catch(() => null);

      // Fail closed: an unreadable session table must not mean "session valid".
      if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
        return {
          response: NextResponse.json(
            { message: "Session expired or revoked. Please sign in again." },
            { status: 401 },
          ),
        };
      }

      // Guard against a validly-signed token whose subject no longer matches its row.
      if (sessionRow.userId !== payload.userId) {
        return {
          response: NextResponse.json(
            { message: "Unauthorized. Session does not match this user." },
            { status: 401 },
          ),
        };
      }

      const session: TenantSession = {
        userId: payload.userId,
        orgId: payload.orgId,
        role: payload.role ?? "analyst",
        name: payload.name ?? "Unknown",
        sebiRegNo: payload.sebiRegNo ?? null,
        isPlatformOperator: false,
        isUserSession: true,
      };
      if (opts.requirePlatformOperator) {
        return {
          response: NextResponse.json(
            { message: "This endpoint requires an internal service credential." },
            { status: 403 },
          ),
        };
      }
      return session;
    }
  }

  if (hasValidApiSecret(req)) {
    const userId = req.headers.get("x-user-id") ?? "agent-user";
    const session: TenantSession = {
      userId: PLATFORM_OPERATOR_USER_IDS.has(userId) ? userId : "agent-user",
      // The operator identity is still bound to one org for its own writes; its
      // cross-tenant READ access comes from isPlatformOperator, not from a wildcard org.
      orgId: req.headers.get("x-org-id") ?? "default-org",
      role: req.headers.get("x-user-role") ?? "ADMIN",
      name: req.headers.get("x-user-name") ?? "EquiGen Agent",
      sebiRegNo: req.headers.get("x-user-sebi-reg-no") ?? null,
      isPlatformOperator: true,
      isUserSession: false,
    };
    return session;
  }

  return {
    response: NextResponse.json(
      { message: "Unauthorized. Sign in, or present a valid internal service credential." },
      { status: 401 },
    ),
  };
}

/** Narrowing helper so callers can `if (isFailure(result)) return result.response`. */
export function isTenantFailure(
  result: TenantSession | TenantGuardFailure,
): result is TenantGuardFailure {
  return (result as TenantGuardFailure).response !== undefined;
}

export interface TenantOwnedRecord {
  orgId?: string | null;
}

/**
 * Whether `session` may access `record`.
 *
 * Rules:
 *  - Exact org match always passes.
 *  - Platform operators may read anything, including legacy `orgId: null` rows
 *    created before tenancy existed.
 *  - A record with NO orgId is visible only to a platform operator. Previously
 *    these leaked to any caller whose orgId happened to be `default-org`.
 *  - Admins are NOT org-superusers. A firm's admin manages their own firm's data.
 */
export function canAccessTenantRecord(
  session: TenantSession,
  record: TenantOwnedRecord | null | undefined,
): boolean {
  if (!record) return false;
  if (session.isPlatformOperator) return true;
  if (!record.orgId) return false;
  return record.orgId === session.orgId;
}

/** Convenience predicate that also tolerates an absent record. */
export function assertTenantAccess(
  session: TenantSession,
  record: TenantOwnedRecord | null | undefined,
): boolean {
  return canAccessTenantRecord(session, record);
}

/** Standard 403 body for a cross-tenant read. */
export function tenantForbidden(): NextResponse {
  return NextResponse.json({ message: "Forbidden. Access denied." }, { status: 403 });
}

/**
 * Whether the session holds one of the given roles.
 *
 * `admin` is deliberately NOT accepted by the routes that need authorisation rather
 * than tenancy. A firm admin manages their own firm; only the API_SECRET platform
 * operator crosses tenants.
 */
export function hasRole(session: TenantSession, ...roles: string[]): boolean {
  if (session.isPlatformOperator) return true;
  const role = (session.role ?? "").toLowerCase();
  return roles.some((r) => r.toLowerCase() === role);
}

/** Standard 403 body for an action the caller's role may not perform. */
export function roleForbidden(required: string): NextResponse {
  return NextResponse.json(
    { message: `Forbidden. This action requires the "${required}" role.` },
    { status: 403 },
  );
}

/**
 * Asserts that a research plan (or its parent session) belongs to the caller's tenant.
 *
 * The five `/api/agent/run-*` routes and several others accepted a caller-supplied
 * `planId`, loaded the plan with a bare `findUnique`, and then read the victim tenant's
 * decrypted API key. Ownership must be proven from the row, never from the request.
 */
export async function assertPlanOwnership(
  session: TenantSession,
  planId: string,
): Promise<boolean> {
  if (!planId) return false;
  const plan = await prisma.researchPlan.findUnique({
    where: { id: planId },
    select: { session: { select: { orgId: true } } },
  });
  if (!plan) return false;
  return canAccessTenantRecord(session, { orgId: plan.session?.orgId ?? null });
}

/**
 * Prisma `where` fragment scoping a query to the caller's tenant.
 *
 * Operators get no filter (they are cross-tenant by definition). Users get an
 * exact org match, which also excludes legacy `orgId: null` rows.
 */
export function tenantWhereClause(session: TenantSession): { orgId?: string } {
  return session.isPlatformOperator ? {} : { orgId: session.orgId };
}

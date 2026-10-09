import { NextRequest, NextResponse } from "next/server";

/**
 * @deprecated Use `requireTenantSession` / `canAccessTenantRecord` from
 * `./tenant` instead.
 *
 * Why this module is no longer the authorisation boundary:
 *
 *  - `requireApiSecret` accepted a request whenever it merely carried `x-user-id`
 *    and `x-org-id` headers. Those are middleware-injected, so any route the
 *    middleware matcher failed to cover would honour client-supplied identity.
 *  - `getAuthSession` fell back to `orgId: "default-org"` with `role: "admin"`
 *    whenever only `API_SECRET` was present, and several routes then treated
 *    `default-org` as a cross-tenant wildcard.
 *
 * The tenant guard verifies the session JWT itself and only accepts injected
 * headers alongside a valid internal service credential. See `src/lib/utils/tenant.ts`.
 */

export interface AuthSession {
  userId: string;
  orgId: string;
  role: string;
  name: string;
  sebiRegNo: string | null;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    {
      message:
        "Unauthorized. Set the x-api-secret header or authenticate via the sign-in page.",
    },
    { status: 401 },
  );
}

/**
 * Legacy authorisation check. Retained only so that a route which has not yet been
 * migrated keeps working; it is NOT a tenant boundary.
 *
 * @deprecated Use `requireTenantSession`.
 */
export function requireApiSecret(req: NextRequest): NextResponse | null {
  const userId = req.headers.get("x-user-id");
  const orgId = req.headers.get("x-org-id");

  if (userId && orgId) return null;

  const secret = process.env.API_SECRET;
  const provided = req.headers.get("x-api-secret");
  if (secret && provided === secret) return null;

  return unauthorized();
}

/**
 * Legacy identity extraction. Trusts injected headers and defaults the tenant.
 *
 * @deprecated Use `requireTenantSession`, which verifies the session JWT and
 * refuses to invent an orgId.
 */
export function getAuthSession(req: NextRequest): AuthSession | null {
  const userId = req.headers.get("x-user-id");
  const orgId = req.headers.get("x-org-id");
  const role = req.headers.get("x-user-role");
  const name = req.headers.get("x-user-name");
  const sebiRegNo = req.headers.get("x-user-sebi-reg-no");

  if (!userId || !orgId) {
    const secret = process.env.API_SECRET;
    const provided = req.headers.get("x-api-secret");
    if (secret && provided === secret) {
      return {
        userId: "system-test-user",
        orgId: "default-org",
        role: "admin",
        name: "System Test User",
        sebiRegNo: "INH000000000",
      };
    }
    return null;
  }

  return {
    userId,
    orgId,
    role: role || "analyst",
    name: name || "Anonymous",
    sebiRegNo: sebiRegNo || null,
  };
}

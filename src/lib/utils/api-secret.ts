/**
 * API-secret verification — EDGE SAFE.
 *
 * WHY THIS IS A SEPARATE MODULE
 * `src/middleware.ts` runs on the Edge runtime and needs `hasValidApiSecret`, but the
 * Edge runtime cannot execute Node built-ins. `tenant.ts` — the natural home for this
 * function — imports Prisma, which pulls in `pg`, so importing it from middleware
 * fails at build/runtime with:
 *
 *   Error: The edge runtime does not support Node.js 'crypto' module.
 *   Module not found: Can't resolve 'pg-native'
 *
 * Anything reachable from middleware MUST live here or in another module with no
 * Node-runtime dependencies: no `node:crypto`, no Prisma, no filesystem.
 *
 * Revocation (a database lookup) deliberately stays in `tenant.ts`, which is
 * Node-only and runs in the API route handlers.
 */

/**
 * Length-independent, branch-free string comparison.
 *
 * Implemented in plain JS rather than `crypto.timingSafeEqual` so it is safe on both
 * runtimes. The loop always examines every character and accumulates differences into
 * an accumulator that is only inspected at the end, so control flow does not depend on
 * where the first mismatch is.
 *
 * NOTE: a length mismatch is inherently observable via `length`, which is why the
 * `length` check below exists and is unavoidable. It reveals only the length of the
 * configured secret, not its contents.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;

  const aLen = a.length;
  const bLen = b.length;

  let mismatch = aLen ^ bLen;
  // Compare over the longer length so both inputs are read in full regardless of
  // whether they match.
  const len = aLen > bLen ? aLen : bLen;
  for (let i = 0; i < len; i++) {
    mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return mismatch === 0;
}

/** The userId the middleware assigns to API_SECRET-authenticated service calls. */
const PLATFORM_OPERATOR_USER_IDS = new Set(["agent-user", "system-test-user"]);

/**
 * Whether the request presented a valid API_SECRET.
 *
 * The development fallback secret is read from `INTERNAL_API_SECRET` rather than
 * hardcoded, so it cannot leak through a shared constant, and it is refused outright
 * in production.
 */
export function hasValidApiSecret(req: {
  headers: Headers;
  cookies?: { get?: (name: string) => { value?: string } | undefined };
}): boolean {
  const provided = req.headers.get("x-api-secret");
  if (!provided) return false;

  const configured = process.env.API_SECRET;
  if (configured && safeEqual(provided, configured)) return true;

  if (process.env.NODE_ENV !== "production") {
    const internal = process.env.INTERNAL_API_SECRET;
    if (internal && safeEqual(provided, internal)) return true;
  }

  return false;
}

export { PLATFORM_OPERATOR_USER_IDS };
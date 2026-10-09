/**
 * In-process fixed-window rate limiter.
 *
 * SECURITY: the API had no rate limiting at all on any endpoint. That allowed
 * credential stuffing against `/api/auth/signin`, unbounded signup enumeration, and
 * CPU-exhaustion primitives against the LLM-backed routes (`/api/agent/chat`,
 * `/api/sandbox/execute`), each of which can hold a request open for tens of seconds.
 *
 * Scope and limitations, stated plainly:
 *  - State is per-process. With more than one instance, the effective limit is
 *    `limit x instances`. A shared store (Redis) is required for a true global limit;
 *    this is a meaningful first layer, not a complete answer.
 *  - The window is fixed rather than sliding, so a caller may burst 2x the limit
 *    across a window boundary.
 *
 * Both are deliberate trade-offs: no new infrastructure, and a failure mode that
 * under-limits rather than locking legitimate users out.
 */

interface WindowState {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the current window resets. */
  retryAfterMs: number;
}

const globalStore = new Map<string, WindowState>();

/** Evict expired windows so the map cannot grow without bound under id churn. */
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, state] of globalStore) {
    if (state.resetAt <= now) globalStore.delete(key);
  }
}

/**
 * Records a hit against `key` and reports whether it is allowed.
 *
 * @param limit  maximum requests permitted per window
 * @param windowMs window length in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const existing = globalStore.get(key);
  if (!existing || existing.resetAt <= now) {
    globalStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  existing.count += 1;
  const retryAfterMs = existing.resetAt - now;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterMs,
  };
}

/**
 * Client address for rate-limit bucketing.
 *
 * `x-forwarded-for` is only trustworthy when a trusted proxy sets it; the leftmost
 * entry is the client when the deployment terminates at a known proxy.
 */
export function clientKeyFromRequest(
  req: { headers: Headers },
  extra = "",
): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";
  return extra ? `${extra}:${ip}` : ip;
}

/** Test seam: clears all counters. */
export function resetRateLimits(): void {
  globalStore.clear();
}
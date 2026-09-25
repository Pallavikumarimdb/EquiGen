/**
 * NSE Session Manager — RC-3 Reliability Fix
 *
 * NSE India's public API (nseindia.com/api/*) requires a valid browser session
 * cookie obtained by first visiting the NSE homepage. Without it, all API calls
 * return HTTP 401 or empty data arrays.
 *
 * This singleton fetches and caches the session cookie for 5 minutes,
 * reducing the overhead of repeated homepage visits during a single agent run.
 */

let _nseCookies: string | null = null;
let _nseSessionFetchedAt = 0;
const NSE_SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface NseSessionResult {
  cookies: string;
  fromCache: boolean;
}

/**
 * Obtains (or returns cached) NSE session cookies by visiting the NSE homepage.
 * Returns null if the session could not be established.
 */
export async function getNseSession(): Promise<NseSessionResult | null> {
  const now = Date.now();

  if (_nseCookies && now - _nseSessionFetchedAt < NSE_SESSION_TTL_MS) {
    return { cookies: _nseCookies, fromCache: true };
  }

  try {
    console.log("[NseSession] Bootstrapping NSE session by visiting nseindia.com...");
    const res = await fetch("https://www.nseindia.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });

    const rawCookies = res.headers.get("set-cookie") ?? "";
    if (!rawCookies) {
      console.warn("[NseSession] No cookies returned from NSE homepage — API calls may fail.");
      // Return empty string rather than null so callers still attempt requests
      _nseCookies = "";
      _nseSessionFetchedAt = now;
      return { cookies: "", fromCache: false };
    }

    // Parse: extract only name=value parts, join with "; "
    const cookiePairs = rawCookies
      .split(/,\s*(?=[A-Za-z_-]+=)/)
      .map((c) => c.split(";")[0].trim())
      .filter((c) => c.includes("="))
      .join("; ");

    _nseCookies = cookiePairs;
    _nseSessionFetchedAt = now;

    console.log(`[NseSession] ✓ NSE session established (${cookiePairs.length} chars of cookies)`);
    return { cookies: cookiePairs, fromCache: false };
  } catch (err) {
    console.warn("[NseSession] Failed to bootstrap NSE session:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

/**
 * Returns standard NSE request headers, injecting the session cookie if available.
 * Falls back to headers without Cookie if session is unavailable.
 */
export async function getNseHeaders(): Promise<HeadersInit> {
  const base: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
    "Origin": "https://www.nseindia.com",
    "X-Requested-With": "XMLHttpRequest",
  };

  const session = await getNseSession();
  if (session?.cookies) {
    base["Cookie"] = session.cookies;
  }

  return base;
}

/**
 * Invalidates the cached NSE session, forcing a fresh bootstrap on the next call.
 * Call this when NSE API returns 401 or empty data (session may have expired).
 */
export function invalidateNseSession(): void {
  _nseCookies = null;
  _nseSessionFetchedAt = 0;
  console.log("[NseSession] Session cache invalidated — will re-bootstrap on next request.");
}

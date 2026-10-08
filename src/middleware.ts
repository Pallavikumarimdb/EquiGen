import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJWT } from "@/lib/utils/jwt";
import { hasValidApiSecret } from "@/lib/utils/tenant";

/** Static asset extensions, checked as a path SUFFIX rather than a substring. */
const STATIC_ASSET_RE = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|map)$/i;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Exclude public assets, static content, and public APIs (like sign-in / sign-up / sign-out / demo-guest)
  //    Payment webhooks are also public — the signature header is the auth.
  //
  //    Static detection used to be `pathname.includes(".")`, which excluded ANY
  //    dotted path from authentication (e.g. `/v1.5/report`). It is now a suffix
  //    test against known asset extensions.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/signin") ||
    pathname.startsWith("/api/auth/signup") ||
    pathname.startsWith("/api/auth/signout") ||
    pathname.startsWith("/api/auth/demo") ||
    pathname === "/api/billing/webhook" ||
    STATIC_ASSET_RE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const isAuthPage = pathname.startsWith("/signin") || pathname.startsWith("/signup");
  const isLandingPage = pathname === "/";
  const isLegalPage =
    pathname.startsWith("/terms") || pathname.startsWith("/privacy");

  // 2. Retrieve token from cookies
  const token = request.cookies.get("session_token")?.value;

  let session = null;
  if (token) {
    session = await verifyJWT(token);
  }

  // 3. Handle login/signup redirection if already authenticated
  if (isAuthPage && session) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // 3b. The landing page, auth screens, and legal pages are reachable without a
  // session. "/" itself decides what to render (marketing page vs. dashboard).
  if (!session && (isLandingPage || isAuthPage || isLegalPage)) {
    return NextResponse.next();
  }

  // 4. User is authenticated via cookie session — inject authentic user session
  if (session) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", session.userId);
    requestHeaders.set("x-org-id", session.orgId);
    requestHeaders.set("x-user-role", session.role);
    requestHeaders.set("x-user-name", session.name);
    if (session.sebiRegNo) {
      requestHeaders.set("x-user-sebi-reg-no", session.sebiRegNo);
    }

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // 5. Internal service credential (headless agent / CI callers).
  //    The secret is validated by `hasValidApiSecret`, which reads it from the
  //    environment. It previously accepted a hardcoded "equigen-internal" literal
  //    in any non-production environment, so an unset NODE_ENV in a deployed
  //    environment would have been a full authentication bypass.
  //
  //    Only reached when NO user cookie session exists — a real user session always wins.
  if (hasValidApiSecret(request)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", "agent-user");
    // The operator identity is bound to one organisation for its own writes. Its
    // cross-tenant READ access comes from `isPlatformOperator` in the tenant guard,
    // not from `default-org` acting as a wildcard — see src/lib/utils/tenant.ts.
    requestHeaders.set("x-org-id", "default-org");
    requestHeaders.set("x-user-role", "ADMIN");
    requestHeaders.set("x-user-name", "EquiGen Agent");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 6. Deny access if no session is active and no internal secret
  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      { message: "Unauthorized. Please sign in." },
      { status: 401 }
    );
  }
  // Redirect web requests to the public landing page, which routes into sign in / sign up
  return NextResponse.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api/auth/signin, api/auth/signup, and api/auth/demo (public auth endpoints)
     * - api/billing/webhook (public payment webhook, authenticated by signature)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static files with extensions (.css, .js, .png, .jpg, .svg, etc.)
     */
    "/((?!api/auth/signin|api/auth/signup|api/auth/signout|api/auth/demo|api/billing/webhook|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|map)$).*)",
  ],
};

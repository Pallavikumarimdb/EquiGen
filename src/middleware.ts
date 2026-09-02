import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyJWT } from "@/lib/utils/jwt";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  console.log(`[Middleware] pathname: ${pathname}`);

  // 1. Exclude public assets, static content, and public APIs (like sign-in / sign-up / demo-guest)
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/auth/signin") ||
    pathname.startsWith("/api/auth/signup") ||
    pathname.startsWith("/api/auth/demo") ||
    pathname.includes(".") // matches static files like favicon.ico, images, etc.
  ) {
    return NextResponse.next();
  }

  const isAuthPage = pathname.startsWith("/signin") || pathname.startsWith("/signup");

  // 2. Retrieve token from cookies
  const token = request.cookies.get("session_token")?.value;

  let session = null;
  if (token) {
    session = await verifyJWT(token);
  }

  // 3. Handle login/signup redirection if already authenticated
  if (isAuthPage) {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 3b. Internal developer / Agent secret bypass
  const apiSecret = request.headers.get("x-api-secret");
  if (apiSecret === "equigen-internal") {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", "agent-user");
    requestHeaders.set("x-org-id", "default-org");
    requestHeaders.set("x-user-role", "ADMIN");
    requestHeaders.set("x-user-name", "EquiGen Agent");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // 4. Deny access if no session is active
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { message: "Unauthorized. Please sign in." },
        { status: 401 }
      );
    }
    // Redirect web requests to login page
    return NextResponse.redirect(new URL("/signin", request.url));
  }

  // 5. User is authenticated, clone request headers and append user session information
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

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api/auth/signin, api/auth/signup, and api/auth/demo (public auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static files with extensions (.css, .js, .png, .jpg, .svg, etc.)
     */
    "/((?!api/auth/signin|api/auth/signup|api/auth/demo|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?|map)$).*)",
  ],
};

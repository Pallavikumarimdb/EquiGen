import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple API secret guard for sensitive routes.
 *
 * To enable: set `API_SECRET` in your `.env` file.
 * When set, all protected routes require the `x-api-secret` header to match.
 * When NOT set (default for local dev), auth is skipped — useful for development.
 *
 * Usage:
 *   const authError = requireApiSecret(req);
 *   if (authError) return authError;
 */
export function requireApiSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET;

  // Auth disabled — skip check (local dev / no secret configured)
  if (!secret) return null;

  const provided = req.headers.get('x-api-secret');
  if (provided === secret) return null;

  // Check same-origin browser requests via Origin/Referer header as an alternative
  // This allows the dashboard UI (same-origin) to access protected routes without a header
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  if (appUrl && origin.startsWith(appUrl)) return null;

  return NextResponse.json(
    { message: 'Unauthorized. Set the x-api-secret header to access this endpoint.' },
    { status: 401 }
  );
}

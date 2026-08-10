import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Simple API secret guard for sensitive routes.
 *
 * To enable: set `API_SECRET` in your `.env` file.
 * When set, all protected routes require the `x-api-secret` header to match.
 * When NOT set (default for local dev), auth is skipped — useful for development.
 *
 * Same-origin browser requests (the dashboard UI) are permitted only when the
 * Origin/Referer header EXACTLY matches `NEXT_PUBLIC_APP_URL` (no prefix matching —
 * `https://app.example.com.evil.com` must never pass for `https://app.example.com`).
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
  if (provided) {
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return null;
  }

  // Same-origin browser fallback: exact match against NEXT_PUBLIC_APP_URL only.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '');
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  if (appUrl && origin.replace(/\/+$/, '') === appUrl) return null;

  return NextResponse.json(
    { message: 'Unauthorized. Set the x-api-secret header to access this endpoint.' },
    { status: 401 }
  );
}
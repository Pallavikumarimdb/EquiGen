import { SignJWT, jwtVerify } from "jose";

/**
 * JWT signing secret.
 *
 * SECURITY: this previously fell back to the hardcoded literal
 * `"default-secret-key-at-least-32-chars-long"`. With `JWT_SECRET` unset — a very
 * common misconfiguration — every session cookie in the deployment was signed with a
 * publicly known key, so anyone could mint a cookie for any `userId`/`orgId`/`role`
 * and pass `requireTenantSession` as any tenant, including a cross-tenant superuser.
 * The secret is committed in git history, so rotating it is mandatory after deploy.
 *
 * In production a missing or too-short secret now fails closed at first use rather
 * than silently signing with a guessable key.
 */
function resolveJwtSecret(): Uint8Array {
  const configured = process.env.JWT_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  if (!configured || configured.length < 32) {
    if (isProduction) {
      throw new Error(
        "JWT_SECRET is missing or shorter than 32 characters. Refusing to sign or verify " +
          "session tokens with a guessable key. Generate one with: openssl rand -base64 48",
      );
    }
    // Non-production: keep the dev convenience, but make it loud and obvious.
    console.warn(
      "[jwt] WARNING: JWT_SECRET is not configured. Using a hardcoded development key. " +
        "Any token signed with it must never be trusted.",
    );
    return new TextEncoder().encode(
      "default-secret-key-at-least-32-chars-long",
    );
  }

  return new TextEncoder().encode(configured);
}

// Resolved lazily: reading env at module scope breaks builds that import this module
// before the environment is populated, and it must not throw during `next build`.
let cachedSecret: Uint8Array | null = null;
function getSecret(): Uint8Array {
  if (!cachedSecret) cachedSecret = resolveJwtSecret();
  return cachedSecret;
}

export interface UserSessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  orgId: string;
  sebiRegNo: string | null;
  /** Unique session id, so a signed-out session can be revoked. */
  jti?: string;
}

/**
 * Signs a JWT with the user session payload.
 */
export async function signJWT(
  payload: UserSessionPayload,
  expiresAt: Date,
  jti?: string,
): Promise<string> {
  const josePayload: UserSessionPayload = { ...payload };
  if (jti) josePayload.jti = jti;

  return new SignJWT({ ...josePayload })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti ?? crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecret());
}

/**
 * Verifies a JWT token. Returns the payload or null if invalid/expired.
 *
 * Throws in production when no usable secret is configured, so a misconfigured
 * deployment fails loudly instead of rejecting every legitimate session silently.
 */
export async function verifyJWT(token: string): Promise<UserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as UserSessionPayload;
  } catch (err) {
    // A configuration error must not be indistinguishable from "bad token".
    if (
      err instanceof Error &&
      err.message.includes("JWT_SECRET is missing or shorter than")
    ) {
      throw err;
    }
    return null;
  }
}
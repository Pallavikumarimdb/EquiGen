import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET_KEY = process.env.JWT_SECRET || "default-secret-key-at-least-32-chars-long";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_KEY);

export interface UserSessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  orgId: string;
  sebiRegNo: string | null;
}

/**
 * Signs a JWT with the user session payload.
 */
export async function signJWT(payload: UserSessionPayload, expiresAt: Date): Promise<string> {
  // Convert payload to plain object (jose expects simple types)
  const josePayload = { ...payload };
  
  return new SignJWT(josePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(JWT_SECRET);
}

/**
 * Verifies a JWT token. Returns the payload or null if invalid/expired.
 */
export async function verifyJWT(token: string): Promise<UserSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as UserSessionPayload;
  } catch {
    return null;
  }
}

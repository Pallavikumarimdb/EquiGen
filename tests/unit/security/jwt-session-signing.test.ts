/**
 * Session-token signing behaviour.
 *
 * Covers the ephemeral development key, including the stability property that the
 * `globalThis` cache exists to provide: Next.js dev re-evaluates modules on every
 * recompile, so a module-scoped cache would mint a new key each time and silently
 * invalidate every session cookie mid-session.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signJWT, verifyJWT } from "@/lib/utils/jwt";

const globalForJwt = globalThis as unknown as { __equigenJwtSecret?: Uint8Array };

const basePayload = {
  userId: "u-1",
  email: "a@example.com",
  name: "Analyst",
  role: "analyst",
  orgId: "acme",
  sebiRegNo: "INH000000123",
};

function readGlobalKey(): Uint8Array | undefined {
  return globalForJwt.__equigenJwtSecret;
}

beforeEach(() => {
  delete globalForJwt.__equigenJwtSecret;
  vi.resetModules();
});

afterEach(() => {
  delete globalForJwt.__equigenJwtSecret;
  vi.stubEnv("JWT_SECRET", "");
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("with a configured JWT_SECRET", () => {
  it("round-trips a token", async () => {
    vi.stubEnv("JWT_SECRET", "a".repeat(48));
    const expiresAt = new Date(Date.now() + 60_000);
    const token = await signJWT(basePayload, expiresAt);
    const decoded = await verifyJWT(token);
    expect(decoded?.userId).toBe("u-1");
    expect(decoded?.orgId).toBe("acme");
  });

  it("rejects a token signed with a different secret", async () => {
    vi.stubEnv("JWT_SECRET", "a".repeat(48));
    const token = await signJWT(basePayload, new Date(Date.now() + 60_000));

    vi.resetModules();
    delete globalForJwt.__equigenJwtSecret;
    vi.stubEnv("JWT_SECRET", "b".repeat(48));

    expect(await verifyJWT(token)).toBeNull();
  });
});

describe("without a configured JWT_SECRET (development)", () => {
  beforeEach(() => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
  });

  it("still issues a verifiable token rather than refusing", async () => {
    const token = await signJWT(basePayload, new Date(Date.now() + 60_000));
    const decoded = await verifyJWT(token);
    expect(decoded?.userId).toBe("u-1");
  });

  it("caches the key on globalThis so recompiles do not invalidate sessions", async () => {
    await signJWT(basePayload, new Date(Date.now() + 60_000));
    const first = readGlobalKey();
    expect(first).toBeDefined();

    // Simulate a Next.js dev recompile: the module is re-evaluated, so any cache held
    // in module scope is gone. The token minted before the reload must still verify.
    const token = await signJWT(basePayload, new Date(Date.now() + 60_000));

    vi.resetModules();
    const { signJWT: signAgain } = await import("@/lib/utils/jwt");

    expect(readGlobalKey()).toBe(first);

    // A token signed after the reload verifies against the pre-reload key.
    const decoded = await verifyJWT(token);
    expect(decoded?.userId).toBe("u-1");

    // And the re-imported module still uses the same key.
    const afterReload = await signAgain(basePayload, new Date(Date.now() + 60_000));
    expect(await verifyJWT(afterReload)).not.toBeNull();
    expect(readGlobalKey()).toBe(first);
  });

  it("uses a key that is not a fixed repository constant", async () => {
    await signJWT(basePayload, new Date(Date.now() + 60_000));
    const key = readGlobalKey()!;
    const asText = new TextDecoder().decode(key);
    // The pre-fix literal must not reappear.
    expect(asText).not.toContain("default-secret-key-at-least-32-chars-long");
    expect(key.length).toBe(32);
  });
});

describe("production without a configured JWT_SECRET", () => {
  it("throws rather than signing with a guessable key", async () => {
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");

    await expect(signJWT(basePayload, new Date(Date.now() + 60_000))).rejects.toThrow(
      /JWT_SECRET is missing or shorter than 32 characters/,
    );
  });

  it("refuses a secret shorter than 32 characters", async () => {
    vi.stubEnv("JWT_SECRET", "too-short");
    vi.stubEnv("NODE_ENV", "production");

    await expect(signJWT(basePayload, new Date(Date.now() + 60_000))).rejects.toThrow(
      /JWT_SECRET is missing or shorter than 32 characters/,
    );
  });
});
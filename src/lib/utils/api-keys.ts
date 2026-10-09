import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Server-side master key for AES-256-GCM encryption of tenant provider keys.
 *
 * SECURITY: this previously fell back to the literal `"a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"`
 * outside production. That key is in git history, so ANYONE holding a database dump
 * could decrypt every tenant's stored Groq/OpenAI/OpenRouter/Anthropic/DeepSeek key.
 * The production-only guard was also conditional on NODE_ENV, so a staging/preview
 * deployment — or a container with NODE_ENV unset — silently encrypted real keys with
 * a public constant.
 *
 * There is now no fallback at all: the module refuses to load without the variable.
 * Resolution is lazy rather than at import time so `next build` (which imports this
 * module without a runtime environment) still succeeds.
 *
 * OPERATOR ACTION: rotate ENCRYPTION_KEY before deploying if any non-production
 * instance ever stored real keys. Existing ciphertext cannot be read with a new key.
 */
let cachedMasterKey: Buffer | null = null;

function masterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;

  const configured = process.env.ENCRYPTION_KEY;
  if (!configured) {
    throw new Error(
      "[api-keys] ENCRYPTION_KEY is not set. Every tenant's stored provider key is " +
        "encrypted with it, so it must be configured rather than defaulted. " +
        "Generate one with `openssl rand -hex 16` and set it in your .env.",
    );
  }

  const key = Buffer.from(configured, "hex");
  if (key.length !== 32) {
    throw new Error(
      `[api-keys] ENCRYPTION_KEY must be 64 hex characters (32 bytes) for AES-256; got ${key.length} bytes. ` +
        "Generate one with `openssl rand -hex 16`.",
    );
  }

  cachedMasterKey = key;
  return key;
}

/**
 * Encrypts a raw text key using AES-256-GCM.
 * Output format: iv_hex:auth_tag_hex:encrypted_text_hex
 */
export function encryptKey(rawText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    masterKey(),
    iv,
  );

  let encrypted = cipher.update(rawText, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted key string formatted as iv_hex:auth_tag_hex:encrypted_text_hex.
 */
export function decryptKey(encryptedString: string): string {
  const parts = encryptedString.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted key payload structure");
  }

  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encryptedText = parts[2];

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    masterKey(),
    iv,
  );
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Saves a provider API key securely encrypted in the database.
 * If the key is empty, it deletes the key record.
 */
export async function saveEncryptedApiKey(
  orgId: string,
  provider: string,
  keyText: string,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  if (!keyText || keyText.trim() === "") {
    try {
      await prisma.apiKey.delete({
        where: {
          orgId_provider: { orgId, provider },
        },
      });
    } catch {
      // Key didn't exist, ignore delete failure
    }
    return;
  }

  const encrypted = encryptKey(keyText.trim());
  await prisma.apiKey.upsert({
    where: {
      orgId_provider: { orgId, provider },
    },
    update: {
      encryptedKey: encrypted,
    },
    create: {
      orgId,
      provider,
      encryptedKey: encrypted,
    },
  });
}

/**
 * Retrieves and decrypts a saved API key from the database.
 * Returns null if not found.
 */
export async function getDecryptedApiKey(
  orgId: string,
  provider: string,
): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;

  const keyRecord = await prisma.apiKey.findUnique({
    where: {
      orgId_provider: { orgId, provider },
    },
  });

  if (!keyRecord) return null;
  return decryptKey(keyRecord.encryptedKey);
}

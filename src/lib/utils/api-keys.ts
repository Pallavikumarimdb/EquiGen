import crypto from 'crypto';
import { prisma } from '@/lib/db';

// Get server-side master key from environment — REQUIRED for AES-256-GCM key encryption.
// Generate with: openssl rand -hex 16
if (!process.env.ENCRYPTION_KEY) {
  if (process.env.NODE_ENV === 'production') {
    // Refuse to run with a publicly-known key — stored provider keys would be decryptable
    // by anyone who reads the repository.
    throw new Error(
      '[api-keys] ENCRYPTION_KEY must be set in production. ' +
      'Generate one with `openssl rand -hex 16` and set it in your .env.'
    );
  }
  console.warn(
    '[api-keys] WARNING: ENCRYPTION_KEY is not set. ' +
    'Using a hardcoded DEVELOPMENT-ONLY key — set ENCRYPTION_KEY in your .env before deploying. ' +
    'Keys encrypted with the dev key cannot be decrypted after a real key is configured.'
  );
}
const MASTER_KEY = process.env.ENCRYPTION_KEY || 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'; // development-only, 32 bytes

/**
 * Encrypts a raw text key using AES-256-GCM.
 * Output format: iv_hex:auth_tag_hex:encrypted_text_hex
 */
export function encryptKey(rawText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(MASTER_KEY), iv);
  
  let encrypted = cipher.update(rawText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted key string formatted as iv_hex:auth_tag_hex:encrypted_text_hex.
 */
export function decryptKey(encryptedString: string): string {
  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted key payload structure');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = parts[2];

  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(MASTER_KEY), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Saves a provider API key securely encrypted in the database.
 * If the key is empty, it deletes the key record.
 */
export async function saveEncryptedApiKey(orgId: string, provider: string, keyText: string): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  
  if (!keyText || keyText.trim() === '') {
    try {
      await prisma.apiKey.delete({
        where: {
          orgId_provider: { orgId, provider }
        }
      });
    } catch {
      // Key didn't exist, ignore delete failure
    }
    return;
  }

  const encrypted = encryptKey(keyText.trim());
  await prisma.apiKey.upsert({
    where: {
      orgId_provider: { orgId, provider }
    },
    update: {
      encryptedKey: encrypted
    },
    create: {
      orgId,
      provider,
      encryptedKey: encrypted
    }
  });
}

/**
 * Retrieves and decrypts a saved API key from the database.
 * Returns null if not found.
 */
export async function getDecryptedApiKey(orgId: string, provider: string): Promise<string | null> {
  if (!process.env.DATABASE_URL) return null;

  const keyRecord = await prisma.apiKey.findUnique({
    where: {
      orgId_provider: { orgId, provider }
    }
  });

  if (!keyRecord) return null;
  return decryptKey(keyRecord.encryptedKey);
}

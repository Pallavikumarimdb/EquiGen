import crypto from "crypto";

/**
 * Computes sha256 checksum of JSON/string content to guarantee data integrity.
 */
export function computeSHA256(content: unknown): string {
  const normalized =
    typeof content === "string" ? content : JSON.stringify(content);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

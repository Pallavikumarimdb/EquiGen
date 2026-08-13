/**
 * Prompt/schema versioning — the second half of chunk idempotency.
 *
 * chunkInputHash = sha256(chunkText + extractType + promptVersion[extractType])
 *
 * Bumping one type's version invalidates ONLY that type's "ok" chunks on the next run —
 * a financials prompt fix never reprocesses narrative chunks (saves 8B budget).
 * Versions must be bumped in the same commit that changes the corresponding prompt/schema.
 */

import { computeSHA256 } from "@/lib/utils/hash";

export const PROMPT_VERSIONS = {
  general: 1,
  swot: 1,
  financials: 1,
  narrative: 1,
} as const;

export type ExtractType = keyof typeof PROMPT_VERSIONS;

/** Stable idempotency key for a chunk — changes only when text OR prompt version changes. */
export function chunkInputHash(
  chunkText: string,
  extractType: ExtractType,
): string {
  return computeSHA256(
    `${chunkText}|${extractType}|${PROMPT_VERSIONS[extractType]}`,
  );
}

/** Snapshot of all versions — stored on ExtractionJob.schemaVersion for audit + invalidation checks. */
export function currentSchemaVersion(): string {
  return JSON.stringify(PROMPT_VERSIONS);
}

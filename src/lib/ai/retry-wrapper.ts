/**
 * retry-wrapper.ts — Parses Groq's actual retry hint from 429 error bodies.
 *
 * Wraps a structured-output invoke call. On a genuine 429:
 *   1. Parses Groq's suggested wait time from the error message ("try again in X.XXs")
 *   2. Waits exactly that long + 1s safety margin
 *   3. Retries once
 *   4. If still blocked, throws a typed RateLimitError so callers can set status: 'throttled'
 *      instead of status: 'failed', enabling auto-resume instead of manual "Resume Node" click.
 */

export class RateLimitError extends Error {
  public retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Parses Groq's "try again in Xs" from the error message.
 * Falls back to 15s if the message can't be parsed.
 */
export function parseRetryAfterSeconds(errorMessage: string): number {
  const match = errorMessage.match(
    /try again in (?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i,
  );
  if (!match) return 15;

  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const seconds = match[3] ? parseFloat(match[3]) : 0;

  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? Math.ceil(total) + 1 : 15; // +1s safety margin
}

/**
 * Wraps any async call. On 429 responses:
 *  - Parses Groq's suggested wait time (not a guessed backoff)
 *  - If the cooldown is long (>30s, typically a model daily-quota reset) and a
 *    `fallback` callable is provided (e.g. a different model on its own quota),
 *    switches to the fallback instead of freezing the request.
 *  - Otherwise waits exactly that long, then retries once
 *  - If still rate-limited after maxAttempts, throws RateLimitError (typed, not generic Error)
 *
 * Non-429 errors are re-thrown immediately without retry.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 2,
  onWaitStart?: (waitSeconds: number) => Promise<void> | void,
  onWaitEnd?: () => Promise<void> | void,
  fallback?: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      const status =
        (err as { status?: number })?.status ||
        (err as { response?: { status?: number } })?.response?.status;
      const message = err instanceof Error ? err.message : String(err);

      if (
        status === 429 ||
        message.includes("rate_limit_exceeded") ||
        message.includes("Rate limit") ||
        message.includes("429") ||
        message.includes("Quota")
      ) {
        const waitSeconds = parseRetryAfterSeconds(message);
        console.warn(
          `\n[RetryWrapper] ⚠️ LLM API RATE LIMITED (Attempt ${attempt + 1}/${maxAttempts}). Waiting ${waitSeconds}s per provider backoff...`,
        );
        console.warn(`[RetryWrapper] Error Details: ${message}\n`);

        // Long cooldown (daily-quota reset) → hand off to the fallback model when available.
        // Shorter waits are handled on the same model to preserve preferred-model quality.
        if (fallback && waitSeconds > 30) {
          try {
            console.warn(
              `[RetryWrapper] 🔄 Long cooldown detected (${waitSeconds}s) — switching execution to fallback model...`,
            );
            return await fallback();
          } catch (fbErr: unknown) {
            lastError = fbErr;
            console.warn(
              "[RetryWrapper] ❌ Fallback model execution also failed:",
              fbErr instanceof Error ? fbErr.message : fbErr,
            );
          }
        }

        // Abort and throw immediately if wait duration exceeds 5 minutes (300s) to avoid freezing server processes
        if (waitSeconds > 300) {
          console.error(`[RetryWrapper] ❌ Cooldown wait of ${waitSeconds}s exceeds 300s max limit. Halting execution.`);
          throw new RateLimitError(
            lastError instanceof Error ? lastError.message : message,
            waitSeconds,
          );
        }

        if (attempt < maxAttempts - 1) {
          if (onWaitStart) {
            try {
              await onWaitStart(waitSeconds);
            } catch (e) {
              console.error("Failed calling onWaitStart in retry wrapper:", e);
            }
          }
          await new Promise((resolve) =>
            setTimeout(resolve, waitSeconds * 1000),
          );
          if (onWaitEnd) {
            try {
              await onWaitEnd();
            } catch (e) {
              console.error("Failed calling onWaitEnd in retry wrapper:", e);
            }
          }
          continue; // retry
        }

        // Exhausted attempts — signal as throttled, not failed
        throw new RateLimitError(
          lastError instanceof Error ? lastError.message : message,
          waitSeconds,
        );
      }

      // Non-rate-limit error — propagate immediately as real failure
      throw err;
    }
  }

  throw lastError;
}

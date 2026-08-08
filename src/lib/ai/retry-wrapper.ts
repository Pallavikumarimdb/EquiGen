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
    this.name = 'RateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Parses Groq's "try again in Xs" from the error message.
 * Falls back to 15s if the message can't be parsed.
 */
export function parseRetryAfterSeconds(errorMessage: string): number {
  const match = errorMessage.match(/try again in ([\d.]+)s/i);
  return match ? Math.ceil(parseFloat(match[1])) + 1 : 15; // +1s safety margin
}

/**
 * Wraps any async call. On 429 responses:
 *  - Parses Groq's suggested wait time (not a guessed backoff)
 *  - Waits exactly that long, then retries once
 *  - If still rate-limited after maxAttempts, throws RateLimitError (typed, not generic Error)
 *
 * Non-429 errors are re-thrown immediately without retry.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 2
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      const status = (err as { status?: number })?.status
        || (err as { response?: { status?: number } })?.response?.status;
      const message = err instanceof Error ? err.message : String(err);

      if (status === 429 || message.includes('rate_limit_exceeded') || message.includes('Rate limit')) {
        const waitSeconds = parseRetryAfterSeconds(message);
        console.warn(`[RetryWrapper] Rate limited (attempt ${attempt + 1}/${maxAttempts}). Waiting ${waitSeconds}s per Groq's response.`);

        if (attempt < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
          continue; // retry
        }

        // Exhausted attempts — signal as throttled, not failed
        throw new RateLimitError(message, waitSeconds);
      }

      // Non-rate-limit error — propagate immediately as real failure
      throw err;
    }
  }

  throw lastError;
}

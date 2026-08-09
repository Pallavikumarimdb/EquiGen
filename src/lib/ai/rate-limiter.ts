/**
 * TokenBudgetManager — Tracks real token usage per model in a sliding 60-second window
 * and makes callers wait for actual headroom instead of guessing with fixed delays.
 */

interface UsageEntry {
  tokens: number;
  timestamp: number;
}

class TokenBudgetManager {
  private usage: Map<string, UsageEntry[]> = new Map();
  private limits: Map<string, number> = new Map([
    ['llama-3.3-70b-versatile', 12000],
    ['llama-3.1-8b-instant', 500000],
    ['gpt-4o-mini', 200000],
    ['gpt-4o', 800000],
  ]);

  private readonly windowMs = 60_000;

  setLimit(model: string, tpm: number) {
    this.limits.set(model, tpm);
  }

  private prune(model: string) {
    const now = Date.now();
    const entries = this.usage.get(model) || [];
    const fresh = entries.filter(e => now - e.timestamp < this.windowMs);
    this.usage.set(model, fresh);
  }

  private currentUsage(model: string): number {
    this.prune(model);
    return (this.usage.get(model) || []).reduce((sum, e) => sum + e.tokens, 0);
  }

  /** Returns how many tokens are free right now for this model. */
  availableBudget(model: string): number {
    const limit = this.limits.get(model) ?? 12000;
    return Math.max(0, limit - this.currentUsage(model));
  }

  /** Records actual tokens consumed by a completed call (input + output). */
  recordUsage(model: string, tokens: number) {
    const entries = this.usage.get(model) || [];
    entries.push({ tokens, timestamp: Date.now() });
    this.usage.set(model, entries);
  }

  /**
   * Waits until `estimatedTokens` of budget is free for `model`.
   * Returns the number of ms actually waited (for logging/telemetry).
   * Throws REQUEST_EXCEEDS_MODEL_CEILING if the request is fundamentally too large.
   * `onWaitStart` fires before each sleep with the computed wait duration so callers
   * can surface a live "waiting for capacity" estimate to the user (e.g. via job status).
   */
  async waitForBudget(
    model: string,
    estimatedTokens: number,
    onWaitStart?: (waitMs: number) => void
  ): Promise<number> {
    const limit = this.limits.get(model) ?? 12000;

    if (estimatedTokens > limit) {
      throw new Error(
        `REQUEST_EXCEEDS_MODEL_CEILING: estimated ${estimatedTokens} tokens exceeds ${model}'s ${limit} TPM ceiling outright. Shrink the request or use a higher-TPM model.`
      );
    }

    const start = Date.now();

    while (this.availableBudget(model) < estimatedTokens) {
      this.prune(model);
      const entries = this.usage.get(model) || [];
      if (entries.length === 0) break; // budget free next tick
      const oldest = entries[0];
      const msUntilExpires = this.windowMs - (Date.now() - oldest.timestamp) + 250; // +250ms safety margin
      const waitMs = Math.max(250, msUntilExpires);
      console.log(`[TokenBudget] Waiting ${waitMs}ms for ${estimatedTokens} tokens on ${model} (available: ${this.availableBudget(model)})`);
      onWaitStart?.(waitMs);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    return Date.now() - start;
  }
}

export const tokenBudgetManager = new TokenBudgetManager();

/**
 * Rough token estimator — uses ~4 chars/token heuristic across Llama/GPT-family tokenizers.
 * Accurate enough for budgeting; not exact tokenization.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

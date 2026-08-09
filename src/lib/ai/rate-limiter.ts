/**
 * TokenBudgetManager — Tracks real token usage per model in a sliding 60-second window
 * and makes callers wait for actual headroom instead of guessing with fixed delays.
 * Also tracks tokens-per-day (TPD) so the router can switch models before Groq's
 * daily quota is exhausted (each model has its own separate daily quota).
 */

interface UsageEntry {
  tokens: number;
  timestamp: number;
}

interface DailyUsageEntry {
  date: string; // UTC yyyy-mm-dd
  tokens: number;
}

class TokenBudgetManager {
  private usage: Map<string, UsageEntry[]> = new Map();
  private dailyUsage: Map<string, DailyUsageEntry> = new Map();
  private limits: Map<string, number> = new Map([
    ['llama-3.3-70b-versatile', 12000],
    ['llama-3.1-8b-instant', 500000],
    ['gpt-4o-mini', 200000],
    ['gpt-4o', 800000],
  ]);

  // Tokens-per-day ceilings (provisional — 70B's on-demand quota is ~100k/day,
  // a small buffer is kept below the real cap to absorb token-estimation drift).
  private readonly tpds: Map<string, number> = new Map([
    ['llama-3.3-70b-versatile', 97000],
    ['llama-3.1-8b-instant', 97000],
    ['gpt-4o-mini', 2000000],
    ['gpt-4o', 400000],
  ]);

  private readonly windowMs = 60_000;

  setLimit(model: string, tpm: number) {
    this.limits.set(model, tpm);
  }

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** Tokens already consumed today for this model (resets at UTC midnight). */
  dailyUsedToday(model: string): number {
    const rec = this.dailyUsage.get(model);
    if (!rec || rec.date !== this.todayKey()) return 0;
    return rec.tokens;
  }

  /** True if the model still has tokens-per-day headroom for an estimated request. */
  hasDailyBudget(model: string, estimatedTokens: number): boolean {
    const limit = this.tpds.get(model);
    if (limit === undefined) return true;
    return this.dailyUsedToday(model) + estimatedTokens <= limit;
  }

  /** Records tokens consumed today for a model (summed across the UTC day). */
  recordDailyUsage(model: string, tokens: number): void {
    const key = this.todayKey();
    const prev = this.dailyUsage.get(model);
    this.dailyUsage.set(model, {
      date: key,
      tokens: (prev && prev.date === key ? prev.tokens : 0) + tokens
    });
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

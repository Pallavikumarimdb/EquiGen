/**
 * TokenBudgetStore — the single seam between the token budget logic and its backing store.
 *
 * One Postgres implementation today (durable across instances at small scale, atomic via
 * upsert-on-minute-bucket). A Redis implementation (INCR/EXPIRE on the same interface) can
 * replace it later without touching any business logic — swap the store, not the callers.
 */

export interface ModelLimitRecord {
  model: string;
  /** Tokens per minute ceiling */
  tpm: number;
  /** Tokens per day ceiling (0 = unlimited/unset) */
  tpd: number;
  source: 'configured' | 'discovered' | 'env';
  lastDiscoveredAt?: Date | null;
}

export interface TokenBudgetStore {
  /** Tokens used in the rolling 60-second window for a model (sum of the last two minute buckets). */
  windowUsed(model: string): Promise<number>;
  /** Tokens used today (UTC) for a model. */
  dailyUsed(model: string): Promise<number>;
  /** Atomically add tokens to the current window and the daily total. */
  recordUsage(model: string, tokens: number): Promise<void>;
  /** Persist a limit (configured default or live-discovered). */
  upsertLimit(record: ModelLimitRecord): Promise<void>;
  /** Latest persisted limit for a model, if any. */
  getLimit(model: string): Promise<ModelLimitRecord | null>;
}

/** UTC minute key used as the budget bucket id, e.g. "2026-08-10T14:07". */
export function minuteKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 16);
}

/** UTC day key used for tokens-per-day tracking, e.g. "2026-08-10". */
export function dayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** No-op store used when the database is unavailable — budget stays in-memory, nothing is persisted. */
export class NullBudgetStore implements TokenBudgetStore {
  async windowUsed(): Promise<number> {
    return 0;
  }
  async dailyUsed(): Promise<number> {
    return 0;
  }
  async recordUsage(): Promise<void> {}
  async upsertLimit(): Promise<void> {}
  async getLimit(): Promise<ModelLimitRecord | null> {
    return null;
  }
}
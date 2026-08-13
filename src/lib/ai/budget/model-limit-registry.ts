/**
 * ModelLimitRegistry — in-process, sync source of truth for per-model rate ceilings.
 *
 * Priority: env override > live-discovered (from Groq x-ratelimit-* headers) > configured default.
 * The defaults below are *starting points only*: Groq's free tier changed materially during 2026
 * (measured reports put the text models near ~6k TPM with 30 RPM and tightened per-day request
 * caps), so the registry is meant to be corrected by limit-discovery.ts at runtime. Numbers here
 * are deliberately conservative until discovery confirms them.
 */

import { ModelLimitRecord } from "./types";

export const MODEL_IDS = {
  PRIMARY_70B: "llama-3.3-70b-versatile",
  BULK_8B: "llama-3.1-8b-instant",
  VISION_11B: "llama-3.2-11b-vision-preview",
} as const;

export const VISION_MODEL =
  process.env.GROQ_VISION_MODEL || MODEL_IDS.VISION_11B;

/** Fallback ceilings used when discovery hasn't run (or has no API key to probe with). */
const CONFIGURED_DEFAULTS: Record<string, ModelLimitRecord> = {
  [MODEL_IDS.PRIMARY_70B]: {
    model: MODEL_IDS.PRIMARY_70B,
    tpm: 6000,
    tpd: 97000,
    source: "configured",
  },
  [MODEL_IDS.BULK_8B]: {
    model: MODEL_IDS.BULK_8B,
    tpm: 6000,
    tpd: 1000000,
    source: "configured",
  },
  [MODEL_IDS.VISION_11B]: {
    model: MODEL_IDS.VISION_11B,
    tpm: 7000,
    tpd: 1000000,
    source: "configured",
  },
  "gpt-4o-mini": {
    model: "gpt-4o-mini",
    tpm: 200000,
    tpd: 2000000,
    source: "configured",
  },
  "gpt-4o": { model: "gpt-4o", tpm: 800000, tpd: 400000, source: "configured" },
};

class ModelLimitRegistry {
  /** discovered()/env overrides, keyed by model */
  private overrides = new Map<string, ModelLimitRecord>();
  private hydrating: Promise<void> | null = null;

  private configured(model: string): ModelLimitRecord {
    return (
      CONFIGURED_DEFAULTS[model] ?? {
        model,
        tpm: 6000,
        tpd: 0,
        source: "configured",
      }
    );
  }

  /** Effective limit for a model, in-process and synchronous (router hot path). */
  get(model: string): ModelLimitRecord {
    const env =
      process.env[
        `GROQ_TPM_${model.toUpperCase().replace(/[^A-Z0-9_]/g, "_")}`
      ];
    if (env) {
      const tpm = parseInt(env, 10);
      if (Number.isFinite(tpm) && tpm > 0) {
        return { ...this.configured(model), tpm, source: "env" };
      }
    }
    return this.overrides.get(model) ?? this.configured(model);
  }

  getTpm(model: string): number {
    return this.get(model).tpm;
  }

  getTpd(model: string): number {
    return this.get(model).tpd;
  }

  /** Apply a discovered limit: update memory now, persist to the store (best-effort). */
  async setDiscovered(record: ModelLimitRecord): Promise<void> {
    this.overrides.set(record.model, record);
    if (process.env.DATABASE_URL) {
      try {
        const { PostgresBudgetStore } = await import("./postgres-store");
        await new PostgresBudgetStore().upsertLimit(record);
      } catch (err) {
        console.warn(
          `[ModelLimitRegistry] Failed persisting discovered limit for ${record.model}:`,
          err,
        );
      }
    }
  }

  /**
   * Hydrate discovered limits persisted by a previous process (durable across restarts).
   * Called lazily before the first budget check; failures are non-fatal.
   */
  async hydrateFromStore(): Promise<void> {
    if (this.hydrating || !process.env.DATABASE_URL) return;
    this.hydrating = (async () => {
      try {
        const { PostgresBudgetStore } = await import("./postgres-store");
        const store = new PostgresBudgetStore();
        for (const model of Object.keys(CONFIGURED_DEFAULTS)) {
          const persisted = await store.getLimit(model);
          if (persisted && persisted.source === "discovered") {
            this.overrides.set(model, persisted);
          }
        }
      } catch (err) {
        console.warn(
          "[ModelLimitRegistry] Store hydration failed (continuing with defaults):",
          err,
        );
      }
    })();
    await this.hydrating;
  }
}

export const modelLimitRegistry = new ModelLimitRegistry();

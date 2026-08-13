/**
 * limit-discovery.ts — live rate-limit calibration from Groq's response headers.
 *
 * Hardcoded ceilings rot (Groq's free tier changed materially during 2026). Instead of trusting
 * constants, this module probes each model once per process (max_tokens=1) using the SDK's
 * rawResponse mode, parses the `x-ratelimit-*` / `x-requests-ratelimit-*` headers, and feeds the
 * result into the ModelLimitRegistry (memory) + PostgresBudgetStore (durable). A 24h-refresh
 * guard keeps discovery from firing more than once a day per model, and the probe is optional —
 * it never blocks or fails an AI call.
 */

import {
  MODEL_IDS,
  modelLimitRegistry,
  VISION_MODEL,
} from "./model-limit-registry";
import { ModelLimitRecord } from "./types";

export interface DiscoveredLimits {
  model: string;
  /** tokens/min from x-ratelimit-limit-tokens */
  tpm: number | null;
  /** requests/min from x-ratelimit-limit-requests */
  rpm: number | null;
  /** tokens/day from x-ratelimit-limit-tokens-day (may be absent on some tiers) */
  tpd: number | null;
  headers: Record<string, string>;
}

/** Header names Groq sends per model (both x-ratelimit-* and x-requests-ratelimit-* spellings). */
const HEADER_CANDIDATES: Record<"tpm" | "rpm" | "tpd", string[]> = {
  tpm: ["x-ratelimit-limit-tokens", "x-requests-ratelimit-limit-tokens"],
  rpm: ["x-ratelimit-limit-requests", "x-requests-ratelimit-limit-requests"],
  tpd: [
    "x-ratelimit-limit-tokens-day",
    "x-requests-ratelimit-limit-tokens-day",
    "x-ratelimit-limit-tokens-per-day",
  ],
};

function pickInt(headers: Headers, keys: string[]): number | null {
  for (const key of keys) {
    const value = headers.get(key);
    if (value) {
      const parsed = parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return null;
}

/** Extract limit numbers from a raw response's headers. */
export function parseLimitHeaders(headers: Headers): DiscoveredLimits {
  const flatten: Record<string, string> = {};
  headers.forEach((value, key) => {
    flatten[key.toLowerCase()] = value;
  });
  const asHeaders = new Headers(flatten);
  return {
    model: "",
    tpm: pickInt(asHeaders, HEADER_CANDIDATES.tpm),
    rpm: pickInt(asHeaders, HEADER_CANDIDATES.rpm),
    tpd: pickInt(asHeaders, HEADER_CANDIDATES.tpd),
    headers: flatten,
  };
}

const probesInFlight = new Map<string, Promise<void>>();
const lastProbeAt = new Map<string, number>();
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Probe a single model's ceiling. Idempotent per process; cached 24h. Never throws —
 * failures are logged and the configured default stands.
 */
async function probeModel(apiKey: string, model: string): Promise<void> {
  const now = Date.now();
  const last = lastProbeAt.get(model) || 0;
  if (now - last < REFRESH_AFTER_MS) return;

  if (probesInFlight.has(model)) {
    await probesInFlight.get(model);
    return;
  }

  const probeTask = (async () => {
    try {
      // Plain fetch (no SDK): the entire point is reading the x-ratelimit-* response headers,
      // which Groq also includes on 429 responses — so even a rejected probe is informative.
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
          }),
        },
      );

      const limits = parseLimitHeaders(response.headers);
      limits.model = model;

      const record: ModelLimitRecord = {
        model,
        tpm: limits.tpm ?? modelLimitRegistry.getTpm(model),
        tpd: limits.tpd ?? modelLimitRegistry.getTpd(model),
        source: "discovered",
        lastDiscoveredAt: new Date(),
      };
      console.log(
        `[LimitDiscovery] ${model}: discovered TPM=${record.tpm} TPD=${record.tpd} (rpm=${limits.rpm ?? "n/a"}, http ${response.status})`,
      );
      await modelLimitRegistry.setDiscovered(record);
      lastProbeAt.set(model, now);
    } catch (err) {
      console.warn(
        `[LimitDiscovery] Probe failed for ${model} (keeping configured default):`,
        err instanceof Error ? err.message : err,
      );
      lastProbeAt.set(model, now); // don't hammer on failures
    }
  })();

  probesInFlight.set(model, probeTask);
  try {
    await probeTask;
  } finally {
    probesInFlight.delete(model);
  }
}

/**
 * Discover ceilings for the models the pipeline actually uses.
 * Fires once per process per model (guarded); awaits lazily-coalesced probes.
 */
export async function ensureLimitsDiscovered(apiKey?: string): Promise<void> {
  if (!apiKey) return;
  await modelLimitRegistry.hydrateFromStore().catch(() => {});
  await Promise.allSettled([
    probeModel(apiKey, MODEL_IDS.PRIMARY_70B),
    probeModel(apiKey, MODEL_IDS.BULK_8B),
    probeModel(apiKey, VISION_MODEL),
  ]);
}

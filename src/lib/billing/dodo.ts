import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Dodo Payments client over the public REST API.
 *
 * Dodo is a Merchant of Record, so it handles tax, invoicing, and remittance —
 * which is why an unregistered founder can sell on it at all.
 *
 * Deliberately dependency-free: everything needed here (Bearer auth, checkout
 * session creation, subscription updates, Standard Webhooks verification) is one
 * fetch plus node:crypto, so we avoid pulling an SDK into the server bundle.
 */

const API_BASES = {
  test_mode: "https://test.dodopayments.com",
  live_mode: "https://live.dodopayments.com",
} as const;

export type DodoEnvironment = keyof typeof API_BASES;

export class DodoPaymentsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DodoPaymentsError";
  }
}

export interface DodoCheckoutSession {
  session_id: string;
  /** Null only when a saved payment method is charged immediately — never our case. */
  checkout_url: string | null;
}

export interface DodoSubscription {
  subscription_id: string;
  status: string;
  product_id?: string;
  metadata?: Record<string, unknown>;
  customer?: { customer_id?: string; email?: string; name?: string };
  next_billing_date?: string | null;
  previous_billing_date?: string | null;
  cancel_at_next_billing_date?: boolean;
}

export function getDodoConfig() {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim();
  const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim();
  const rawEnv = process.env.DODO_PAYMENTS_ENVIRONMENT?.trim().toLowerCase();
  const environment: DodoEnvironment = rawEnv === "live_mode" ? "live_mode" : "test_mode";

  return {
    apiKey: apiKey || null,
    webhookKey: webhookKey || null,
    environment,
    apiBase: API_BASES[environment],
    /** Fixed currency so the subscription doesn't silently lock to whatever IP says. */
    currency: process.env.DODO_BILLING_CURRENCY?.trim().toUpperCase() || "INR",
    configured: Boolean(apiKey),
  };
}

export function isBillingConfigured(): boolean {
  return getDodoConfig().configured;
}

async function dodoFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { apiKey, apiBase } = getDodoConfig();
  if (!apiKey) {
    throw new DodoPaymentsError(
      "Dodo Payments is not configured. Set DODO_PAYMENTS_API_KEY.",
      503,
      "billing_not_configured",
    );
  }

  const response = await fetch(`${apiBase}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }

  if (!response.ok) {
    throw new DodoPaymentsError(
      typeof data.message === "string"
        ? data.message
        : `Dodo Payments request failed (${response.status}).`,
      response.status,
      typeof data.code === "string" ? data.code : undefined,
    );
  }

  return data as T;
}

/**
 * Creates a hosted checkout session for a subscription product.
 *
 * Dodo creates the subscription itself once checkout completes, so there is no
 * subscription_id here — it arrives on the `subscription.active` webhook. The
 * `metadata` we attach is what lets that webhook find the owning organization.
 */
export async function createCheckoutSession(params: {
  productId: string;
  customerEmail: string;
  customerName: string;
  returnUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  trialPeriodDays?: number;
}): Promise<DodoCheckoutSession> {
  const { currency } = getDodoConfig();

  return dodoFetch<DodoCheckoutSession>("/checkouts", {
    method: "POST",
    body: {
      product_cart: [{ product_id: params.productId, quantity: 1 }],
      customer: {
        email: params.customerEmail,
        name: params.customerName,
      },
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
      // Lock the currency explicitly — otherwise it is inferred from the
      // customer's IP and then frozen for the subscription's lifetime.
      billing_currency: currency,
      // UPI first for an India-based desk, but never hide the cards: Dodo's own
      // guidance is to keep credit/debit as fallbacks so checkout never dead-ends.
      allowed_payment_method_types: ["upi_intent", "credit", "debit"],
      customization: { theme: "light" },
      feature_flags: {
        allow_currency_selection: true,
      },
      ...(params.trialPeriodDays && params.trialPeriodDays > 0
        ? { subscription_data: { trial_period_days: params.trialPeriodDays } }
        : {}),
    },
  });
}

/**
 * Cancels at the end of the current billing period rather than immediately,
 * matching the "cancel at period end" promise shown in the billing UI.
 */
export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string) {
  return dodoFetch<DodoSubscription>(`/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: {
      status: "cancelled",
      cancel_at_next_billing_date: true,
      cancel_reason: "cancelled_by_customer",
    },
  });
}

/** Undoes a scheduled cancellation by returning the subscription to active. */
export async function resumeSubscription(subscriptionId: string) {
  return dodoFetch<DodoSubscription>(`/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    body: { status: "active", cancel_at_next_billing_date: false },
  });
}

// ─── Webhooks (Standard Webhooks spec) ───────────────────────────────────────

/** Reject replays. Standard Webhooks libraries use a 5-minute tolerance. */
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  signature: string | null;
  timestamp: string | null;
}

export interface WebhookVerificationResult {
  valid: boolean;
  reason?: "missing_secret" | "missing_headers" | "stale_timestamp" | "bad_signature";
}

/**
 * Verifies a Standard Webhooks signature.
 *
 * 1. Signed content is `{id}.{timestamp}.{rawBody}`.
 * 2. The secret is a `whsec_`-prefixed base64 string; strip the prefix and
 *    base64-decode the remainder to get the raw signing key.
 * 3. HMAC-SHA256 that content, base64-encode it, and compare against the
 *    `v1,` entries in the `webhook-signature` header. The header may carry
 *    several space-separated signatures during secret rotation — any match wins.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: WebhookHeaders,
): WebhookVerificationResult {
  const { webhookKey } = getDodoConfig();
  if (!webhookKey) return { valid: false, reason: "missing_secret" };
  // Absent headers are a delivery problem; a present-but-unusable signature is
  // an authenticity problem. Both reject, but they read differently in logs.
  if (!headers.id || headers.signature === null || headers.timestamp === null) {
    return { valid: false, reason: "missing_headers" };
  }

  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return { valid: false, reason: "stale_timestamp" };
  if (Math.abs(Date.now() / 1000 - timestamp) > WEBHOOK_TOLERANCE_SECONDS) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const encodedKey = webhookKey.startsWith("whsec_") ? webhookKey.slice(6) : webhookKey;
  const key = Buffer.from(encodedKey, "base64");

  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${rawBody}`)
    .digest("base64");

  const candidates = headers.signature
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1,"))
    .map((part) => part.slice(3));

  if (candidates.length === 0) return { valid: false, reason: "bad_signature" };

  const expectedBuf = Buffer.from(expected, "utf8");
  // Compare every candidate rather than short-circuiting, so timing does not
  // reveal how many signatures were checked.
  let matched = false;
  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate, "utf8");
    if (candidateBuf.length !== expectedBuf.length) continue;
    if (timingSafeEqual(candidateBuf, expectedBuf)) matched = true;
  }

  return matched ? { valid: true } : { valid: false, reason: "bad_signature" };
}

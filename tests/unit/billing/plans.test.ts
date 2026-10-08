import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac, randomBytes } from "node:crypto";
import {
  PLANS,
  PLAN_ORDER,
  getPlan,
  isPaidPlan,
  priceForCycle,
  formatInr,
  formatLimit,
  dodoProductIdFor,
  dodoProductEnvNameFor,
  type PlanId,
} from "@/lib/billing/plans";
import { verifyWebhookSignature, getDodoConfig } from "@/lib/billing/dodo";
import { nextMonthStart, isExemptOrg, EXEMPT_ORG_ID } from "@/lib/billing/entitlements";

describe("plan catalog", () => {
  it("falls back to the free plan for unknown ids", () => {
    expect(getPlan("nonsense").id).toBe("free");
    expect(getPlan(null).id).toBe("free");
    expect(getPlan(undefined).id).toBe("free");
  });

  it("prices the free plan at zero and marks it as not paid", () => {
    expect(PLANS.free.pricePaiseMonthly).toBe(0);
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan("pro")).toBe(true);
  });

  it("charges ten months for a yearly cycle (two months free)", () => {
    const monthly = PLANS.pro.pricePaiseMonthly;
    expect(priceForCycle("pro", "monthly")).toBe(monthly);
    expect(priceForCycle("pro", "yearly")).toBe(monthly * 10);
  });

  it("keeps yearly pricing cheaper than twelve monthly payments", () => {
    for (const id of PLAN_ORDER) {
      if (PLANS[id].pricePaiseMonthly === 0) continue;
      expect(priceForCycle(id, "yearly")).toBeLessThan(PLANS[id].pricePaiseMonthly * 12);
    }
  });

  it("never charges for the free plan on either cycle", () => {
    expect(priceForCycle("free", "monthly")).toBe(0);
    expect(priceForCycle("free", "yearly")).toBe(0);
  });

  it("only escalates quota and seats across tiers", () => {
    const [free, pro, desk] = PLAN_ORDER.map((id) => PLANS[id]);
    expect(pro.reportsPerMonth!).toBeGreaterThan(free.reportsPerMonth!);
    expect(desk.reportsPerMonth).toBeNull();
    expect(pro.seats).toBeGreaterThan(free.seats);
    expect(desk.seats).toBeGreaterThan(pro.seats);
  });

  it("formats rupee amounts and limits for display", () => {
    expect(formatInr(2499000)).toContain("24,990");
    expect(formatInr(0)).toContain("0");
    expect(formatLimit(40)).toBe("40");
    expect(formatLimit(null)).toBe("Unlimited");
  });

  it("has no Dodo product mapping for the free tier", () => {
    expect(dodoProductIdFor("free", "monthly")).toBeNull();
    expect(dodoProductEnvNameFor("free", "yearly")).toBeNull();
  });

  it("reads the product id from the env var for the requested cycle", () => {
    const previous = process.env.DODO_PRODUCT_PRO_MONTHLY;
    process.env.DODO_PRODUCT_PRO_MONTHLY = "pdt_monthly_123";
    try {
      expect(dodoProductIdFor("pro", "monthly")).toBe("pdt_monthly_123");
      // Yearly is a separate env var, so it stays unmapped here.
      expect(dodoProductIdFor("pro", "yearly")).toBeNull();
      expect(dodoProductEnvNameFor("pro", "yearly")).toBe("DODO_PRODUCT_PRO_YEARLY");
    } finally {
      if (previous === undefined) delete process.env.DODO_PRODUCT_PRO_MONTHLY;
      else process.env.DODO_PRODUCT_PRO_MONTHLY = previous;
    }
  });

  it("treats blank env values as unmapped", () => {
    const previous = process.env.DODO_PRODUCT_DESK_MONTHLY;
    process.env.DODO_PRODUCT_DESK_MONTHLY = "   ";
    try {
      expect(dodoProductIdFor("desk", "monthly")).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.DODO_PRODUCT_DESK_MONTHLY;
      else process.env.DODO_PRODUCT_DESK_MONTHLY = previous;
    }
  });
});

describe("dodo configuration", () => {
  const saved = {
    api: process.env.DODO_PAYMENTS_API_KEY,
    env: process.env.DODO_PAYMENTS_ENVIRONMENT,
    currency: process.env.DODO_BILLING_CURRENCY,
  };

  afterEach(() => {
    for (const [key, value] of [
      ["DODO_PAYMENTS_API_KEY", saved.api],
      ["DODO_PAYMENTS_ENVIRONMENT", saved.env],
      ["DODO_BILLING_CURRENCY", saved.currency],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults to test mode so a missing env var never hits live", () => {
    delete process.env.DODO_PAYMENTS_ENVIRONMENT;
    expect(getDodoConfig().environment).toBe("test_mode");
    expect(getDodoConfig().apiBase).toBe("https://test.dodopayments.com");

    process.env.DODO_PAYMENTS_ENVIRONMENT = "live_mode";
    expect(getDodoConfig().apiBase).toBe("https://live.dodopayments.com");

    // Anything unrecognised must not be treated as live.
    process.env.DODO_PAYMENTS_ENVIRONMENT = "nonsense";
    expect(getDodoConfig().environment).toBe("test_mode");
  });

  it("pins a billing currency so subscriptions cannot drift with customer IP", () => {
    delete process.env.DODO_BILLING_CURRENCY;
    expect(getDodoConfig().currency).toBe("INR");

    process.env.DODO_BILLING_CURRENCY = "usd";
    expect(getDodoConfig().currency).toBe("USD");
  });

  it("reports unconfigured when no API key is present", () => {
    delete process.env.DODO_PAYMENTS_API_KEY;
    expect(getDodoConfig().configured).toBe(false);
    process.env.DODO_PAYMENTS_API_KEY = "dodo_test_key";
    expect(getDodoConfig().configured).toBe(true);
  });
});

describe("webhook signature verification (Standard Webhooks)", () => {
  const rawKey = randomBytes(32);
  // Dodo presents the key base64-encoded behind a `whsec_` prefix.
  const SECRET = `whsec_${rawKey.toString("base64")}`;

  const sign = (id: string, timestamp: string, body: string) =>
    createHmac("sha256", rawKey).update(`${id}.${timestamp}.${body}`).digest("base64");

  const headers = (body: string, opts: { id?: string; ts?: string; sigs?: string[] } = {}) => {
    const id = opts.id ?? "msg_123";
    const timestamp = opts.ts ?? String(Math.floor(Date.now() / 1000));
    const sigs = opts.sigs ?? [sign(id, timestamp, body)];
    return {
      id,
      timestamp,
      signature: sigs.map((s) => `v1,${s}`).join(" "),
    };
  };

  beforeEach(() => {
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = SECRET;
  });

  afterEach(() => {
    delete process.env.DODO_PAYMENTS_WEBHOOK_KEY;
  });

  const body = '{"type":"subscription.active","data":{"subscription_id":"sub_1"}}';

  it("accepts a correctly signed payload", () => {
    expect(verifyWebhookSignature(body, headers(body)).valid).toBe(true);
  });

  it("accepts when the key has no whsec_ prefix", () => {
    process.env.DODO_PAYMENTS_WEBHOOK_KEY = rawKey.toString("base64");
    expect(verifyWebhookSignature(body, headers(body)).valid).toBe(true);
  });

  it("accepts if any signature in a rotating set matches", () => {
    const h = headers(body);
    const rotated = sign(h.id, h.timestamp, "different body");
    const result = verifyWebhookSignature(body, {
      ...h,
      signature: `v1,${rotated} v1,${sign(h.id, h.timestamp, body)}`,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a tampered body", () => {
    const h = headers(body);
    expect(verifyWebhookSignature('{"type":"subscription.cancelled"}', h).valid).toBe(false);
  });

  it("rejects a mismatched webhook id or timestamp", () => {
    const h = headers(body);
    expect(verifyWebhookSignature(body, { ...h, id: "msg_other" }).valid).toBe(false);
    expect(verifyWebhookSignature(body, { ...h, timestamp: String(Number(h.timestamp) + 1) }).valid).toBe(
      false,
    );
  });

  it("rejects replays older than the 5 minute tolerance", () => {
    const stale = String(Math.floor(Date.now() / 1000) - 6 * 60);
    const result = verifyWebhookSignature(body, headers(body, { ts: stale }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("stale_timestamp");
  });

  it("rejects missing headers and unusable signatures without throwing", () => {
    expect(verifyWebhookSignature(body, { id: null, signature: null, timestamp: null })).toEqual({
      valid: false,
      reason: "missing_headers",
    });
    expect(verifyWebhookSignature(body, { ...headers(body), signature: "" }).reason).toBe(
      "bad_signature",
    );
    expect(verifyWebhookSignature(body, { ...headers(body), signature: "v1," }).reason).toBe(
      "bad_signature",
    );
    // No `v1,` entries at all (e.g. a future scheme) must not verify.
    expect(verifyWebhookSignature(body, { ...headers(body), signature: "v2,abc" }).reason).toBe(
      "bad_signature",
    );
  });

  it("rejects everything when no webhook key is configured", () => {
    delete process.env.DODO_PAYMENTS_WEBHOOK_KEY;
    const result = verifyWebhookSignature(body, headers(body));
    expect(result).toEqual({ valid: false, reason: "missing_secret" });
  });
});

describe("quota window helpers", () => {
  it("resets at the first instant of the next UTC month", () => {
    expect(nextMonthStart(new Date("2026-10-08T12:00:00Z")).toISOString()).toBe(
      "2026-11-01T00:00:00.000Z",
    );
    expect(nextMonthStart(new Date("2026-12-31T23:59:59Z")).toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });

  it("exempts the internal default-org tenant from quotas", () => {
    expect(isExemptOrg(EXEMPT_ORG_ID)).toBe(true);
    expect(isExemptOrg("some-real-org")).toBe(false);
  });
});

describe("tier gating arithmetic", () => {
  /** Mirrors the decision the entitlement layer makes from a usage snapshot. */
  const allows = (planId: PlanId, used: number) => {
    const limit = PLANS[planId].reportsPerMonth;
    return limit === null || used < limit;
  };

  it("blocks the free plan once its allowance is consumed", () => {
    expect(allows("free", 0)).toBe(true);
    expect(allows("free", 2)).toBe(true);
    expect(allows("free", 3)).toBe(false);
    expect(allows("free", 4)).toBe(false);
  });

  it("blocks the pro plan at its allowance and never blocks desk", () => {
    expect(allows("pro", 39)).toBe(true);
    expect(allows("pro", 40)).toBe(false);
    expect(allows("desk", 10_000)).toBe(true);
  });
});

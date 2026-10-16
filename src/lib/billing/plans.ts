/**
 * Plan catalog — the single source of truth for pricing, quotas, and entitlements.
 *
 * This module is imported by both client components (pricing cards) and server
 * routes (quota enforcement, checkout), so it must stay free of server-only imports.
 *
 * Dodo Payments product IDs are NOT hardcoded here — they are read from env at
 * call time so the same catalog works across test and live Dodo environments.
 * Dodo is a Merchant of Record, so the product price configured in the Dodo
 * dashboard is what the customer is actually charged; the prices below are for
 * display only and must be kept in sync with those products.
 */

export type PlanId = "free" | "starter" | "pro" | "desk";
export type BillingCycle = "monthly" | "yearly";

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly list price in paise (INR minor units). Yearly is charged as 10x monthly. */
  pricePaiseMonthly: number;
  /** Reports an org may generate per calendar month. null = unlimited. */
  reportsPerMonth: number | null;
  seats: number;
  features: string[];
  highlighted: boolean;
  /** Env vars holding the Dodo product_id for this tier, per billing cycle. */
  dodoProductEnvMonthly: string | null;
  dodoProductEnvYearly: string | null;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free Trial",
    tagline: "For individual analysts validating the workflow.",
    pricePaiseMonthly: 0,
    reportsPerMonth: 3,
    seats: 1,
    features: [
      "3 research notes per month",
      "Branded PDF & Excel export",
      "In-report Copilot chat assistance",
      "Financial extraction & math audit",
      "Single analyst seat",
    ],
    highlighted: false,
    dodoProductEnvMonthly: null,
    dodoProductEnvYearly: null,
  },
  starter: {
    id: "starter",
    name: "Starter / Solo",
    tagline: "For individual analysts & advisors publishing coverage.",
    pricePaiseMonthly: 149900,
    reportsPerMonth: 10,
    seats: 1,
    features: [
      "10 research reports per month",
      "1 analyst seat",
      "Autonomous multi-agent research runs",
      "Interactive in-report Copilot chat",
      "Linked 3-statement DCF & live Excel export",
      "Publication-ready A4 PDF notes",
    ],
    highlighted: false,
    dodoProductEnvMonthly: "DODO_PRODUCT_STARTER_MONTHLY",
    dodoProductEnvYearly: "DODO_PRODUCT_STARTER_YEARLY",
  },
  pro: {
    id: "pro",
    name: "Pro / Boutique Desk",
    tagline: "For boutique research desks & covering teams.",
    pricePaiseMonthly: 599900,
    reportsPerMonth: 40,
    seats: 3,
    features: [
      "40 research reports per month",
      "3 analyst seats",
      "Autonomous research + Annual Report/DRHP upload",
      "Unlimited in-report Copilot chat",
      "SEBI (RA) sign-off & audit trail",
      "Historical valuation multiples bands (±1σ, ±2σ)",
    ],
    highlighted: true,
    dodoProductEnvMonthly: "DODO_PRODUCT_PRO_MONTHLY",
    dodoProductEnvYearly: "DODO_PRODUCT_PRO_YEARLY",
  },
  desk: {
    id: "desk",
    name: "Institutional Desk",
    tagline: "For asset managers, PMS desks, and multi-analyst firms.",
    pricePaiseMonthly: 2499000,
    reportsPerMonth: null,
    seats: 10,
    features: [
      "150+ research reports per month",
      "10 analyst seats",
      "Everything in Pro / Boutique Desk",
      "Priority agent capacity & dedicated GPU routing",
      "Custom institutional branding on exports",
      "Dedicated compliance & audit support",
    ],
    highlighted: false,
    dodoProductEnvMonthly: "DODO_PRODUCT_DESK_MONTHLY",
    dodoProductEnvYearly: "DODO_PRODUCT_DESK_YEARLY",
  },
};

export const PLAN_ORDER: PlanId[] = ["starter", "pro", "desk"];

/** Yearly billing is charged at 10x the monthly price (two months free). */
const YEARLY_MONTHS_FREE = 2;

export function getPlan(planId: string | null | undefined): Plan {
  if (planId && planId in PLANS) return PLANS[planId as PlanId];
  return PLANS.free;
}

export function isPaidPlan(planId: string | null | undefined): boolean {
  return getPlan(planId).pricePaiseMonthly > 0;
}

/** Total charge in paise for a plan/cycle pair. */
export function priceForCycle(planId: PlanId, cycle: BillingCycle): number {
  const plan = PLANS[planId];
  if (plan.pricePaiseMonthly === 0) return 0;
  return cycle === "yearly"
    ? plan.pricePaiseMonthly * (12 - YEARLY_MONTHS_FREE)
    : plan.pricePaiseMonthly;
}

/** Display price in rupees, e.g. 2499000 -> "24,990". */
export function formatInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/** Human label for a usage counter, e.g. 40 -> "40", 150 -> "150+", null -> "Unlimited". */
export function formatLimit(limit: number | null): string {
  if (limit === null) return "Unlimited";
  if (limit >= 150) return "150+";
  return new Intl.NumberFormat("en-IN").format(limit);
}

/**
 * Resolves the Dodo product_id for a tier/cycle from env. Returns null when the
 * deployment has not mapped that product yet — callers surface it as a config
 * error rather than silently charging the wrong amount.
 */
export function dodoProductIdFor(planId: PlanId, cycle: BillingCycle): string | null {
  const envKey =
    cycle === "yearly"
      ? PLANS[planId].dodoProductEnvYearly
      : PLANS[planId].dodoProductEnvMonthly;
  if (!envKey) return null;
  const value = process.env[envKey];
  return value && value.trim() ? value.trim() : null;
}

/** Name of the env var that must be set for a tier/cycle to be purchasable. */
export function dodoProductEnvNameFor(planId: PlanId, cycle: BillingCycle): string | null {
  return cycle === "yearly"
    ? PLANS[planId].dodoProductEnvYearly
    : PLANS[planId].dodoProductEnvMonthly;
}

import { prisma } from "@/lib/db";
import { getPlan, type Plan, type PlanId } from "./plans";

/**
 * Resolves an organization's plan and enforces plan-tier entitlements.
 *
 * Billing is per-organization, not per-user: one subscription row per org and
 * every seat in that org shares the quota.
 *
 * The internal `default-org` tenant (demo guest + agent bypass) is exempt from
 * quota enforcement so the public demo workspace can never dead-end.
 */

/**
 * Statuses that grant paid entitlements.
 *
 * `past_due` is included deliberately: Dodo opens a grace period on a failed
 * renewal and the customer keeps access until it lapses, so charging them while
 * they are in that window would contradict the provider's own behaviour.
 */
const ENTITLED_STATUSES = new Set(["active", "pending", "past_due"]);

export const EXEMPT_ORG_ID = "default-org";

export interface OrgSubscription {
  planId: PlanId;
  status: string;
  seats: number;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  providerSubscriptionId: string | null;
  providerPaymentId: string | null;
}

export interface UsageSnapshot {
  plan: Plan;
  subscription: OrgSubscription;
  reportsUsed: number;
  reportsLimit: number | null;
  reportsRemaining: number | null;
  seatsUsed: number;
  /** When the current quota window rolls over. */
  resetsAt: Date;
  exempt: boolean;
}

function freeSubscription(): OrgSubscription {
  return {
    planId: "free",
    status: "none",
    seats: getPlan("free").seats,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    providerSubscriptionId: null,
    providerPaymentId: null,
  };
}

/** First instant of the next calendar month (UTC). */
export function nextMonthStart(from = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
}

export function isExemptOrg(orgId: string): boolean {
  return orgId === EXEMPT_ORG_ID;
}

export async function getOrgSubscription(orgId: string): Promise<OrgSubscription> {
  if (isExemptOrg(orgId)) {
    return {
      ...freeSubscription(),
      planId: "desk",
      status: "active",
      seats: getPlan("desk").seats,
    };
  }

  const row = await prisma.subscription.findUnique({ where: { orgId } });
  if (!row) return freeSubscription();

  // A cancelled/expired/failed row falls back to free entitlements.
  const entitled = ENTITLED_STATUSES.has(row.status);
  const planId: PlanId = entitled ? (row.planId as PlanId) : "free";

  return {
    planId: getPlan(planId).id,
    status: row.status,
    seats: row.seats,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    providerSubscriptionId: row.providerSubscriptionId,
    providerPaymentId: row.providerPaymentId,
  };
}

export async function getUsageSnapshot(orgId: string): Promise<UsageSnapshot> {
  const subscription = await getOrgSubscription(orgId);
  const plan = getPlan(subscription.planId);
  const exempt = isExemptOrg(orgId);

  const windowStart = new Date();
  windowStart.setUTCDate(1);
  windowStart.setUTCHours(0, 0, 0, 0);

  const [reportsUsed, seatsUsed] = await Promise.all([
    prisma.reportHistory.count({
      where: { orgId, createdAt: { gte: windowStart } },
    }),
    prisma.user.count({ where: { orgId } }),
  ]);

  const reportsLimit = plan.reportsPerMonth;

  return {
    plan,
    subscription,
    reportsUsed,
    reportsLimit,
    reportsRemaining: reportsLimit === null ? null : Math.max(0, reportsLimit - reportsUsed),
    seatsUsed,
    resetsAt: nextMonthStart(),
    exempt,
  };
}

export interface QuotaDecision {
  allowed: boolean;
  reason?: string;
  plan: Plan;
  reportsUsed: number;
  reportsLimit: number | null;
  resetsAt: Date;
}

/**
 * Gate for starting a new research run. Returns a decision rather than throwing
 * so callers can map it onto their own HTTP semantics (402 for plan limits).
 */
export async function checkReportQuota(orgId: string): Promise<QuotaDecision> {
  const snapshot = await getUsageSnapshot(orgId);

  if (snapshot.exempt) {
    return {
      allowed: true,
      plan: snapshot.plan,
      reportsUsed: snapshot.reportsUsed,
      reportsLimit: null,
      resetsAt: snapshot.resetsAt,
    };
  }

  const { reportsLimit } = snapshot;
  const allowed = reportsLimit === null || snapshot.reportsUsed < reportsLimit;

  return {
    allowed,
    reason: allowed
      ? undefined
      : `Your ${snapshot.plan.name} plan includes ${reportsLimit} research note${reportsLimit === 1 ? "" : "s"} per month. Upgrade to continue, or wait for the quota to reset.`,
    plan: snapshot.plan,
    reportsUsed: snapshot.reportsUsed,
    reportsLimit,
    resetsAt: snapshot.resetsAt,
  };
}

/** Gate for inviting additional analysts to the org. */
export async function checkSeatQuota(orgId: string): Promise<QuotaDecision> {
  const snapshot = await getUsageSnapshot(orgId);

  if (snapshot.exempt) {
    return {
      allowed: true,
      plan: snapshot.plan,
      reportsUsed: snapshot.seatsUsed,
      reportsLimit: null,
      resetsAt: snapshot.resetsAt,
    };
  }

  const allowed = snapshot.seatsUsed < snapshot.plan.seats;

  return {
    allowed,
    reason: allowed
      ? undefined
      : `The ${snapshot.plan.name} plan includes ${snapshot.plan.seats} seat${snapshot.plan.seats === 1 ? "" : "s"}. Upgrade to add more analysts.`,
    plan: snapshot.plan,
    reportsUsed: snapshot.seatsUsed,
    reportsLimit: snapshot.plan.seats,
    resetsAt: snapshot.resetsAt,
  };
}

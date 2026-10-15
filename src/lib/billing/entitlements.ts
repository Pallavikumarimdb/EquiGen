import { prisma } from "@/lib/db";
import { getPlan, type Plan, type PlanId } from "./plans";

/**
 * Resolves an organization's plan and enforces plan-tier entitlements.
 *
 * Billing is per-organization, not per-user: one subscription row per org and
 * every seat in that org shares the quota.
 *
 * The internal `default-org` tenant (demo guest + agent bypass) and designated
 * administrator accounts are exempt from quota enforcement so they can test
 * and audit the application with unlimited runs.
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

/** Admin accounts with unrestricted, unlimited access */
export const ADMIN_EMAILS = new Set<string>([
  "pallavi@gmail.com",
  "pallavilpmt1995@gmail.com",
  ...(process.env.ADMIN_EMAIL ? [process.env.ADMIN_EMAIL.toLowerCase().trim()] : []),
]);

export interface UserContext {
  role?: string | null;
  email?: string | null;
  userId?: string | null;
}

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

export function isAdminUser(user?: UserContext | null): boolean {
  if (!user) return false;
  if (user.role && user.role.toLowerCase() === "admin") return true;
  if (user.email && ADMIN_EMAILS.has(user.email.toLowerCase().trim())) return true;
  return false;
}

/**
 * Checks if an organization or user context is exempt from quota restrictions.
 * Grants unrestricted "desk" plan access to admins and exempt orgs.
 */
export async function isExempt(orgId?: string | null, user?: UserContext | null): Promise<boolean> {
  if (orgId && isExemptOrg(orgId)) return true;
  if (isAdminUser(user)) return true;

  if (user?.userId) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: user.userId },
        select: { role: true, email: true },
      });
      if (dbUser && isAdminUser(dbUser)) return true;
    } catch {
      // Ignore DB errors in exemption check
    }
  }

  if (orgId) {
    try {
      const adminInOrg = await prisma.user.findFirst({
        where: {
          orgId,
          OR: [
            { role: "admin" },
            { email: { in: Array.from(ADMIN_EMAILS) } },
          ],
        },
        select: { id: true },
      });
      if (adminInOrg) return true;
    } catch {
      // Ignore DB errors
    }
  }

  return false;
}

export async function getOrgSubscription(orgId: string, user?: UserContext | null): Promise<OrgSubscription> {
  if (await isExempt(orgId, user)) {
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

/**
 * Records an immutable report usage entry in BillingEvent.
 * This ensures deleting a generated report from the UI history NEVER refunds
 * or rolls back consumed monthly research quota.
 */
export async function recordReportUsage(params: {
  orgId: string;
  referenceId: string;
  userId?: string | null;
  companyName?: string | null;
  ticker?: string | null;
}): Promise<void> {
  const { orgId, referenceId, userId, companyName, ticker } = params;
  if (!orgId || isExemptOrg(orgId)) return;

  const eventId = `usage_${referenceId}`;
  try {
    await prisma.billingEvent.upsert({
      where: { eventId },
      create: {
        eventId,
        eventType: "report_usage",
        orgId,
        payload: {
          referenceId,
          userId: userId ?? null,
          companyName: companyName ?? null,
          ticker: ticker ?? null,
          timestamp: new Date().toISOString(),
        },
      },
      update: {},
    });
  } catch (err) {
    console.warn("[Billing] Failed to record immutable usage event:", err);
  }
}

export async function getUsageSnapshot(orgId: string, user?: UserContext | null): Promise<UsageSnapshot> {
  const exempt = await isExempt(orgId, user);
  const subscription = await getOrgSubscription(orgId, user);
  const plan = getPlan(subscription.planId);

  const windowStart = new Date();
  windowStart.setUTCDate(1);
  windowStart.setUTCHours(0, 0, 0, 0);

  // LOOPHOLE FIX:
  // Count immutable "report_usage" billing events PLUS existing report history records.
  // Using Math.max guarantees that:
  // 1. Any report run creates a permanent record in BillingEvent that is NOT deleted when a report is deleted.
  // 2. Legacy reports created before this fix still count against quota.
  // 3. Deleting an existing report does NOT refund quota.
  const [billingEventsCount, existingReportsCount, seatsUsed] = await Promise.all([
    prisma.billingEvent.count({
      where: {
        orgId,
        eventType: "report_usage",
        createdAt: { gte: windowStart },
      },
    }).catch(() => 0),
    prisma.reportHistory.count({
      where: { orgId, createdAt: { gte: windowStart } },
    }).catch(() => 0),
    prisma.user.count({ where: { orgId } }).catch(() => 1),
  ]);

  const reportsUsed = Math.max(billingEventsCount, existingReportsCount);
  const reportsLimit = exempt ? null : plan.reportsPerMonth;

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
export async function checkReportQuota(orgId: string, user?: UserContext | null): Promise<QuotaDecision> {
  const snapshot = await getUsageSnapshot(orgId, user);

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
      : `Your ${snapshot.plan.name} plan includes ${reportsLimit} research note${reportsLimit === 1 ? "" : "s"} per month. You have consumed all ${reportsLimit} reports for this month. Deleting saved reports does not refund consumed quota. Upgrade to Pro for higher limits, or wait for the monthly quota to reset.`,
    plan: snapshot.plan,
    reportsUsed: snapshot.reportsUsed,
    reportsLimit,
    resetsAt: snapshot.resetsAt,
  };
}

/** Gate for inviting additional analysts to the org. */
export async function checkSeatQuota(orgId: string, user?: UserContext | null): Promise<QuotaDecision> {
  const snapshot = await getUsageSnapshot(orgId, user);

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

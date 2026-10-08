import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getPlan, isPaidPlan, type PlanId } from "@/lib/billing/plans";
import { verifyWebhookSignature } from "@/lib/billing/dodo";

export const runtime = "nodejs";

/**
 * POST /api/billing/webhook
 *
 * Public endpoint (Dodo cannot present a session cookie). Payloads are verified
 * against the Standard Webhooks signature and de-duplicated on `webhook-id`, so
 * Dodo's retry schedule is safe.
 *
 * Subscription lifecycle events drive entitlements. Payment events are logged
 * for reconciliation but never grant access on their own — Dodo fires
 * `payment.succeeded` alongside every renewal, and `subscription.renewed` is the
 * documented signal for extending a cycle.
 */

interface DodoSubscriptionData {
  subscription_id?: string;
  status?: string;
  product_id?: string;
  metadata?: Record<string, unknown>;
  customer?: { customer_id?: string };
  next_billing_date?: string | null;
  cancel_at_next_billing_date?: boolean;
}

interface DodoWebhookEvent {
  business_id?: string;
  type?: string;
  timestamp?: string;
  data?: DodoSubscriptionData & {
    payload_type?: string;
    payment_id?: string;
    subscription_id?: string;
  };
}

/** Subscription events that carry state we care about. */
const SUBSCRIPTION_EVENTS = new Set([
  "subscription.active",
  "subscription.updated",
  "subscription.renewed",
  "subscription.past_due",
  "subscription.on_hold",
  "subscription.paused",
  "subscription.unpaused",
  "subscription.plan_changed",
  "subscription.cancelled",
  "subscription.expired",
  "subscription.failed",
]);

/** Dodo subscription status -> ours. Same vocabulary, minus `none`. */
const STATUS_MAP: Record<string, string> = {
  active: "active",
  pending: "pending",
  past_due: "past_due",
  on_hold: "on_hold",
  paused: "paused",
  cancelled: "cancelled",
  expired: "expired",
  failed: "failed",
};

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function readString(metadata: Record<string, unknown> | undefined, key: string): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Find the owning org: our metadata first, then a reverse lookup on the
 * provider subscription id we stored at checkout time.
 */
async function resolveOrgId(data: DodoWebhookEvent["data"]): Promise<string | null> {
  const fromMetadata = readString(data?.metadata, "orgId");
  if (fromMetadata) return fromMetadata;

  const subscriptionId = data?.subscription_id;
  if (subscriptionId) {
    const row = await prisma.subscription.findFirst({
      where: { providerSubscriptionId: subscriptionId },
      select: { orgId: true },
    });
    if (row) return row.orgId;
  }

  return null;
}

export async function POST(req: NextRequest) {
  // Standard Webhooks signs the exact bytes received, so read raw and parse after.
  const rawBody = await req.text();

  const verification = verifyWebhookSignature(rawBody, {
    id: req.headers.get("webhook-id"),
    signature: req.headers.get("webhook-signature"),
    timestamp: req.headers.get("webhook-timestamp"),
  });

  if (!verification.valid) {
    if (verification.reason === "missing_secret") {
      return NextResponse.json(
        { message: "DODO_PAYMENTS_WEBHOOK_KEY is not set." },
        { status: 503 },
      );
    }
    // Deliberately vague to the caller; the reason is logged for operators.
    console.warn(`[Billing] Rejected webhook: ${verification.reason}`);
    return NextResponse.json({ message: "Invalid signature." }, { status: 401 });
  }

  let event: DodoWebhookEvent;
  try {
    event = JSON.parse(rawBody) as DodoWebhookEvent;
  } catch {
    return NextResponse.json({ message: "Malformed payload." }, { status: 400 });
  }

  const type = event.type ?? "unknown";
  const webhookId = req.headers.get("webhook-id")!;

  // Idempotency: claim the event before doing any work.
  try {
    await prisma.billingEvent.create({
      data: { eventId: webhookId, eventType: type, payload: event as object },
    });
  } catch {
    return NextResponse.json({ status: "ok", duplicate: true });
  }

  // Log-only events: nothing to reconcile, and we still record them above.
  if (!SUBSCRIPTION_EVENTS.has(type)) {
    await prisma.billingEvent.updateMany({
      where: { eventId: webhookId },
      data: { orgId: null },
    });
    return NextResponse.json({ status: "ok", event: type, ignored: true });
  }

  const data = event.data ?? {};
  const orgId = await resolveOrgId(data);
  if (!orgId) {
    // Acknowledge so Dodo stops retrying; the event stays logged for debugging.
    console.warn(`[Billing] Could not resolve an org for ${type} (${data.subscription_id})`);
    return NextResponse.json({ status: "ok", warning: "no org resolved" });
  }

  const existing = await prisma.subscription.findUnique({
    where: { orgId },
    select: { planId: true },
  });

  const metadataPlanId = readString(data.metadata, "planId");
  const planId: PlanId =
    metadataPlanId && metadataPlanId in { free: 1, pro: 1, desk: 1 }
      ? (metadataPlanId as PlanId)
      : ((existing?.planId as PlanId) ?? "pro");
  const plan = getPlan(planId);

  const status = STATUS_MAP[data.status ?? ""] ?? "pending";

  // `subscription.failed` is terminal — never grant on it. Everything else that
  // isn't explicitly a live state falls back to the free tier.
  const grantPaid = isPaidPlan(planId) && status !== "failed";

  await prisma.subscription.upsert({
    where: { orgId },
    create: {
      orgId,
      provider: "dodo",
      planId: grantPaid ? planId : "free",
      status,
      providerSubscriptionId: data.subscription_id ?? null,
      providerCustomerId: data.customer?.customer_id ?? null,
      providerProductId: data.product_id ?? null,
      providerPaymentId: data.payment_id ?? null,
      currentPeriodEnd: grantPaid ? toDate(data.next_billing_date) : null,
      cancelAtPeriodEnd: data.cancel_at_next_billing_date === true,
      seats: plan.seats,
    },
    update: {
      provider: "dodo",
      planId: grantPaid ? planId : "free",
      status,
      providerSubscriptionId: data.subscription_id ?? undefined,
      providerCustomerId: data.customer?.customer_id ?? undefined,
      providerProductId: data.product_id ?? undefined,
      providerPaymentId: data.payment_id ?? undefined,
      currentPeriodEnd: grantPaid ? toDate(data.next_billing_date) : null,
      cancelAtPeriodEnd: data.cancel_at_next_billing_date === true,
      seats: plan.seats,
    },
  });

  await prisma.billingEvent.update({ where: { eventId: webhookId }, data: { orgId } });

  console.log(`[Billing] ${type} -> org ${orgId} plan ${grantPaid ? planId : "free"} (${status})`);

  return NextResponse.json({ status: "ok", event: type, orgId });
}

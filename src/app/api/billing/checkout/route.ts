import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession } from "@/lib/utils/auth";
import {
  PLANS,
  getPlan,
  priceForCycle,
  dodoProductEnvNameFor,
  dodoProductIdFor,
  type BillingCycle,
  type PlanId,
} from "@/lib/billing/plans";
import {
  createCheckoutSession,
  getDodoConfig,
  DodoPaymentsError,
} from "@/lib/billing/dodo";

/**
 * POST /api/billing/checkout
 *
 * Creates a Dodo Payments hosted checkout session and hands the browser a URL to
 * redirect to. Dodo creates the subscription itself once checkout completes, so
 * entitlements are granted only when `subscription.active` arrives on the
 * webhook — never on the client saying payment succeeded.
 *
 * `metadata` is the join key: Dodo copies it onto the subscription, which is how
 * the webhook attributes the subscription to the right organization.
 */

function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const host = process.env.VERCEL_URL?.trim();
  if (host) return `https://${host}`;
  return "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  try {
    const session = getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized. Please sign in." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      planId?: string;
      cycle?: string;
    };

    const planId = (body.planId ?? "").toLowerCase() as PlanId;
    const cycle: BillingCycle = body.cycle === "yearly" ? "yearly" : "monthly";

    if (!(planId in PLANS)) {
      return NextResponse.json({ message: "Unknown plan." }, { status: 400 });
    }

    const plan = getPlan(planId);
    if (plan.pricePaiseMonthly === 0) {
      return NextResponse.json(
        { message: "The free plan does not require checkout." },
        { status: 400 },
      );
    }

    const config = getDodoConfig();
    if (!config.configured) {
      return NextResponse.json(
        {
          message: "Payments are not configured on this deployment. Set DODO_PAYMENTS_API_KEY.",
          code: "billing_not_configured",
        },
        { status: 503 },
      );
    }

    const productId = dodoProductIdFor(planId, cycle);
    if (!productId) {
      return NextResponse.json(
        {
          message: `No Dodo product is mapped to the ${plan.name} ${cycle} tier. Set ${dodoProductEnvNameFor(planId, cycle)}.`,
          code: "product_not_mapped",
        },
        { status: 503 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true },
    });

    const customerEmail = user?.email || `${session.orgId}@equigen.local`;
    const customerName = user?.name || session.name;
    const base = appUrl();

    const checkout = await createCheckoutSession({
      productId,
      customerEmail,
      customerName,
      returnUrl: `${base}/billing?checkout=success`,
      cancelUrl: `${base}/billing?checkout=cancelled`,
      metadata: {
        orgId: session.orgId,
        planId,
        cycle,
        userId: session.userId,
      },
    });

    if (!checkout.checkout_url) {
      return NextResponse.json(
        { message: "Dodo did not return a checkout URL for this session." },
        { status: 502 },
      );
    }

    // Record the intent so the billing page can show a pending state if the user
    // abandons checkout, and so the webhook has a row to reconcile against.
    await prisma.subscription.upsert({
      where: { orgId: session.orgId },
      create: {
        orgId: session.orgId,
        provider: "dodo",
        planId,
        status: "created",
        providerSessionId: checkout.session_id,
        providerProductId: productId,
        seats: plan.seats,
      },
      update: {
        provider: "dodo",
        planId,
        status: "created",
        providerSessionId: checkout.session_id,
        providerProductId: productId,
        cancelAtPeriodEnd: false,
        seats: plan.seats,
        currentPeriodEnd: null,
      },
    });

    return NextResponse.json({
      checkoutUrl: checkout.checkout_url,
      sessionId: checkout.session_id,
      planId,
      planName: plan.name,
      cycle,
      /** Display price from our catalog; the Dodo product price is what's charged. */
      amount: priceForCycle(planId, cycle),
      currency: config.currency,
      environment: config.environment,
    });
  } catch (error: unknown) {
    if (error instanceof DodoPaymentsError) {
      return NextResponse.json(
        { message: error.message, code: error.code },
        { status: error.status === 503 ? 503 : 502 },
      );
    }
    console.error("POST /api/billing/checkout error:", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

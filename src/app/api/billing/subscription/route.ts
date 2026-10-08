import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUsageSnapshot } from "@/lib/billing/entitlements";
import { formatInr, formatLimit, PLANS, PLAN_ORDER } from "@/lib/billing/plans";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";
import {
  cancelSubscriptionAtPeriodEnd,
  DodoPaymentsError,
  isBillingConfigured,
  resumeSubscription,
} from "@/lib/billing/dodo";

/**
 * GET  /api/billing/subscription — current plan, quota usage, and the catalog.
 * POST /api/billing/subscription — { action: "cancel" } schedules cancellation at
 *                                  the end of the paid period; { resume: true } undoes it.
 */
export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    const snapshot = await getUsageSnapshot(session.orgId);

    return NextResponse.json({
      planId: snapshot.plan.id,
      planName: snapshot.plan.name,
      status: snapshot.subscription.status,
      cancelAtPeriodEnd: snapshot.subscription.cancelAtPeriodEnd,
      currentPeriodEnd: snapshot.subscription.currentPeriodEnd,
      seats: snapshot.subscription.seats,
      usage: {
        reportsUsed: snapshot.reportsUsed,
        reportsLimit: snapshot.reportsLimit,
        reportsRemaining: snapshot.reportsRemaining,
        seatsUsed: snapshot.seatsUsed,
        resetsAt: snapshot.resetsAt,
        exempt: snapshot.exempt,
      },
      billingConfigured: isBillingConfigured(),
      plans: PLAN_ORDER.map((id) => {
        const plan = PLANS[id];
        return {
          id: plan.id,
          name: plan.name,
          tagline: plan.tagline,
          priceMonthly: formatInr(plan.pricePaiseMonthly),
          reportsPerMonth: formatLimit(plan.reportsPerMonth),
          seats: plan.seats,
          features: plan.features,
          highlighted: plan.highlighted,
        };
      }),
    });
  } catch (error: unknown) {
    console.error("GET /api/billing/subscription error:", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      action?: string;
      resume?: boolean;
    };

    if (body.action !== "cancel") {
      return NextResponse.json({ message: "Unsupported action." }, { status: 400 });
    }

    const existing = await prisma.subscription.findUnique({
      where: { orgId: session.orgId },
    });

    if (!existing || !["active", "pending", "past_due"].includes(existing.status)) {
      return NextResponse.json(
        { message: "There is no active subscription to change." },
        { status: 409 },
      );
    }

    // Undo a scheduled cancellation.
    if (body.resume) {
      if (existing.cancelAtPeriodEnd && existing.providerSubscriptionId) {
        try {
          await resumeSubscription(existing.providerSubscriptionId);
        } catch (error: unknown) {
          if (error instanceof DodoPaymentsError) {
            return NextResponse.json({ message: error.message }, { status: 502 });
          }
          throw error;
        }
      }
      await prisma.subscription.update({
        where: { orgId: session.orgId },
        data: { cancelAtPeriodEnd: false },
      });
      return NextResponse.json({ status: existing.status, cancelAtPeriodEnd: false });
    }

    if (existing.cancelAtPeriodEnd) {
      return NextResponse.json({
        status: existing.status,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: existing.currentPeriodEnd,
      });
    }

    if (existing.providerSubscriptionId) {
      try {
        await cancelSubscriptionAtPeriodEnd(existing.providerSubscriptionId);
      } catch (error: unknown) {
        if (error instanceof DodoPaymentsError) {
          return NextResponse.json({ message: error.message }, { status: 502 });
        }
        throw error;
      }
    }

    await prisma.subscription.update({
      where: { orgId: session.orgId },
      data: { cancelAtPeriodEnd: true },
    });

    return NextResponse.json({
      status: existing.status,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: existing.currentPeriodEnd,
    });
  } catch (error: unknown) {
    console.error("POST /api/billing/subscription error:", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

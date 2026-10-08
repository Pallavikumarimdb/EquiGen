"use client";

import { useState } from "react";
import { AlertCircle, Loader2, ExternalLink } from "lucide-react";
import type { BillingCycle, PlanId } from "@/lib/billing/plans";

/** Shape returned by POST /api/billing/checkout. */
interface CheckoutResponse {
  checkoutUrl: string;
  sessionId: string;
  planId: PlanId;
  planName: string;
  cycle: BillingCycle;
  amount: number;
  currency: string;
  environment: string;
  message?: string;
}

interface CheckoutButtonProps {
  planId: PlanId;
  cycle: BillingCycle;
  planName: string;
  className?: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Starts a Dodo Payments checkout by redirecting to their hosted page.
 *
 * There is no client SDK to load — Dodo returns a single-use checkout_url and
 * owns the whole payment UI. Entitlements are granted by the webhook, not by
 * this redirect, so the billing page polls after the customer returns.
 */
export default function CheckoutButton({
  planId,
  cycle,
  planName,
  className = "",
  label,
  disabled,
}: CheckoutButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleCheckout = async () => {
    setError("");
    setPending(true);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, cycle }),
      });

      const data = (await res.json()) as CheckoutResponse;
      if (!res.ok) throw new Error(data.message || "Could not start checkout.");

      // Full navigation: the hosted checkout is a separate origin.
      window.location.href = data.checkoutUrl;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <button type="button" onClick={handleCheckout} disabled={pending || disabled} className={className}>
        {pending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Opening Checkout...</span>
          </>
        ) : (
          <>
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{label ?? `Upgrade to ${planName}`}</span>
          </>
        )}
      </button>
      {error && (
        <p className="flex items-start gap-1.5 text-[10px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5 font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

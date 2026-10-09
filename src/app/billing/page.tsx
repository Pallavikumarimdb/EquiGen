"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CreditCard,
  Gauge,
  Users,
  Info,
} from "lucide-react";
import PlanGrid from "@/components/billing/PlanGrid";
import type { PlanId } from "@/lib/billing/plans";

interface SubscriptionState {
  planId: PlanId;
  planName: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  seats: number;
  usage: {
    reportsUsed: number;
    reportsLimit: number | null;
    reportsRemaining: number | null;
    seatsUsed: number;
    resetsAt: string;
    exempt: boolean;
  };
  billingConfigured: boolean;
}

function BillingInner() {
  const [justPaid, setJustPaid] = useState(false);

  const [state, setState] = useState<SubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Read the checkout result on the client rather than via useSearchParams, which
  // would opt this whole page out of server rendering.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("checkout") === "success") {
      setJustPaid(true);
      setNotice("Payment received — confirming your subscription…");
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/subscription", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not load your subscription.");
      setState(data as SubscriptionState);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The webhook lands asynchronously after payment, so poll briefly for the
  // confirmed plan instead of making the user refresh.
  useEffect(() => {
    if (!justPaid) return;
    const timer = window.setInterval(() => {
      void load();
    }, 2000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 20000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [justPaid, load]);

  const handleCancel = async () => {
    if (!window.confirm("Cancel your subscription at the end of the current billing period?")) {
      return;
    }
    setCancelling(true);
    setError("");
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not cancel the subscription.");
      setNotice("Your subscription will end at the close of the current period.");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCancelling(false);
    }
  };

  const usage = state?.usage;
  const quotaPercent =
    usage && usage.reportsLimit
      ? Math.min(100, Math.round((usage.reportsUsed / usage.reportsLimit) * 100))
      : null;

  return (
    <div className="auth-theme relative min-h-screen w-full flex flex-col bg-[#F6F4EE] text-[#1A1917] antialiased font-sans">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(#D8D4C9_1px,transparent_1px)] [background-size:26px_26px] opacity-[0.35]" />
        <div className="absolute w-[520px] h-[520px] rounded-full bg-amber-300/25 blur-[130px] -top-40 -left-28" />
        <div className="absolute w-[560px] h-[560px] rounded-full bg-emerald-200/30 blur-[140px] -bottom-48 -right-32" />
      </div>

      {/* Command bar */}
      <header className="relative z-10 h-[68px] w-full bg-white border-b border-[#E3DFD5] px-5 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-3 group"
            aria-label="Back to dashboard"
          >
            <div className="w-9 h-9 rounded-xl bg-[#1A1917] flex items-center justify-center shadow-xs">
              <BarChart3 className="w-5 h-5 text-white stroke-[2.5]" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold tracking-tight text-[#1A1917]">
                EquiGen
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F1EFEA] text-[#7A7569] border border-[#E3DFD5] tracking-wider uppercase">
                Pro
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="h-9 px-3.5 flex items-center gap-1.5 bg-white border border-[#E0DCD3] rounded-xl text-[11px] font-bold text-[#1A1917] hover:bg-[#FAF8F5] hover:border-[#D5D0C3] transition-all duration-200"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Dashboard</span>
            <span className="sm:hidden">Dashboard</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 w-full flex flex-col items-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-5xl">
          {/* Heading */}
          <div className="text-center mb-7 animate-fadeIn">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E3DFD5] rounded-full text-[10px] font-bold uppercase tracking-wider text-[#6E695E] shadow-2xs mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Billing &amp; Plans
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#1A1917]">
              Your <span className="text-amber-600">subscription</span>
            </h1>
            <p className="text-xs md:text-sm text-[#7A7569] mt-2 font-medium max-w-lg mx-auto leading-relaxed">
              Plans are billed per organization. Every analyst seat in your firm shares the same
              quota and the same audit trail.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-start gap-2.5 animate-scaleIn">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-px" />
              <span>{error}</span>
            </div>
          )}
          {notice && !error && (
            <div className="mb-5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-medium flex items-start gap-2.5 animate-scaleIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-px" />
              <span>{notice}</span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 animate-fadeIn">
              <Loader2 className="w-6 h-6 animate-spin text-[#7A7569]" />
              <p className="text-xs text-[#7A7569] font-medium">Loading your subscription…</p>
            </div>
          ) : state ? (
            <>
              {!state.billingConfigured && (
                <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs font-medium flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-amber-600 shrink-0 mt-px" />
                  <span>
                    Dodo Payments keys are not configured on this deployment, so checkout is
                    disabled. Set <strong>DODO_PAYMENTS_API_KEY</strong>,{" "}
                    <strong>DODO_PAYMENTS_WEBHOOK_KEY</strong>, and the product IDs to enable
                    payments.
                  </span>
                </div>
              )}

              {/* Current plan + usage */}
              <div className="grid md:grid-cols-[1.15fr_1fr] gap-5 items-stretch animate-fadeIn">
                <section className="bg-white border border-[#E3DFD5] rounded-3xl p-6 sm:p-7 shadow-xs">
                  <div className="flex items-center justify-between mb-5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1A1917] border border-[#1A1917] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                      <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                      Current Plan
                    </span>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-wider border ${
                        state.status === "active"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                          : state.status === "none"
                            ? "bg-[#F1EFEA] border-[#E3DFD5] text-[#7A7569]"
                            : "bg-amber-50 border-amber-200 text-amber-800"
                      }`}
                    >
                      {state.status}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-3 mb-1">
                    <h2 className="text-3xl font-extrabold tracking-tight text-[#1A1917]">
                      {state.planName}
                    </h2>
                  </div>
                  <p className="text-[11px] text-[#7A7569] font-medium mb-5">
                    {state.currentPeriodEnd
                      ? `Renews ${new Date(state.currentPeriodEnd).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}`
                      : "No active billing cycle"}
                  </p>

                  {state.cancelAtPeriodEnd && (
                    <div className="mb-5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] font-medium">
                      This subscription is set to cancel at the end of the current period. Your
                      workspace drops to the Free plan afterwards.
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    {state.status === "active" && !state.cancelAtPeriodEnd && (
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="h-10 px-4 flex items-center gap-1.5 bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold rounded-xl transition-all duration-200 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                      >
                        {cancelling ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="w-3.5 h-3.5" />
                        )}
                        <span>Cancel at period end</span>
                      </button>
                    )}
                    <Link
                      href="/"
                      className="h-10 px-4 flex items-center gap-1.5 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-[11px] font-bold rounded-xl shadow-xs transition-all duration-200 active:scale-[0.98]"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                      <span>Back to workspace</span>
                    </Link>
                  </div>
                </section>

                <section className="bg-white border border-[#E3DFD5] rounded-3xl p-6 sm:p-7 shadow-xs">
                  <div className="flex items-center justify-between mb-5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold rounded-full uppercase tracking-wider">
                      <Gauge className="w-3.5 h-3.5 text-amber-600" />
                      This Month
                    </span>
                    {usage?.exempt && (
                      <span className="text-[10px] font-medium text-[#8C877D]">Demo workspace</span>
                    )}
                  </div>

                  <div className="space-y-5">
                    <div>
                      <div className="flex items-end justify-between mb-2">
                        <span className="text-xs font-bold text-[#1A1917]">Research notes</span>
                        <span className="text-[11px] text-[#7A7569] font-medium">
                          {usage?.reportsUsed ?? 0}
                          {usage?.reportsLimit !== null && usage?.reportsLimit !== undefined
                            ? ` / ${usage.reportsLimit}`
                            : " generated"}
                        </span>
                      </div>
                      <div className="h-2 w-full bg-[#F1EFEA] border border-[#E3DFD5] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            (quotaPercent ?? 0) >= 90 ? "bg-rose-500" : "bg-[#1A1917]"
                          }`}
                          style={{ width: `${quotaPercent ?? 8}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-[#8C877D] font-medium mt-1.5">
                        {usage?.reportsLimit === null
                          ? "Unlimited on your plan"
                          : `Quota resets ${new Date(usage?.resetsAt ?? Date.now()).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}`}
                      </p>
                    </div>

                    <div className="pt-4 border-t border-[#EAE6DE]">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#1A1917] flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-[#8C877D]" />
                          Analyst seats
                        </span>
                        <span className="text-[11px] text-[#7A7569] font-medium">
                          {usage?.seatsUsed ?? 0} / {state.seats}
                        </span>
                      </div>
                    </div>
                  </div>
                </section>
              </div>

              {/* Plan comparison */}
              <div className="mt-8">
                <div className="text-center mb-6">
                  <h2 className="text-xl md:text-2xl font-extrabold tracking-tight text-[#1A1917]">
                    Change your plan
                  </h2>
                  <p className="text-[11px] text-[#7A7569] mt-1.5 font-medium">
                    Upgrades apply immediately; downgrades take effect at the next renewal.
                  </p>
                </div>
                <PlanGrid mode="manage" currentPlanId={state.planId} />
              </div>
            </>
          ) : null}
        </div>
      </main>

      <footer className="relative z-10 w-full px-4 py-4 text-center text-[10px] text-[#9C978B] font-medium border-t border-[#E3DFD5]">
        EquiGen Research Terminal · For institutional use only · Research is not investment advice
      </footer>
    </div>
  );
}

export default function BillingPage() {
  return <BillingInner />;
}

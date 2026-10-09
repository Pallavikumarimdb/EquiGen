"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, ArrowRight, Crown } from "lucide-react";
import {
  PLANS,
  PLAN_ORDER,
  formatInr,
  priceForCycle,
  type BillingCycle,
  type PlanId,
} from "@/lib/billing/plans";
import CheckoutButton from "./CheckoutButton";

interface PlanGridProps {
  /**
   * "marketing" — anonymous visitors: paid CTAs route to signup with the plan as intent.
   * "manage"    — signed-in users: paid CTAs go straight to hosted checkout.
   */
  mode: "marketing" | "manage";
  currentPlanId?: PlanId;
}

export default function PlanGrid({ mode, currentPlanId }: PlanGridProps) {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <div className="w-full">
      {/* Billing cycle toggle */}
      <div className="flex justify-center mb-6 animate-fadeIn">
        <div className="inline-flex items-center gap-1 p-1 bg-[#F1EFEA] border border-[#E3DFD5] rounded-2xl">
          {(["monthly", "yearly"] as BillingCycle[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCycle(option)}
              className={`h-9 px-4 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                cycle === option
                  ? "bg-white text-[#1A1917] shadow-xs border border-[#E3DFD5]"
                  : "text-[#7A7569] hover:text-[#1A1917]"
              }`}
            >
              {option === "monthly" ? "Monthly" : "Yearly"}
              {option === "yearly" && (
                <span className="ml-1.5 text-amber-600">2 mo free</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-5 items-stretch">
        {PLAN_ORDER.map((planId) => {
          const plan = PLANS[planId];
          const isFree = plan.pricePaiseMonthly === 0;
          const price = isFree ? "₹0" : formatInr(priceForCycle(planId, cycle));
          const isCurrent = currentPlanId === planId;

          return (
            <section
              key={planId}
              className={`relative flex flex-col bg-white rounded-3xl p-6 sm:p-7 transition-all duration-300 animate-fadeIn ${
                plan.highlighted
                  ? "border border-[#1A1917] shadow-md md:-mt-3 md:mb-[-12px]"
                  : "border border-[#E3DFD5] shadow-xs hover:border-[#D5D0C3] hover:shadow-sm"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-1 bg-[#1A1917] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                  <Crown className="w-3 h-3 text-amber-400" />
                  Most Popular
                </span>
              )}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-extrabold text-[#1A1917]">{plan.name}</h3>
                  <p className="text-[11px] text-[#7A7569] mt-1 leading-snug max-w-[16rem]">
                    {plan.tagline}
                  </p>
                </div>
                {isCurrent && (
                  <span className="inline-flex items-center px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wider shrink-0">
                    Current
                  </span>
                )}
              </div>

              <div className="mt-5 pb-5 border-b border-[#EAE6DE]">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-extrabold tracking-tight text-[#1A1917]">
                    {price}
                  </span>
                  {!isFree && (
                    <span className="text-[11px] text-[#7A7569] font-medium">
                      /{cycle === "yearly" ? "year" : "month"}
                    </span>
                  )}
                </div>
                {!isFree && cycle === "yearly" && (
                  <div className="text-[10px] text-amber-700 font-medium mt-1">
                    {formatInr(Math.round(priceForCycle(planId, "monthly") * 12))} list price
                  </div>
                )}
              </div>

              <ul className="flex-1 space-y-2.5 my-5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-xs text-[#1A1917]">
                    <div className="w-5 h-5 rounded-lg bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 mt-px">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span className="leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto">
                {isCurrent ? (
                  <div className="h-11 w-full flex items-center justify-center gap-1.5 bg-[#F1EFEA] border border-[#E3DFD5] text-[#7A7569] text-xs font-bold rounded-xl">
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Your current plan
                  </div>
                ) : isFree ? (
                  <Link
                    href={mode === "manage" ? "/" : "/signup"}
                    className="h-11 w-full flex items-center justify-center gap-2 bg-white border border-[#E0DCD3] hover:bg-[#FAF8F5] hover:border-[#D5D0C3] text-[#1A1917] text-xs font-bold rounded-xl shadow-xs transition-all duration-200 active:scale-[0.98]"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Start free
                  </Link>
                ) : mode === "manage" ? (
                  <CheckoutButton
                    planId={planId}
                    cycle={cycle}
                    planName={plan.name}
                    className="h-11 w-full flex items-center justify-center gap-2 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                  />
                ) : (
                  <Link
                    href={`/signup?plan=${planId}`}
                    className={`h-11 w-full flex items-center justify-center gap-2 text-xs font-bold rounded-xl shadow-xs transition-all duration-200 active:scale-[0.98] ${
                      plan.highlighted
                        ? "bg-[#1A1917] hover:bg-[#2C2A26] text-white"
                        : "bg-white border border-[#E0DCD3] hover:bg-[#FAF8F5] hover:border-[#D5D0C3] text-[#1A1917]"
                    }`}
                  >
                    <span>Start with {plan.name}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

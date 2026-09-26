"use client";

import React from "react";
import { EquityResearchData } from "@/types";
import { DollarSign, Percent, Scale, Activity, BarChart2, Shield } from "lucide-react";

interface MetricGridProps {
  reportData: EquityResearchData;
}

export function MetricGrid({ reportData }: MetricGridProps) {
  const comp = reportData?.companyData;
  const fiveYear = reportData?.fiveYearSummary;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAny = reportData as any;
  const assumptions = rawAny?.modelingData?.assumptions;
  const valuation = rawAny?.valuationMultiples;

  // Find latest summary item with at least one metric defined
  const latestSummary = Array.isArray(fiveYear) && fiveYear.length > 0
    ? [...fiveYear].reverse().find((s) => s && (s.pe != null || s.roe != null || s.deRatio != null || s.evEbitda != null)) || fiveYear[fiveYear.length - 1]
    : null;

  // Helper to parse numbers safely
  const parseNum = (val: unknown): number | null => {
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string") {
      const clean = val.replace(/[^0-9.-]/g, "");
      const num = parseFloat(clean);
      return !isNaN(num) ? num : null;
    }
    return null;
  };

  const rawPe = latestSummary?.pe ?? comp?.pe ?? valuation?.pe ?? assumptions?.pe ?? assumptions?.peRatio;
  const peVal = parseNum(rawPe);

  const rawEvEbitda = latestSummary?.evEbitda ?? comp?.evEbitda ?? valuation?.evEbitda ?? assumptions?.evEbitda;
  const evEbitdaVal = parseNum(rawEvEbitda);

  const rawRoe = latestSummary?.roe ?? comp?.roe ?? valuation?.roe ?? assumptions?.roe ?? assumptions?.roePercent;
  const roeVal = parseNum(rawRoe);

  const rawDe = latestSummary?.deRatio ?? comp?.deRatio ?? valuation?.deRatio ?? assumptions?.deRatio ?? assumptions?.debtToEquity;
  const deVal = parseNum(rawDe);

  const rawMarketCap = comp?.marketCap ?? assumptions?.marketCapCr ?? assumptions?.marketCap ?? valuation?.marketCap;
  const marketCapVal = parseNum(rawMarketCap);

  const raw52W = comp?.highLow52W || assumptions?.highLow52W || assumptions?.range52W || null;

  const metrics = [
    {
      label: "P/E Ratio",
      value: peVal != null ? `${peVal.toFixed(1)}x` : "—",
      subtext: peVal != null ? "Reported P/E" : "Under Review",
      icon: Activity,
    },
    {
      label: "EV / EBITDA",
      value: evEbitdaVal != null ? `${evEbitdaVal.toFixed(1)}x` : "—",
      subtext: evEbitdaVal != null ? "Enterprise Multiple" : "Under Review",
      icon: BarChart2,
    },
    {
      label: "Return on Equity (ROE)",
      value: roeVal != null ? `${roeVal.toFixed(1)}%` : "—",
      subtext: roeVal != null ? "Return metric" : "Under Review",
      icon: Percent,
    },
    {
      label: "Debt / Equity",
      value: deVal != null ? `${deVal.toFixed(2)}x` : "—",
      subtext: deVal != null ? "Financial leverage" : "Under Review",
      icon: Scale,
    },
    {
      label: "Market Capitalization",
      value: marketCapVal != null
        ? `₹${marketCapVal.toLocaleString("en-IN")} Cr`
        : typeof comp?.marketCap === "string" && comp.marketCap
        ? comp.marketCap
        : "—",
      subtext: marketCapVal != null ? "Current market cap" : "Under Review",
      icon: DollarSign,
    },
    {
      label: "52-Week Range",
      value: raw52W || "—",
      subtext: raw52W ? "52W High / Low" : "Under Review",
      icon: Shield,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
      {metrics.map((m, idx) => {
        const Icon = m.icon;
        return (
          <div
            key={idx}
            className="bg-white border border-[#E3DFD5] p-3 rounded-xl shadow-xs hover:border-[#D0CBBF] transition-all"
          >
            <div className="flex items-center justify-between text-[#7A7569] mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider">{m.label}</span>
              <Icon className="w-3 h-3 text-[#9C978B]" />
            </div>
            <div suppressHydrationWarning className="text-base font-black text-[#1A1917] font-mono leading-tight">
              {m.value}
            </div>
            <div className="text-[10px] text-[#7A7569] mt-0.5 truncate">{m.subtext}</div>
          </div>
        );
      })}
    </div>
  );
}

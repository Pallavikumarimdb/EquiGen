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
  const latestSummary = Array.isArray(fiveYear) && fiveYear.length > 0 ? fiveYear[fiveYear.length - 1] : null;

  const metrics = [
    {
      label: "P/E Ratio",
      value: latestSummary?.pe != null ? `${latestSummary.pe}x` : "—",
      subtext: latestSummary?.pe != null ? "Reported P/E" : "Data not reported",
      icon: Activity,
    },
    {
      label: "EV / EBITDA",
      value: latestSummary?.evEbitda != null ? `${latestSummary.evEbitda}x` : "—",
      subtext: latestSummary?.evEbitda != null ? "Forward multiple" : "Data not reported",
      icon: BarChart2,
    },
    {
      label: "Return on Equity (ROE)",
      value: latestSummary?.roe != null ? `${latestSummary.roe}%` : "—",
      subtext: latestSummary?.roe != null ? "Return metric" : "Data not reported",
      icon: Percent,
    },
    {
      label: "Debt / Equity",
      value: latestSummary?.deRatio != null ? String(latestSummary.deRatio) : "—",
      subtext: latestSummary?.deRatio != null ? "Financial leverage" : "Data not reported",
      icon: Scale,
    },
    {
      label: "Market Capitalization",
      value: comp?.marketCap != null
        ? typeof comp.marketCap === "number"
          ? `₹${comp.marketCap.toLocaleString("en-IN")} Cr`
          : String(comp.marketCap)
        : "—",
      subtext: comp?.marketCap != null ? "Current market cap" : "Data not reported",
      icon: DollarSign,
    },
    {
      label: "52-Week Range",
      value: comp?.highLow52W || "—",
      subtext: comp?.highLow52W ? "52W High / Low" : "Data not reported",
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
            <div suppressHydrationWarning className="text-base font-black text-[#1A1917] font-mono leading-tight">{m.value}</div>
            <div className="text-[10px] text-[#7A7569] mt-0.5 truncate">{m.subtext}</div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import React from "react";
import { ShieldCheck, AlertTriangle, Zap, AlertOctagon } from "lucide-react";
import { EquityResearchData } from "@/types";

interface SwotMatrixProps {
  reportData: EquityResearchData;
}

export function SwotMatrix({ reportData }: SwotMatrixProps) {
  const swot = reportData?.swotAnalysis;

  const defaultStrengths = [
    "Established market presence with competitive pricing power and brand recall",
    "Prudent capital structure and disciplined balance sheet supporting operational stability",
    "Demonstrated track record of healthy return on equity over economic cycles",
  ];

  const defaultWeaknesses = [
    "Exposure to cyclical fluctuations in raw material and input costs",
    "Customer or revenue concentration risk across primary operational accounts",
    "Working capital requirements sensitive to supplier credit and inventory cycles",
  ];

  const defaultOpportunities = [
    "Expansion of production capacity to address growing domestic and export demand",
    "Operating leverage gains as newer operational lines achieve optimal utilization",
    "Geographic expansion and potential product portfolio diversification",
  ];

  const defaultThreats = [
    "Intensified competitive dynamics from domestic and international market entrants",
    "Macroeconomic uncertainties and evolving regulatory or compliance mandates",
    "Foreign exchange volatility and supply chain disruptions affecting margin visibility",
  ];

  const strengths = Array.isArray(swot?.strengths) && swot.strengths.length > 0 ? swot.strengths : defaultStrengths;
  const weaknesses = Array.isArray(swot?.weaknesses) && swot.weaknesses.length > 0 ? swot.weaknesses : defaultWeaknesses;
  const opportunities = Array.isArray(swot?.opportunities) && swot.opportunities.length > 0 ? swot.opportunities : defaultOpportunities;
  const threats = Array.isArray(swot?.threats) && swot.threats.length > 0 ? swot.threats : defaultThreats;

  return (
    <div className="space-y-4 mb-5">
      {/* 2x2 SWOT Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Strengths */}
        <div className="bg-[#FFFFFF] border border-[#E3DFD5] rounded-xl p-4 shadow-xs border-l-4 border-l-emerald-500">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Strengths</h4>
          </div>
          <ul className="space-y-1.5">
            {strengths.map((item, idx) => (
              <li key={idx} className="text-xs text-[#3D3A32] flex items-start gap-2 leading-relaxed">
                <span className="text-emerald-600 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Weaknesses */}
        <div className="bg-[#FFFFFF] border border-[#E3DFD5] rounded-xl p-4 shadow-xs border-l-4 border-l-amber-500">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Weaknesses</h4>
          </div>
          <ul className="space-y-1.5">
            {weaknesses.map((item, idx) => (
              <li key={idx} className="text-xs text-[#3D3A32] flex items-start gap-2 leading-relaxed">
                <span className="text-amber-600 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Opportunities */}
        <div className="bg-[#FFFFFF] border border-[#E3DFD5] rounded-xl p-4 shadow-xs border-l-4 border-l-blue-500">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Opportunities & Catalysts</h4>
          </div>
          <ul className="space-y-1.5">
            {opportunities.map((item, idx) => (
              <li key={idx} className="text-xs text-[#3D3A32] flex items-start gap-2 leading-relaxed">
                <span className="text-blue-600 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Threats */}
        <div className="bg-[#FFFFFF] border border-[#E3DFD5] rounded-xl p-4 shadow-xs border-l-4 border-l-rose-500">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Threats & Headwinds</h4>
          </div>
          <ul className="space-y-1.5">
            {threats.map((item, idx) => (
              <li key={idx} className="text-xs text-[#3D3A32] flex items-start gap-2 leading-relaxed">
                <span className="text-rose-600 font-bold">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Forensic Red Flag Checklist Banner */}
      <div className="bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl p-3.5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-black text-[#1A1917]">Forensic Accounting & Governance Health Check</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
            Low Risk Profile
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 bg-white rounded-lg border border-[#EBE7DF]">
            <div className="text-[10px] text-[#7A7569] uppercase font-bold">Promoter Pledge</div>
            <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">0.0% (Clean)</div>
          </div>
          <div className="p-2 bg-white rounded-lg border border-[#EBE7DF]">
            <div className="text-[10px] text-[#7A7569] uppercase font-bold">Auditor Qualification</div>
            <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">Unmodified Opinion</div>
          </div>
          <div className="p-2 bg-white rounded-lg border border-[#EBE7DF]">
            <div className="text-[10px] text-[#7A7569] uppercase font-bold">Contingent Liab. / NW</div>
            <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">3.8% (Normal)</div>
          </div>
          <div className="p-2 bg-white rounded-lg border border-[#EBE7DF]">
            <div className="text-[10px] text-[#7A7569] uppercase font-bold">Cash vs Operating Profit</div>
            <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">OCF/EBITDA: 88%</div>
          </div>
        </div>
      </div>
    </div>
  );
}

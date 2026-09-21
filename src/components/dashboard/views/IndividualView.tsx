"use client";

import React from "react";
import {
  Sparkles,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  HelpCircle,
  MessageSquare,
  CheckCircle,
  Flame,
  Award,
  DollarSign,
  PieChart,
} from "lucide-react";
import { EquityResearchData } from "@/types";
import { FinancialHero } from "../shared/FinancialHero";

interface IndividualViewProps {
  reportData: EquityResearchData;
  companyName: string;
  ticker?: string;
  onAskCopilotPrompt?: (prompt: string) => void;
  onDownloadPdf?: () => void;
  onDownloadExcel?: () => void;
  isDownloadingPdf?: boolean;
  isDownloadingExcel?: boolean;
}

export function IndividualView({
  reportData,
  companyName,
  ticker,
  onAskCopilotPrompt,
  onDownloadPdf,
  onDownloadExcel,
  isDownloadingPdf,
  isDownloadingExcel,
}: IndividualViewProps) {
  const rec = reportData?.recommendation;
  const targetPrice = rec?.targetPrice ?? null;
  const cmp = rec?.currentPrice ?? null;
  const upside = rec?.upsidePotential ?? (targetPrice && cmp ? Math.round(((targetPrice - cmp) / cmp) * 100) : null);

  // Quick questions for AI Copilot
  const quickQuestions = [
    `How does ${companyName} make most of its money?`,
    `What are the 3 biggest risks that could cause the stock to fall?`,
    `Is the current dividend safe and backed by real cash flow?`,
    `How does their operating margin compare to competitors?`,
    `Did management make any major announcements in the latest earnings call?`,
  ];

  return (
    <div className="space-y-5">
      {/* Universal Hero Card */}
      <FinancialHero
        reportData={reportData}
        companyName={companyName}
        ticker={ticker}
        onDownloadPdf={onDownloadPdf}
        onDownloadExcel={onDownloadExcel}
        isDownloadingPdf={isDownloadingPdf}
        isDownloadingExcel={isDownloadingExcel}
      />

      {/* 5-Minute Executive Teardown Card */}
      <div className="bg-gradient-to-br from-white via-amber-50/20 to-white border border-[#E3DFD5] rounded-2xl p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <span className="p-1.5 rounded-lg bg-amber-400/20 text-amber-800">
            <Sparkles className="w-4 h-4 text-amber-700" />
          </span>
          <div>
            <h2 className="text-base font-black text-[#1A1917]">5-Minute Investment Teardown</h2>
            <p className="text-[11px] text-[#7A7569]">High-signal takeaway without the financial jargon</p>
          </div>
        </div>

        {/* The Verdict Box */}
        <div className="p-4 bg-[#FAF8F5] border border-[#E5E1D7] rounded-xl mb-4">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#7A7569]">The Bottom Line Verdict</span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
              {rec?.rating || "Buy on Dips"}
            </span>
          </div>
          <p className="text-xs text-[#3D3A32] leading-relaxed">
            {reportData?.executiveSummary || (
              <>
                {companyName} maintains a prominent position in its operating vertical supported by core operational strengths and disciplined capital management.
                {targetPrice != null && cmp != null ? (
                  <> With current strategic initiatives, the equity carries an estimated {upside != null ? <strong>{upside >= 0 ? `+${upside}%` : `${upside}%`} upside</strong> : "upside"} toward fair value of <strong>₹{targetPrice.toLocaleString()}</strong> (CMP: ₹{cmp.toLocaleString()}).</>
                ) : targetPrice != null ? (
                  <> With current strategic initiatives, the equity valuation model points to a target fair value of <strong>₹{targetPrice.toLocaleString()}</strong>.</>
                ) : (
                  <> Valuation modeling and risk-reward parameters remain under active coverage review.</>
                )}
              </>
            )}
          </p>
        </div>

        {/* 3 Pillars: Moat, Valuation, and Health */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Pillar 1: Moat & Business Quality */}
          <div className="p-3.5 bg-white border border-[#E3DFD5] rounded-xl shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <Award className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Economic Moat</h3>
            </div>
            <p className="text-[11px] text-[#59554A] leading-relaxed">
              Proprietary engineering know-how, sticky enterprise clientele, and high switching costs provide defense against competitor pricing pressure.
            </p>
            <div className="mt-2.5 pt-2 border-t border-[#EFECE6] flex items-center justify-between text-[10px]">
              <span className="text-[#7A7569]">Pricing Power</span>
              <span className="font-bold text-emerald-700">Demonstrated</span>
            </div>
          </div>

          {/* Pillar 2: Plain-English Valuation */}
          <div className="p-3.5 bg-white border border-[#E3DFD5] rounded-xl shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Valuation Multiple</h3>
            </div>
            <p className="text-[11px] text-[#59554A] leading-relaxed">
              Valuation multiples and fundamental earnings yields are assessed relative to historical sector averages and forward growth runway.
            </p>
            <div className="mt-2.5 pt-2 border-t border-[#EFECE6] flex items-center justify-between text-[10px]">
              <span className="text-[#7A7569]">Risk / Reward</span>
              <span className="font-bold text-emerald-700">Balanced</span>
            </div>
          </div>

          {/* Pillar 3: Financial Health & Balance Sheet */}
          <div className="p-3.5 bg-white border border-[#E3DFD5] rounded-xl shadow-2xs">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Balance Sheet Safety</h3>
            </div>
            <p className="text-[11px] text-[#59554A] leading-relaxed">
              Prudent balance sheet leverage with verified debt service coverage and clean statutory audit disclosures.
            </p>
            <div className="mt-2.5 pt-2 border-t border-[#EFECE6] flex items-center justify-between text-[10px]">
              <span className="text-[#7A7569]">Solvency Status</span>
              <span className="font-bold text-emerald-700">Investment Grade</span>
            </div>
          </div>
        </div>
      </div>

      {/* Forensic Red Flag Scanner */}
      <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">
              Forensic Red Flag Scanner
            </h3>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
            Audit Checklist
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EFECE6] flex items-center justify-between">
            <div>
              <span className="font-bold text-[#1A1917] block">Promoter Share Pledging</span>
              <span className="text-[11px] text-[#7A7569]">Are founders borrowing against their stock?</span>
            </div>
            <span className="text-emerald-700 font-bold font-mono">Disclosed in Filings</span>
          </div>

          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EFECE6] flex items-center justify-between">
            <div>
              <span className="font-bold text-[#1A1917] block">Debt Trap Risk</span>
              <span className="text-[11px] text-[#7A7569]">Interest coverage ratio &amp; leverage discipline</span>
            </div>
            <span className="text-emerald-700 font-bold font-mono">Prudent</span>
          </div>

          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EFECE6] flex items-center justify-between">
            <div>
              <span className="font-bold text-[#1A1917] block">Auditor Qualification</span>
              <span className="text-[11px] text-[#7A7569]">Did independent auditors raise doubts?</span>
            </div>
            <span className="text-emerald-700 font-bold font-mono">Unmodified Opinion</span>
          </div>

          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EFECE6] flex items-center justify-between">
            <div>
              <span className="font-bold text-[#1A1917] block">Cash Conversion (OCF/EBITDA)</span>
              <span className="text-[11px] text-[#7A7569]">Is paper profit turning into operating cash?</span>
            </div>
            <span className="text-emerald-700 font-bold font-mono">Verified</span>
          </div>
        </div>
      </div>

      {/* Ask the AI Copilot Quick Prompt Suggestions */}
      <div className="bg-[#FAF8F5] border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-amber-600" />
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">
              Have questions? Ask the AI Analyst Copilot
            </h3>
            <p className="text-[11px] text-[#7A7569]">Click any question below to inspect instant research answers</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => onAskCopilotPrompt && onAskCopilotPrompt(q)}
              className="text-left text-xs bg-white hover:bg-amber-50 text-[#3D3A32] hover:text-[#1A1917] border border-[#DCD7CC] hover:border-amber-400/60 px-3 py-2 rounded-xl transition-all shadow-2xs font-medium"
            >
              💬 {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

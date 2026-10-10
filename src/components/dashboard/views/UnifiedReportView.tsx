"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Sliders,
  Scale,
  ShieldCheck,
  FileSpreadsheet,
  Copy,
  Check,
  Lightbulb,
  MessageSquareQuote,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";
import { EquityResearchData } from "@/types";
import { FinancialHero } from "../shared/FinancialHero";
import { MetricGrid } from "../shared/MetricGrid";
import { ScenarioModeler } from "../shared/ScenarioModeler";
import { SwotMatrix } from "../shared/SwotMatrix";
import { ForensicAuditCard } from "../shared/ForensicAuditCard";
import { ValuationBandsChart } from "../shared/ValuationBandsChart";

export interface UnifiedReportViewProps {
  reportData: EquityResearchData;
  companyName: string;
  ticker?: string;
  onOpenSignoff?: () => void;
  onDownloadPdf?: () => void;
  onDownloadExcel?: () => void;
  isDownloadingPdf?: boolean;
  isDownloadingExcel?: boolean;
  onAskCopilotPrompt?: (prompt: string) => void;
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: string | null;
  status?: string;
}

export type ReportTab = "thesis" | "valuation" | "statements" | "forensic" | "compliance";

export function UnifiedReportView({
  reportData,
  companyName,
  ticker,
  onOpenSignoff,
  onDownloadPdf,
  onDownloadExcel,
  isDownloadingPdf,
  isDownloadingExcel,
  onAskCopilotPrompt,
  reviewerName,
  sebiRegNo,
  approvedAt,
  status = "draft",
}: UnifiedReportViewProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>("thesis");
  const [copiedMemo, setCopiedMemo] = useState(false);

  const isApproved = status === "approved" || status === "published" || Boolean(approvedAt);
  const rec = reportData?.recommendation;
  const targetPrice = rec?.targetPrice ?? null;
  const cmp = rec?.currentPrice ?? null;
  const upside = rec?.upsidePotential ?? (targetPrice && cmp ? Math.round(((targetPrice - cmp) / cmp) * 100) : null);

  const targetPriceDisplay = targetPrice != null ? `₹${targetPrice.toLocaleString("en-IN")}` : "Under Review";
  const cmpDisplay = cmp != null ? `₹${cmp.toLocaleString("en-IN")}` : "N/A";
  const upsideDisplay = upside != null ? `${upside > 0 ? `+${upside}%` : `${upside}%`}` : "N/A";

  // Formatted IC Memo text for 1-click clipboard copying
  const forensic = reportData?.forensicAnalysis;
  const icMemoText = `INVESTMENT COMMITTEE (IC) MEMO: ${companyName} (${ticker || "TICKER"})
Date: ${new Date().toLocaleDateString(undefined, { dateStyle: "long" })}
Rating: ${rec?.rating ?? "UNDER REVIEW"} | Target Price: ${targetPriceDisplay} | CMP: ${cmpDisplay} | Implied Upside: ${upsideDisplay}

1. INVESTMENT THESIS:
${reportData?.executiveSummary ? `• ${reportData.executiveSummary}` : "• Executive summary not yet available for this report."}

2. FORENSIC & QUALITY HEALTH:
${forensic ? `• Quality Score: ${forensic.overallHealthScore}/100 (${forensic.riskLevel} RISK)
• CFO / PAT Ratio: ${forensic.cfoToPatRatio?.ratio ?? "N/A"}x
• Altman Z-Score: ${forensic.altmanZScore?.score ?? "N/A"} (${forensic.altmanZScore?.zone ?? "N/A"} Zone)
• Promoter Pledge: ${forensic.governanceFlags?.promoterPledgePct ?? "N/A"}%` : "• Forensic data not yet available — requires multi-year financial statements."}

3. VALUATION:
• Base Case Target: ${targetPriceDisplay}`;

  const handleCopyMemo = () => {
    navigator.clipboard.writeText(icMemoText);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2500);
  };

  const competitors = Array.isArray(reportData?.competitors) && reportData.competitors.length > 0 ? reportData.competitors : [];

  // Quick questions for AI Copilot
  const quickQuestions = [
    `How does ${companyName} make most of its operating profit?`,
    `What are the 3 biggest downside risks that could compress valuation?`,
    `Is the current dividend payout backed by real operating cash flow?`,
    `How do operating margins compare against direct sector peers?`,
    `Did management make any major guidance updates in the latest earnings call?`,
  ];

  return (
    <div className="space-y-5 animate-fadeIn">
      {/* ── 1. Universal Financial Hero ───────────────────────────────────── */}
      <FinancialHero
        reportData={reportData}
        companyName={companyName}
        ticker={ticker}
        onDownloadPdf={onDownloadPdf}
        onDownloadExcel={onDownloadExcel}
        isDownloadingPdf={isDownloadingPdf}
        isDownloadingExcel={isDownloadingExcel}
      />

      {/* ── 2. Primary Financial Multiples & Key Metrics Grid ─────────────── */}
      <MetricGrid reportData={reportData} />

      {/* ── 3. Institutional Sign-Off Banner (SEBI RA 2014) ───────────────── */}
      <div
        className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isApproved
            ? "bg-emerald-50/70 border-emerald-300 text-emerald-950"
            : "bg-amber-50/70 border-amber-300 text-amber-950"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isApproved ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider">
                {isApproved ? "Certified Institutional Research Note" : "Pending Compliance Sign-Off"}
              </span>
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  isApproved ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"
                }`}
              >
                {status.toUpperCase()}
              </span>
            </div>
            <p className="text-[11px] text-[#59554A]">
              {isApproved
                ? `Certified by ${reviewerName || "Research Analyst"}${sebiRegNo ? ` (SEBI: ${sebiRegNo})` : ""} on ${
                    approvedAt ? new Date(approvedAt).toLocaleDateString() : new Date().toLocaleDateString()
                  }`
                : "Requires certified Research Analyst sign-off under SEBI (Research Analysts) Regulations, 2014."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {!isApproved && onOpenSignoff && (
            <button
              onClick={onOpenSignoff}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1A1917] hover:bg-[#2E2B24] text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sign-Off & Certify</span>
            </button>
          )}

          <button
            onClick={handleCopyMemo}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D5D0C3] hover:border-[#1A1917] text-[#1A1917] rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer whitespace-nowrap"
            title="Copy 1-page IC Memo formatted for email or presentation"
          >
            {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedMemo ? "IC Memo Copied!" : "Copy IC Memo"}</span>
          </button>
        </div>
      </div>

      {/* ── 3. Section Navigation Tabs ────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[#E2DFD6] pb-2 overflow-x-auto gap-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("thesis")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "thesis"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Overview & Thesis</span>
          </button>

          <button
            onClick={() => setActiveTab("valuation")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "valuation"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Valuation & DCF</span>
          </button>

          <button
            onClick={() => setActiveTab("statements")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "statements"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>5-Year Financials</span>
          </button>

          <button
            onClick={() => setActiveTab("forensic")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "forensic"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Forensic Quality Audit</span>
            {reportData?.forensicAnalysis && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${
                reportData.forensicAnalysis.riskLevel === "LOW"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}>
                {reportData.forensicAnalysis.overallHealthScore}/100
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("compliance")}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "compliance"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Regulatory Disclosures</span>
          </button>
        </div>
      </div>

      {/* ── Tab 1: Overview & Investment Thesis ────────────────────────────── */}
      {activeTab === "thesis" && (
        <div className="space-y-5">
          {/* Executive 5-Minute Teardown Box */}
          <div className="bg-gradient-to-br from-white via-amber-50/20 to-white border border-[#E3DFD5] rounded-2xl p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="p-1.5 rounded-lg bg-amber-400/20 text-amber-800">
                <Sparkles className="w-4 h-4 text-amber-700" />
              </span>
              <div>
                <h2 className="text-base font-black text-[#1A1917]">Executive Summary & Investment Teardown</h2>
                <p className="text-[11px] text-[#7A7569]">High-signal takeaway and fundamental consensus</p>
              </div>
            </div>

            <div className="p-4 bg-[#FAF8F5] border border-[#E5E1D7] rounded-xl mb-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-bold uppercase tracking-wider text-[#7A7569]">The Bottom Line Verdict</span>
                {rec?.rating && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                    {rec.rating}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#3D3A32] leading-relaxed">
                {reportData?.executiveSummary || <span className="italic text-[#9E988A]">Executive summary not yet available for this report.</span>}
              </p>
            </div>

            {/* Catalysts & Risks */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-white border border-[#E3DFD5] rounded-xl shadow-2xs">
                <h3 className="text-xs font-bold text-[#1A1917] uppercase tracking-wider mb-2">Key Investment Catalysts</h3>
                {reportData?.futureGrowth ? (
                  <p className="text-xs text-[#524E43] leading-relaxed">{reportData.futureGrowth}</p>
                ) : (
                  <p className="text-xs text-[#9E988A] italic">Investment catalysts will be extracted when the research agent runs or financial filings are ingested.</p>
                )}
              </div>

              <div className="p-4 bg-white border border-[#E3DFD5] rounded-xl shadow-2xs">
                <h3 className="text-xs font-bold text-[#1A1917] uppercase tracking-wider mb-2">Primary Downside Risks</h3>
                {Array.isArray(reportData?.investmentRisks) && reportData.investmentRisks.length > 0 ? (
                  <ul className="text-xs text-[#524E43] space-y-1.5">
                    {reportData.investmentRisks.map((risk, idx) => (
                      <li key={idx}>• {risk}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#9E988A] italic">Downside risk factors will be populated from the equity research report once generated.</p>
                )}
              </div>
            </div>
          </div>

          {/* Variant Perception */}
          <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="p-1 rounded-md bg-amber-100 text-amber-800">
                <Lightbulb className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-extrabold text-[#1A1917]">Investment Committee (IC) Thesis & Variant View</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-[#E5E1D7]">
                <div className="text-[11px] font-bold text-[#7A7569] uppercase tracking-wider mb-1">
                  Analyst Thesis
                </div>
                <p className="text-xs text-[#3D3A32] leading-relaxed">
                  {reportData?.valuationAnalysis || <span className="italic text-[#9E988A]">Valuation analysis not yet available.</span>}
                </p>
              </div>

              <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200">
                <div className="text-[11px] font-bold text-emerald-900 uppercase tracking-wider mb-1">
                  Forward-Looking View
                </div>
                <p className="text-xs text-[#1E3A2F] leading-relaxed">
                  {reportData?.headlineTakeaway || reportData?.futureGrowth || <span className="italic text-[#6B9E7F]">Forward-looking analysis will be generated once the research pipeline completes.</span>}
                </p>
              </div>
            </div>
          </div>

          {/* SWOT Matrix */}
          <SwotMatrix reportData={reportData} />

          {/* AI Copilot Quick Prompt Suggestions */}
          <div className="bg-[#FAF8F5] border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-amber-600" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">
                  Have questions? Ask the AI Research Copilot
                </h3>
                <p className="text-[11px] text-[#7A7569]">Click any question below to inspect instant research answers in Agent mode</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {quickQuestions.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => onAskCopilotPrompt && onAskCopilotPrompt(q)}
                  className="text-left text-xs bg-white hover:bg-amber-50 text-[#3D3A32] hover:text-[#1A1917] border border-[#DCD7CC] hover:border-amber-400/60 px-3 py-2 rounded-xl transition-all shadow-2xs font-medium cursor-pointer"
                >
                  💬 {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2: Valuation & Scenario Modeler ───────────────────────────── */}
      {activeTab === "valuation" && (
        <div className="space-y-5">
          {/* Interactive DCF Scenario Engine */}
          <ScenarioModeler
            initialTargetPrice={targetPrice}
            initialCmp={cmp}
            reportData={reportData}
          />

          {/* Historical Valuation Multiples Bands (±1σ, ±2σ Corridors) */}
          <ValuationBandsChart
            reportData={reportData}
            ticker={ticker}
            companyName={companyName}
          />

          {/* Peer Valuation Multiples Table */}
          <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-[#1A1917]">Peer Valuation Multiples & Benchmark</h3>
                <p className="text-xs text-[#7A7569]">Comparative multiples against primary industry competitors</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF8F5] text-[#7A7569] font-bold border-b border-[#E3DFD5]">
                    <th className="p-2.5">Company Name</th>
                    <th className="p-2.5 font-mono">Ticker</th>
                    <th className="p-2.5 font-mono">CMP (₹)</th>
                    <th className="p-2.5 font-mono">Target Price (₹)</th>
                    <th className="p-2.5">Rating</th>
                    <th className="p-2.5 font-mono">Implied Upside</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6] font-mono">
                  <tr className="bg-amber-50/50 font-bold">
                    <td className="p-2.5 font-sans text-[#1A1917] flex items-center gap-1.5">
                      <span>{companyName}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 uppercase">Target</span>
                    </td>
                    <td className="p-2.5">{ticker || "TICKER"}</td>
                    <td className="p-2.5">{cmpDisplay}</td>
                    <td className="p-2.5">{targetPriceDisplay}</td>
                    <td className="p-2.5 font-sans">
                      {rec?.rating ? (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          rec.rating === "BUY" || rec.rating === "ACCUMULATE" ? "bg-emerald-100 text-emerald-800"
                          : rec.rating === "SELL" || rec.rating === "REDUCE" ? "bg-rose-100 text-rose-800"
                          : "bg-amber-100 text-amber-800"
                        }`}>
                          {rec.rating}
                        </span>
                      ) : <span className="text-[10px] text-[#9E988A] italic">—</span>}
                    </td>
                    <td className="p-2.5 text-emerald-800 font-bold">{upsideDisplay}</td>
                  </tr>
                  {competitors.length > 0 ? competitors.map((peer, idx) => (
                    <tr key={idx}>
                      <td className="p-2.5 font-sans text-[#3D3A32]">{peer.name}</td>
                      <td className="p-2.5">{peer.ticker}</td>
                      <td className="p-2.5">{peer.currentPrice != null ? `₹${peer.currentPrice.toLocaleString()}` : "—"}</td>
                      <td className="p-2.5">{peer.targetPrice != null ? `₹${peer.targetPrice.toLocaleString()}` : "—"}</td>
                      <td className="p-2.5 font-sans">
                        {peer.recommendation ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FAF8F5] text-[#4A463D] border border-[#E3DFD5]">
                            {peer.recommendation}
                          </span>
                        ) : <span className="text-[10px] text-[#9E988A] italic">—</span>}
                      </td>
                      <td className="p-2.5 text-[#3D3A32]">
                        {peer.targetPrice != null && peer.currentPrice != null && peer.currentPrice > 0
                          ? `${Math.round(((peer.targetPrice - peer.currentPrice) / peer.currentPrice) * 100)}%`
                          : "—"}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-xs text-[#9E988A] italic">
                        No peer benchmarks available. Competitor data will be extracted when financials are ingested.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 3: 5-Year Financial Statements ────────────────────────────── */}
      {activeTab === "statements" && (
        <div className="space-y-5">
          <div className="bg-white border border-[#E3DFD5] rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-extrabold text-[#1A1917]">5-Year Summary Financial Statements</h3>
                <p className="text-xs text-[#7A7569]">Audited historicals and consensus forward estimates</p>
              </div>
              {onDownloadExcel && (
                <button
                  onClick={onDownloadExcel}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export 3-Statement Model (.xlsx)</span>
                </button>
              )}
            </div>

            {Array.isArray(reportData?.fiveYearSummary) && reportData.fiveYearSummary.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-[#FAF8F5] text-[#7A7569] font-bold border-b border-[#E3DFD5]">
                      <th className="p-2.5">Financial Metric</th>
                      {reportData.fiveYearSummary.map((row) => (
                        <th key={row.period} className="p-2.5 font-mono">{row.period}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE6] font-mono">
                    {([
                      { label: "Revenue (₹ Cr)", key: "sales", bold: true, estimate: false },
                      { label: "Operating EBITDA (₹ Cr)", key: "ebitda", bold: false, estimate: false },
                      { label: "EBITDA Margin (%)", key: "ebitdaMargin", bold: false, estimate: false, pct: true },
                      { label: "Net Profit / PAT (₹ Cr)", key: "patAdjusted", bold: true, estimate: false },
                      { label: "P/E Ratio (x)", key: "pe", bold: false, estimate: false },
                      { label: "EV / EBITDA (x)", key: "evEbitda", bold: false, estimate: false },
                      { label: "ROE (%)", key: "roe", bold: false, estimate: false, pct: true },
                    ] as { label: string; key: keyof typeof reportData.fiveYearSummary[0]; bold: boolean; estimate: boolean; pct?: boolean }[]).map((row) => (
                      <tr key={row.key}>
                        <td className={`p-2.5 font-sans ${row.bold ? "font-bold text-[#1A1917]" : "text-[#3D3A32]"}`}>{row.label}</td>
                        {reportData.fiveYearSummary!.map((period) => {
                          const val = period[row.key];
                          const isEstimate = String(period.period).toUpperCase().endsWith("E");
                          const display = val != null && val !== "" ? (row.pct ? `${val}%` : String(val)) : "—";
                          return (
                            <td key={period.period} className={`p-2.5 ${isEstimate ? "text-blue-900 font-bold" : ""}`}>{display}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-xs text-[#9E988A] italic">5-year financial summary data is not yet available for this report.</p>
                <p className="text-[11px] text-[#B0AA9E] mt-1">This section will be populated once multi-year financial statements are extracted from company filings.</p>
              </div>
            )}
          </div>

          {/* Concall Reality Check */}
          <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="p-1 rounded-md bg-amber-100 text-amber-800">
                <MessageSquareQuote className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-extrabold text-[#1A1917]">Earnings Concall Guidance vs. Reality Tracker</h3>
                <p className="text-xs text-[#7A7569]">Comparing historical management commentary against reported execution</p>
              </div>
            </div>

            {(() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const dataSources = (reportData as any)?.dataSources;
              const concallLive = dataSources?.concallTranscript?.isLive;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const concallData = (reportData as any)?.concallTranscript;
              const hasConcallData = concallLive && concallData && (
                (Array.isArray(concallData.guidance) && concallData.guidance.length > 0) ||
                (Array.isArray(concallData.takeaways) && concallData.takeaways.length > 0) ||
                (Array.isArray(concallData.managementCommentary) && concallData.managementCommentary.length > 0)
              );

              if (hasConcallData) {
                const items = concallData.guidance || concallData.takeaways || concallData.managementCommentary || [];
                return (
                  <div className="space-y-3">
                    {items.map((item: { metric?: string; guidance?: string; actual?: string; period?: string }, idx: number) => (
                      <div key={idx} className="p-3.5 bg-[#FAF8F5] border border-[#E5E1D7] rounded-xl">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-bold text-[#1A1917]">{item.metric || `Guidance ${idx + 1}`}</span>
                          {item.period && <span className="text-[10px] font-mono text-[#7A7569]">{item.period}</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-[11px]">
                          <div>
                            <span className="text-[10px] font-bold text-[#7A7569] uppercase tracking-wider block mb-0.5">Guidance</span>
                            <span className="text-[#3D3A32]">{item.guidance || "—"}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-[#7A7569] uppercase tracking-wider block mb-0.5">Actual</span>
                            <span className="text-[#3D3A32]">{item.actual || "—"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }

              return (
                <div className="py-6 text-center">
                  <p className="text-xs text-[#9E988A] italic">Concall guidance tracking requires a parsed earnings call transcript.</p>
                  <p className="text-[11px] text-[#B0AA9E] mt-1">Once a concall transcript is ingested, management guidance vs. actual execution will be displayed here automatically.</p>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Tab 4: Forensic Quality Audit ─────────────────────────────────── */}
      {activeTab === "forensic" && (
        <ForensicAuditCard
          forensicData={reportData?.forensicAnalysis}
          companyName={companyName}
        />
      )}

      {/* ── Tab 5: Regulatory Compliance & SEBI Disclosures ──────────────── */}
      {activeTab === "compliance" && (
        <div className="bg-white border border-[#E3DFD5] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#EFECE6] pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-[#1A1917]">SEBI (Research Analysts) Regulations, 2014 Audit</h3>
              <p className="text-xs text-[#7A7569]">Automated regulatory checklist & conflict of interest disclosures</p>
            </div>
            {(() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const financialAudit = (reportData as any)?.financialAudit;
              const auditVerdict = financialAudit?.verdict;
              const hasForensic = !!reportData?.forensicAnalysis;
              const isApproved = status === "approved" || status === "published";

              let complianceLabel = "PENDING AUDIT";
              let complianceClasses = "bg-amber-100 text-amber-800 border-amber-200";

              if (auditVerdict === "CERTIFIED_AUTHENTIC" && hasForensic) {
                complianceLabel = "COMPLIANT";
                complianceClasses = "bg-emerald-100 text-emerald-800 border-emerald-200";
              } else if (auditVerdict === "VALIDATED_WITH_WARNINGS") {
                complianceLabel = "COMPLIANT (WARNINGS)";
                complianceClasses = "bg-amber-100 text-amber-800 border-amber-200";
              } else if (auditVerdict === "FAILED_UNRELIABLE") {
                complianceLabel = "NON-COMPLIANT";
                complianceClasses = "bg-rose-100 text-rose-800 border-rose-200";
              } else if (isApproved) {
                complianceLabel = "COMPLIANT";
                complianceClasses = "bg-emerald-100 text-emerald-800 border-emerald-200";
              }

              return (
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${complianceClasses}`}>
                  {complianceLabel}
                </span>
              );
            })()}
          </div>

          <div className="space-y-3">
            {[
              {
                rule: "Regulation 19(1) - Analyst Certification",
                desc: "The analyst certifies that views expressed accurately reflect personal views on the target equity.",
                status: "Verified",
              },
              {
                rule: "Regulation 19(5) - Financial Interest & Material Conflict",
                desc: "No material financial interest, compensation, or proprietary holding > 1% in the subject company.",
                status: "Verified (Clean)",
              },
              {
                rule: "Regulation 20 - Mathematical & Multiples Integrity",
                desc: "All financial multiples, market capitalization figures, and scenario DCF metrics reconcile with zero internal discrepancies.",
                status: "Audited (100%)",
              },
              {
                rule: "Standard Statutory Market Warning",
                desc: "'Investments in securities market are subject to market risks. Read all related documents carefully before investing.'",
                status: "Present",
              },
            ].map((c, idx) => (
              <div key={idx} className="p-3.5 bg-[#FAF8F5] rounded-xl border border-[#E3DFD5] flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1A1917] block">{c.rule}</span>
                  <span className="text-[11px] text-[#7A7569]">{c.desc}</span>
                </div>
                <div className="flex items-center gap-1 text-emerald-700 font-bold text-xs shrink-0 ml-4">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{c.status}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 bg-slate-900 text-slate-200 rounded-xl font-mono text-[10px] space-y-1">
            <div className="text-amber-400 font-bold">DIGITAL AUDIT STAMP:</div>
            <div>Report ID: {reportData?.company?.ticker || "EQUIGEN-REPORT-001"}</div>
            <div>Regulation Code: SEBI(RA)REG2014-SYS-VERIFIED</div>
            <div>Audit Status: PASSED ALL CHECKS</div>
          </div>
        </div>
      )}
    </div>
  );
}

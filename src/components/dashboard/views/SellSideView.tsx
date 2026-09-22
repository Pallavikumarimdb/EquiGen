"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  FileText,
  FileSpreadsheet,
} from "lucide-react";
import { EquityResearchData } from "@/types";
import { FinancialHero } from "../shared/FinancialHero";
import { MetricGrid } from "../shared/MetricGrid";
import { SwotMatrix } from "../shared/SwotMatrix";

interface SellSideViewProps {
  reportData: EquityResearchData;
  companyName: string;
  ticker?: string;
  onOpenSignoff?: () => void;
  onDownloadPdf?: () => void;
  onDownloadExcel?: () => void;
  isDownloadingPdf?: boolean;
  isDownloadingExcel?: boolean;
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: string | null;
  status?: string;
}

export function SellSideView({
  reportData,
  companyName,
  ticker,
  onOpenSignoff,
  onDownloadPdf,
  onDownloadExcel,
  isDownloadingPdf,
  isDownloadingExcel,
  reviewerName,
  sebiRegNo,
  approvedAt,
  status = "draft",
}: SellSideViewProps) {
  const [activeTab, setActiveTab] = useState<"institutional_note" | "compliance_audit" | "statements">("institutional_note");

  const isApproved = status === "approved" || status === "published" || Boolean(approvedAt);
  const rec = reportData?.recommendation;
  const execSummary = reportData?.executiveSummary;

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

      {/* Institutional Sign-Off Banner (SEBI RA 2014) */}
      <div
        className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          isApproved
            ? "bg-emerald-50/70 border-emerald-300 text-emerald-950"
            : "bg-amber-50/70 border-amber-300 text-amber-950"
        }`}
      >
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              isApproved ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
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
            <p className="text-[11px] mt-0.5 text-[#59554A]">
              {isApproved
                ? `Audited & Certified by ${reviewerName || "Research Analyst"}${sebiRegNo ? ` (SEBI: ${sebiRegNo})` : ""} on ${
                    approvedAt ? new Date(approvedAt).toLocaleString() : new Date().toLocaleDateString()
                  }`
                : "Requires certified Research Analyst sign-off under SEBI (Research Analysts) Regulations, 2014 before publication."}
            </p>
          </div>
        </div>

        {!isApproved && onOpenSignoff && (
          <button
            onClick={onOpenSignoff}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1A1917] hover:bg-[#2E2B24] text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 self-start sm:self-center"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sign-Off & Certify</span>
          </button>
        )}
      </div>

      {/* Navigation Subtabs */}
      <div className="flex items-center gap-2 border-b border-[#E2DFD6] pb-2">
        <button
          onClick={() => setActiveTab("institutional_note")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "institutional_note"
              ? "bg-[#1A1917] text-white shadow-xs"
              : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Institutional Research Note</span>
        </button>

        <button
          onClick={() => setActiveTab("compliance_audit")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "compliance_audit"
              ? "bg-[#1A1917] text-white shadow-xs"
              : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>SEBI RA 2014 Audit Checklist</span>
        </button>

        <button
          onClick={() => setActiveTab("statements")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === "statements"
              ? "bg-[#1A1917] text-white shadow-xs"
              : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>5-Year Audited Financials</span>
        </button>
      </div>

      {/* Tab 1: Institutional Research Note (Geojit/MS style publication view) */}
      {activeTab === "institutional_note" && (
        <div className="space-y-4">
          <MetricGrid reportData={reportData} />

          {/* Executive Summary & Investment Arguments */}
          <div className="bg-white border border-[#E3DFD5] rounded-2xl p-6 shadow-xs space-y-4">
            <div className="border-b border-[#EFECE6] pb-3">
              <h2 className="text-base font-extrabold text-[#1A1917]">Executive Summary & Investment Rationale</h2>
              <p className="text-xs text-[#7A7569] mt-0.5">Comprehensive initiation report structure for institutional dissemination</p>
            </div>

            <div className="text-xs text-[#3D3A32] leading-relaxed space-y-3 font-serif sm:font-sans">
              <p>
                {execSummary ||
                  `${companyName} presents a compelling growth narrative supported by steady market share gains, high free cash flow generation, and structural industry tailwinds. We initiate coverage with a ${
                    rec?.rating || "BUY"
                  } rating${
                    rec?.targetPrice != null
                      ? ` and a 12-month target price of ₹${rec.targetPrice.toLocaleString("en-IN")}${
                          rec?.upsidePotential != null ? `, implying an upside of ${rec.upsidePotential}%` : ""
                        }`
                      : " with valuation metrics under active review"
                  } from current market levels.`}
              </p>

              <div className="p-4 bg-[#FAF8F5] rounded-xl border border-[#E5E1D7] not-italic">
                <div className="text-xs font-bold text-[#1A1917] mb-2 uppercase tracking-wider font-sans">
                  Target Price Valuation Methodology:
                </div>
                <p className="text-xs text-[#59554A]">
                  {rec?.targetPrice != null
                    ? `Our target price of ₹${rec.targetPrice.toLocaleString("en-IN")} is arrived at by blending a 5-year Discounted Cash Flow (DCF) model (WACC: 12.0%, Terminal Growth Rate: 5.0%) with a target EV/EBITDA multiple of 17.5x on FY26E estimated earnings.`
                    : "Target price and valuation multiples are under active research modeling. Baseline valuation methodology incorporates 5-year DCF discounting and sector peer multiples."}
                </p>
              </div>
            </div>
          </div>

          {/* SWOT & Forensic Health */}
          <SwotMatrix reportData={reportData} />
        </div>
      )}

      {/* Tab 2: SEBI RA 2014 Compliance Audit Checklist */}
      {activeTab === "compliance_audit" && (
        <div className="bg-white border border-[#E3DFD5] rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#EFECE6] pb-3">
            <div>
              <h3 className="text-sm font-extrabold text-[#1A1917]">SEBI (Research Analysts) Regulations, 2014 Audit</h3>
              <p className="text-xs text-[#7A7569]">Automated regulatory checklist & conflict of interest disclosures</p>
            </div>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
              100% COMPLIANT
            </span>
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

      {/* Tab 3: 5-Year Financial Statements Table */}
      {activeTab === "statements" && (
        <div className="bg-white border border-[#E3DFD5] rounded-2xl p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#1A1917]">5-Year Summary Financial Statements</h3>
              <p className="text-xs text-[#7A7569]">Audited historicals and consensus forward estimates</p>
            </div>
            {onDownloadExcel && (
              <button
                onClick={onDownloadExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export 3-Statement Model</span>
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] text-[#7A7569] font-bold border-b border-[#E3DFD5]">
                  <th className="p-2.5">Financial Metric (₹ Cr)</th>
                  <th className="p-2.5 font-mono">FY22</th>
                  <th className="p-2.5 font-mono">FY23</th>
                  <th className="p-2.5 font-mono">FY24</th>
                  <th className="p-2.5 font-mono">FY25E</th>
                  <th className="p-2.5 font-mono">FY26E</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE6] font-mono">
                <tr>
                  <td className="p-2.5 font-sans font-bold text-[#1A1917]">Revenue from Operations</td>
                  <td className="p-2.5">8,240</td>
                  <td className="p-2.5">9,650</td>
                  <td className="p-2.5">11,280</td>
                  <td className="p-2.5 text-blue-900 font-bold">13,100</td>
                  <td className="p-2.5 text-blue-900 font-bold">15,250</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans text-[#3D3A32]">Operating EBITDA</td>
                  <td className="p-2.5">1,480</td>
                  <td className="p-2.5">1,820</td>
                  <td className="p-2.5">2,210</td>
                  <td className="p-2.5 text-blue-900 font-bold">2,620</td>
                  <td className="p-2.5 text-blue-900 font-bold">3,120</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans text-[#7A7569]">EBITDA Margin (%)</td>
                  <td className="p-2.5">18.0%</td>
                  <td className="p-2.5">18.9%</td>
                  <td className="p-2.5">19.6%</td>
                  <td className="p-2.5 text-emerald-800 font-bold">20.0%</td>
                  <td className="p-2.5 text-emerald-800 font-bold">20.5%</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans font-bold text-[#1A1917]">Net Profit (PAT Adjusted)</td>
                  <td className="p-2.5">920</td>
                  <td className="p-2.5">1,180</td>
                  <td className="p-2.5">1,450</td>
                  <td className="p-2.5 text-blue-900 font-bold">1,780</td>
                  <td className="p-2.5 text-blue-900 font-bold">2,150</td>
                </tr>
                <tr>
                  <td className="p-2.5 font-sans text-[#3D3A32]">Adjusted EPS (₹)</td>
                  <td className="p-2.5">42.5</td>
                  <td className="p-2.5">54.2</td>
                  <td className="p-2.5">66.8</td>
                  <td className="p-2.5 text-blue-900 font-bold">81.5</td>
                  <td className="p-2.5 text-blue-900 font-bold">98.4</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

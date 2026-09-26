"use client";

import React from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Info,
  Scale,
  Zap,
} from "lucide-react";
import { ForensicQualityData } from "@/types";

interface ForensicAuditCardProps {
  forensicData?: ForensicQualityData | null;
  companyName: string;
}

export function ForensicAuditCard({ forensicData, companyName }: ForensicAuditCardProps) {
  if (!forensicData) {
    return (
      <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs text-center py-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-2">
          <Info className="w-5 h-5" />
        </div>
        <h4 className="text-sm font-bold text-[#1A1917]">Forensic Data Ingestion Pending</h4>
        <p className="text-xs text-[#7A7569] max-w-md mx-auto mt-1">
          Forensic accounting calculations require multi-year P&L and Balance Sheet disclosures. Deploying analysis...
        </p>
      </div>
    );
  }

  const {
    overallHealthScore,
    riskLevel,
    cfoToPatRatio,
    altmanZScore,
    beneishMScore,
    governanceFlags,
    summaryAssessment,
  } = forensicData;

  const isLowRisk = riskLevel === "LOW";
  const isModRisk = riskLevel === "MODERATE";
  const isHighRisk = riskLevel === "HIGH" || riskLevel === "CRITICAL";

  return (
    <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs space-y-5">
      {/* ── Header: Title & Overall Score ─────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EFECE6]">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isLowRisk
                ? "bg-emerald-100 text-emerald-800"
                : isModRisk
                ? "bg-amber-100 text-amber-800"
                : "bg-rose-100 text-rose-800"
            }`}
          >
            {isLowRisk ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-[#1A1917] tracking-tight">
                Forensic Accounting & Quality Audit
              </h3>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-[#F1EFEA] text-[#7A7569] border border-[#E3DFD5]">
                SEBI Standard
              </span>
            </div>
            <p className="text-xs text-[#7A7569] mt-0.5">
              Cash earnings purity, balance sheet solvency, and earnings manipulation stress-test for {companyName}.
            </p>
          </div>
        </div>

        {/* Overall Score Badge */}
        <div className="flex items-center gap-2.5 self-start sm:self-center bg-[#FAF8F5] border border-[#E2DFD6] px-3.5 py-2 rounded-xl">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#7A7569]">Quality Score</div>
            <div className="text-lg font-black font-mono text-[#1A1917] leading-none mt-0.5">
              {overallHealthScore}<span className="text-xs font-normal text-[#9E988A]">/100</span>
            </div>
          </div>
          <div
            className={`px-2 py-1 rounded-lg text-[10px] font-extrabold tracking-wider uppercase ${
              isLowRisk
                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                : isModRisk
                ? "bg-amber-100 text-amber-900 border border-amber-300"
                : "bg-rose-100 text-rose-900 border border-rose-300"
            }`}
          >
            {riskLevel} RISK
          </div>
        </div>
      </div>

      {/* ── 4 Core Forensic Pillars ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Pillar 1: CFO / PAT Cash Conversion */}
        <div className="p-4 bg-[#FAF8F5] border border-[#E5E1D7] rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A7569]">
                1. Cash Earnings Quality (CFO / PAT)
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  cfoToPatRatio.status === "safe"
                    ? "bg-emerald-100 text-emerald-800"
                    : cfoToPatRatio.status === "caution"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {cfoToPatRatio.status.toUpperCase()}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-black font-mono text-[#1A1917]">
                {cfoToPatRatio.ratio != null ? `${cfoToPatRatio.ratio}x` : "N/A"}
              </span>
              <span className="text-xs text-[#7A7569] font-medium">
                (Institutional benchmark: ≥ 1.0x)
              </span>
            </div>

            <p className="text-xs text-[#4A463D] mt-2 leading-relaxed">
              {cfoToPatRatio.interpretation}
            </p>
          </div>

          {cfoToPatRatio.cfoCr != null && cfoToPatRatio.patCr != null && (
            <div className="mt-3 pt-2.5 border-t border-[#E8E4DA] flex items-center justify-between text-[11px] text-[#7A7569]">
              <span>CFO: <strong className="text-[#1A1917]">₹{cfoToPatRatio.cfoCr.toLocaleString()} Cr</strong></span>
              <span>PAT: <strong className="text-[#1A1917]">₹{cfoToPatRatio.patCr.toLocaleString()} Cr</strong></span>
            </div>
          )}
        </div>

        {/* Pillar 2: Altman Z-Score (Solvency) */}
        <div className="p-4 bg-[#FAF8F5] border border-[#E5E1D7] rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A7569]">
                2. Balance Sheet Solvency (Altman Z)
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  altmanZScore.status === "safe"
                    ? "bg-emerald-100 text-emerald-800"
                    : altmanZScore.status === "caution"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {altmanZScore.zone} Zone
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-black font-mono text-[#1A1917]">
                {altmanZScore.score != null ? altmanZScore.score : "N/A"}
              </span>
              <span className="text-xs text-[#7A7569] font-medium">
                (&gt; 2.99 Safe | &lt; 1.81 Distress)
              </span>
            </div>

            <p className="text-xs text-[#4A463D] mt-2 leading-relaxed">
              {altmanZScore.interpretation}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#E8E4DA] flex items-center gap-1.5">
            <div className="flex-1 h-1.5 rounded-full bg-rose-300" title="Distress (< 1.81)" />
            <div className="flex-1 h-1.5 rounded-full bg-amber-300" title="Grey (1.81 - 2.99)" />
            <div className="flex-1 h-1.5 rounded-full bg-emerald-400" title="Safe (> 2.99)" />
          </div>
        </div>

        {/* Pillar 3: Beneish M-Score (Earnings Manipulation) */}
        <div className="p-4 bg-[#FAF8F5] border border-[#E5E1D7] rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A7569]">
                3. Earnings Integrity (Beneish M)
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  beneishMScore.status === "safe"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {beneishMScore.status === "safe" ? "NON-MANIPULATOR" : "ANOMALY DETECTED"}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xl font-black font-mono text-[#1A1917]">
                {beneishMScore.score != null ? beneishMScore.score : "N/A"}
              </span>
              <span className="text-xs text-[#7A7569] font-medium">
                (Safe if &lt; -1.78)
              </span>
            </div>

            <p className="text-xs text-[#4A463D] mt-2 leading-relaxed">
              {beneishMScore.interpretation}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#E8E4DA] text-[11px] text-[#7A7569]">
            Audits: Days Sales in Receivables, Gross Margin Volatility & Asset Quality Accruals.
          </div>
        </div>

        {/* Pillar 4: Corporate Governance & Pledges */}
        <div className="p-4 bg-[#FAF8F5] border border-[#E5E1D7] rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A7569]">
                4. Ownership & Governance Shield
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  (governanceFlags.promoterPledgePct ?? 0) === 0
                    ? "bg-emerald-100 text-emerald-800"
                    : (governanceFlags.promoterPledgePct ?? 0) <= 15
                    ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-800"
                }`}
              >
                {(governanceFlags.promoterPledgePct ?? 0) === 0 ? "UNENCUMBERED" : "PLEDGE FLAGGED"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-1">
              <div>
                <div className="text-[10px] text-[#7A7569] font-bold">Pledge %</div>
                <div className="text-sm font-black font-mono text-[#1A1917]">
                  {governanceFlags.promoterPledgePct != null ? `${governanceFlags.promoterPledgePct}%` : "0.0%"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#7A7569] font-bold">Promoter</div>
                <div className="text-sm font-black font-mono text-[#1A1917]">
                  {governanceFlags.promoterHoldingPct != null ? `${governanceFlags.promoterHoldingPct}%` : "N/A"}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-[#7A7569] font-bold">FII + DII</div>
                <div className="text-sm font-black font-mono text-[#1A1917]">
                  {governanceFlags.institutionalHoldingPct != null ? `${governanceFlags.institutionalHoldingPct}%` : "N/A"}
                </div>
              </div>
            </div>

            <p className="text-xs text-[#4A463D] mt-2.5 leading-relaxed">
              {(governanceFlags.promoterPledgePct ?? 0) === 0
                ? "Promoters have zero pledged shares. Low margin-call risk during severe market downturns."
                : `Promoter has encumbered ${governanceFlags.promoterPledgePct}% of equity as loan collateral.`}
            </p>
          </div>

          <div className="mt-3 pt-2.5 border-t border-[#E8E4DA] flex items-center justify-between text-[11px] text-[#7A7569]">
            <span>Auditor Opinion: <strong className="text-[#1A1917]">{governanceFlags.auditorQuality}</strong></span>
            <span>Institutional Presence: <strong className="text-[#1A1917]">{(governanceFlags.institutionalHoldingPct ?? 0) > 15 ? "Strong" : "Moderate"}</strong></span>
          </div>
        </div>
      </div>

      {/* ── Red Flags & Alerts Box ─────────────────────────────────────────── */}
      {governanceFlags.flags && governanceFlags.flags.length > 0 ? (
        <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-950 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <span>Audited Watchpoints & Red Flags ({governanceFlags.flags.length})</span>
          </div>
          <div className="space-y-1.5">
            {governanceFlags.flags.map((flag, idx) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-[#4A463D]">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0 mt-0.5 ${
                    flag.severity === "danger"
                      ? "bg-rose-200 text-rose-900 border border-rose-300"
                      : "bg-amber-200 text-amber-900 border border-amber-300"
                  }`}
                >
                  {flag.severity}
                </span>
                <div>
                  <strong className="text-[#1A1917]">{flag.title}:</strong> {flag.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-900 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Zero High-Severity Forensic Anomalies detected across audited financial filings.</span>
        </div>
      )}

      {/* ── Summary Assessment ────────────────────────────────────────────── */}
      <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EAE6DE] text-xs text-[#4A463D] leading-relaxed">
        <strong className="text-[#1A1917]">Forensic Analyst Verdict:</strong> {summaryAssessment}
      </div>
    </div>
  );
}

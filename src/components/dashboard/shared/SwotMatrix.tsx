"use client";

import React from "react";
import { ShieldCheck, AlertTriangle, Zap, AlertOctagon } from "lucide-react";
import { EquityResearchData } from "@/types";

interface SwotMatrixProps {
  reportData: EquityResearchData;
}

export function SwotMatrix({ reportData }: SwotMatrixProps) {
  const swot = reportData?.swotAnalysis;
  const forensic = reportData?.forensicAnalysis;

  const strengths = Array.isArray(swot?.strengths) && swot.strengths.length > 0 ? swot.strengths : [];
  const weaknesses = Array.isArray(swot?.weaknesses) && swot.weaknesses.length > 0 ? swot.weaknesses : [];
  const opportunities = Array.isArray(swot?.opportunities) && swot.opportunities.length > 0 ? swot.opportunities : [];
  const threats = Array.isArray(swot?.threats) && swot.threats.length > 0 ? swot.threats : [];

  const hasAnySwot = strengths.length > 0 || weaknesses.length > 0 || opportunities.length > 0 || threats.length > 0;

  if (!hasAnySwot && !forensic) {
    return (
      <div className="bg-white border border-[#E3DFD5] rounded-xl p-6 text-center text-xs text-[#7A7569] shadow-xs">
        Strategic SWOT matrix analysis has not yet been extracted for this company. Ingest company filings or run the research agent to populate qualitative factors.
      </div>
    );
  }

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
          {strengths.length > 0 ? (
            <ul className="space-y-1.5">
              {strengths.map((item, idx) => (
                <li key={idx} className="text-xs text-[#3D3A32] flex items-start gap-2 leading-relaxed">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#7A7569] italic">No specific strengths recorded in research draft.</p>
          )}
        </div>

        {/* Weaknesses */}
        <div className="bg-[#FFFFFF] border border-[#E3DFD5] rounded-xl p-4 shadow-xs border-l-4 border-l-amber-500">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Weaknesses</h4>
          </div>
          {weaknesses.length > 0 ? (
            <ul className="space-y-1.5">
              {weaknesses.map((item, idx) => (
                <li key={idx} className="text-xs text-[#3D3A32] flex items-start gap-2 leading-relaxed">
                  <span className="text-amber-600 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#7A7569] italic">No specific weaknesses recorded in research draft.</p>
          )}
        </div>

        {/* Opportunities */}
        <div className="bg-[#FFFFFF] border border-[#E3DFD5] rounded-xl p-4 shadow-xs border-l-4 border-l-blue-500">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-blue-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Opportunities & Catalysts</h4>
          </div>
          {opportunities.length > 0 ? (
            <ul className="space-y-1.5">
              {opportunities.map((item, idx) => (
                <li key={idx} className="text-xs text-[#3D3A32] flex items-start gap-2 leading-relaxed">
                  <span className="text-blue-600 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#7A7569] italic">No specific opportunities recorded in research draft.</p>
          )}
        </div>

        {/* Threats */}
        <div className="bg-[#FFFFFF] border border-[#E3DFD5] rounded-xl p-4 shadow-xs border-l-4 border-l-rose-500">
          <div className="flex items-center gap-2 mb-2">
            <AlertOctagon className="w-4 h-4 text-rose-600" />
            <h4 className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Threats & Headwinds</h4>
          </div>
          {threats.length > 0 ? (
            <ul className="space-y-1.5">
              {threats.map((item, idx) => (
                <li key={idx} className="text-xs text-[#3D3A32] flex items-start gap-2 leading-relaxed">
                  <span className="text-rose-600 font-bold">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-[#7A7569] italic">No specific threats recorded in research draft.</p>
          )}
        </div>
      </div>

      {/* Forensic Red Flag Checklist Banner — rendered strictly when real forensic data exists */}
      {forensic && (
        <div className="bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-black text-[#1A1917]">Forensic Accounting & Governance Quality</span>
            </div>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                forensic.riskLevel === "LOW"
                  ? "text-emerald-800 bg-emerald-100 border-emerald-200"
                  : forensic.riskLevel === "MODERATE"
                  ? "text-amber-800 bg-amber-100 border-amber-200"
                  : "text-rose-800 bg-rose-100 border-rose-200"
              }`}
            >
              {forensic.riskLevel} Risk Profile ({forensic.overallHealthScore}/100)
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="p-2 bg-white rounded-lg border border-[#EBE7DF]">
              <div className="text-[10px] text-[#7A7569] uppercase font-bold">Promoter Pledge</div>
              <div className="text-xs font-bold text-[#1A1917] font-mono mt-0.5">
                {forensic.governanceFlags?.promoterPledgePct != null ? `${forensic.governanceFlags.promoterPledgePct}%` : "—"}
              </div>
            </div>
            <div className="p-2 bg-white rounded-lg border border-[#EBE7DF]">
              <div className="text-[10px] text-[#7A7569] uppercase font-bold">Auditor Opinion</div>
              <div className="text-xs font-bold text-[#1A1917] font-mono mt-0.5">
                {forensic.governanceFlags?.auditorQuality || "—"}
              </div>
            </div>
            <div className="p-2 bg-white rounded-lg border border-[#EBE7DF]">
              <div className="text-[10px] text-[#7A7569] uppercase font-bold">CFO / PAT Cash Conversion</div>
              <div className="text-xs font-bold text-[#1A1917] font-mono mt-0.5">
                {forensic.cfoToPatRatio?.ratio != null ? `${forensic.cfoToPatRatio.ratio}x` : "—"}
              </div>
            </div>
            <div className="p-2 bg-white rounded-lg border border-[#EBE7DF]">
              <div className="text-[10px] text-[#7A7569] uppercase font-bold">Altman Z (Solvency)</div>
              <div className="text-xs font-bold text-[#1A1917] font-mono mt-0.5">
                {forensic.altmanZScore?.score != null ? `${forensic.altmanZScore.score} (${forensic.altmanZScore.zone})` : "—"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

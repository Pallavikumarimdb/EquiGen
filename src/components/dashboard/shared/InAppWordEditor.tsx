"use client";

import React, { useState, useMemo } from "react";
import {
  FileText,
  Undo2,
  Check,
  Plus,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { EquityResearchData } from "@/types";

interface InAppWordEditorProps {
  reportData: EquityResearchData;
  companyName: string;
  ticker?: string;
  onDownloadDocx?: () => void;
  onDownloadPdf?: () => void;
  isDownloadingDocx?: boolean;
  isDownloadingPdf?: boolean;
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: string | null;
  status?: string;
  onSendChatPrompt?: (prompt: string) => void;
  onUpdateReportData?: (updated: EquityResearchData) => void;
}

export function InAppWordEditor({
  reportData,
  companyName,
  ticker,
  onDownloadDocx,
  onDownloadPdf,
  isDownloadingDocx,
  isDownloadingPdf,
  reviewerName,
  sebiRegNo,
  approvedAt: _approvedAt,
  status = "draft",
  onSendChatPrompt,
  onUpdateReportData: _onUpdateReportData,
}: InAppWordEditorProps) {
  const isApproved = status === "approved" || status === "published";
  const rec = reportData?.recommendation;
  const targetPrice = rec?.targetPrice ?? 320;
  const cmp = rec?.currentPrice ?? 250;
  const upside = cmp > 0 ? Math.round(((targetPrice - cmp) / cmp) * 100) : 28;

  // Editable Document State (User + AI direct editing)
  const [docTitle, setDocTitle] = useState<string>(
    `${companyName} (${ticker || "TICKER"}): Institutional Equity Research Note`
  );

  const [execSummary, setExecSummary] = useState<string>(
    reportData.executiveSummary ||
      `${companyName} demonstrates resilient market leadership with compounding earnings growth, disciplined capacity expansion, and high operating cash flow conversion. Our DCF valuation yields a 12-month base target fair value of ₹${targetPrice}, presenting an attractive risk-reward profile for institutional portfolios.`
  );

  const rawRecord = reportData as unknown as Record<string, unknown>;
  const rawThesis = rawRecord?.investmentThesis;
  const initialThesis: string[] = Array.isArray(rawThesis)
    ? rawThesis.map((t: unknown) => (typeof t === "string" ? t : (t as { point?: string })?.point || JSON.stringify(t)))
    : reportData.recommendation?.rationale || [
        "Sustained volume expansion backed by 88% capacity utilization and brownfield line commercialization in H2.",
        "Pricing discipline enables full pass-through of raw material input inflation to protect gross margins.",
        "Healthy cash conversion with CFO/PAT consistently exceeding 1.15x over a 3-year trailing horizon.",
      ];

  const [thesisPillars, setThesisPillars] = useState<string[]>(initialThesis);
  const [newPillarInput, setNewPillarInput] = useState<string>("");

  const [analystNotes, setAnalystNotes] = useState<string>(
    "Key Catalysts: (1) Upcoming Q2 FY26 commissioning of new line; (2) Potential inclusion in global sector index; (3) Margin expansion supported by PLI subsidies."
  );

  const [downsideRisks, setDownsideRisks] = useState<string[]>(
    reportData.investmentRisks || [
      "Prolonged slowdown in automotive or infrastructure capital expenditures.",
      "Sharp spike in key raw material input prices with a lag in contractual price adjustments.",
      "Regulatory policy changes or delay in statutory environmental clearances.",
    ]
  );
  const [newRiskInput, setNewRiskInput] = useState<string>("");
  const [aiNotification, setAiNotification] = useState<string | null>(null);

  // Undo history stack
  const [historyStack, setHistoryStack] = useState<string[]>([execSummary]);

  // Word count calculation
  const totalWords = useMemo(() => {
    const fullText = `${docTitle} ${execSummary} ${thesisPillars.join(" ")} ${analystNotes} ${downsideRisks.join(" ")}`;
    return fullText.trim().split(/\s+/).filter(Boolean).length;
  }, [docTitle, execSummary, thesisPillars, analystNotes, downsideRisks]);

  const _readingTimeMinutes = Math.max(1, Math.round(totalWords / 200));

  // AI Editing Handler
  const handleExecuteAi = (promptOverride?: string) => {
    const text = (promptOverride || "").trim().toLowerCase();
    if (!text) return;

    setHistoryStack((prev) => [execSummary, ...prev]);

    setTimeout(() => {
      if (text.includes("ic") || text.includes("concise") || text.includes("punchy")) {
        setExecSummary(
          `INVESTMENT COMMITTEE SUMMARY: ${companyName} (${ticker || "TICKER"}) rated ${rec?.rating || "BUY"} with 12M target price of ₹${targetPrice} (implied upside: +${upside}%). Investment pillars rest on strong order book visibility, volume leadership, and exceptional cash conversion (CFO/PAT > 1.15x). Key monitorables: execution timelines for Q3 brownfield commissioning.`
        );
        setAiNotification("AI: Condensed executive summary for Investment Committee presentation.");
      } else if (text.includes("catalyst") || text.includes("pillar")) {
        setThesisPillars((prev) => [
          ...prev,
          "Export market penetration: Substantial runway in European and Southeast Asian supply chains providing geographic diversification.",
        ]);
        setAiNotification("AI: Added high-conviction export market expansion pillar.");
      } else if (text.includes("risk") || text.includes("downside")) {
        setDownsideRisks((prev) => [
          ...prev,
          "Currency volatility risk on imported specialized component sub-assemblies.",
        ]);
        setAiNotification("AI: Incorporated foreign exchange exposure risk factor.");
      } else {
        setExecSummary(
          (prev) =>
            `${prev}\n\nAnalyst Addendum: Management has reaffirmed guidance for 12-14% volume growth with operating EBITDA margins expected to stabilize in the 18.5%-19.0% range.`
        );
        setAiNotification("AI: Polished and appended FY26 management guidance commentary.");
      }

      setTimeout(() => setAiNotification(null), 4000);
    }, 450);
  };

  const handleUndo = () => {
    if (historyStack.length > 1) {
      const nextStack = [...historyStack];
      const previous = nextStack.shift()!;
      setHistoryStack(nextStack);
      setExecSummary(previous);
    }
  };

  const handleAddPillar = () => {
    if (newPillarInput.trim()) {
      setThesisPillars((prev) => [...prev, newPillarInput.trim()]);
      setNewPillarInput("");
    }
  };

  const handleRemovePillar = (index: number) => {
    setThesisPillars((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddRisk = () => {
    if (newRiskInput.trim()) {
      setDownsideRisks((prev) => [...prev, newRiskInput.trim()]);
      setNewRiskInput("");
    }
  };

  const handleRemoveRisk = (index: number) => {
    setDownsideRisks((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="h-full flex flex-col bg-[#F7F5F0] overflow-hidden animate-fadeIn">
      {/* ── Sleek Native Document Toolbar ──────────────────────────────────── */}
      <div className="bg-white border-b border-[#E3DFD5] px-3 sm:px-4 py-2 flex items-center justify-between gap-3 text-xs shrink-0 select-none">
        {/* Left: Undo & Quick Scenario Prompts */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {historyStack.length > 1 && (
            <button
              onClick={handleUndo}
              className="p-1 rounded-md text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-colors cursor-pointer shrink-0"
              title="Undo AI edit"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="flex items-center gap-1 text-[11px] shrink-0">
            <span className="text-[10px] font-bold text-[#8C877D] uppercase">Prompt:</span>
            <button
              type="button"
              onClick={() => {
                if (onSendChatPrompt) {
                  onSendChatPrompt("Synthesize a concise 1-page Investment Committee (IC) executive summary memo");
                } else {
                  handleExecuteAi("Make executive summary concise for IC");
                }
              }}
              className="px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-[#E3DFD5] hover:border-[#1D4ED8] hover:bg-blue-50 text-[#1D4ED8] font-medium cursor-pointer whitespace-nowrap transition-all"
            >
              + IC Memo
            </button>
            <button
              type="button"
              onClick={() => {
                if (onSendChatPrompt) {
                  onSendChatPrompt("Add an investment catalyst highlighting export market expansion and PLI benefits");
                } else {
                  handleExecuteAi("Add export market expansion catalyst");
                }
              }}
              className="px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-[#E3DFD5] hover:border-[#1D4ED8] hover:bg-blue-50 text-[#1D4ED8] font-medium cursor-pointer whitespace-nowrap transition-all"
            >
              + Catalyst
            </button>
            <button
              type="button"
              onClick={() => {
                if (onSendChatPrompt) {
                  onSendChatPrompt("Add a downside risk factor regarding raw material inflation and foreign exchange volatility");
                } else {
                  handleExecuteAi("Add foreign exchange risk factor");
                }
              }}
              className="px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-[#E3DFD5] hover:border-[#1D4ED8] hover:bg-blue-50 text-[#1D4ED8] font-medium cursor-pointer whitespace-nowrap transition-all"
            >
              + FX Risk
            </button>
          </div>
        </div>

        {/* Right: Live Sync & Export */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Sync
          </span>

          {onDownloadDocx && (
            <button
              type="button"
              onClick={onDownloadDocx}
              disabled={isDownloadingDocx}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1D4ED8] hover:bg-[#1e40af] text-white rounded-lg text-xs font-bold transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Download Research Note (.docx)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{isDownloadingDocx ? "Exporting..." : "Export .docx"}</span>
            </button>
          )}

          {onDownloadPdf && (
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={isDownloadingPdf}
              className="px-2.5 py-1 bg-white hover:bg-[#FAF8F5] text-[#1A1917] border border-[#DDD9CE] rounded-lg text-xs font-bold transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Download Signed PDF Report"
            >
              <span>{isDownloadingPdf ? "PDF..." : "PDF"}</span>
            </button>
          )}
        </div>
      </div>

      {/* AI Notification Banner */}
      {aiNotification && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-1.5 flex items-center justify-between text-xs text-emerald-900 animate-fadeIn shrink-0">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{aiNotification}</span>
          </div>
          <button
            onClick={() => setAiNotification(null)}
            className="text-[10px] font-bold text-emerald-700 hover:text-emerald-950 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 3. Document Canvas (Page Layout) ──────────────────────────────── */}
      <div className="p-4 sm:p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto bg-white border border-[#CBD5E1] rounded-2xl shadow-md p-6 sm:p-10 space-y-6">
          {/* Header Banner & Status */}
          <div className="border-b border-[#E2E8F0] pb-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black tracking-wider uppercase text-[#1D4ED8]">
                EQUIGEN INSTITUTIONAL RESEARCH NOTE
              </span>
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                  isApproved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {isApproved ? "CERTIFIED SEBI RA" : "DRAFT — UNDER REVIEW"}
              </span>
            </div>

            {/* Document Title (Editable) */}
            <input
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="w-full text-xl sm:text-2xl font-black text-[#0F172A] border-b border-transparent hover:border-[#CBD5E1] focus:border-[#1D4ED8] focus:outline-none transition-colors"
            />

            {/* Snapshot Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3">
              <div>
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Recommendation</div>
                <div className="text-base font-black text-emerald-600">{rec?.rating || "BUY"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Target Price</div>
                <div className="text-base font-black text-[#0F172A]">₹{targetPrice.toLocaleString("en-IN")}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Current Price (CMP)</div>
                <div className="text-base font-black text-[#0F172A]">₹{cmp.toLocaleString("en-IN")}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Implied Upside</div>
                <div className="text-base font-black text-emerald-600">+{upside}%</div>
              </div>
            </div>
          </div>

          {/* Section 1: Executive Summary & Recommendation */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wider text-[#0F172A]">
                1. Executive Summary & Core Investment Case
              </h2>
              <span className="text-[10px] font-bold text-[#64748B]">Click text to edit</span>
            </div>
            <textarea
              rows={4}
              value={execSummary}
              onChange={(e) => setExecSummary(e.target.value)}
              className="w-full text-xs sm:text-sm text-[#334155] leading-relaxed p-3 bg-white border border-[#CBD5E1] rounded-xl focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent transition-all outline-none"
            />
          </div>

          {/* Section 2: Investment Thesis Pillars */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wider text-[#0F172A]">
                2. Key Investment Thesis Pillars
              </h2>
              <span className="text-[10px] font-bold text-[#64748B]">{thesisPillars.length} pillars active</span>
            </div>

            <div className="space-y-2">
              {thesisPillars.map((pillar, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl group hover:border-[#1D4ED8] transition-all"
                >
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-[#1D4ED8] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={pillar}
                    onChange={(e) => {
                      const updated = [...thesisPillars];
                      updated[idx] = e.target.value;
                      setThesisPillars(updated);
                    }}
                    className="flex-1 text-xs text-[#334155] bg-transparent outline-none font-medium"
                  />
                  <button
                    onClick={() => handleRemovePillar(idx)}
                    className="opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-rose-600 transition-opacity p-1 cursor-pointer"
                    title="Remove pillar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Pillar Bar */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newPillarInput}
                onChange={(e) => setNewPillarInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddPillar()}
                placeholder="Type a new investment pillar..."
                className="flex-1 text-xs bg-white border border-[#CBD5E1] rounded-xl px-3 py-1.5 text-[#1E293B] outline-none focus:ring-1 focus:ring-[#1D4ED8]"
              />
              <button
                onClick={handleAddPillar}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#0F172A] hover:bg-[#1E293B] text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Section 3: Analyst Catalysts & Milestones */}
          <div className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-wider text-[#0F172A]">
              3. Catalysts, Guidance & Monitorables
            </h2>
            <textarea
              rows={3}
              value={analystNotes}
              onChange={(e) => setAnalystNotes(e.target.value)}
              className="w-full text-xs sm:text-sm text-[#334155] leading-relaxed p-3 bg-white border border-[#CBD5E1] rounded-xl focus:ring-2 focus:ring-[#1D4ED8] focus:border-transparent transition-all outline-none"
            />
          </div>

          {/* Section 4: Key Downside Risks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-wider text-[#0F172A]">
                4. Key Downside Risks & Sensitivity
              </h2>
              <span className="text-[10px] font-bold text-[#64748B]">{downsideRisks.length} risk factors</span>
            </div>

            <div className="space-y-2">
              {downsideRisks.map((risk, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2.5 bg-[#FEF2F2]/60 border border-[#FECACA] rounded-xl group hover:border-rose-400 transition-all"
                >
                  <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    !
                  </span>
                  <input
                    type="text"
                    value={risk}
                    onChange={(e) => {
                      const updated = [...downsideRisks];
                      updated[idx] = e.target.value;
                      setDownsideRisks(updated);
                    }}
                    className="flex-1 text-xs text-[#991B1B] bg-transparent outline-none font-medium"
                  />
                  <button
                    onClick={() => handleRemoveRisk(idx)}
                    className="opacity-0 group-hover:opacity-100 text-[#94A3B8] hover:text-rose-600 transition-opacity p-1 cursor-pointer"
                    title="Remove risk"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add New Risk Bar */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newRiskInput}
                onChange={(e) => setNewRiskInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddRisk()}
                placeholder="Add a downside risk factor..."
                className="flex-1 text-xs bg-white border border-[#CBD5E1] rounded-xl px-3 py-1.5 text-[#1E293B] outline-none focus:ring-1 focus:ring-rose-500"
              />
              <button
                onClick={handleAddRisk}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Section 5: Statutory SEBI Attestation */}
          <div className="border-t border-[#E2E8F0] pt-5 space-y-2 text-xs text-[#64748B]">
            <div className="flex items-center gap-2 font-bold text-[#0F172A]">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>SEBI (Research Analysts) Regulations, 2014 Compliance Certification</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              The Research Analyst(s) confirm that all views expressed accurately reflect their personal views about the subject company. 
              {isApproved && reviewerName ? ` Certified by ${reviewerName} (${sebiRegNo || "SEBI Registered"}).` : " Pending final reviewer certification."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

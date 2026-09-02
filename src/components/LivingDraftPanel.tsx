"use client";

import React, { useState } from "react";
import {
  FileText,
  Sparkles,
  Edit3,
  Save,
  Download,
  ShieldCheck,
  History,
  CheckCircle2,
  AlertCircle,
  Eye,
} from "lucide-react";
import { ReportSection, ReportSectionName } from "@/types/plan4";
import { SectionStore } from "@/lib/report/section-store";

interface LivingDraftPanelProps {
  planId?: string;
  ticker?: string;
  companyName?: string;
  sections?: ReportSection[];
  hasActivePlan?: boolean;
  isSebiCompliant?: boolean;
  sebiScore?: number;
  onExportPdf?: () => void;
}

export function LivingDraftPanel({
  planId = "demo-plan-id",
  ticker,
  companyName,
  sections = [],
  hasActivePlan = false,
  isSebiCompliant = true,
  sebiScore = 100,
  onExportPdf,
}: LivingDraftPanelProps) {
  const [activeSection, setActiveSection] = useState<ReportSectionName>("executive_summary");
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const currentSection = sections.find((s) => s.name === activeSection) ?? sections[0];

  const handleStartEdit = () => {
    if (!currentSection) return;
    setEditedText(currentSection.content);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!currentSection) return;
    currentSection.content = editedText;
    currentSection.lastUpdatedAt = new Date().toISOString();
    SectionStore.saveSectionVersion(planId, currentSection.name, editedText, currentSection.citations, "analyst_steer");
    setIsEditing(false);
  };

  const sectionHistory = SectionStore.getSectionHistory(planId, activeSection);

  return (
    <div className="flex flex-col h-full bg-[#121217] border border-white/[0.08] rounded-2xl overflow-hidden font-sans shadow-xl">
      {/* Draft Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#16161e] border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
          <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-bold text-slate-200 truncate">
              {hasActivePlan && companyName ? `${companyName} (${ticker ?? "EQUITY"})` : "Living Research Report Draft"}
            </h3>
            <p className="text-[10px] text-slate-500 font-medium">
              {hasActivePlan ? "Real-time AI Synthesis & Analyst Review" : "No active research run"}
            </p>
          </div>
        </div>

        {/* SEBI Compliance & PDF Export Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {hasActivePlan && (
            <span
              className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1 border ${
                isSebiCompliant
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  : "bg-amber-500/10 border-amber-500/20 text-amber-400"
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              SEBI: {sebiScore}/100
            </span>
          )}

          {hasActivePlan && (
            <button
              onClick={onExportPdf}
              className="px-2.5 py-1 rounded-xl text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Export PDF
            </button>
          )}
        </div>
      </div>

      {!hasActivePlan || sections.length === 0 ? (
        /* Empty State when no plan is active */
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 font-sans my-auto">
          <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-indigo-400">
            <Sparkles className="w-8 h-8 opacity-70 animate-pulse" />
          </div>
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">No Active Research Plan</h4>
          <p className="text-xs text-slate-500 max-w-[280px] leading-relaxed">
            Enter a research objective in the left panel and launch the agent plan to synthesize the live publication draft here.
          </p>
        </div>
      ) : (
        <>
          {/* Section Tabs Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#111118] px-2 py-1 shrink-0">
            <div className="flex overflow-x-auto gap-1 scrollbar-none py-0.5">
              {sections.map((sec) => (
                <button
                  key={sec.name}
                  onClick={() => {
                    setActiveSection(sec.name);
                    setIsEditing(false);
                    setShowHistory(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize whitespace-nowrap transition-all ${
                    activeSection === sec.name
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                >
                  {sec.name.replace("_", " ")}
                </button>
              ))}
            </div>

            {/* Action Tools */}
            <div className="flex items-center gap-1 pl-2 border-l border-white/5">
              <button
                onClick={() => setShowHistory(!showHistory)}
                title="View Revision History"
                className={`p-1.5 rounded-lg text-slate-400 hover:text-white transition-all ${
                  showHistory ? "bg-white/10 text-white" : "hover:bg-white/5"
                }`}
              >
                <History className="w-3.5 h-3.5" />
              </button>
              {isEditing ? (
                <button
                  onClick={handleSaveEdit}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-600 text-white hover:bg-emerald-500 transition-all flex items-center gap-1"
                >
                  <Save className="w-3 h-3" /> Save
                </button>
              ) : (
                <button
                  onClick={handleStartEdit}
                  title="Edit Section Text"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Section Body */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 text-slate-300 text-sm leading-relaxed scrollbar-thin relative">
            {/* Watermark Notice */}
            <div className="text-[10px] font-bold text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                DRAFT — FOR INTERNAL ANALYST REVIEW & SEBI SIGN-OFF ONLY
              </span>
              <span className="font-mono text-[9px] opacity-75">UNWATERMARKED UPON APPROVAL</span>
            </div>

            {showHistory && (
              <div className="p-3 rounded-xl bg-black/80 border border-indigo-500/30 text-xs space-y-2 font-mono">
                <div className="font-bold text-indigo-300 uppercase tracking-wider text-[10px]">
                  Revision History ({sectionHistory.length} versions)
                </div>
                {sectionHistory.map((ver, idx) => (
                  <div key={ver.versionId} className="p-2 rounded bg-white/5 border border-white/5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{ver.versionId}</span> · <span className="text-slate-400">{ver.author}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">{new Date(ver.updatedAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}

            {currentSection ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h4 className="font-bold text-white capitalize text-base">{currentSection.name.replace("_", " ")}</h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Updated {new Date(currentSection.lastUpdatedAt).toLocaleTimeString()}
                  </span>
                </div>

                {isEditing ? (
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    rows={10}
                    className="w-full p-3 bg-black/70 border border-indigo-500/50 rounded-xl text-slate-200 font-sans text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                  />
                ) : (
                  <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-slate-200 leading-relaxed font-sans whitespace-pre-wrap text-xs">
                    {currentSection.content}
                  </div>
                )}

                {/* Citations / Provenance Badges */}
                {currentSection.citations && currentSection.citations.length > 0 && (
                  <div className="pt-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Source Citations & Provenance</div>
                    <div className="flex flex-wrap gap-1.5">
                      {currentSection.citations.map((cite, i) => (
                        <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono">
                          ref: {cite}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-slate-500 text-xs italic text-center py-12">Select a section to view live draft.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

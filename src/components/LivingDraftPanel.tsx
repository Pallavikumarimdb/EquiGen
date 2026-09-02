"use client";

import React, { useState } from "react";
import { FileText, Sparkles, AlertCircle } from "lucide-react";
import { ReportSection, ReportSectionName } from "@/types/plan4";

interface LivingDraftPanelProps {
  ticker?: string;
  companyName?: string;
  sections?: ReportSection[];
  hasActivePlan?: boolean;
}

export function LivingDraftPanel({
  ticker,
  companyName,
  sections = [],
  hasActivePlan = false,
}: LivingDraftPanelProps) {
  const [activeSection, setActiveSection] = useState<ReportSectionName>("executive_summary");

  const currentSection = sections.find((s) => s.name === activeSection) ?? sections[0];

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
              {hasActivePlan ? "Real-time AI Synthesis" : "No active research run"}
            </p>
          </div>
        </div>

        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 ${
          hasActivePlan
            ? "bg-indigo-500/10 border border-indigo-500/20 text-indigo-300"
            : "bg-white/5 border border-white/10 text-slate-500"
        }`}>
          {hasActivePlan ? "Live Synthesis" : "Standby"}
        </span>
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
          {/* Section Tabs */}
          <div className="flex border-b border-white/[0.06] bg-[#111118] overflow-x-auto p-1.5 gap-1 shrink-0 scrollbar-none">
            {sections.map((sec) => (
              <button
                key={sec.name}
                onClick={() => setActiveSection(sec.name)}
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

          {/* Section Content Display */}
          <div className="flex-1 p-5 overflow-y-auto space-y-4 text-slate-300 text-sm leading-relaxed scrollbar-thin">
            {currentSection ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <h4 className="font-bold text-white capitalize text-base">{currentSection.name.replace("_", " ")}</h4>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Updated {new Date(currentSection.lastUpdatedAt).toLocaleTimeString()}
                  </span>
                </div>

                <div className="bg-black/40 p-4 rounded-xl border border-white/5 text-slate-200 leading-relaxed font-sans whitespace-pre-wrap">
                  {currentSection.content}
                </div>

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

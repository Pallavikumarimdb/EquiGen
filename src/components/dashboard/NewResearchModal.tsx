"use client";

import React, { useState, useRef } from "react";
import {
  X,
  Sparkles,
  Bot,
  Upload,
  FileText,
  FileBadge2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface LaunchResearchParams {
  companyName: string;
  ticker?: string;
  depth?: "quick" | "standard" | "deep";
  promptGoal?: string;
  file?: File | null;
}

interface NewResearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchResearch: (params: LaunchResearchParams) => void;
}

export function NewResearchModal({
  isOpen,
  onClose,
  onLaunchResearch,
}: NewResearchModalProps) {
  // Autonomous swarm (always runs — source of truth)
  const [targetCompany, setTargetCompany] = useState("");
  const [targetTicker, setTargetTicker] = useState("");
  const [researchDepth, setResearchDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [customFocus, setCustomFocus] = useState("");

  // Optional PDF upload (Annual Report / DRHP)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const validateAndSetFile = (file: File) => {
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setUploadError("Only PDF files are supported (Annual Report or DRHP).");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setUploadError("File exceeds the 100 MB limit. Please upload a smaller document.");
      return;
    }
    setSelectedFile(file);
    setIsUploadOpen(true);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
  };

  /**
   * Submit handler — Autonomous AI Swarm is always the source of truth.
   *
   * If the user attached an Annual Report / DRHP PDF, it is passed into the unified
   * research pipeline as supplemental context (enriching financial model, synthesis & chat).
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCompany.trim()) return;

    const fullGoal = customFocus.trim()
      ? `Initiation of coverage on ${targetCompany.trim()}${targetTicker ? ` (${targetTicker.trim()})` : ""} — ${customFocus.trim()}`
      : `Initiation of coverage on ${targetCompany.trim()}${targetTicker ? ` (${targetTicker.trim()})` : ""} — 5-year DCF, peer multiples, and SEBI compliance audit`;

    // Launch unified autonomous research with optional attached PDF filing
    onLaunchResearch({
      companyName: targetCompany.trim(),
      ticker: targetTicker.trim() || undefined,
      depth: researchDepth,
      promptGoal: fullGoal,
      file: selectedFile,
    });

    onClose();
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFileDrop(e); }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn"
    >
      <div className="relative w-full max-w-2xl bg-[#181614] border border-[#2E2B24] rounded-2xl shadow-2xl overflow-hidden text-white font-sans">

        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2E2B24] bg-[#141311]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-md shadow-amber-500/20">
              <Sparkles className="w-4 h-4 text-black stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Initialize Research Workspace</h2>
              <p className="text-[11px] text-[#8C877D]">
                Autonomous AI Swarm · optionally enrich with an Annual Report or DRHP PDF
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8C877D] hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div className="p-6 max-h-[80vh] overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Section 1: Autonomous AI Swarm ── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-amber-400/20 flex items-center justify-center shrink-0">
                  <Bot className="w-3 h-3 text-amber-400" />
                </div>
                <span className="text-[11px] font-bold text-amber-300/80 uppercase tracking-wider">
                  Autonomous AI Swarm (Live BSE / NSE)
                </span>
              </div>

              <div className="p-3 bg-amber-400/5 border border-amber-400/20 rounded-xl flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  The multi-agent swarm scrapes live exchange disclosures from{" "}
                  <strong>BSE &amp; NSE India</strong>, builds a 3-tier DCF model, runs peer
                  benchmarking, and audits statutory SEBI disclosures. Optionally attach an
                  Annual Report or DRHP below — extracted data feeds directly into the swarm.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
                    Target Company Name <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tata Motors, Eternal Limited, ICICI Bank"
                    value={targetCompany}
                    onChange={(e) => setTargetCompany(e.target.value)}
                    className="w-full bg-[#1F1D19] border border-[#2E2B24] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#6C675E] focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
                    Ticker (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="TATAMOTORS"
                    value={targetTicker}
                    onChange={(e) => setTargetTicker(e.target.value.toUpperCase())}
                    className="w-full bg-[#1F1D19] border border-[#2E2B24] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#6C675E] focus:outline-none focus:border-amber-400 uppercase font-mono"
                  />
                </div>
              </div>

              {/* Research Depth */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
                  Analysis Depth &amp; Rigor
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: "quick", title: "Quick Teardown", time: "~30s", desc: "Snapshot DCF & key multiples" },
                    { id: "standard", title: "Standard Coverage", time: "~2 mins", desc: "5-Yr DCF, peer comps & filings" },
                    { id: "deep", title: "Deep Forensic Note", time: "~4 mins", desc: "Concalls, audit & SEBI check" },
                  ].map((d) => (
                    <div
                      key={d.id}
                      onClick={() => setResearchDepth(d.id as "quick" | "standard" | "deep")}
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                        researchDepth === d.id
                          ? "bg-amber-400/10 border-amber-400"
                          : "bg-[#1F1D19] border-[#2E2B24] hover:border-[#3E3B34]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{d.title}</span>
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-black/40 text-amber-300">{d.time}</span>
                      </div>
                      <p className="text-[10px] mt-1 text-[#8C877D] leading-tight">{d.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Focus */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
                  Specific Focus / Variant Hypothesis (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Compare EV segment margin expansion vs M&M; assess debt repayment schedule"
                  value={customFocus}
                  onChange={(e) => setCustomFocus(e.target.value)}
                  className="w-full bg-[#1F1D19] border border-[#2E2B24] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#6C675E] focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            {/* ── Divider ── */}
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-[#2E2B24]" />
              <span className="text-[9px] font-semibold text-[#4A4740] uppercase tracking-widest whitespace-nowrap">
                optional pdf enrichment
              </span>
              <div className="flex-1 h-px bg-[#2E2B24]" />
            </div>

            {/* ── Section 2: Annual Report / DRHP Upload (collapsible) ── */}
            <div className="space-y-3">
              {/* Collapsible toggle */}
              <button
                type="button"
                onClick={() => setIsUploadOpen((v) => !v)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 bg-[#1C1A17] border border-[#2E2B24] rounded-xl hover:border-[#3E3B34] transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${selectedFile ? "bg-emerald-500/20" : "bg-[#262420]"}`}>
                    <FileBadge2 className={`w-3 h-3 ${selectedFile ? "text-emerald-400" : "text-[#8C877D]"}`} />
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-bold text-white">Attach Annual Report or DRHP PDF</span>
                    {selectedFile ? (
                      <span className="ml-2 text-[10px] text-emerald-400 font-semibold">
                        {selectedFile.name} &middot; {(selectedFile.size / 1024 / 1024).toFixed(1)} MB ✓
                      </span>
                    ) : (
                      <span className="ml-2 text-[10px] text-[#5C5750]">
                        Optional — structured filing data enriches the swarm
                      </span>
                    )}
                  </div>
                </div>
                {isUploadOpen
                  ? <ChevronUp className="w-3.5 h-3.5 text-[#8C877D] shrink-0" />
                  : <ChevronDown className="w-3.5 h-3.5 text-[#8C877D] shrink-0" />
                }
              </button>

              {/* Drop-zone (shown when expanded) */}
              {isUploadOpen && (
                <div
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); }}
                  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); }}
                  onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFileDrop(e); }}
                  onClick={() => fileInputRef.current?.click()}
                  data-dropzone="true"
                  className={`p-5 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                    isDragActive
                      ? "border-amber-400 bg-amber-400/5"
                      : selectedFile
                      ? "border-emerald-500/50 bg-emerald-500/5"
                      : "border-[#2E2B24] hover:border-[#3E3B34] bg-[#1F1D19]"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) validateAndSetFile(e.target.files[0]);
                      e.target.value = "";
                    }}
                  />

                  {uploadError && (
                    <div className="mb-3 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold">
                      {uploadError}
                    </div>
                  )}

                  {selectedFile ? (
                    <div className="flex flex-col items-center">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
                        <FileText className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white">{selectedFile.name}</span>
                      <span className="text-[10px] text-emerald-400 mt-0.5 font-medium">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to parse
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); setUploadError(null); }}
                        className="mt-2 text-[10px] text-[#8C877D] hover:text-rose-400 underline underline-offset-2 transition-colors"
                      >
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-9 h-9 rounded-xl bg-[#262420] text-[#8C877D] flex items-center justify-center mb-2">
                        <Upload className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-bold text-white">Drop Annual Report or DRHP PDF here</span>
                      <span className="text-[10px] text-[#8C877D] mt-1">or click to browse · max 100 MB</span>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="flex items-center gap-1 text-[10px] text-[#6C675E]">
                          <FileText className="w-3 h-3" /> Annual Report
                        </span>
                        <span className="w-px h-3 bg-[#3E3B34]" />
                        <span className="flex items-center gap-1 text-[10px] text-[#6C675E]">
                          <FileBadge2 className="w-3 h-3" /> DRHP / Prospectus
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── CTA Row ── */}
            <div className="pt-1 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8C877D] hover:text-white transition-all"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={!targetCompany.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-black text-xs font-bold rounded-xl shadow-lg shadow-amber-500/10 active:scale-95 transition-all"
              >
                <Bot className="w-4 h-4 text-black stroke-[2.5]" />
                <span>
                  {selectedFile
                    ? "Deploy Swarm + Parse Document"
                    : "Deploy Autonomous Research Swarm"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

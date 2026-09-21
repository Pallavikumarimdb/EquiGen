"use client";

import React, { useState, useRef } from "react";
import {
  X,
  Sparkles,
  Bot,
  Upload,
  FileText,
  Building2,
  ChevronRight,
  ShieldCheck,
  Zap,
  Clock,
  ArrowRight,
} from "lucide-react";

interface NewResearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchAutonomous: (companyName: string, depth: "quick" | "standard" | "deep", promptGoal?: string) => void;
  onLaunchUpload: (file: File, companyName: string) => void;
}

export function NewResearchModal({
  isOpen,
  onClose,
  onLaunchAutonomous,
  onLaunchUpload,
}: NewResearchModalProps) {
  const [activeTab, setActiveTab] = useState<"autonomous" | "upload">("autonomous");

  // Autonomous state
  const [targetCompany, setTargetCompany] = useState("");
  const [targetTicker, setTargetTicker] = useState("");
  const [researchDepth, setResearchDepth] = useState<"quick" | "standard" | "deep">("standard");
  const [customFocus, setCustomFocus] = useState("");

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadCompanyName, setUploadCompanyName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const validateAndSetFile = (file: File) => {
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setUploadError("Only official PDF files are supported.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError("File exceeds the 50MB size limit. Please upload a smaller document.");
      return;
    }
    setSelectedFile(file);
    if (!uploadCompanyName) {
      const guessedName = file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
      setUploadCompanyName(guessedName);
    }
  };

  const handleAutonomousSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCompany.trim()) return;
    const fullGoal = customFocus.trim()
      ? `Initiation of coverage on ${targetCompany.trim()}${targetTicker ? ` (${targetTicker.trim()})` : ""} — ${customFocus.trim()}`
      : `Initiation of coverage on ${targetCompany.trim()}${targetTicker ? ` (${targetTicker.trim()})` : ""} — 5-year DCF, peer multiples, and SEBI compliance audit`;
    onLaunchAutonomous(targetCompany.trim(), researchDepth, fullGoal);
    onClose();
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    onLaunchUpload(selectedFile, uploadCompanyName.trim());
    onClose();
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#181614] border border-[#2E2B24] rounded-2xl shadow-2xl overflow-hidden text-white font-sans">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2E2B24] bg-[#141311]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black font-bold shadow-md shadow-amber-500/20">
              <Sparkles className="w-4 h-4 text-black stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-white">Initialize Research Workspace</h2>
              <p className="text-[11px] text-[#8C877D]">Select your execution engine to analyze a company</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8C877D] hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Engine Switcher Tabs */}
        <div className="px-6 pt-4 pb-2 bg-[#141311]/50">
          <div className="grid grid-cols-2 p-1 bg-[#1C1A17] border border-[#2E2B24] rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("autonomous")}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${
                activeTab === "autonomous"
                  ? "bg-amber-400 text-black font-bold shadow-sm"
                  : "text-[#8C877D] hover:text-white"
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>Autonomous AI Swarm (Live BSE/NSE)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${
                activeTab === "upload"
                  ? "bg-amber-400 text-black font-bold shadow-sm"
                  : "text-[#8C877D] hover:text-white"
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Assisted Document Upload (PDF)</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {activeTab === "autonomous" ? (
            /* ── Tab 1: Autonomous AI Swarm ────────────────────────── */
            <form onSubmit={handleAutonomousSubmit} className="space-y-4">
              <div className="p-3 bg-amber-400/5 border border-amber-400/20 rounded-xl flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  The multi-agent swarm will automatically scrape live exchange disclosures from <strong>BSE & NSE India</strong>, extract financial statements, build a 3-tier DCF valuation model, conduct peer benchmarking, and audit statutory SEBI disclosures.
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
                    Target Company Name *
                  </label>
                  <input
                    type="text"
                    required
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
                    placeholder="e.g. TATAMOTORS"
                    value={targetTicker}
                    onChange={(e) => setTargetTicker(e.target.value.toUpperCase())}
                    className="w-full bg-[#1F1D19] border border-[#2E2B24] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#6C675E] focus:outline-none focus:border-amber-400 uppercase font-mono"
                  />
                </div>
              </div>

              {/* Research Depth Selection */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
                  Analysis Depth & Rigor
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
                          ? "bg-amber-400/10 border-amber-400 text-white"
                          : "bg-[#1F1D19] border-[#2E2B24] text-[#8C877D] hover:border-[#3E3B34]"
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

              {/* Custom Thesis / Focus Areas */}
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

              {/* Submit CTA */}
              <div className="pt-2 flex items-center justify-end gap-3">
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
                  <Sparkles className="w-4 h-4 text-black stroke-[2.5]" />
                  <span>Deploy Autonomous Research Swarm</span>
                </button>
              </div>
            </form>
          ) : (
            /* ── Tab 2: Assisted Document Upload ─────────────────────── */
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={() => setIsDragActive(false)}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
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
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      validateAndSetFile(e.target.files[0]);
                    }
                  }}
                />

                {uploadError && (
                  <div className="mb-3 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-semibold">
                    {uploadError}
                  </div>
                )}

                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
                      <FileText className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-white">{selectedFile.name}</span>
                    <span className="text-[10px] text-emerald-400 mt-0.5 font-medium">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · Ready to parse
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-10 h-10 rounded-xl bg-[#262420] text-[#8C877D] flex items-center justify-center mb-2">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-white">Drop Annual Report or DRHP PDF here</span>
                    <span className="text-[10px] text-[#8C877D] mt-1">or click to browse from device (max 100MB)</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
                  Company Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. L&T Technology Services Limited"
                  value={uploadCompanyName}
                  onChange={(e) => setUploadCompanyName(e.target.value)}
                  className="w-full bg-[#1F1D19] border border-[#2E2B24] rounded-xl px-3.5 py-2 text-xs text-white placeholder-[#6C675E] focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Submit CTA */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8C877D] hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedFile}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 disabled:opacity-50 text-black text-xs font-bold rounded-xl shadow-lg shadow-amber-500/10 active:scale-95 transition-all"
                >
                  <FileText className="w-4 h-4 text-black" />
                  <span>Parse Document & Extract Financials</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

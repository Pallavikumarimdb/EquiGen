"use client";

import React, { useState, useEffect } from "react";
import { X, ShieldCheck, AlertTriangle, Loader2 } from "lucide-react";

interface SignoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportId: string | null;
  companyName: string;
  defaultReviewerName: string;
  defaultSebiRegNo: string;
  onSignoffSuccess: (reviewerName: string, sebiRegNo: string) => void;
}

export function SignoffModal({
  isOpen,
  onClose,
  reportId,
  companyName,
  defaultReviewerName,
  defaultSebiRegNo,
  onSignoffSuccess,
}: SignoffModalProps) {
  const [reviewerName, setReviewerName] = useState(defaultReviewerName || "");
  const [sebiRegNo, setSebiRegNo] = useState(defaultSebiRegNo || "");
  const [certifiedConflictFree, setCertifiedConflictFree] = useState(false);
  const [certifiedAnalysisAccuracy, setCertifiedAnalysisAccuracy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (defaultReviewerName) {
      setReviewerName(defaultReviewerName);
    }
  }, [defaultReviewerName]);

  useEffect(() => {
    if (defaultSebiRegNo) {
      setSebiRegNo(defaultSebiRegNo);
    }
  }, [defaultSebiRegNo]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportId) return;
    if (!certifiedConflictFree || !certifiedAnalysisAccuracy) {
      setError("You must certify compliance with all statutory disclosures.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          reviewerName,
          sebiRegNo,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to sign off report");
      }

      onSignoffSuccess(reviewerName, sebiRegNo);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#181614] border border-[#2E2B24] rounded-2xl shadow-2xl overflow-hidden text-white font-sans">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2E2B24] bg-[#141311]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-white">SEBI Statutory Sign-Off</h3>
              <p className="text-[11px] text-[#8C877D]">SEBI (Research Analysts) Regulations, 2014</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8C877D] hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300">
            Sign-off for <strong>{companyName}</strong> will digitally stamp your verified SEBI credentials and lock the research note for client distribution.
          </div>

          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
              Reviewer / Analyst Legal Name *
            </label>
            <input
              type="text"
              required
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="w-full bg-[#1F1D19] border border-[#2E2B24] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-bold text-[#A6A095] uppercase tracking-wider">
              SEBI Registration Number *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. INH200000123"
              value={sebiRegNo}
              onChange={(e) => setSebiRegNo(e.target.value)}
              className="w-full bg-[#1F1D19] border border-[#2E2B24] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500 uppercase"
            />
          </div>

          {/* Regulatory Checkboxes */}
          <div className="space-y-2.5 pt-2 border-t border-[#2E2B24]">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#E0DDD5]">
              <input
                type="checkbox"
                checked={certifiedConflictFree}
                onChange={(e) => setCertifiedConflictFree(e.target.checked)}
                className="mt-0.5 accent-emerald-500 w-4 h-4 rounded"
              />
              <span>
                I certify that I hold no financial interest or material conflict of interest in <strong>{companyName}</strong> under SEBI RA Reg 19(5).
              </span>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#E0DDD5]">
              <input
                type="checkbox"
                checked={certifiedAnalysisAccuracy}
                onChange={(e) => setCertifiedAnalysisAccuracy(e.target.checked)}
                className="mt-0.5 accent-emerald-500 w-4 h-4 rounded"
              />
              <span>
                I have audited the financial models, DCF valuation assumptions, and BSE/NSE disclosures for mathematical integrity.
              </span>
            </label>
          </div>

          <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#2E2B24]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8C877D] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !certifiedConflictFree || !certifiedAnalysisAccuracy}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/30 transition-all active:scale-95"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              <span>{loading ? "Stamping..." : "Approve & Certify Note"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

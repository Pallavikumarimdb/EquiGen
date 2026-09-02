"use client";

import React, { useState } from "react";
import {
  Target,
  Loader2,
  ChevronRight,
  DollarSign,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Search,
  BarChart3,
  FileText,
  Shield,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { ResearchPlanRecord, MilestonePlan, ResearchDepth } from "@/types/plan4";

const MILESTONE_ICONS: Record<string, React.ReactNode> = {
  fetch_documents:       <FileText className="w-4 h-4 text-blue-400" />,
  extract_financials:    <BarChart3 className="w-4 h-4 text-emerald-400" />,
  build_financial_model: <Zap className="w-4 h-4 text-amber-400" />,
  peer_benchmark:        <Search className="w-4 h-4 text-cyan-400" />,
  synthesise:            <BookOpen className="w-4 h-4 text-violet-400" />,
  compliance_audit:      <Shield className="w-4 h-4 text-rose-400" />,
};

const DEPTH_OPTIONS: { value: ResearchDepth; label: string; desc: string; badgeColor: string }[] = [
  {
    value: "quick",
    label: "Quick",
    desc: "~10 min · $0.45 · 2Y Filings, EV/EBITDA",
    badgeColor: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  },
  {
    value: "standard",
    label: "Standard",
    desc: "~25 min · $1.10 · 4Y Filings, DCF, Concall",
    badgeColor: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  },
  {
    value: "deep",
    label: "Deep Dive",
    desc: "~55 min · $2.40 · 6Y Filings, Monte Carlo, DRHP",
    badgeColor: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },
];

interface GoalTerminalProps {
  sessionId: string;
  onPlanApproved: (plan: ResearchPlanRecord) => void;
}

export function GoalTerminal({ sessionId, onPlanApproved }: GoalTerminalProps) {
  const [goalText, setGoalText] = useState("");
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [phase, setPhase] = useState<"input" | "planning" | "review" | "approved">("input");
  const [plan, setPlan] = useState<ResearchPlanRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const handleGeneratePlan = async () => {
    if (!goalText.trim() || !ticker.trim() || !companyName.trim()) return;
    setPhase("planning");
    setError(null);
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({ goalText, ticker: ticker.toUpperCase(), companyName, depth, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to create plan.");
      setPlan(data.plan as ResearchPlanRecord);
      setPhase("review");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("input");
    }
  };

  const handleApprove = async () => {
    if (!plan) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/agent/plan/${plan.id}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({ actorId: "analyst" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to approve plan.");
      setPlan(data.plan as ResearchPlanRecord);
      setPhase("approved");
      onPlanApproved(data.plan as ResearchPlanRecord);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed.");
    } finally {
      setApproving(false);
    }
  };

  const handleEdit = () => {
    setPhase("input");
    setPlan(null);
  };

  const totalCost = plan?.costEstimate ?? 0;
  const totalMinutes = plan ? Math.ceil((plan.latencyEstS ?? 0) / 60) : 0;

  return (
    <div className="flex flex-col h-full bg-[#121217] border border-white/[0.08] rounded-2xl p-5 font-sans overflow-y-auto scrollbar-thin shadow-2xl">
      {/* Terminal Title Header */}
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.06] shrink-0">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/20 text-white shrink-0">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
            Autonomous Research Goal
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-mono font-semibold">
              Devin Agent
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Specify research intent. EquiGen decomposes goals into execution milestones.
          </p>
        </div>
      </div>

      {/* ── Input & Planning Phase ── */}
      {(phase === "input" || phase === "planning") && (
        <div className="flex flex-col space-y-4">
          {/* Ticker + Company Name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                NSE/BSE Ticker
              </label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="TATAMOTORS"
                disabled={phase === "planning"}
                className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs font-mono font-bold text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Company Name
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Tata Motors Limited"
                disabled={phase === "planning"}
                className="w-full px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs font-medium text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all"
              />
            </div>
          </div>

          {/* Goal Description Textarea */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
              Research Objective & Scope
            </label>
            <textarea
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              disabled={phase === "planning"}
              rows={4}
              placeholder='e.g., "Initiation of coverage on Tata Motors — 5-year DCF, compare EV & ICE margins vs M&M, fetch Q3 concall guidance on margin recovery."'
              className="w-full p-3 bg-black/50 border border-white/10 rounded-xl text-xs font-sans text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all leading-relaxed resize-none"
            />
          </div>

          {/* Depth Selector Pills */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Research Depth
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DEPTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDepth(opt.value)}
                  disabled={phase === "planning"}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    depth === opt.value
                      ? `${opt.badgeColor} shadow-md`
                      : "border-white/5 bg-black/30 text-slate-400 hover:border-white/10 hover:text-slate-200"
                  }`}
                >
                  <div className="font-bold text-xs">{opt.label}</div>
                  <div className="text-[10px] opacity-75 mt-1 leading-snug">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleGeneratePlan}
            disabled={phase === "planning" || !goalText.trim() || !ticker.trim() || !companyName.trim()}
            className="w-full py-3 px-4 rounded-xl font-bold text-xs text-white transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #6366f1, #3b82f6)" }}
          >
            {phase === "planning" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Decomposing Goal into Milestones…</>
            ) : (
              <><Sparkles className="w-4 h-4" /> Generate Research Execution Plan</>
            )}
          </button>
        </div>
      )}

      {/* ── Review Phase ── */}
      {phase === "review" && plan && (
        <div className="flex flex-col space-y-4">
          {/* Plan Summary Box */}
          <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
            <div className="font-bold text-indigo-300 mb-1">
              Research Plan: {companyName} ({ticker})
            </div>
            <div className="text-slate-300 leading-relaxed font-sans">{plan.goalText}</div>
          </div>

          {/* Time & Cost Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">Estimated Cost</div>
                <div className="text-sm font-bold text-emerald-400">${totalCost.toFixed(3)}</div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-black/40 border border-white/5 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase">Estimated Time</div>
                <div className="text-sm font-bold text-blue-400">~{totalMinutes} min</div>
              </div>
            </div>
          </div>

          {/* Milestones Checklist */}
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Execution Milestones ({plan.milestones.length})
            </div>
            <div className="space-y-2">
              {plan.milestones.map((m: MilestonePlan, idx: number) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-black/40 border border-white/5 text-xs"
                >
                  <div className="mt-0.5 shrink-0">{MILESTONE_ICONS[m.type] ?? <ChevronRight className="w-4 h-4 text-slate-400" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-200 flex items-center gap-2">
                      <span className="text-slate-500 text-[10px] font-mono">{idx + 1}.</span>
                      <span>{m.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{m.description}</p>
                  </div>
                  <div className="text-right shrink-0 text-[10px] font-mono">
                    <div className="text-slate-500">~{m.estimatedMinutes}m</div>
                    <div className="text-emerald-400">${m.estimatedCostUsd.toFixed(3)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleEdit}
              className="flex-1 py-2.5 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-all"
            >
              Edit Scope
            </button>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex-[2] py-2.5 px-3 rounded-xl font-bold text-xs text-white transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
              style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}
            >
              {approving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Approving…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Approve & Launch Plan</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Approved Phase ── */}
      {phase === "approved" && (
        <div className="flex flex-col items-center justify-center p-6 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3 my-auto">
          <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          <div>
            <h3 className="text-sm font-bold text-white">Research Plan Approved & Launched</h3>
            <p className="text-xs text-slate-400 mt-1">
              Subagent Swarm is executing tasks. Monitor real-time progress in the Trajectory Stream panel →
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

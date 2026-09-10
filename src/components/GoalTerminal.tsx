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
  activePlanId?: string | null;
  activePlan?: ResearchPlanRecord | null;
  onPlanApproved: (plan: ResearchPlanRecord) => void;
  onNewGoal?: () => void;
}

export function GoalTerminal({ sessionId, activePlanId, activePlan, onPlanApproved, onNewGoal }: GoalTerminalProps) {
  const [goalText, setGoalText] = useState("");
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [phase, setPhase] = useState<"input" | "planning" | "review" | "approved">("input");
  const [plan, setPlan] = useState<ResearchPlanRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const [completedMilestoneIds, setCompletedMilestoneIds] = useState<string[]>([]);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [researchQuality, setResearchQuality] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<Record<string, { isLive?: boolean; count?: number; found?: boolean; isDerivedFromRealData?: boolean; source?: string; quotesFound?: number }> | null>(null);
  const [modelFallback, setModelFallback] = useState<boolean | null>(null);

  // Sync state when activePlan or activePlanId changes
  React.useEffect(() => {
    if (activePlan) {
      setPlan(activePlan);
      setPhase("approved");
      if (activePlan.status === "completed") {
        setActiveStepIdx(6);
      }
    } else if (!activePlanId) {
      setGoalText("");
      setTicker("");
      setCompanyName("");
      setDepth("standard");
      setPhase("input");
      setPlan(null);
      setError(null);
    }
  }, [activePlan, activePlanId]);

  // Subscribe to real-time SSE stream for live milestone progress checkmarks
  React.useEffect(() => {
    const planIdToUse = plan?.id || activePlanId;
    if (!planIdToUse || planIdToUse === "demo-plan-id") return;

    const eventSource = new EventSource(`/api/agent/stream?planId=${encodeURIComponent(planIdToUse)}`);

    eventSource.addEventListener("subagent_start", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const payload = parsed?.data || parsed;
        if (typeof payload?.stepNum === "number") {
          setActiveStepIdx(payload.stepNum - 1);
        } else if (parsed?.milestoneRef) {
          const mNum = parseInt(String(parsed.milestoneRef).replace(/\D/g, ""), 10);
          if (!isNaN(mNum)) setActiveStepIdx(mNum - 1);
        }
      } catch {}
    });

    eventSource.addEventListener("milestone_done", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const payload = parsed?.data || parsed;
        const mRef = payload?.milestoneRef || parsed?.milestoneRef;
        if (mRef) {
          setCompletedMilestoneIds((prev) => Array.from(new Set([...prev, mRef])));
        }
        if (typeof payload?.stepNum === "number") {
          setActiveStepIdx(payload.stepNum);
        }
      } catch {}
    });

    eventSource.addEventListener("plan_complete", (e: MessageEvent) => {
      setPlan((prev) => (prev ? { ...prev, status: "completed" } : prev));
      setActiveStepIdx(6);
      try {
        const parsed = JSON.parse(e.data);
        const payload = parsed?.data || parsed;
        if (payload?.researchQuality) setResearchQuality(payload.researchQuality);
        if (payload?.dataSources) setDataSources(payload.dataSources);
        if (typeof payload?.modelFallback === "boolean") setModelFallback(payload.modelFallback);
      } catch {}
    });

    return () => {
      eventSource.close();
    };
  }, [plan?.id, activePlanId]);

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

      // Kick off background execution via MasterOrchestrator
      fetch("/api/agent/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({ planId: plan.id }),
      }).catch((err) => console.warn("[GoalTerminal] Failed to trigger plan execution:", err));

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
    <div className="flex flex-col h-full bg-white border border-[#E3DFD5] rounded-2xl p-5 font-sans overflow-y-auto shadow-sm">
      {/* Terminal Title Header */}
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-[#E2DFD6] shrink-0">
        <div className="p-2.5 rounded-xl bg-[#1A1917] text-white shrink-0 shadow-sm">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-[#1A1917] tracking-wide flex items-center gap-2">
            Autonomous Research Goal
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#E8F0FE] border border-[#D2E3FC] text-[#1A73E8] font-mono font-bold">
              EquiGen Agent
            </span>
          </h2>
          <p className="text-xs text-[#59554A] mt-0.5">
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
              <label className="block text-[10px] font-bold text-[#383530] uppercase tracking-wider mb-1.5">
                NSE/BSE Ticker
              </label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="TATAMOTORS"
                disabled={phase === "planning"}
                className="w-full px-3 py-2.5 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl text-xs font-mono font-bold text-[#1A1917] placeholder-[#7A7568] focus:outline-none focus:border-[#1A1917] transition-all"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] font-bold text-[#383530] uppercase tracking-wider mb-1.5">
                Company Name
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Tata Motors Limited"
                disabled={phase === "planning"}
                className="w-full px-3 py-2.5 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl text-xs font-medium text-[#1A1917] placeholder-[#7A7568] focus:outline-none focus:border-[#1A1917] transition-all"
              />
            </div>
          </div>

          {/* Goal Description Textarea */}
          <div>
            <label className="block text-[10px] font-bold text-[#383530] uppercase tracking-wider mb-1.5">
              Research Objective & Scope
            </label>
            <textarea
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              disabled={phase === "planning"}
              rows={4}
              placeholder='e.g., "Initiation of coverage on Tata Motors — 5-year DCF, compare EV & ICE margins vs M&M, fetch Q3 concall guidance on margin recovery."'
              className="w-full p-3.5 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl text-xs font-sans text-[#1A1917] placeholder-[#7A7568] focus:outline-none focus:border-[#1A1917] transition-all leading-relaxed resize-none font-medium"
            />
          </div>

          {/* Depth Selector Pills */}
          <div>
            <label className="block text-[10px] font-bold text-[#383530] uppercase tracking-wider mb-2">
              Research Depth
            </label>
            <div className="grid grid-cols-3 gap-2">
              {DEPTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDepth(opt.value)}
                  disabled={phase === "planning"}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    depth === opt.value
                      ? "bg-[#1A1917] border-[#1A1917] text-white shadow-md font-bold"
                      : "border-[#E3DFD5] bg-[#FAF8F5] text-[#383530] hover:border-[#1A1917] hover:text-[#1A1917]"
                  }`}
                >
                  <div className="font-bold text-xs">{opt.label}</div>
                  <div className={`text-[10px] mt-1 leading-snug ${depth === opt.value ? "text-slate-300" : "text-[#59554A]"}`}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FEF7E0] border border-[#FDE293] text-[#B06000] text-xs font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-[#B06000]" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleGeneratePlan}
            disabled={phase === "planning" || !goalText.trim() || !ticker.trim() || !companyName.trim()}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 bg-[#1A1917] hover:bg-[#2C2A26] cursor-pointer"
          >
            {phase === "planning" ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Decomposing Goal into Milestones…</>
            ) : (
              <><Sparkles className="w-4 h-4 text-amber-400" /> Generate Research Execution Plan</>
            )}
          </button>
        </div>
      )}

      {/* ── Review Phase ── */}
      {phase === "review" && plan && (
        <div className="flex flex-col space-y-4">
          {/* Plan Summary Box */}
          <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] text-xs">
            <div className="font-bold text-[#1A1917] mb-1">
              Research Plan: {companyName} ({ticker})
            </div>
            <div className="text-[#383530] leading-relaxed font-sans font-medium">{plan.goalText}</div>
          </div>

          {/* Time & Cost Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#E6F4EA] border border-[#CEEAD6] text-[#137333]">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#59554A] uppercase">Estimated Cost</div>
                <div className="text-sm font-bold text-[#137333]">${totalCost.toFixed(3)}</div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#E8F0FE] border border-[#D2E3FC] text-[#1A73E8]">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#59554A] uppercase">Estimated Time</div>
                <div className="text-sm font-bold text-[#1A73E8]">~{totalMinutes} min</div>
              </div>
            </div>
          </div>

          {/* Milestones Checklist */}
          <div>
            <div className="text-[10px] font-bold text-[#383530] uppercase tracking-wider mb-2">
              Execution Milestones ({plan.milestones.length})
            </div>
            <div className="space-y-2">
              {plan.milestones.map((m: MilestonePlan, idx: number) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] text-xs"
                >
                  <div className="mt-0.5 shrink-0">{MILESTONE_ICONS[m.type] ?? <ChevronRight className="w-4 h-4 text-[#59554A]" />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[#1A1917] flex items-center gap-2">
                      <span className="text-[#59554A] text-[10px] font-mono">{idx + 1}.</span>
                      <span>{m.label}</span>
                    </div>
                    <p className="text-[11px] text-[#59554A] mt-0.5 leading-snug font-medium">{m.description}</p>
                  </div>
                  <div className="text-right shrink-0 text-[10px] font-mono">
                    <div className="text-[#59554A]">~{m.estimatedMinutes}m</div>
                    <div className="text-[#137333] font-bold">${m.estimatedCostUsd.toFixed(3)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleEdit}
              className="flex-1 py-2.5 px-3 rounded-xl border border-[#E3DFD5] bg-[#FAF8F5] hover:bg-[#EFECE6] text-[#1A1917] font-bold text-xs transition-all cursor-pointer"
            >
              Edit Scope
            </button>
            <button
              onClick={handleApprove}
              disabled={approving}
              className="flex-[2] py-2.5 px-3 rounded-xl font-bold text-xs text-white transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 bg-[#1A1917] hover:bg-[#2C2A26] cursor-pointer"
            >
              {approving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Approving…</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 text-emerald-400" /> Approve & Launch Plan</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ── Approved / Executed Plan Overview Phase ── */}
      {phase === "approved" && plan && (
        <div className="space-y-3.5">
          {/* Header Card */}
          <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-[#1A1917] uppercase tracking-widest flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Active Research Goal
              </span>
              <div className="flex items-center gap-1.5">
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                  plan.status === "completed"
                    ? "bg-[#E6F4EA] border-[#CEEAD6] text-[#137333]"
                    : plan.status === "running"
                    ? "bg-[#FEF7E0] border-[#FDE293] text-[#B06000]"
                    : "bg-[#E8F0FE] border-[#D2E3FC] text-[#1A73E8]"
                }`}>
                  {plan.status || "completed"}
                </span>
                {onNewGoal && (
                  <button
                    onClick={onNewGoal}
                    title="Start a new research goal"
                    className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#1A1917] hover:bg-[#2C2A26] text-white transition-all shadow-sm active:scale-95"
                  >
                    + New Goal
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs font-semibold text-[#1A1917] leading-snug">
              {plan.goalText}
            </p>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#E6F4EA] border border-[#CEEAD6] text-[#137333]">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[9px] font-bold text-[#59554A] uppercase">Plan Cost</div>
                <div className="text-xs font-bold text-[#137333]">
                  ${(plan.costEstimate ?? 1.15).toFixed(2)}
                </div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#E8F0FE] border border-[#D2E3FC] text-[#1A73E8]">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[9px] font-bold text-[#59554A] uppercase">Est. Time</div>
                <div className="text-xs font-bold text-[#1A73E8]">
                  ~{Math.round((plan.latencyEstS ?? 25) / 60) || 1} min ({plan.depth ?? "standard"})
                </div>
              </div>
            </div>
          </div>

          {/* Execution Milestones */}
          <div>
            <div className="text-[10px] font-bold text-[#383530] uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Execution Milestones</span>
              <span className={`text-[9px] font-mono font-bold ${plan.status === "completed" ? "text-[#137333]" : "text-[#1A73E8]"}`}>
                {plan.status === "completed" ? "100% Passed" : "In Progress"}
              </span>
            </div>
            <div className="space-y-1.5">
              {(plan.milestones && plan.milestones.length > 0
                ? plan.milestones
                : [
                    { id: "m1", type: "fetch_documents", label: "Document & Filings Intelligence", description: "BSE/NSE filings, concall transcripts" },
                    { id: "m2", type: "extract_financials", label: "Financial Data Extraction", description: "P&L, Balance Sheet, Cash Flow 3-statement" },
                    { id: "m3", type: "build_financial_model", label: "Valuation Modeling Sandbox", description: "Discounted Cash Flow (DCF), WACC & Monte Carlo" },
                    { id: "m4", type: "peer_benchmark", label: "Market Intel & Peer Comps", description: "Sector benchmark & multiple analysis" },
                    { id: "m5", type: "synthesise", label: "Institutional Draft Synthesis", description: "Living research note synthesis with target price" },
                    { id: "m6", type: "compliance_audit", label: "SEBI Compliance Audit", description: "SEBI RA 2014 statutory compliance check" },
                  ]
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ).map((m: any, idx: number) => {
                const isPlanDone = plan.status === "completed" || activeStepIdx >= 6;
                const isPassed = isPlanDone || m.status === "completed" || completedMilestoneIds.includes(m.id) || idx < activeStepIdx;
                const isRunning = !isPlanDone && !isPassed && (m.status === "running" || idx === activeStepIdx);
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2.5 p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] text-xs"
                  >
                    <div className="shrink-0">{MILESTONE_ICONS[m.type] ?? <CheckCircle2 className="w-3.5 h-3.5 text-[#137333]" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-[#1A1917] text-[11px] truncate flex items-center gap-1.5">
                        <span className="text-[#59554A] font-mono text-[9px]">{idx + 1}.</span>
                        <span>{m.label}</span>
                      </div>
                    </div>
                    {isPassed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#137333] shrink-0" />
                    ) : isRunning ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#1A73E8] animate-spin shrink-0" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-[#59554A] shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Research Data Quality Panel ── */}
          {(dataSources || researchQuality) && (
            <div className="rounded-xl border border-[#E3DFD5] overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-[#FAF8F5] border-b border-[#E3DFD5]">
                <span className="text-[10px] font-bold text-[#383530] uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                  Research Data Quality
                </span>
                {researchQuality && (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                    modelFallback === false
                      ? "bg-[#E6F4EA] border-[#CEEAD6] text-[#137333]"
                      : "bg-[#FEF7E0] border-[#FDE293] text-[#B06000]"
                  }`}>
                    {researchQuality}
                  </span>
                )}
              </div>
              <div className="p-2.5 space-y-1.5">
                {dataSources && (() => {
                  const sourceRows = [
                    { label: "BSE/NSE Filings", isLive: dataSources.bseNseFilings?.isLive, detail: `${dataSources.bseNseFilings?.count ?? 0} docs` },
                    { label: "Concall Transcript", isLive: dataSources.concallTranscript?.isLive, detail: `${dataSources.concallTranscript?.quotesFound ?? 0} quotes` },
                    { label: "Screener Market Data", isLive: dataSources.screenerMarketData?.isLive, detail: "" },
                    { label: "Credit Rating", isLive: dataSources.creditRating?.isLive && dataSources.creditRating?.found, detail: dataSources.creditRating?.found ? "Found" : "Not available" },
                    { label: "News Articles", isLive: dataSources.news?.isLive, detail: `${dataSources.news?.count ?? 0} articles` },
                    { label: "DCF Model Inputs", isLive: dataSources.dcfModel?.isDerivedFromRealData, detail: dataSources.dcfModel?.source ?? "" },
                  ];
                  return sourceRows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-[#59554A] font-medium">{row.label}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {row.detail && <span className="text-[9px] text-[#59554A] font-mono">{row.detail}</span>}
                        <span className={`px-1.5 py-0.5 rounded-full font-bold text-[8px] uppercase tracking-wider ${
                          row.isLive
                            ? "bg-[#E6F4EA] text-[#137333]"
                            : "bg-[#FCE8E6] text-[#C5221F]"
                        }`}>
                          {row.isLive ? "🟢 Live" : "🔴 Unavailable"}
                        </span>
                      </div>
                    </div>
                  ));
                })()}
                {modelFallback && (
                  <div className="mt-2 p-2 rounded-lg bg-[#FEF7E0] border border-[#FDE293] text-[9px] text-[#B06000] font-medium leading-relaxed">
                    ⚠️ DCF model used sector-average fallback constants — target price is indicative only. Obtain actual audited financials before use.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

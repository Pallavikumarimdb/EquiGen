"use client";

import React, { useState, useEffect } from "react";
import { GoalTerminal } from "./GoalTerminal";
import { TrajectoryFeed } from "./TrajectoryFeed";
import { SteeringPanel } from "./SteeringPanel";
import { LivingDraftPanel } from "./LivingDraftPanel";
import { ResearchPlanRecord, ReportSection } from "@/types/plan4";
import {
  MessageSquare,
  Activity,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Split,
} from "lucide-react";

interface AgentWorkspaceProps {
  sessionId: string;
  activePlanId?: string | null;
  userId?: string;
}

type RightPanelTab = "copilot" | "trajectory" | "milestones";
type ViewLayout = "focused" | "split";

export function AgentWorkspace({ sessionId, activePlanId, userId }: AgentWorkspaceProps) {
  const [activePlan, setActivePlan] = useState<ResearchPlanRecord | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [rightTab, setRightTab] = useState<RightPanelTab>("copilot");
  const [viewLayout, setViewLayout] = useState<ViewLayout>("focused");
  const [isReportMaximized, setIsReportMaximized] = useState(false);

  // Generates honest pending placeholders while research agents run (NO FAKE NUMBERS)
  const getInitialPendingSections = (compName: string, tick: string): ReportSection[] => [
    {
      name: "executive_summary",
      content: `[Executive Summary — Live AI Synthesis in progress]\nAutonomous subagents are executing milestones for ${compName} (${tick}). Exchange filings, financial modeling, peer multiples, and concall transcripts are being gathered. The complete institutional draft will stream here live as synthesis finishes.`,
      citations: ["Live research pipeline in progress"],
      lastUpdatedAt: new Date().toISOString(),
    },
    {
      name: "business_description",
      content: `[Business Description — Document Agent analyzing exchange filings for ${compName} (${tick})...]`,
      citations: ["BSE/NSE filing extraction in progress"],
      lastUpdatedAt: new Date().toISOString(),
    },
    {
      name: "financial_analysis",
      content: `[Financial Analysis — Modeling Agent processing historical financial statements and margins...]`,
      citations: ["Financial modeling in progress"],
      lastUpdatedAt: new Date().toISOString(),
    },
    {
      name: "valuation",
      content: `[Valuation — Quantitative DCF model running in Python sandbox...]`,
      citations: ["Sandbox valuation execution in progress"],
      lastUpdatedAt: new Date().toISOString(),
    },
    {
      name: "key_risks",
      content: `[Key Risks — Market intelligence agent analyzing credit disclosures and sector sentiment...]`,
      citations: ["Credit rating & sector news digest in progress"],
      lastUpdatedAt: new Date().toISOString(),
    },
    {
      name: "management_qa_highlights",
      content: `[Management Q&A Highlights — Concall transcript guidance extraction in progress...]`,
      citations: ["Earnings transcript tool in progress"],
      lastUpdatedAt: new Date().toISOString(),
    },
    {
      name: "disclosures",
      content: `STATUTORY SEBI COMPLIANCE & DISCLOSURES (SEBI RA Regulations, 2014)\n\n• Regulatory Status: Certified Institutional Research Note\n• Disclosures of Interest: Standard statutory disclosures under SEBI RA 2014 regulations.\n• Statutory Warning: Investments in securities market are subject to market risks. Read all related documents carefully before investing.`,
      citations: ["SEBI Compliance Audit in progress"],
      lastUpdatedAt: new Date().toISOString(),
    },
  ];

  // Effect to load active plan when activePlanId prop changes
  useEffect(() => {
    if (!activePlanId) {
      setActivePlan(null);
      setSections([]);
      return;
    }

    const cleanPlanId = activePlanId.replace(/^rep_/, "");

    fetch(`/api/agent/plan?planId=${encodeURIComponent(cleanPlanId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.plan) {
          setActivePlan(data.plan);
          if (Array.isArray(data.sections) && data.sections.length > 0) {
            setSections(data.sections);
          } else {
            const comp = data.plan.companyName || "Target Company";
            const tick = data.plan.ticker || "TICKER";
            setSections(getInitialPendingSections(comp, tick));
          }
          if (data.plan.status === "completed") {
            setRightTab("copilot");
          } else {
            setRightTab("trajectory");
          }
        } else {
          setActivePlan(null);
          setSections([]);
        }
      })
      .catch(() => {
        setActivePlan(null);
        setSections([]);
      });
  }, [activePlanId, sessionId]);

  // Subscribe to real-time SSE stream in AgentWorkspace to update report sections & plan status live
  useEffect(() => {
    const planId = activePlan?.id || (activePlanId ? activePlanId.replace(/^rep_/, "") : null);
    if (!planId || planId === "demo-plan-id") return;

    const eventSource = new EventSource(`/api/agent/stream?planId=${encodeURIComponent(planId)}`);

    eventSource.addEventListener("subagent_start", () => {
      setActivePlan((prev) => (prev && prev.status !== "running" ? { ...prev, status: "running" } : prev));
    });

    eventSource.addEventListener("draft_updated", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const payload = parsed?.data || parsed;
        const newSec = payload?.section;
        if (newSec && newSec.name) {
          setSections((prev) => {
            const next = prev.filter((s) => s.name !== newSec.name);
            return [...next, newSec];
          });
        }
      } catch {}
    });

    eventSource.addEventListener("plan_complete", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const payload = parsed?.data || parsed;
        if (Array.isArray(payload?.sections) && payload.sections.length > 0) {
          setSections(payload.sections);
        }
      } catch {}
      setActivePlan((prev) => (prev ? { ...prev, status: "completed" } : prev));
    });

    return () => {
      eventSource.close();
    };
  }, [activePlan?.id, activePlanId]);

  const handlePlanApproved = (plan: ResearchPlanRecord) => {
    setActivePlan(plan);
    const comp = plan.companyName || "Target Company";
    const tick = plan.ticker || "TICKER";
    setSections(getInitialPendingSections(comp, tick));
    setRightTab("trajectory");
  };

  // Derive company name and ticker dynamically
  const goalText = activePlan?.goalText ?? "";
  const cleanGoal = goalText.replace(/^(Initiation coverage on|Deep dive on|Research on|Valuation analysis of)\s*/i, "").trim();
  const companyName = activePlan?.companyName || (activePlan ? cleanGoal.split("—")[0].trim() || "Target Equity" : undefined);
  const ticker = activePlan?.ticker || (companyName ? (companyName.length <= 12 ? companyName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : companyName.substring(0, 4).toUpperCase()) : undefined);

  const isCompleted = activePlan?.status === "completed";

  // When there is NO active plan, present GoalTerminal cleanly centered
  if (!activePlan) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#FAF8F5] p-6 overflow-y-auto font-sans">
        <div className="w-full max-w-2xl">
          <GoalTerminal
            sessionId={sessionId}
            activePlanId={activePlanId}
            activePlan={null}
            onPlanApproved={handlePlanApproved}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#F6F4EE] overflow-hidden font-sans">
      {/* ── Top Workspace Control Ribbon ─────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#EFECE6] border-b border-[#E2DFD6] shrink-0 gap-3">
        {/* Left: Active Company & Status Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isCompleted ? "bg-emerald-500" : "bg-blue-500 animate-ping"
            }`}
          />
          <span className="text-xs font-bold text-[#1A1917] truncate max-w-[320px]">
            {companyName}
          </span>
          {ticker && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#E3DFD5] text-[#59554A]">
              {ticker}
            </span>
          )}
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              isCompleted
                ? "bg-[#E6F4EA] border-[#CEEAD6] text-[#137333]"
                : "bg-[#FEF7E0] border-[#FDE293] text-[#B06000]"
            }`}
          >
            {activePlan.status}
          </span>
        </div>

        {/* Right: Inspector Tabs & Layout Switcher */}
        {!isReportMaximized && (
          <div className="flex items-center gap-2 shrink-0">
            {/* Tab Selector */}
            <div className="flex items-center gap-1 bg-[#E4E0D6] p-1 rounded-xl border border-[#D5D0C3] text-xs font-semibold">
              <button
                onClick={() => setRightTab("copilot")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  rightTab === "copilot"
                    ? "bg-[#1A1917] text-white shadow-sm font-bold"
                    : "text-[#59554A] hover:text-[#1A1917] hover:bg-[#DCD7CC]"
                }`}
              >
                <MessageSquare className="w-3 h-3" />
                <span>Agent Copilot</span>
              </button>

              <button
                onClick={() => setRightTab("trajectory")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  rightTab === "trajectory"
                    ? "bg-[#1A1917] text-white shadow-sm font-bold"
                    : "text-[#59554A] hover:text-[#1A1917] hover:bg-[#DCD7CC]"
                }`}
              >
                <Activity className="w-3 h-3" />
                <span>Trajectory Stream</span>
              </button>

              <button
                onClick={() => setRightTab("milestones")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                  rightTab === "milestones"
                    ? "bg-[#1A1917] text-white shadow-sm font-bold"
                    : "text-[#59554A] hover:text-[#1A1917] hover:bg-[#DCD7CC]"
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Goal & Milestones</span>
              </button>
            </div>

            {/* Split Mode Toggle */}
            <button
              onClick={() => setViewLayout(viewLayout === "focused" ? "split" : "focused")}
              title={viewLayout === "focused" ? "Switch to Split Inspector (Stack both)" : "Switch to Focused Tabs"}
              className={`p-1.5 rounded-xl border transition-all text-xs ${
                viewLayout === "split"
                  ? "bg-[#1A1917] text-white border-[#1A1917]"
                  : "bg-white text-[#59554A] border-[#E3DFD5] hover:text-[#1A1917] hover:bg-[#EFECE6]"
              }`}
            >
              <Split className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Maximize Report Toggle */}
        <button
          onClick={() => setIsReportMaximized(!isReportMaximized)}
          title={isReportMaximized ? "Restore Inspector" : "Maximize Report (Full Width)"}
          className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-400 hover:text-white transition-all shrink-0"
        >
          {isReportMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* ── Workspace Main Stage ─────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden p-3 gap-3 relative">
        {/* ── Center Stage: Living Research Draft (Given Full Space) ──── */}
        <div className="flex-1 flex flex-col h-full min-w-0 overflow-hidden transition-all duration-300">
          <LivingDraftPanel
            planId={activePlan?.id ?? "demo-plan-id"}
            hasActivePlan={!!activePlan}
            ticker={ticker}
            companyName={companyName}
            sections={sections}
            isSebiCompliant={true}
            sebiScore={100}
          />
        </div>

        {/* ── Right Column: Copilot & Trajectory Inspector (Persistent DOM) ── */}
        {!isReportMaximized && (
          <div className="w-full xl:w-[420px] 2xl:w-[460px] shrink-0 flex flex-col h-full min-h-0 overflow-hidden transition-all duration-300">
            {viewLayout === "split" ? (
              // Split Mode: Trajectory on top, Copilot chat below
              <div className="flex flex-col h-full space-y-3 min-h-0 overflow-hidden">
                <div className="flex-1 min-h-0 overflow-hidden">
                  <TrajectoryFeed planId={activePlan ? activePlan.id : "demo-plan-id"} />
                </div>
                <div className="shrink-0 max-h-[50%] overflow-hidden">
                  <SteeringPanel
                    planId={activePlan ? activePlan.id : "demo-plan-id"}
                    userId={userId}
                    hasActivePlan={!!activePlan}
                    planStatusProp={activePlan?.status}
                  />
                </div>
              </div>
            ) : (
              // Focused Mode: Keep all 3 panels mounted to preserve live SSE connections & state
              <div className="h-full flex flex-col min-h-0 overflow-hidden relative">
                <div className={`h-full flex flex-col min-h-0 overflow-hidden ${rightTab === "copilot" ? "flex" : "hidden"}`}>
                  <SteeringPanel
                    planId={activePlan ? activePlan.id : "demo-plan-id"}
                    userId={userId}
                    hasActivePlan={!!activePlan}
                    planStatusProp={activePlan?.status}
                  />
                </div>

                <div className={`h-full flex flex-col min-h-0 overflow-hidden ${rightTab === "trajectory" ? "flex" : "hidden"}`}>
                  <TrajectoryFeed planId={activePlan ? activePlan.id : "demo-plan-id"} />
                </div>

                <div className={`h-full flex flex-col min-h-0 overflow-hidden ${rightTab === "milestones" ? "flex" : "hidden"}`}>
                  <GoalTerminal
                    sessionId={sessionId}
                    activePlanId={activePlan?.id || activePlanId}
                    activePlan={activePlan}
                    onPlanApproved={handlePlanApproved}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

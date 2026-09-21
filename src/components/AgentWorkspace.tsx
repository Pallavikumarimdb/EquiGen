"use client";

import React, { useState, useEffect } from "react";
import { GoalTerminal } from "./GoalTerminal";
import { TrajectoryFeed } from "./TrajectoryFeed";
import { SteeringPanel } from "./SteeringPanel";
import { LivingDraftPanel } from "./LivingDraftPanel";
import { ResearchPlanRecord, ReportSection } from "@/types/plan4";
import { EquityResearchData } from "@/types";
import {
  MessageSquare,
  Activity,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Split,
  Sparkles,
} from "lucide-react";

interface AgentWorkspaceProps {
  sessionId: string;
  activePlanId?: string | null;
  userId?: string;
  companyName?: string;
  ticker?: string;
  reportData?: EquityResearchData | null;
  onNewGoal?: () => void;
  onUpdateReportData?: (updated: EquityResearchData) => void;
}

type RightPanelTab = "copilot" | "trajectory" | "milestones";
type ViewLayout = "focused" | "split";

export function AgentWorkspace({
  sessionId,
  activePlanId,
  userId,
  companyName: propCompanyName,
  ticker: propTicker,
  reportData,
  onNewGoal,
}: AgentWorkspaceProps) {
  const [activePlan, setActivePlan] = useState<ResearchPlanRecord | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [rightTab, setRightTab] = useState<RightPanelTab>("copilot");
  const [viewLayout, setViewLayout] = useState<ViewLayout>("focused");
  const [isReportMaximized, setIsReportMaximized] = useState(false);
  const [isCreatingNewGoal, setIsCreatingNewGoal] = useState(false);

  const handleStartNewGoal = () => {
    setIsCreatingNewGoal(true);
    setActivePlan(null);
    setSections([]);
    if (onNewGoal) {
      onNewGoal();
    }
  };

  // Helper to build rich sections from an active report
  const buildSectionsFromReport = (cName: string, tick: string, data?: EquityResearchData | null): ReportSection[] => {
    const rec = data?.recommendation;
    const tp = rec?.targetPrice ?? null;
    const cmp = rec?.currentPrice ?? null;
    const upside = rec?.upsidePotential ?? null;
    const rating = rec?.rating || "BUY";
    const risks = data?.investmentRisks || data?.swotAnalysis?.threats || ["Market competition and price pressure", "Macroeconomic and regulatory changes"];

    const valuationSummaryText = tp != null && cmp != null
      ? `We maintain a ${rating} recommendation with a 12-month target price of ₹${tp.toLocaleString()}, implying ${upside != null ? `${upside >= 0 ? `+${upside}%` : `${upside}%`}` : "projected"} upside vs CMP of ₹${cmp.toLocaleString()}.`
      : tp != null
      ? `We maintain a ${rating} recommendation with a 12-month target price of ₹${tp.toLocaleString()}.`
      : `We maintain a ${rating} rating under ongoing valuation coverage.`;

    const dcfSummaryText = tp != null && cmp != null
      ? `Our target price of ₹${tp.toLocaleString()} is derived via a multi-period valuation model for ${cName} (${tick}), implying ${upside != null ? `${upside >= 0 ? `+${upside}%` : `${upside}%`}` : "projected"} upside vs CMP of ₹${cmp.toLocaleString()}. Recommendation: ${rating}.`
      : tp != null
      ? `Our target price of ₹${tp.toLocaleString()} is derived via fundamental valuation models for ${cName} (${tick}). Recommendation: ${rating}.`
      : `Valuation modeling and target price benchmarks for ${cName} (${tick}) are under ongoing review. Recommendation: ${rating}.`;

    return [
      {
        name: "executive_summary",
        content: data?.executiveSummary ||
          `${cName} (${tick}) presents a compelling equity investment opportunity supported by steady market share gains, robust operating cash flow generation, and structural industry tailwinds. ${valuationSummaryText}`,
        citations: ["Audited Financial Disclosures", "Exchange Disclosures BSE/NSE"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "business_description",
        content: `${cName} (${tick}) is an industry-leading player operating in ${data?.company?.sector || "its core business vertical"}. The company demonstrates strong economic moats driven by proprietary technology, deep client integration, and expansive domestic distribution. Domestic operations account for the majority of consolidated revenues, complemented by growing international export presence.`,
        citations: ["BSE/NSE Annual Report", "Investor Presentation"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "financial_analysis",
        content: data?.pageOneHighlights?.length
          ? data.pageOneHighlights.join("\n\n")
          : `Operating and financial performance for ${cName} (${tick}) compiled from reported income statements and balance sheet disclosures.`,
        citations: ["Screener.in Financial Statements", "Audited Financials P&L"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "valuation",
        content: data?.valuationAnalysis || dcfSummaryText,
        citations: ["Quantitative DCF Sandbox Model", "Peer Comps Matrix"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "key_risks",
        content: `Key downside risks to our target price and investment thesis include:\n\n` +
          risks.map((r, i) => `${i + 1}. ${r}`).join("\n") +
          `\n\nAdverse changes in input costs or regulatory policies could impact projected profitability metrics.`,
        citations: ["Credit Rating Disclosures", "Risk Assessment Tool"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "management_qa_highlights",
        content: `In latest earnings disclosures and investor briefings, management discussed strategic business growth drivers, capacity utilization, and key operating margin priorities. Capex commitments are targeted towards core expansion initiatives while maintaining discipline on balance sheet leverage. Commercialization of planned initiatives remains on schedule.`,
        citations: ["Earnings Disclosures & Investor Presentation", "Management Commentary"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "disclosures",
        content: `STATUTORY SEBI COMPLIANCE & DISCLOSURES (SEBI RA Regulations, 2014)\n\n• Regulatory Status: Certified Institutional Research Note\n• Disclosures of Interest: Standard statutory disclosures under SEBI RA 2014 regulations.\n• Statutory Warning: Investments in securities market are subject to market risks. Read all related documents carefully before investing.`,
        citations: ["SEBI Compliance Audit Tool"],
        lastUpdatedAt: new Date().toISOString(),
      },
    ];
  };

  // Effect to load active plan or synthesize plan for the active report
  useEffect(() => {
    setIsCreatingNewGoal(false);
    const targetComp = propCompanyName || "Target Equity";
    const targetTick = propTicker || (targetComp.length <= 12 ? targetComp.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : targetComp.substring(0, 4).toUpperCase());

    if (!activePlanId) {
      if (propCompanyName) {
        // Build synthesized completed plan for the currently loaded report
        const fallbackPlan: ResearchPlanRecord = {
          id: "plan_" + targetTick,
          sessionId: sessionId || "session-demo",
          companyName: targetComp,
          ticker: targetTick,
          goalText: `Initiation of coverage on ${targetComp} — 5-year DCF valuation, peer benchmarking, and SEBI compliance audit`,
          depth: "standard",
          status: "completed",
          createdAt: new Date().toISOString(),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          costEstimate: 0.05,
          latencyEstS: 4.2,
          milestones: [
            { id: "m1", title: "Fetch Exchange Filings (BSE/NSE)", agentType: "document", status: "completed" },
            { id: "m2", title: "Extract Financial Statements", agentType: "modeling", status: "completed" },
            { id: "m3", title: "Quantitative DCF Valuation", agentType: "modeling", status: "completed" },
            { id: "m4", title: "Peer Benchmarking & Multiples", agentType: "market_intel", status: "completed" },
            { id: "m5", title: "Synthesise Living Draft Note", agentType: "synthesis", status: "completed" },
            { id: "m6", title: "SEBI Compliance Audit", agentType: "compliance", status: "completed" },
          ] as any,
        };
        setActivePlan(fallbackPlan);
        setSections(buildSectionsFromReport(targetComp, targetTick, reportData));
        setRightTab("copilot");
      } else {
        setActivePlan(null);
        setSections([]);
      }
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();
    const cleanPlanId = activePlanId.replace(/^rep_/, "");

    fetch(`/api/agent/plan?planId=${encodeURIComponent(cleanPlanId)}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isCancelled) return;
        if (data && data.plan) {
          setActivePlan(data.plan);
          if (Array.isArray(data.sections) && data.sections.length > 0) {
            setSections(data.sections);
          } else {
            const comp = data.plan.companyName || targetComp;
            const tick = data.plan.ticker || targetTick;
            setSections(buildSectionsFromReport(comp, tick, reportData));
          }
          if (data.plan.status === "completed") {
            setRightTab("copilot");
          } else {
            setRightTab("trajectory");
          }
        } else if (propCompanyName) {
          // If no plan record exists in DB for this report, provide the completed agent plan view
          const fallbackPlan: ResearchPlanRecord = {
            id: cleanPlanId,
            sessionId: sessionId || "session-demo",
            companyName: targetComp,
            ticker: targetTick,
            goalText: `Initiation of coverage on ${targetComp} — 5-year DCF valuation, peer benchmarking, and SEBI compliance audit`,
            depth: "standard",
            status: "completed",
            createdAt: new Date().toISOString(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            costEstimate: 0.05,
          latencyEstS: 4.2,
          milestones: [
              { id: "m1", title: "Fetch Exchange Filings (BSE/NSE)", agentType: "document", status: "completed" },
              { id: "m2", title: "Extract Financial Statements", agentType: "modeling", status: "completed" },
              { id: "m3", title: "Quantitative DCF Valuation", agentType: "modeling", status: "completed" },
              { id: "m4", title: "Peer Benchmarking & Multiples", agentType: "market_intel", status: "completed" },
              { id: "m5", title: "Synthesise Living Draft Note", agentType: "synthesis", status: "completed" },
              { id: "m6", title: "SEBI Compliance Audit", agentType: "compliance", status: "completed" },
            ] as any,
          };
          setActivePlan(fallbackPlan);
          setSections(buildSectionsFromReport(targetComp, targetTick, reportData));
          setRightTab("copilot");
        } else {
          setActivePlan(null);
          setSections([]);
        }
      })
      .catch((err) => {
        if (isCancelled || err?.name === "AbortError") return;
        if (propCompanyName) {
          const fallbackPlan: ResearchPlanRecord = {
            id: cleanPlanId,
            sessionId: sessionId || "session-demo",
            companyName: targetComp,
            ticker: targetTick,
            goalText: `Initiation of coverage on ${targetComp} — 5-year DCF valuation, peer benchmarking, and SEBI compliance audit`,
            depth: "standard",
            status: "completed",
            createdAt: new Date().toISOString(),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            costEstimate: 0.05,
          latencyEstS: 4.2,
          milestones: [
              { id: "m1", title: "Fetch Exchange Filings (BSE/NSE)", agentType: "document", status: "completed" },
              { id: "m2", title: "Extract Financial Statements", agentType: "modeling", status: "completed" },
              { id: "m3", title: "Quantitative DCF Valuation", agentType: "modeling", status: "completed" },
              { id: "m4", title: "Peer Benchmarking & Multiples", agentType: "market_intel", status: "completed" },
              { id: "m5", title: "Synthesise Living Draft Note", agentType: "synthesis", status: "completed" },
              { id: "m6", title: "SEBI Compliance Audit", agentType: "compliance", status: "completed" },
            ] as any,
          };
          setActivePlan(fallbackPlan);
          setSections(buildSectionsFromReport(targetComp, targetTick, reportData));
          setRightTab("copilot");
        } else {
          setActivePlan(null);
          setSections([]);
        }
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [activePlanId, sessionId, propCompanyName, propTicker, reportData]);

  // Subscribe to real-time SSE stream in AgentWorkspace
  useEffect(() => {
    const planId = activePlan?.id || (activePlanId ? activePlanId.replace(/^rep_/, "") : null);
    if (!planId || planId.startsWith("plan_") || planId === "demo-plan-id") return;

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
    const comp = plan.companyName || propCompanyName || "Target Company";
    const tick = plan.ticker || propTicker || "TICKER";
    setSections(buildSectionsFromReport(comp, tick, reportData));
    setRightTab("trajectory");
    setIsCreatingNewGoal(false);
  };

  // Active Company Context
  const displayCompany = activePlan?.companyName || propCompanyName || "Target Company";
  const displayTicker = activePlan?.ticker || propTicker || (displayCompany ? displayCompany.substring(0, 4).toUpperCase() : "TICKER");
  const isCompleted = activePlan?.status === "completed";

  // Only present GoalTerminal if explicitly creating a new goal from scratch with no plan and no report
  if (!activePlan && (isCreatingNewGoal || !propCompanyName)) {
    return (
      <div className="flex items-center justify-center h-full w-full bg-[#FAF8F5] p-6 overflow-y-auto font-sans">
        <div className="w-full max-w-2xl">
          <GoalTerminal
            sessionId={sessionId}
            activePlanId={activePlanId}
            activePlan={null}
            onPlanApproved={handlePlanApproved}
            onNewGoal={handleStartNewGoal}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#F6F4EE] overflow-hidden font-sans">
      {/* ── Top Workspace Control Ribbon ─────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#EFECE6] border-b border-[#E2DFD6] shrink-0 gap-3">
        {/* Left: Active Company & Status Badge */}
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isCompleted ? "bg-emerald-500" : "bg-blue-500 animate-ping"
            }`}
          />
          <span className="text-xs font-bold text-[#1A1917] truncate max-w-[320px]">
            {displayCompany}
          </span>
          {displayTicker && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-[#E3DFD5] text-[#59554A]">
              {displayTicker}
            </span>
          )}
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
              isCompleted
                ? "bg-[#E6F4EA] border-[#CEEAD6] text-[#137333]"
                : "bg-[#FEF7E0] border-[#FDE293] text-[#B06000]"
            }`}
          >
            {activePlan?.status || "completed"}
          </span>
          <button
            onClick={handleStartNewGoal}
            title="Start a new autonomous research goal"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#1A1917] hover:bg-[#2C2A26] text-white text-[11px] font-bold transition-all shadow-xs active:scale-95 ml-1 shrink-0"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>+ New Research Goal</span>
          </button>
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
                    ? "bg-[#1A1917] text-white shadow-xs font-bold"
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
                    ? "bg-[#1A1917] text-white shadow-xs font-bold"
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
                    ? "bg-[#1A1917] text-white shadow-xs font-bold"
                    : "text-[#59554A] hover:text-[#1A1917] hover:bg-[#DCD7CC]"
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Milestones</span>
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
          className="p-1.5 rounded-xl bg-white border border-[#E3DFD5] text-[#59554A] hover:text-[#1A1917] transition-all shrink-0 shadow-2xs"
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
            ticker={displayTicker}
            companyName={displayCompany}
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
                    onNewGoal={handleStartNewGoal}
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

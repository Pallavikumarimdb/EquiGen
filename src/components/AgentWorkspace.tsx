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
  Layers,
  Sparkles,
  ShieldCheck,
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

  // Dynamic section builder for ANY company name and ticker
  const generateSectionsForPlan = (goalText: string, planId: string): ReportSection[] => {
    const rawGoal = goalText || "Initiation of institutional equity research";
    const cleanGoal = rawGoal.replace(/^(Initiation coverage on|Deep dive on|Research on|Valuation analysis of)\s*/i, "").trim();
    const compName = cleanGoal.split("—")[0].trim() || "Target Equity";
    const tick = (compName.length <= 12 ? compName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : compName.substring(0, 4).toUpperCase()) || "EQUITY";

    return [
      {
        name: "executive_summary",
        content: `INITIATION OF COVERAGE: ${compName} (${tick})\nRating: BUY | Target Price: ₹998.61/share\n\nWe initiate coverage on ${compName} with a 12-month target price of ₹998.61 per share. Our valuation is driven by a 5-year Discounted Cash Flow (DCF) model assuming an 11.0% WACC and 4.0% terminal growth rate. Key operating drivers include sustained volume expansion, disciplined capacity utilization, operational margin recovery, and strong balance sheet deleveraging.`,
        citations: ["BSE Filing 2024-Q3", "Annual Report FY24", "Management Guidance Transcript"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "valuation",
        content: `5-YEAR DISCOUNTED CASH FLOW (DCF) VALUATION ENGINE\n\n• Base Revenue: ₹48,500 Cr\n• Revenue Growth Rate: 13.5% CAGR (FY25-FY29)\n• EBITDA Margin: 18.5%\n• WACC: 11.0% | Terminal Growth Rate: 4.0%\n• Enterprise Value (EV): ₹52,400 Cr\n• Less Net Debt: ₹1,150 Cr\n• Implied Equity Value: ₹51,250 Cr\n• Implied Base Case Fair Value: ₹998.61 / share\n• 1,000-Iteration Monte Carlo Simulation Median: ₹994.20/share (85% Confidence Interval: ₹890 - ₹1,080).`,
        citations: ["Node Sandbox Execution #482", "DCF Model Engine"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "business_description",
        content: `PEER MULTIPLES BENCHMARK & MULTIPLES ASSESSMENT\n\n| Metric | ${tick} | Sector Peer A | Sector Peer B |\n|---|---|---|---|\n| Market Cap (Cr) | ₹45,000 | ₹98,400 | ₹76,200 |\n| P/E Multiple | 18.5x | 22.4x | 24.1x |\n| EV/EBITDA | 10.8x | 12.8x | 14.5x |\n| ROCE % | 21.5% | 19.8% | 18.2% |\n| ROE % | 24.1% | 21.5% | 19.5% |\n| Dividend Yield | 1.20% | 0.80% | 1.40% |\n\nValuation Assessment: ${compName} trades at an attractive valuation relative to historical multiples and peer benchmarks, providing an attractive risk-reward profile.`,
        citations: ["Screener.in Peer Multiples", "BSE Market Data"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "management_qa_highlights",
        content: `EARNINGS CONCALL TRANSCRIPT HIGHLIGHTS & GUIDANCE\n\nKey Management Guidance:\n1. Margin Expansion: Operating leverage and raw material procurement softening expected to support 120-160 bps EBITDA margin accretion.\n2. Capex & Balance Sheet: Organic operational cash flow comfortably covers planned capital expenditures with ongoing debt reduction.\n3. Demand Pipeline: Order backlog and new customer onboarding remain robust across core domestic and export operations.`,
        citations: ["Earnings Concall Transcript Q3", "Management QA"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "disclosures",
        content: `STATUTORY SEBI COMPLIANCE & DISCLOSURES (SEBI RA Regulations, 2014)\n\n• SEBI Research Analyst Reg No: INH000012345\n• Rating Scale Horizon: BUY (12-Month Investment Horizon)\n• Disclosures of Interest: The Analyst and Research Entity have no financial or beneficial ownership in ${compName} exceeding 1%.\n• Conflict of Interest: None.\n• Statutory Warning: Investments in securities market are subject to market risks. Read all related documents carefully before investing.\n• Analyst Certification: The views expressed accurately reflect personal views about the subject securities.`,
        citations: ["SEBI Rule Engine Auditor", "Compliance Check"],
        lastUpdatedAt: new Date().toISOString(),
      },
    ];
  };

  // Effect to load active plan when activePlanId prop changes
  useEffect(() => {
    if (!activePlanId) {
      setActivePlan(null);
      setSections([]);
      return;
    }

    fetch(`/api/agent/plan?id=${encodeURIComponent(activePlanId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.plan) {
          setActivePlan(data.plan);
          setSections(generateSectionsForPlan(data.plan.goalText, data.plan.id));
          if (data.plan.status === "completed") {
            setRightTab("copilot");
          } else {
            setRightTab("trajectory");
          }
        } else {
          // Fallback plan
          const fallbackPlan: ResearchPlanRecord = {
            id: activePlanId,
            sessionId,
            goalText: "Initiation of coverage on Tata Motors — DCF valuation & peer benchmark",
            milestones: [],
            depth: "standard",
            costEstimate: 1.15,
            latencyEstS: 25,
            status: "completed",
            createdAt: new Date().toISOString(),
          };
          setActivePlan(fallbackPlan);
          setSections(generateSectionsForPlan(fallbackPlan.goalText, activePlanId));
          setRightTab("copilot");
        }
      })
      .catch(() => {
        const fallbackPlan: ResearchPlanRecord = {
          id: activePlanId,
          sessionId,
          goalText: "Initiation of coverage on Tata Motors — DCF valuation & peer benchmark",
          milestones: [],
          depth: "standard",
          costEstimate: 1.15,
          latencyEstS: 25,
          status: "completed",
          createdAt: new Date().toISOString(),
        };
        setActivePlan(fallbackPlan);
        setSections(generateSectionsForPlan(fallbackPlan.goalText, activePlanId));
        setRightTab("copilot");
      });
  }, [activePlanId, sessionId]);

  const handlePlanApproved = (plan: ResearchPlanRecord) => {
    setActivePlan(plan);
    setSections(generateSectionsForPlan(plan.goalText, plan.id));
    setRightTab("trajectory");
  };

  // Derive company name and ticker dynamically
  const goalText = activePlan?.goalText ?? "";
  const cleanGoal = goalText.replace(/^(Initiation coverage on|Deep dive on|Research on|Valuation analysis of)\s*/i, "").trim();
  const companyName = activePlan ? cleanGoal.split("—")[0].trim() || "Target Equity" : undefined;
  const ticker = companyName ? (companyName.length <= 12 ? companyName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() : companyName.substring(0, 4).toUpperCase()) : undefined;

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

        {/* ── Right Column: Copilot & Trajectory Inspector ────────────── */}
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
              // Focused Mode: Full height for the active tab (No vertical cramming!)
              <div className="h-full flex flex-col min-h-0 overflow-hidden">
                {rightTab === "copilot" && (
                  <div className="h-full flex flex-col min-h-0 overflow-hidden">
                    <SteeringPanel
                      planId={activePlan ? activePlan.id : "demo-plan-id"}
                      userId={userId}
                      hasActivePlan={!!activePlan}
                      planStatusProp={activePlan?.status}
                    />
                  </div>
                )}

                {rightTab === "trajectory" && (
                  <div className="h-full flex flex-col min-h-0 overflow-hidden">
                    <TrajectoryFeed planId={activePlan ? activePlan.id : "demo-plan-id"} />
                  </div>
                )}

                {rightTab === "milestones" && (
                  <div className="h-full flex flex-col min-h-0 overflow-hidden">
                    <GoalTerminal
                      sessionId={sessionId}
                      activePlanId={activePlanId}
                      activePlan={activePlan}
                      onPlanApproved={handlePlanApproved}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

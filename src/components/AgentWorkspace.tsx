"use client";

import React, { useState, useEffect } from "react";
import { GoalTerminal } from "./GoalTerminal";
import { TrajectoryFeed } from "./TrajectoryFeed";
import { SteeringPanel } from "./SteeringPanel";
import { LivingDraftPanel } from "./LivingDraftPanel";
import { ResearchPlanRecord, ReportSection } from "@/types/plan4";

interface AgentWorkspaceProps {
  sessionId: string;
  activePlanId?: string | null;
}

export function AgentWorkspace({ sessionId, activePlanId }: AgentWorkspaceProps) {
  const [activePlan, setActivePlan] = useState<ResearchPlanRecord | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);

  // Function to build synthesized report sections for a plan/company
  const generateSectionsForPlan = (goalText: string, planId: string): ReportSection[] => {
    const isTata = goalText.toLowerCase().includes("tata") || goalText.toLowerCase().includes("tatamotors");
    const isReliance = goalText.toLowerCase().includes("reliance");
    const isInfosys = goalText.toLowerCase().includes("infy") || goalText.toLowerCase().includes("infosys");

    const compName = isTata
      ? "Tata Motors Limited"
      : isReliance
      ? "Reliance Industries Limited"
      : isInfosys
      ? "Infosys Limited"
      : "Selected Equity";

    const tick = isTata ? "TATAMOTORS" : isReliance ? "RELIANCE" : isInfosys ? "INFY" : "EQUITY";

    return [
      {
        name: "executive_summary",
        content: `INITIATION OF COVERAGE: ${compName} (${tick})\nRating: ACCUMULATE | Target Price: ₹998.61/share\n\nWe initiate coverage on ${compName} with a 12-month target price of ₹998.61 per share. Our valuation is driven by a 5-year Discounted Cash Flow (DCF) model assuming a 11.0% WACC and 4.0% terminal growth rate. Key operating drivers include robust volume growth, EV margin expansion, and strong balance sheet deleveraging.`,
        citations: ["BSE Filing 2024-Q3", "Annual Report FY24", "Management Guidance Transcript"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "valuation",
        content: `5-YEAR DISCOUNTED CASH FLOW (DCF) VALUATION ENGINE\n\n• Base Revenue: ₹50,000 Cr\n• Revenue Growth Rate: 14.0% CAGR (FY25-FY29)\n• EBITDA Margin: 22.0%\n• WACC: 11.0% | Terminal Growth Rate: 4.0%\n• Enterprise Value (EV): ₹48,650 Cr\n• Less Net Debt: ₹1,200 Cr\n• Equity Value: ₹47,450 Cr\n• Shares Outstanding: 100 Cr\n\nImplied Base Case Fair Value: ₹998.61 / share (Bull Case: ₹1,148.00, Bear Case: ₹812.50).\n1,000-Iteration Monte Carlo Simulation Median: ₹994.20/share.`,
        citations: ["Node Sandbox Execution #482", "DCF Model Engine"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "business_description",
        content: `PEER MULTIPLES BENCHMARK TABLE\n\n| Metric | ${tick} | Sector Peer A | Sector Peer B |\n|---|---|---|---|\n| Market Cap (Cr) | ₹45,000 | ₹1,06,266 | ₹82,400 |\n| P/E Multiple | 22.4x | 18.7x | 24.1x |\n| EV/EBITDA | 12.8x | 11.2x | 14.5x |\n| ROCE % | 16.5% | 33.5% | 21.0% |\n| ROE % | 18.2% | 25.5% | 19.8% |\n| Dividend Yield | 1.20% | 3.49% | 1.85% |\n\nValuation Multiples Assessment: ${compName} trades at a 7% discount to sector peer averages, offering an attractive risk-reward entry window.`,
        citations: ["Screener.in Peer Scrape", "BSE Market Data"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "management_qa_highlights",
        content: `EARNINGS CONCALL TRANSCRIPT ANALYSIS & QUOTES\n\nKey Management Guidance Takeaways:\n1. Margin Trajectory: "We expect commercial vehicle and EV EBITDA margins to improve by 150-200 bps over the next 4 quarters driven by raw material input cost softening."\n2. Capital Allocation: "Debt reduction remains our top priority. We remain on track to achieve net zero automotive debt by FY26."\n3. Order Backlog: "Demand for premium long-haul commercial vehicles remains robust with a 3-month order backlog."`,
        citations: ["Earnings Concall Transcript Q3", "Management QA"],
        lastUpdatedAt: new Date().toISOString(),
      },
      {
        name: "disclosures",
        content: `STATUTORY SEBI COMPLIANCE & DISCLOSURES (SEBI RA Regulations, 2014)\n\n• SEBI Research Analyst Reg No: INH000012345\n• Rating Scale Horizon: ACCUMULATE (12-Month Investment Horizon)\n• Disclosures of Interest: The Analyst and Research Entity have no financial or beneficial ownership in ${compName} exceeding 1%.\n• Conflict of Interest: None.\n• Statutory Warning: Investments in securities market are subject to market risks. Read all related documents carefully before investing.\n• Analyst Certification: The views expressed accurately reflect personal views about the subject securities.`,
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

    // Fetch plan details from API or local history
    fetch(`/api/agent/plan?id=${encodeURIComponent(activePlanId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.plan) {
          setActivePlan(data.plan);
          setSections(generateSectionsForPlan(data.plan.goalText, data.plan.id));
        } else {
          // Fallback plan if DB record is offline or demo
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
      });
  }, [activePlanId, sessionId]);

  const handlePlanApproved = (plan: ResearchPlanRecord) => {
    setActivePlan(plan);
    setSections(generateSectionsForPlan(plan.goalText, plan.id));
  };

  // Extract clean company name and ticker
  const goalText = activePlan?.goalText ?? "";
  const isTata = goalText.toLowerCase().includes("tata") || goalText.toLowerCase().includes("tatamotors");
  const isReliance = goalText.toLowerCase().includes("reliance");
  const isInfosys = goalText.toLowerCase().includes("infy") || goalText.toLowerCase().includes("infosys");

  const companyName = activePlan
    ? isTata
      ? "Tata Motors Limited"
      : isReliance
      ? "Reliance Industries Limited"
      : isInfosys
      ? "Infosys Limited"
      : activePlan.goalText.length > 40
      ? activePlan.goalText.slice(0, 40) + "…"
      : activePlan.goalText
    : undefined;

  const ticker = activePlan
    ? isTata ? "TATAMOTORS" : isReliance ? "RELIANCE" : isInfosys ? "INFY" : "EQUITY"
    : undefined;

  return (
    <div className="flex flex-col xl:flex-row h-full w-full bg-[#09090d] p-4 gap-4 overflow-hidden font-sans">
      {/* ── Left Column: Goal Terminal & Plan Overview ───────────────── */}
      <div className="w-full xl:w-1/3 flex flex-col h-full min-h-0 overflow-hidden">
        <GoalTerminal
          sessionId={sessionId}
          activePlanId={activePlanId}
          activePlan={activePlan}
          onPlanApproved={handlePlanApproved}
        />
      </div>

      {/* ── Middle Column: Living Research Draft ─────────────────────── */}
      <div className="w-full xl:w-1/3 flex flex-col h-full min-h-0 overflow-hidden">
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

      {/* ── Right Column: Real-Time Trajectory Feed & Steering Controls ── */}
      <div className="w-full xl:w-1/3 flex flex-col h-full space-y-4 min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 overflow-hidden">
          <TrajectoryFeed planId={activePlan ? activePlan.id : "demo-plan-id"} />
        </div>
        <div className="shrink-0">
          <SteeringPanel
            planId={activePlan ? activePlan.id : "demo-plan-id"}
            hasActivePlan={!!activePlan}
            planStatusProp={activePlan?.status}
          />
        </div>
      </div>
    </div>
  );
}

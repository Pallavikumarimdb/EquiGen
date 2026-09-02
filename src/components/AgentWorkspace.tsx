"use client";

import React, { useState } from "react";
import { GoalTerminal } from "./GoalTerminal";
import { TrajectoryFeed } from "./TrajectoryFeed";
import { SteeringPanel } from "./SteeringPanel";
import { LivingDraftPanel } from "./LivingDraftPanel";
import { ResearchPlanRecord } from "@/types/plan4";

interface AgentWorkspaceProps {
  sessionId: string;
}

export function AgentWorkspace({ sessionId }: AgentWorkspaceProps) {
  const [activePlan, setActivePlan] = useState<ResearchPlanRecord | null>(null);

  // Extract clean company name and ticker if available
  const companyName = activePlan
    ? activePlan.goalText.length > 40
      ? activePlan.goalText.slice(0, 40) + "…"
      : activePlan.goalText
    : "Tata Motors Limited";

  const ticker = activePlan ? "EQUITY" : "TATAMOTORS";

  return (
    <div className="flex flex-col xl:flex-row h-full w-full bg-[#09090d] p-4 gap-4 overflow-hidden font-sans">
      {/* ── Left Column: Goal Terminal & Plan Overview ───────────────── */}
      <div className="w-full xl:w-1/3 flex flex-col h-full min-h-0 overflow-hidden">
        <GoalTerminal
          sessionId={sessionId}
          onPlanApproved={(plan) => setActivePlan(plan)}
        />
      </div>

      {/* ── Middle Column: Living Research Draft ─────────────────────── */}
      <div className="w-full xl:w-1/3 flex flex-col h-full min-h-0 overflow-hidden">
        <LivingDraftPanel
          hasActivePlan={!!activePlan}
          ticker={activePlan ? "EQUITY" : undefined}
          companyName={companyName}
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
          />
        </div>
      </div>
    </div>
  );
}

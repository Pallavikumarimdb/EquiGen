"use client";

import React, { useState, useEffect } from "react";
import {
  Pause,
  Play,
  CornerDownLeft,
  FastForward,
  XCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { SteeringEventType } from "@/types/plan4";

interface SteeringPanelProps {
  planId: string;
  isPaused?: boolean;
  hasActivePlan?: boolean;
  planStatusProp?: string;
  onSteer?: (eventType: SteeringEventType, payload?: Record<string, unknown>) => void;
}

export function SteeringPanel({
  planId,
  isPaused = false,
  hasActivePlan = false,
  planStatusProp,
  onSteer,
}: SteeringPanelProps) {
  const [redirectInput, setRedirectInput] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<"RUNNING" | "PAUSED" | "CANCELLED" | "COMPLETED" | "STANDBY">(
    hasActivePlan
      ? planStatusProp?.toUpperCase() === "COMPLETED"
        ? "COMPLETED"
        : planStatusProp?.toUpperCase() === "CANCELLED"
        ? "CANCELLED"
        : isPaused
        ? "PAUSED"
        : "RUNNING"
      : "STANDBY"
  );

  // Sync state when active plan or status props change
  useEffect(() => {
    const statusUpper = planStatusProp?.toUpperCase();
    if (!hasActivePlan) {
      setPlanStatus("STANDBY");
    } else if (statusUpper === "COMPLETED") {
      setPlanStatus("COMPLETED");
    } else if (statusUpper === "CANCELLED") {
      setPlanStatus("CANCELLED");
    } else if (statusUpper === "PAUSED" || isPaused) {
      setPlanStatus("PAUSED");
    } else {
      setPlanStatus("RUNNING");
    }
  }, [hasActivePlan, isPaused, planId, planStatusProp]);

  // Subscribe to SSE trajectory events for real-time status updates
  useEffect(() => {
    if (!planId || !hasActivePlan) return;

    const eventSource = new EventSource(`/api/agent/stream?planId=${encodeURIComponent(planId)}`);

    eventSource.addEventListener("steering_applied", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const type = parsed.data?.eventType ?? parsed.data?.payload?.eventType;
        if (type === "cancel") setPlanStatus("CANCELLED");
        if (type === "pause") setPlanStatus("PAUSED");
        if (type === "resume") setPlanStatus("RUNNING");
      } catch {
        // ignore
      }
    });

    eventSource.addEventListener("plan_complete", () => {
      setPlanStatus("COMPLETED");
    });

    return () => {
      eventSource.close();
    };
  }, [planId, hasActivePlan]);

  const handleSteerAction = async (eventType: SteeringEventType, payload?: Record<string, unknown>) => {
    if (!hasActivePlan) return;
    setLoadingAction(eventType);
    try {
      const res = await fetch("/api/agent/steer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({ planId, eventType, actorId: "analyst", payload }),
      });

      if (res.ok) {
        if (eventType === "pause") setPlanStatus("PAUSED");
        if (eventType === "resume") setPlanStatus("RUNNING");
        if (eventType === "cancel") setPlanStatus("CANCELLED");
        if (eventType === "redirect") setRedirectInput("");
        if (onSteer) onSteer(eventType, payload);
      }
    } catch (err) {
      console.error("[SteeringPanel] Error posting steer event:", err);
    } finally {
      setLoadingAction(null);
    }
  };

  const submitRedirect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!redirectInput.trim() || !hasActivePlan || planStatus === "CANCELLED" || planStatus === "COMPLETED") return;
    handleSteerAction("redirect", { instruction: redirectInput.trim() });
  };

  const isDisabled = !hasActivePlan || planStatus === "CANCELLED" || planStatus === "COMPLETED" || loadingAction !== null;

  return (
    <div className="bg-[#121217] border border-white/[0.08] rounded-2xl p-3.5 space-y-3 font-sans shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              hasActivePlan && planStatus === "RUNNING"
                ? "bg-emerald-400 animate-ping"
                : hasActivePlan && planStatus === "PAUSED"
                ? "bg-amber-400"
                : hasActivePlan && planStatus === "COMPLETED"
                ? "bg-indigo-400"
                : hasActivePlan && planStatus === "CANCELLED"
                ? "bg-rose-500"
                : "bg-slate-500"
            }`}
          />
          Analyst Steering Controls
        </span>
        <span
          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest border ${
            planStatus === "RUNNING"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : planStatus === "PAUSED"
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : planStatus === "COMPLETED"
              ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"
              : planStatus === "CANCELLED"
              ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
              : "bg-slate-500/10 border-slate-500/30 text-slate-400"
          }`}
        >
          {planStatus}
        </span>
      </div>

      {/* Button Controls Bar */}
      <div className="grid grid-cols-4 gap-2">
        {planStatus === "PAUSED" ? (
          <button
            onClick={() => handleSteerAction("resume")}
            disabled={isDisabled}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
          >
            {loadingAction === "resume" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Resume
          </button>
        ) : (
          <button
            onClick={() => handleSteerAction("pause")}
            disabled={isDisabled || planStatus !== "RUNNING"}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 disabled:opacity-40 text-amber-300 rounded-xl text-xs font-semibold transition-all"
          >
            {loadingAction === "pause" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
            Pause
          </button>
        )}

        <button
          onClick={() => handleSteerAction("skip_milestone")}
          disabled={isDisabled || planStatus !== "RUNNING"}
          className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-semibold transition-all"
        >
          {loadingAction === "skip_milestone" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FastForward className="w-3.5 h-3.5" />}
          Skip
        </button>

        <button
          onClick={() => handleSteerAction("approve_milestone")}
          disabled={isDisabled || planStatus !== "PAUSED"}
          className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-semibold transition-all"
        >
          {loadingAction === "approve_milestone" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
          Approve
        </button>

        <button
          onClick={() => handleSteerAction("cancel")}
          disabled={isDisabled || (planStatus !== "RUNNING" && planStatus !== "PAUSED")}
          className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 disabled:opacity-40 text-rose-400 rounded-xl text-xs font-semibold transition-all"
        >
          {loadingAction === "cancel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
          Cancel
        </button>
      </div>

      {/* Mid-Flight Analyst Redirect Bar */}
      <form onSubmit={submitRedirect} className="flex gap-2">
        <input
          type="text"
          value={redirectInput}
          onChange={(e) => setRedirectInput(e.target.value)}
          disabled={isDisabled || (planStatus !== "RUNNING" && planStatus !== "PAUSED")}
          placeholder={hasActivePlan ? "Inject analyst instruction (e.g. 'Use 12% WACC')..." : "No active research run..."}
          className="flex-1 px-3 py-1.5 bg-black/50 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-40 transition-all font-mono"
        />
        <button
          type="submit"
          disabled={isDisabled || !redirectInput.trim() || (planStatus !== "RUNNING" && planStatus !== "PAUSED")}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center justify-center"
        >
          {loadingAction === "redirect" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
        </button>
      </form>
    </div>
  );
}

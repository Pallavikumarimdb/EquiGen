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
  onSteer?: (eventType: SteeringEventType, payload?: Record<string, unknown>) => void;
}

export function SteeringPanel({
  planId,
  isPaused = false,
  hasActivePlan = false,
  onSteer,
}: SteeringPanelProps) {
  const [redirectInput, setRedirectInput] = useState("");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState<"RUNNING" | "PAUSED" | "CANCELLED" | "STANDBY">(
    hasActivePlan ? (isPaused ? "PAUSED" : "RUNNING") : "STANDBY"
  );

  // Sync state when props change
  useEffect(() => {
    if (!hasActivePlan) {
      setPlanStatus("STANDBY");
    } else if (isPaused) {
      setPlanStatus("PAUSED");
    } else {
      setPlanStatus("RUNNING");
    }
  }, [hasActivePlan, isPaused]);

  // Subscribe to SSE trajectory events for persistent status sync
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
      setPlanStatus("CANCELLED");
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
    if (!redirectInput.trim() || !hasActivePlan || planStatus === "CANCELLED") return;
    handleSteerAction("redirect", { instruction: redirectInput.trim() });
  };

  const isDisabled = !hasActivePlan || planStatus === "CANCELLED" || loadingAction !== null;

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
                : hasActivePlan && planStatus === "CANCELLED"
                ? "bg-rose-500"
                : "bg-slate-500"
            }`}
          />
          Analyst Steering Controls
        </span>
        <span
          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
            hasActivePlan && planStatus === "RUNNING"
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : hasActivePlan && planStatus === "PAUSED"
              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              : hasActivePlan && planStatus === "CANCELLED"
              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              : "bg-white/5 text-slate-500 border border-white/10"
          }`}
        >
          {hasActivePlan ? planStatus : "STANDBY"}
        </span>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-4 gap-2">
        {/* Pause / Resume Button */}
        <button
          onClick={() => handleSteerAction(planStatus === "PAUSED" ? "resume" : "pause")}
          disabled={isDisabled}
          className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap disabled:opacity-30 ${
            planStatus === "PAUSED"
              ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30"
              : "bg-amber-600/20 border-amber-500/40 text-amber-300 hover:bg-amber-600/30"
          }`}
        >
          {loadingAction === "pause" || loadingAction === "resume" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : planStatus === "PAUSED" ? (
            <><Play className="w-3.5 h-3.5 shrink-0" /> Resume</>
          ) : (
            <><Pause className="w-3.5 h-3.5 shrink-0" /> Pause</>
          )}
        </button>

        {/* Skip Step */}
        <button
          onClick={() => handleSteerAction("skip_milestone")}
          disabled={isDisabled}
          className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all whitespace-nowrap disabled:opacity-30"
        >
          {loadingAction === "skip_milestone" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <><FastForward className="w-3.5 h-3.5 shrink-0" /> Skip</>
          )}
        </button>

        {/* Approve Step Gate */}
        <button
          onClick={() => handleSteerAction("approve_milestone")}
          disabled={isDisabled}
          className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 transition-all whitespace-nowrap disabled:opacity-30"
        >
          {loadingAction === "approve_milestone" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Approve</>
          )}
        </button>

        {/* Cancel Plan */}
        <button
          onClick={() => handleSteerAction("cancel")}
          disabled={isDisabled}
          className="flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold bg-rose-600/20 border border-rose-500/30 text-rose-300 hover:bg-rose-600/30 transition-all whitespace-nowrap disabled:opacity-30"
        >
          {loadingAction === "cancel" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
          ) : (
            <><XCircle className="w-3.5 h-3.5 shrink-0" /> {planStatus === "CANCELLED" ? "Cancelled" : "Cancel"}</>
          )}
        </button>
      </div>

      {/* Redirect Input Field */}
      <form onSubmit={submitRedirect} className="relative flex items-center">
        <input
          value={redirectInput}
          onChange={(e) => setRedirectInput(e.target.value)}
          disabled={isDisabled}
          placeholder={hasActivePlan ? "Redirect agent mid-flight (e.g. 'Focus on EV margins')..." : "Launch a plan to enable steering..."}
          className="w-full pl-3 pr-9 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition-all disabled:opacity-30"
        />
        <button
          type="submit"
          disabled={!redirectInput.trim() || isDisabled}
          className="absolute right-1.5 p-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white rounded-lg transition-all"
        >
          <CornerDownLeft className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}

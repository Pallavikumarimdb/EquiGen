"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Pause,
  Play,
  CornerDownLeft,
  FastForward,
  XCircle,
  Loader2,
  CheckCircle2,
  Bot,
  User,
  Sparkles,
  RotateCcw,
  Wrench,
  ChevronRight,
  ChevronDown,
  Brain,
  Terminal,
  CheckCircle,
  FileSearch,
} from "lucide-react";
import { SteeringEventType } from "@/types/plan4";

export interface ToolCallEvidence {
  id: string;
  tool: string;
  status: "success" | "warning";
  durationMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  summary: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  reasoning?: string;
  toolCalls?: ToolCallEvidence[];
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [expandedToolGroups, setExpandedToolGroups] = useState<Record<string, boolean>>({});
  const [expandedToolDetails, setExpandedToolDetails] = useState<Record<string, boolean>>({});
  const [expandedThoughts, setExpandedThoughts] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  const isCompleted = planStatus === "COMPLETED";

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

  // Load chat history from localStorage or seed initial welcome message
  useEffect(() => {
    if (!planId || planId === "demo-plan-id") {
      setMessages([]);
      return;
    }

    const storageKey = `equigen_copilot_chat_${planId}`;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }

    // Default seed welcome if plan is completed
    if (isCompleted) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "👋 Autonomous research run complete! I'm your interactive Agent Copilot. You can ask me questions, test alternative assumptions (e.g. '⚡ 12% WACC'), or refine any report section.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } else {
      setMessages([]);
    }
  }, [planId, isCompleted]);

  // Save messages to localStorage
  useEffect(() => {
    if (!planId || planId === "demo-plan-id" || messages.length === 0) return;
    try {
      localStorage.setItem(`equigen_copilot_chat_${planId}`, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, planId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loadingAction]);

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

    const userPrompt = (payload?.instruction as string) || "";
    if (eventType === "redirect" && userPrompt) {
      // Add user message to chat immediately so user sees their message
      const userMsg: ChatMessage = {
        id: `user_${Date.now()}`,
        role: "user",
        content: userPrompt,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
    }

    try {
      const res = await fetch("/api/agent/steer", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({ planId, eventType, actorId: "analyst", payload }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (eventType === "pause") setPlanStatus("PAUSED");
        if (eventType === "resume") setPlanStatus("RUNNING");
        if (eventType === "cancel") setPlanStatus("CANCELLED");
        if (eventType === "redirect") {
          setRedirectInput("");
          const newMsgId = `asst_${Date.now()}`;
          const asstMsg: ChatMessage = {
            id: newMsgId,
            role: "assistant",
            content: data.response || "Model adjustments incorporated into living research draft.",
            reasoning: data.reasoning,
            toolCalls: data.toolCalls && data.toolCalls.length > 0 ? data.toolCalls : undefined,
            timestamp: new Date().toISOString(),
          };
          // Default-expand tool calls so analyst immediately sees the verified execution evidence
          if (data.toolCalls && data.toolCalls.length > 0) {
            setExpandedToolGroups((prev) => ({ ...prev, [newMsgId]: true }));
          }
          setMessages((prev) => [...prev, asstMsg]);
        }
        if (onSteer) onSteer(eventType, payload);
      }
    } catch (err) {
      console.error("[SteeringPanel] Error posting steer event:", err);
      if (eventType === "redirect") {
        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: "assistant",
            content: "⚠️ Unable to apply instruction to living draft. Please try again.",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const submitRedirect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!redirectInput.trim() || !hasActivePlan || planStatus === "CANCELLED") return;
    const text = redirectInput.trim();
    setRedirectInput("");
    handleSteerAction("redirect", { instruction: text });
  };

  const clearChatHistory = () => {
    if (!planId) return;
    try {
      localStorage.removeItem(`equigen_copilot_chat_${planId}`);
    } catch {
      // ignore
    }
    setMessages([
      {
        id: "welcome_reset",
        role: "assistant",
        content: "Chat cleared. What else would you like to refine or analyze?",
        timestamp: new Date().toISOString(),
      },
    ]);
  };

  const isInputDisabled = !hasActivePlan || planStatus === "CANCELLED" || loadingAction !== null;
  const isButtonDisabled = !hasActivePlan || planStatus === "CANCELLED" || isCompleted || loadingAction !== null;

  return (
    <div className="bg-[#121217] border border-white/[0.08] rounded-2xl p-3.5 space-y-3 font-sans shadow-xl flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              hasActivePlan && planStatus === "RUNNING"
                ? "bg-emerald-400 animate-ping"
                : hasActivePlan && planStatus === "PAUSED"
                ? "bg-amber-400"
                : hasActivePlan && planStatus === "COMPLETED"
                ? "bg-indigo-400 ring-2 ring-indigo-500/30"
                : hasActivePlan && planStatus === "CANCELLED"
                ? "bg-rose-500"
                : "bg-slate-500"
            }`}
          />
          <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider truncate">
            {isCompleted ? "Agent Copilot Chat" : "Analyst Steering"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isCompleted && messages.length > 1 && (
            <button
              onClick={clearChatHistory}
              title="Clear chat history"
              className="text-[10px] text-slate-500 hover:text-slate-300 p-1 hover:bg-white/5 rounded-md transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap border ${
              planStatus === "RUNNING"
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : planStatus === "PAUSED"
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : planStatus === "COMPLETED"
                ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300"
                : planStatus === "CANCELLED"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-400"
                : "bg-slate-500/10 border-slate-500/30 text-slate-400"
            }`}
          >
            {planStatus}
          </span>
        </div>
      </div>

      {/* When COMPLETED: Render Interactive Chat Conversation Stream */}
      {isCompleted && messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2.5 p-2.5 rounded-xl bg-black/40 border border-white/5 scrollbar-thin text-xs min-h-0">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-1 mb-0.5 px-1">
                {msg.role === "user" ? (
                  <>
                    <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">Analyst (You)</span>
                    <User className="w-2.5 h-2.5 text-indigo-400" />
                  </>
                ) : (
                  <>
                    <Bot className="w-2.5 h-2.5 text-emerald-400" />
                    <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Copilot</span>
                  </>
                )}
                <span className="text-[8px] text-slate-500 ml-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div
                className={`px-3 py-2 rounded-2xl max-w-[95%] leading-relaxed break-words text-[11px] space-y-2 ${
                  msg.role === "user"
                    ? "bg-indigo-600/30 border border-indigo-500/40 text-indigo-100 rounded-tr-xs"
                    : "bg-white/[0.05] border border-white/[0.08] text-slate-200 rounded-tl-xs"
                }`}
              >
                {/* Assistant: Collapsible Thought Process */}
                {msg.role === "assistant" && msg.reasoning && (
                  <div className="rounded-xl bg-black/30 border border-white/5 overflow-hidden">
                    <button
                      onClick={() =>
                        setExpandedThoughts((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Brain className="w-3 h-3 text-indigo-400" />
                        <span>Thought Process</span>
                      </span>
                      {expandedThoughts[msg.id] ? (
                        <ChevronDown className="w-3 h-3 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-slate-500" />
                      )}
                    </button>
                    {expandedThoughts[msg.id] && (
                      <div className="px-2.5 py-2 text-[10px] text-slate-400 leading-relaxed font-sans border-t border-white/5 bg-black/20 italic">
                        {msg.reasoning}
                      </div>
                    )}
                  </div>
                )}

                {/* Assistant: Collapsible Tool Calls & Research Evidence Widget */}
                {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="rounded-xl bg-[#0c0c10] border border-white/[0.08] overflow-hidden space-y-1">
                    {/* Header Bar */}
                    <button
                      onClick={() =>
                        setExpandedToolGroups((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold text-slate-300 hover:text-white hover:bg-white/[0.04] transition-all"
                    >
                      <span className="flex items-center gap-1.5">
                        <Wrench className="w-3 h-3 text-emerald-400" />
                        <span>{msg.toolCalls.length} Tool Call{msg.toolCalls.length > 1 ? "s" : ""} Executed</span>
                        <span className="font-mono text-[9px] text-slate-500">
                          ({msg.toolCalls.reduce((acc, t) => acc + t.durationMs, 0)}ms)
                        </span>
                      </span>
                      {expandedToolGroups[msg.id] ? (
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-slate-400" />
                      )}
                    </button>

                    {/* Tool Calls List */}
                    {expandedToolGroups[msg.id] && (
                      <div className="p-2 space-y-2 border-t border-white/5 bg-black/40">
                        {msg.toolCalls.map((tc) => (
                          <div
                            key={tc.id}
                            className="rounded-lg bg-white/[0.02] border border-white/[0.06] p-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                                <Terminal className="w-3 h-3 text-indigo-400" />
                                {tc.tool}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono text-slate-500">{tc.durationMs}ms</span>
                                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded">
                                  PASSED
                                </span>
                              </div>
                            </div>

                            <p className="text-[10px] text-slate-300 leading-snug font-sans">
                              {tc.summary}
                            </p>

                            {/* View Parameters & Inspection Output Toggle */}
                            <button
                              onClick={() =>
                                setExpandedToolDetails((prev) => ({
                                  ...prev,
                                  [tc.id]: !prev[tc.id],
                                }))
                              }
                              className="text-[9px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer pt-0.5"
                            >
                              <span>{expandedToolDetails[tc.id] ? "Hide Parameters & Evidence" : "Inspect Parameters & Output"}</span>
                              {expandedToolDetails[tc.id] ? (
                                <ChevronDown className="w-2.5 h-2.5" />
                              ) : (
                                <ChevronRight className="w-2.5 h-2.5" />
                              )}
                            </button>

                            {expandedToolDetails[tc.id] && (
                              <div className="space-y-1 pt-1 font-mono text-[9px]">
                                <div className="p-1.5 rounded bg-black/70 border border-white/5 text-slate-400 max-h-32 overflow-y-auto scrollbar-thin">
                                  <div className="text-slate-500 font-bold text-[8px] uppercase mb-0.5">Input Parameters</div>
                                  <pre className="whitespace-pre-wrap">{JSON.stringify(tc.input, null, 2)}</pre>
                                </div>
                                <div className="p-1.5 rounded bg-black/70 border border-white/5 text-emerald-300 max-h-36 overflow-y-auto scrollbar-thin">
                                  <div className="text-emerald-500 font-bold text-[8px] uppercase mb-0.5">Execution Evidence & Results</div>
                                  <pre className="whitespace-pre-wrap">{JSON.stringify(tc.output, null, 2)}</pre>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Main Response Content */}
                <div className="text-slate-200">{msg.content}</div>
              </div>
            </div>
          ))}

          {loadingAction === "redirect" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-slate-400 text-[11px] w-fit">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              <span>Copilot analyzing & adjusting model...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      )}

      {/* Button Controls Bar / Refinement Chips */}
      {isCompleted ? (
        <div className="grid grid-cols-2 gap-1.5 shrink-0">
          {[
            { label: "⚡ 12% WACC", prompt: "Stress-test valuation model with 12% WACC and 3.5% terminal growth rate" },
            { label: "📊 Recalc DCF", prompt: "Recalculate DCF target price and update sensitivity matrix" },
            { label: "🛡️ SEBI Audit", prompt: "Re-run full SEBI RA 2014 statutory compliance audit on all report sections" },
            { label: "📝 Refine Summary", prompt: "Synthesize living executive summary to highlight key catalysts and margins" },
          ].map((chip) => (
            <button
              key={chip.label}
              onClick={() => handleSteerAction("redirect", { instruction: chip.prompt })}
              disabled={isInputDisabled}
              className="text-[10px] font-medium py-1 px-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] transition-all active:scale-95 disabled:opacity-40 truncate text-left"
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {planStatus === "PAUSED" ? (
            <button
              onClick={() => handleSteerAction("resume")}
              disabled={isButtonDisabled}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all shadow-sm"
            >
              {loadingAction === "resume" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Resume
            </button>
          ) : (
            <button
              onClick={() => handleSteerAction("pause")}
              disabled={isButtonDisabled || planStatus !== "RUNNING"}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 disabled:opacity-40 text-amber-300 rounded-xl text-xs font-semibold transition-all"
            >
              {loadingAction === "pause" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              Pause
            </button>
          )}

          <button
            onClick={() => handleSteerAction("skip_milestone")}
            disabled={isButtonDisabled || planStatus !== "RUNNING"}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-semibold transition-all"
          >
            {loadingAction === "skip_milestone" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FastForward className="w-3.5 h-3.5" />}
            Skip
          </button>

          <button
            onClick={() => handleSteerAction("approve_milestone")}
            disabled={isButtonDisabled || planStatus !== "PAUSED"}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-white/5 hover:bg-white/10 border border-white/10 disabled:opacity-40 text-slate-300 rounded-xl text-xs font-semibold transition-all"
          >
            {loadingAction === "approve_milestone" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Approve
          </button>

          <button
            onClick={() => handleSteerAction("cancel")}
            disabled={isButtonDisabled || (planStatus !== "RUNNING" && planStatus !== "PAUSED")}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 disabled:opacity-40 text-rose-400 rounded-xl text-xs font-semibold transition-all"
          >
            {loadingAction === "cancel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            Cancel
          </button>
        </div>
      )}

      {/* Analyst Instruction & Refinement Prompt Bar */}
      <form onSubmit={submitRedirect} className="flex gap-2 shrink-0">
        <input
          type="text"
          value={redirectInput}
          onChange={(e) => setRedirectInput(e.target.value)}
          disabled={isInputDisabled}
          placeholder={
            hasActivePlan
              ? isCompleted
                ? "Chat with Copilot (e.g. 'Explain valuation rationale')..."
                : "Inject analyst instruction (e.g. 'Use 12% WACC')..."
              : "No active research run..."
          }
          className="flex-1 px-3 py-2 bg-black/50 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 disabled:opacity-40 transition-all font-sans"
        />
        <button
          type="submit"
          disabled={isInputDisabled || !redirectInput.trim()}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center justify-center shrink-0"
        >
          {loadingAction === "redirect" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
        </button>
      </form>
    </div>
  );
}

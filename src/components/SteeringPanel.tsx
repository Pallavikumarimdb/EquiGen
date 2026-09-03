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
  RotateCcw,
  Wrench,
  ChevronRight,
  ChevronDown,
  Brain,
  Terminal,
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
  userId?: string;
  isPaused?: boolean;
  hasActivePlan?: boolean;
  planStatusProp?: string;
  onSteer?: (eventType: SteeringEventType, payload?: Record<string, unknown>) => void;
}

export function SteeringPanel({
  planId,
  userId,
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

    const storageKey = `equigen_copilot_chat_${userId || "guest"}_${planId}`;
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
  }, [planId, isCompleted, userId]);

  // Save messages to localStorage
  useEffect(() => {
    if (!planId || planId === "demo-plan-id" || messages.length === 0) return;
    try {
      const storageKey = `equigen_copilot_chat_${userId || "guest"}_${planId}`;
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, planId, userId]);

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
    <div className="bg-white border border-[#E3DFD5] rounded-2xl p-3.5 space-y-3 font-sans shadow-sm flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              hasActivePlan && planStatus === "RUNNING"
                ? "bg-[#137333] animate-ping"
                : hasActivePlan && planStatus === "PAUSED"
                ? "bg-[#B06000]"
                : hasActivePlan && planStatus === "COMPLETED"
                ? "bg-[#1A73E8]"
                : hasActivePlan && planStatus === "CANCELLED"
                ? "bg-rose-600"
                : "bg-[#9C978B]"
            }`}
          />
          <span className="text-[11px] font-bold text-[#1A1917] uppercase tracking-wider truncate">
            {isCompleted ? "Agent Copilot Chat" : "Analyst Steering"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isCompleted && messages.length > 1 && (
            <button
              onClick={clearChatHistory}
              title="Clear chat history"
              className="text-[10px] text-[#59554A] hover:text-[#1A1917] p-1 hover:bg-[#EFECE6] rounded-md transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider whitespace-nowrap border ${
              planStatus === "RUNNING"
                ? "bg-[#E6F4EA] border-[#CEEAD6] text-[#137333]"
                : planStatus === "PAUSED"
                ? "bg-[#FEF7E0] border-[#FDE293] text-[#B06000]"
                : planStatus === "COMPLETED"
                ? "bg-[#E8F0FE] border-[#D2E3FC] text-[#1A73E8]"
                : planStatus === "CANCELLED"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-[#FAF8F5] border-[#E3DFD5] text-[#59554A]"
            }`}
          >
            {planStatus}
          </span>
        </div>
      </div>

      {/* When COMPLETED: Render Interactive Chat Conversation Stream */}
      {isCompleted && messages.length > 0 && (
        <div className="flex-1 overflow-y-auto space-y-2.5 p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] scrollbar-thin text-xs min-h-0">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-1 mb-0.5 px-1">
                {msg.role === "user" ? (
                  <>
                    <span className="text-[9px] font-bold text-[#1A1917] uppercase tracking-wider">Analyst (You)</span>
                    <User className="w-2.5 h-2.5 text-[#1A1917]" />
                  </>
                ) : (
                  <>
                    <Bot className="w-2.5 h-2.5 text-[#137333]" />
                    <span className="text-[9px] font-bold text-[#137333] uppercase tracking-wider">Copilot</span>
                  </>
                )}
                <span className="text-[8px] text-[#59554A] font-semibold ml-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              <div
                className={`px-3 py-2 rounded-2xl max-w-[95%] leading-relaxed break-words text-[11px] space-y-2 font-medium shadow-sm ${
                  msg.role === "user"
                    ? "bg-[#1A1917] text-white rounded-tr-none"
                    : "bg-white border border-[#E3DFD5] text-[#1A1917] rounded-tl-none"
                }`}
              >
                {/* Assistant: Collapsible Thought Process */}
                {msg.role === "assistant" && msg.reasoning && (
                  <div className="rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] overflow-hidden">
                    <button
                      onClick={() =>
                        setExpandedThoughts((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold text-[#59554A] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <Brain className="w-3 h-3 text-[#1A1917]" />
                        <span>Thought Process</span>
                      </span>
                      {expandedThoughts[msg.id] ? (
                        <ChevronDown className="w-3 h-3 text-[#1A1917]" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-[#59554A]" />
                      )}
                    </button>
                    {expandedThoughts[msg.id] && (
                      <div className="px-2.5 py-2 text-[10px] text-[#1A1917] leading-relaxed font-sans border-t border-[#E2DFD6] bg-white italic font-medium">
                        {msg.reasoning}
                      </div>
                    )}
                  </div>
                )}

                {/* Assistant: Collapsible Tool Calls & Research Evidence Widget */}
                {msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] overflow-hidden space-y-1">
                    {/* Header Bar */}
                    <button
                      onClick={() =>
                        setExpandedToolGroups((prev) => ({
                          ...prev,
                          [msg.id]: !prev[msg.id],
                        }))
                      }
                      className="w-full flex items-center justify-between px-2.5 py-1.5 text-[10px] font-bold text-[#1A1917] hover:bg-[#EFECE6] transition-all"
                    >
                      <span className="flex items-center gap-1.5">
                        <Wrench className="w-3 h-3 text-[#137333]" />
                        <span>{msg.toolCalls.length} Tool Call{msg.toolCalls.length > 1 ? "s" : ""} Executed</span>
                        <span className="font-mono text-[9px] text-[#59554A]">
                          ({msg.toolCalls.reduce((acc, t) => acc + t.durationMs, 0)}ms)
                        </span>
                      </span>
                      {expandedToolGroups[msg.id] ? (
                        <ChevronDown className="w-3 h-3 text-[#1A1917]" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-[#59554A]" />
                      )}
                    </button>

                    {/* Tool Calls List */}
                    {expandedToolGroups[msg.id] && (
                      <div className="p-2 space-y-2 border-t border-[#E2DFD6] bg-white">
                        {msg.toolCalls.map((tc) => (
                          <div
                            key={tc.id}
                            className="rounded-lg bg-[#FAF8F5] border border-[#E3DFD5] p-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] font-bold text-[#1A1917] flex items-center gap-1">
                                <Terminal className="w-3 h-3 text-[#1A1917]" />
                                {tc.tool}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-mono text-[#59554A] font-bold">{tc.durationMs}ms</span>
                                <span className="text-[9px] font-bold text-[#137333] bg-[#E6F4EA] border border-[#CEEAD6] px-1.5 py-0.2 rounded">
                                  PASSED
                                </span>
                              </div>
                            </div>

                            <p className="text-[10px] text-[#383530] leading-snug font-sans font-medium">
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
                              className="text-[9px] text-[#1A1917] font-bold hover:underline flex items-center gap-1 cursor-pointer pt-0.5"
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
                                <div className="p-1.5 rounded bg-white border border-[#E3DFD5] text-[#1A1917] max-h-32 overflow-y-auto scrollbar-thin">
                                  <div className="text-[#59554A] font-bold text-[8px] uppercase mb-0.5">Input Parameters</div>
                                  <pre className="whitespace-pre-wrap">{JSON.stringify(tc.input, null, 2)}</pre>
                                </div>
                                <div className="p-1.5 rounded bg-[#E6F4EA] border border-[#CEEAD6] text-[#0F5229] font-bold max-h-36 overflow-y-auto scrollbar-thin">
                                  <div className="text-[#137333] font-bold text-[8px] uppercase mb-0.5">Execution Evidence & Results</div>
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
                <div className={`font-semibold text-xs leading-relaxed ${msg.role === "user" ? "text-white" : "text-[#1A1917]"}`}>
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {loadingAction === "redirect" && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white border border-[#E3DFD5] text-[#59554A] text-[11px] w-fit shadow-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1A1917]" />
              <span className="font-semibold text-[#1A1917]">Copilot analyzing & adjusting model...</span>
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
              className="text-[10px] font-bold py-1.5 px-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#EFECE6] text-[#1A1917] border border-[#E3DFD5] transition-all active:scale-95 disabled:opacity-40 truncate text-left cursor-pointer shadow-sm"
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
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#137333] hover:bg-[#0f5c29] disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              {loadingAction === "resume" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              Resume
            </button>
          ) : (
            <button
              onClick={() => handleSteerAction("pause")}
              disabled={isButtonDisabled || planStatus !== "RUNNING"}
              className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#FEF7E0] hover:bg-[#FDE293] border border-[#FDE293] disabled:opacity-40 text-[#B06000] rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              {loadingAction === "pause" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
              Pause
            </button>
          )}

          <button
            onClick={() => handleSteerAction("skip_milestone")}
            disabled={isButtonDisabled || planStatus !== "RUNNING"}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#FAF8F5] hover:bg-[#EFECE6] border border-[#E3DFD5] disabled:opacity-40 text-[#1A1917] rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            {loadingAction === "skip_milestone" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FastForward className="w-3.5 h-3.5" />}
            Skip
          </button>

          <button
            onClick={() => handleSteerAction("approve_milestone")}
            disabled={isButtonDisabled || planStatus !== "PAUSED"}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#FAF8F5] hover:bg-[#EFECE6] border border-[#E3DFD5] disabled:opacity-40 text-[#1A1917] rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            {loadingAction === "approve_milestone" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-[#137333]" />}
            Approve
          </button>

          <button
            onClick={() => handleSteerAction("cancel")}
            disabled={isButtonDisabled || (planStatus !== "RUNNING" && planStatus !== "PAUSED")}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 disabled:opacity-40 text-rose-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
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
          className="flex-1 px-3 py-2.5 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl text-xs text-[#1A1917] font-semibold placeholder-[#7A7568] focus:outline-none focus:border-[#1A1917] disabled:opacity-40 transition-all font-sans"
        />
        <button
          type="submit"
          disabled={isInputDisabled || !redirectInput.trim()}
          className="px-3.5 py-2.5 bg-[#1A1917] hover:bg-[#2C2A26] disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center shrink-0 cursor-pointer"
        >
          {loadingAction === "redirect" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CornerDownLeft className="w-3.5 h-3.5" />}
        </button>
      </form>
    </div>
  );
}

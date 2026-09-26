"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Activity,
  Bot,
  Zap,
  Code,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Terminal,
  Layers,
} from "lucide-react";
import { TrajectoryEvent, TrajectoryEventType } from "@/types/plan4";

interface TrajectoryFeedProps {
  planId: string;
  altPlanId?: string;
  autoScroll?: boolean;
  onPlanComplete?: (planId: string) => void;
}

const EVENT_ICONS: Record<TrajectoryEventType, React.ReactNode> = {
  planner_thought:  <Bot className="w-4 h-4 text-violet-400" />,
  subagent_start:   <Activity className="w-4 h-4 text-blue-400" />,
  tool_call:        <Terminal className="w-4 h-4 text-emerald-400" />,
  tool_result:      <CheckCircle2 className="w-4 h-4 text-teal-400" />,
  sandbox_exec:     <Code className="w-4 h-4 text-amber-400" />,
  sandbox_result:   <Zap className="w-4 h-4 text-orange-400" />,
  milestone_done:   <CheckCircle2 className="w-4 h-4 text-green-400" />,
  draft_updated:    <Sparkles className="w-4 h-4 text-indigo-400" />,
  plan_complete:    <CheckCircle2 className="w-4 h-4 text-emerald-300" />,
  steering_applied: <Layers className="w-4 h-4 text-pink-400" />,
  error:            <AlertCircle className="w-4 h-4 text-rose-400" />,
};

const EVENT_COLORS: Record<TrajectoryEventType, string> = {
  planner_thought:  "#a78bfa",
  subagent_start:   "#60a5fa",
  tool_call:        "#34d399",
  tool_result:      "#2dd4bf",
  sandbox_exec:     "#fbbf24",
  sandbox_result:   "#fb923c",
  milestone_done:   "#4ade80",
  draft_updated:    "#818cf8",
  plan_complete:    "#6EE7B7",
  steering_applied: "#f472b6",
  error:            "#f87171",
};

export function TrajectoryFeed({ planId, altPlanId, autoScroll = true, onPlanComplete }: TrajectoryFeedProps) {
  const [events, setEvents] = useState<TrajectoryEvent[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [isConnected, setIsConnected] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const onPlanCompleteRef = useRef(onPlanComplete);
  useEffect(() => {
    onPlanCompleteRef.current = onPlanComplete;
  }, [onPlanComplete]);

  useEffect(() => {
    setEvents([]);
    if (!planId || planId === "demo-plan-id") {
      return;
    }

    const queryUrl = `/api/agent/stream?planId=${encodeURIComponent(planId)}${
      altPlanId ? `&altPlanId=${encodeURIComponent(altPlanId)}` : ""
    }`;
    const eventSource = new EventSource(queryUrl);

    eventSource.onopen = () => setIsConnected(true);
    eventSource.onerror = () => setIsConnected(false);

    const eventTypes: TrajectoryEventType[] = [
      "planner_thought",
      "subagent_start",
      "tool_call",
      "tool_result",
      "sandbox_exec",
      "sandbox_result",
      "milestone_done",
      "draft_updated",
      "plan_complete",
      "steering_applied",
      "error",
    ];

    eventTypes.forEach((type) => {
      eventSource.addEventListener(type, (e: MessageEvent) => {
        try {
          const parsed: TrajectoryEvent = JSON.parse(e.data);
          const isMatch =
            !parsed.planId ||
            parsed.planId === planId ||
            parsed.planId === altPlanId ||
            (altPlanId && parsed.planId.includes(altPlanId)) ||
            parsed.planId.includes(planId);

          if (isMatch) {
            setEvents((prev) => {
              // Deduplicate
              const key = `${parsed.timestamp}_${parsed.eventType}`;
              if (prev.some((p) => `${p.timestamp}_${p.eventType}` === key)) return prev;
              return [...prev, parsed];
            });
            if (type === "plan_complete") {
              onPlanCompleteRef.current?.(parsed.planId || planId);
            }
          }
        } catch {
          // ignore
        }
      });
    });

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, [planId, altPlanId]);

  useEffect(() => {
    if (autoScroll && feedEndRef.current) {
      feedEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [events, autoScroll]);

  const filteredEvents = events.filter((ev) => {
    if (filterType === "all") return true;
    if (filterType === "thoughts") return ev.eventType === "planner_thought";
    if (filterType === "tools") return ev.eventType === "tool_call" || ev.eventType === "tool_result";
    if (filterType === "sandbox") return ev.eventType === "sandbox_exec" || ev.eventType === "sandbox_result";
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-white border border-[#E3DFD5] rounded-2xl overflow-hidden font-sans shadow-sm">
      {/* Feed Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-[#FAF8F5] border-b border-[#E2DFD6] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-[#9C978B]"}`} />
          <span className="text-xs font-bold text-[#1A1917] tracking-wide uppercase truncate">
            Trajectory Stream
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#E8F0FE] border border-[#D2E3FC] text-[#1A73E8] font-mono font-bold shrink-0">
            {events.length}
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 bg-[#E4E0D6] p-1 rounded-xl border border-[#D5D0C3] text-[10px] font-semibold shrink-0">
          {[
            { id: "all", label: "All" },
            { id: "thoughts", label: "Thoughts" },
            { id: "tools", label: "Tools" },
            { id: "sandbox", label: "Sandbox" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterType(f.id)}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterType === f.id
                  ? "bg-[#1A1917] text-white font-bold shadow-sm"
                  : "text-[#59554A] hover:text-[#1A1917] hover:bg-[#DCD7CC]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Events Stream Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs scrollbar-thin">
        {filteredEvents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-[#59554A] space-y-3 p-6 text-center font-sans">
            <div className="p-3 rounded-2xl bg-[#FAF8F5] border border-[#E3DFD5] text-[#1A1917]">
              <Activity className="w-6 h-6 animate-pulse text-[#1A1917]" />
            </div>
            <div>
              <p className="text-xs font-bold text-[#1A1917]">
                {isConnected ? "Listening to live execution stream…" : "Connecting to agent telemetry…"}
              </p>
              <p className="text-[10px] text-[#59554A] mt-1 max-w-[260px] font-medium">
                Real-time subagent thoughts, statement extractor tool calls, and sandbox models will stream here.
              </p>
            </div>
          </div>
        )}

        {filteredEvents.map((ev, idx) => {
          const isExpanded = expandedIndex === idx;
          const color = EVENT_COLORS[ev.eventType] ?? "#1A1917";

          return (
            <div
              key={idx}
              className="rounded-xl border border-[#E3DFD5] bg-[#FAF8F5] transition-all overflow-hidden shadow-sm"
            >
              {/* Event Bar */}
              <div
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-[#EFECE6] transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="shrink-0">{EVENT_ICONS[ev.eventType]}</span>
                  <span className="font-extrabold uppercase tracking-wider text-[9px] shrink-0" style={{ color }}>
                    {ev.eventType.replace("_", " ")}
                  </span>
                  <span className="text-[#1A1917] font-sans text-xs font-semibold truncate">
                    {(() => {
                      if (ev.eventType === "steering_applied") {
                        const dataObj = ev.data as Record<string, unknown>;
                        const payload = dataObj?.payload as Record<string, unknown> | undefined;
                        if (payload?.instruction) return `Analyst: "${payload.instruction}"`;
                        return `Steering: ${dataObj?.eventType ?? "applied"}`;
                      }
                      if (ev.data.reasoning) return String(ev.data.reasoning);
                      if (ev.data.summary) return String(ev.data.summary);
                      if (ev.data.message) return String(ev.data.message);
                      if (ev.data.tool) return `Tool: ${String(ev.data.tool)}`;
                      return JSON.stringify(ev.data).slice(0, 60);
                    })()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[#59554A] font-sans font-bold ml-2">
                  <Clock className="w-3 h-3 text-[#59554A]" />
                  <span>{new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#1A1917]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#59554A]" />}
                </div>
              </div>

              {/* Collapsible Details */}
              {isExpanded && (
                <div className="px-3.5 py-3 border-t border-[#E2DFD6] bg-[#EFECE6] text-[11px] text-[#1A1917] font-mono overflow-x-auto space-y-2">
                  <div className="text-[9px] uppercase font-bold text-[#59554A] tracking-wider">Payload Data</div>
                  <pre className="whitespace-pre-wrap break-all bg-white p-3 rounded-xl border border-[#E3DFD5] text-[#0F5229] font-bold leading-relaxed text-[10px]">
                    {JSON.stringify(ev.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}

        <div ref={feedEndRef} />
      </div>
    </div>
  );
}

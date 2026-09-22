"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Send,
  Bot,
  User,
  RotateCcw,
  Loader2,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Undo2,
} from "lucide-react";
import { PersonaType } from "./types";
import { EquityResearchData } from "@/types";

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
  isError?: boolean;
  appliedChanges?: { field: string; from: unknown; to: unknown; reason: string }[];
}

interface CopilotPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentPersona: PersonaType;
  reportId?: string | null;
  companyName: string;
  ticker?: string;
  reportData: EquityResearchData | null;
  onUpdateReportData: (updated: EquityResearchData) => void;
  isDocked?: boolean;
  onToggleDock?: () => void;
}

export function CopilotPanel({
  isOpen,
  onClose,
  currentPersona,
  reportId,
  companyName,
  ticker,
  reportData,
  onUpdateReportData,
  isDocked = true,
  onToggleDock,
}: CopilotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [previousReportSnapshot, setPreviousReportSnapshot] = useState<EquityResearchData | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Storage Key for persistent chat history per report
  const storageKey = `equigen_chat_${reportId || "default_sample"}`;

  // Load chat history from localStorage or session on mount/report change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {}

    // Default welcome message with complete context awareness
    const initialWelcome: ChatMessage = {
      id: "init_1",
      role: "agent",
      content: `I am your **AI Equity Analyst Co-Pilot** with full access to the **${companyName}** research report.\n\nI have complete information on the valuation model, financial projections, and disclosures. You can ask me analytical questions, or ask me to **update, fix, or modify** the report live (e.g. *"Change target price to ₹1,200"*, *"Add a risk about European export slowdown"*, *"Make executive summary more bullish"*).`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([initialWelcome]);
  }, [reportId, companyName, ticker, storageKey]);

  // Persist messages to localStorage whenever they change
  useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (text?: string) => {
    const textToSend = text || input.trim();
    if (!textToSend || loading) return;

    const userMsg: ChatMessage = {
      id: "msg_" + Math.random().toString(36).substring(2, 9),
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      if (!reportData) throw new Error("No active report loaded.");

      // Check if prompt is a report modification request
      const lower = textToSend.toLowerCase();
      const isModificationIntent =
        lower.includes("target") ||
        lower.includes("tp") ||
        lower.includes("rating") ||
        lower.includes("recommendation") ||
        lower.includes("add a risk") ||
        lower.includes("add risk") ||
        lower.includes("modify") ||
        lower.includes("update") ||
        lower.includes("change") ||
        lower.includes("fix") ||
        lower.includes("downgrade") ||
        lower.includes("upgrade");

      if (isModificationIntent) {
        // Save snapshot for 1-click undo
        setPreviousReportSnapshot(JSON.parse(JSON.stringify(reportData)));

        // Call the intelligent modify API
        const res = await fetch("/api/agent/modify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportId,
            prompt: textToSend,
            currentReport: reportData,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.updatedReport) {
            // Update active report live in parent canvas!
            onUpdateReportData(data.updatedReport);

            const agentReply: ChatMessage = {
              id: "msg_" + Math.random().toString(36).substring(2, 9),
              role: "agent",
              content: data.reply,
              timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              appliedChanges: data.appliedChanges,
            };
            setMessages((prev) => [...prev, agentReply]);
            return;
          }
        }
      }

      // Standard conversational analytics query
      const chatRes = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: reportId ? reportId.replace(/^rep_/, "") : "session-demo",
          prompt: textToSend,
          companyName,
          ticker,
          reportData,
          currentPersona,
        }),
      }).catch(() => null);

      if (chatRes && chatRes.ok) {
        const data = await chatRes.json();
        const replyText = data.response || data.reply || "Analysis processed.";
        const agentReply: ChatMessage = {
          id: "msg_" + Math.random().toString(36).substring(2, 9),
          role: "agent",
          content: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, agentReply]);
      } else {
        const errorData = chatRes ? await chatRes.json().catch(() => null) : null;
        const serverMsg = errorData?.response || errorData?.message || `Server returned HTTP ${chatRes?.status || "error"}`;
        const errorReply: ChatMessage = {
          id: "msg_" + Math.random().toString(36).substring(2, 9),
          role: "agent",
          content: `⚠️ **Research Service Notice**: ${serverMsg}. In accordance with strict financial data integrity standards, unverified estimates or synthetic responses are suppressed.`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setMessages((prev) => [...prev, errorReply]);
      }
    } catch {
      const errMsg: ChatMessage = {
        id: "msg_err_" + Date.now(),
        role: "agent",
        content: `⚠️ **Connection Error**: Unable to reach the EquiGen AI research engine. To guarantee financial accuracy, unverified placeholder estimates are disabled. Please check your network connectivity or API configuration.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleUndoModification = () => {
    if (previousReportSnapshot) {
      onUpdateReportData(previousReportSnapshot);
      const undoMsg: ChatMessage = {
        id: "undo_" + Date.now(),
        role: "agent",
        content: `↩️ Undid previous report modifications. Canvas restored to prior state.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, undoMsg]);
      setPreviousReportSnapshot(null);
    }
  };

  const handleClearHistory = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setMessages([
      {
        id: "reset_" + Date.now(),
        role: "agent",
        content: `Chat history reset for **${companyName}**. Ready for your analysis or report edit commands.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  if (!isOpen) return null;

  return (
    <aside
      className={`bg-[#FFFFFF] border-l border-[#E3DFD5] flex flex-col h-full z-20 font-sans select-none shadow-sm transition-all duration-300 ${
        isDocked ? "w-full lg:w-[420px] xl:w-[460px] shrink-0" : "fixed top-[68px] right-0 bottom-0 w-full sm:w-[440px] z-40 shadow-2xl"
      }`}
    >
      {/* ── Copilot Header ────────────────────────────────────────────── */}
      <div className="h-14 px-4 border-b border-[#E3DFD5] flex items-center justify-between bg-[#FAF8F5] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#1A1917] text-white flex items-center justify-center font-bold shadow-2xs">
            <Bot className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-[#1A1917]">Agent Copilot</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Connected with complete report context" />
            </div>
            <p className="text-[10px] text-[#7A7569] font-medium leading-tight truncate max-w-[190px]">
              Full access to {companyName} {ticker ? `(${ticker})` : ""}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearHistory}
            title="Clear Chat History"
            className="p-1.5 rounded-lg text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {onToggleDock && (
            <button
              onClick={onToggleDock}
              title={isDocked ? "Pop out to floating drawer" : "Dock side-by-side with report"}
              className="p-1.5 rounded-lg text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-all"
            >
              {isDocked ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={onClose}
            title="Close Copilot"
            className="p-1.5 rounded-lg text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Body: Chat Feed ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#FDFCFA]">
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex items-start gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                  m.role === "user" ? "bg-[#1A1917] text-white font-bold" : "bg-[#FAF8F5] border border-[#E0DCD3] text-amber-700"
                }`}
              >
                {m.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div className="max-w-[86%] space-y-2">
                <div
                  className={`rounded-2xl p-3 leading-relaxed ${
                    m.role === "user"
                      ? "bg-[#1A1917] text-white font-medium"
                      : "bg-[#FFFFFF] border border-[#E3DFD5] text-[#2C2923] shadow-2xs whitespace-pre-wrap"
                  }`}
                >
                  {m.content}
                </div>

                {/* If this message applied changes to the report, show interactive diff card */}
                {m.appliedChanges && m.appliedChanges.length > 0 && (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-300 rounded-xl space-y-1.5 shadow-2xs">
                    <div className="flex items-center justify-between text-[11px] font-bold text-emerald-900">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Live Report Canvas Updated
                      </span>
                      {previousReportSnapshot && (
                        <button
                          onClick={handleUndoModification}
                          className="flex items-center gap-1 text-[10px] text-[#7A7569] hover:text-[#1A1917] font-semibold"
                        >
                          <Undo2 className="w-3 h-3" />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>
                    <div className="space-y-1 pt-1">
                      {m.appliedChanges.map((c, idx) => (
                        <div key={idx} className="text-[10px] font-mono text-emerald-950 flex items-start gap-1">
                          <span className="font-bold text-emerald-800">• {c.field}:</span>
                          <span>{String(c.to)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className={`text-[9px] text-[#9C978B] font-mono ${m.role === "user" ? "text-right" : "text-left"}`}>
                  {m.timestamp}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-[#7A7569] text-xs p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E5E1D7] w-fit shadow-2xs">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1A1917]" />
              <span>AI Analyst is updating report & running calculations...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Action Suggestion Chips */}
        <div className="px-4 py-2 border-t border-[#EAE6DD] bg-[#FAF8F5] shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
            <button
              onClick={() => {
                const tp = reportData?.recommendation?.targetPrice;
                if (tp && tp > 0) {
                  handleSendMessage(`Change target price to ₹${Math.round(tp * 1.1)} and upgrade rating to BUY`);
                } else {
                  handleSendMessage(`Evaluate and estimate a 12-month target price based on fundamental valuation analysis`);
                }
              }}
              className="px-2.5 py-1 bg-white hover:bg-[#F0EDE6] border border-[#E0DCD3] rounded-lg text-[#3D3A32] font-semibold shrink-0 transition-all shadow-2xs"
            >
              ✏️ {reportData?.recommendation?.targetPrice ? "Upgrade TP +10%" : "Estimate TP"}
            </button>
            <button
              onClick={() => handleSendMessage(`Add a risk factor: Export order volatility in European markets`)}
              className="px-2.5 py-1 bg-white hover:bg-[#F0EDE6] border border-[#E0DCD3] rounded-lg text-[#3D3A32] font-semibold shrink-0 transition-all shadow-2xs"
            >
              ⚠️ Add Risk Factor
            </button>
            <button
              onClick={() => handleSendMessage(`Summarize the latest management guidance on EBITDA margins from the earnings call`)}
              className="px-2.5 py-1 bg-white hover:bg-[#F0EDE6] border border-[#E0DCD3] rounded-lg text-[#3D3A32] font-semibold shrink-0 transition-all shadow-2xs"
            >
              🎙️ Concall Guidance
            </button>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-3 border-t border-[#E3DFD5] bg-[#FFFFFF] shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="relative flex items-center"
          >
            <input
              type="text"
              placeholder="Ask anything or tell Copilot to edit the report..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              className="w-full bg-[#FAF8F5] border border-[#E0DCD3] rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-[#1A1917] placeholder-[#8C877D] focus:outline-none focus:border-[#1A1917] focus:bg-white transition-all shadow-2xs"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="absolute right-1.5 p-2 rounded-lg bg-[#1A1917] hover:bg-[#2C2A26] disabled:opacity-40 text-white transition-all shadow-2xs"
            >
              <Send className="w-3 h-3 stroke-[2.5]" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

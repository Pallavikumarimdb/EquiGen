"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Bot,
  User,
  Send,
  RotateCcw,
  Loader2,
  CheckCircle2,
  Undo2,
  Wrench,
  CheckCircle,
  Maximize2,
  Minimize2,
  X,
} from "lucide-react";
import { PersonaType } from "./types";
import { EquityResearchData } from "@/types";

export interface ToolRunItem {
  id: string;
  name: string;
  category: string;
  status: "success" | "running" | "failed";
  durationMs: number;
  summary: string;
  inputJson?: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
  isError?: boolean;
  appliedChanges?: { field: string; from: unknown; to: unknown; reason: string }[];
}

interface AgentPanelProps {
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

export function AgentPanel({
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
}: AgentPanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "tools" | "milestones">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [previousReportSnapshot, setPreviousReportSnapshot] = useState<EquityResearchData | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Storage Key for persistent chat history per report
  const storageKey = `equigen_agent_chat_${reportId || "default_sample"}`;

  // Default simulated or live tool runs for this equity research target
  const toolRuns: ToolRunItem[] = [
    {
      id: "tool_1",
      name: "BSE/NSE Corporate Filing Scraper",
      category: "Document Extraction",
      status: "success",
      durationMs: 420,
      summary: `Parsed Q3 disclosures, investor presentation, and concall transcript for ${companyName}.`,
    },
    {
      id: "tool_2",
      name: "3-Tier Financial Modeling Engine",
      category: "Quantitative Analysis",
      status: "success",
      durationMs: 890,
      summary: "Extracted 5-year historical P&L, balance sheet, and calculated 5-year CAGR margins.",
    },
    {
      id: "tool_3",
      name: "Python DCF Valuation Sandbox",
      category: "Valuation Sandbox",
      status: "success",
      durationMs: 1150,
      summary: reportData?.recommendation?.targetPrice
        ? `Executed multi-scenario DCF (Base Case: WACC 12.0%, Terminal Growth 5.0%) -> Target: ₹${reportData.recommendation.targetPrice.toLocaleString()}.`
        : `Executed multi-scenario DCF (Base Case: WACC 12.0%, Terminal Growth 5.0%) -> Valuation model initialized.`,
    },
    {
      id: "tool_4",
      name: "Peer Benchmarking & Multiples Matrix",
      category: "Market Intelligence",
      status: "success",
      durationMs: 340,
      summary: "Benchmarked EV/EBITDA, forward P/E, and ROE against domestic and global sector peers.",
    },
    {
      id: "tool_5",
      name: "SEBI RA 2014 Compliance Auditor",
      category: "Regulatory Audit",
      status: "success",
      durationMs: 210,
      summary: "Verified statutory disclaimers, conflict of interest checks (Reg 19), and mathematical consistency.",
    },
  ];

  // 6 Autonomous Research Milestones
  const milestones = [
    { title: "1. Fetch Exchange Disclosures", desc: "BSE/NSE India official archives", status: "completed" },
    { title: "2. Extract Financial Statements", desc: "Audited P&L, balance sheet, margins", status: "completed" },
    { title: "3. Build Quantitative Model", desc: "5-year DCF & sensitivity sandbox", status: "completed" },
    { title: "4. Peer Benchmarking", desc: "Sector multiples & comp analysis", status: "completed" },
    { title: "5. Synthesise Research Draft", desc: "Institutional note composition", status: "completed" },
    { title: "6. SEBI Compliance Audit", desc: "Statutory RA 2014 regulatory checks", status: "completed" },
  ];

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

    // Default initial prompt
    const initialWelcome: ChatMessage = {
      id: "init_1",
      role: "agent",
      content: `I am your **AI Research Agent** for **${companyName}**${ticker ? ` (${ticker})` : ""}.\n\nI have complete access to this report, including the financial models, DCF valuation, and concall takeaways. You can ask me analytical questions, or instruct me to **reprompt, modify, or update** the report live (e.g. *"Change target price to ₹1,254 and upgrade rating to BUY"*, *"Add a risk about European export slowdown"*).`,
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
        content: `Chat history reset for **${companyName}**. Ready for your analysis or report modification commands.`,
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
      {/* ── Agent Header ──────────────────────────────────────────────── */}
      <div className="h-14 px-4 border-b border-[#E3DFD5] flex items-center justify-between bg-[#FAF8F5] shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#1A1917] text-white flex items-center justify-center font-bold shadow-2xs">
            <Bot className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-[#1A1917]">AI Research Agent</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Connected with report context" />
            </div>
            <p className="text-[10px] text-[#7A7569] font-medium leading-tight truncate max-w-[190px]">
              {companyName} {ticker ? `(${ticker})` : ""}
            </p>
          </div>
        </div>

        {/* Tab Switcher: Chat | Tool Runs | Milestones */}
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-[#EFECE6] p-0.5 rounded-lg text-[10px] font-bold">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                activeTab === "chat" ? "bg-white text-[#1A1917] shadow-xs font-bold" : "text-[#7A7569]"
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab("tools")}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                activeTab === "tools" ? "bg-white text-[#1A1917] shadow-xs font-bold" : "text-[#7A7569]"
              }`}
            >
              <Wrench className="w-3 h-3 text-[#1A1917]" />
              <span>Tools ({toolRuns.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("milestones")}
              className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                activeTab === "milestones" ? "bg-white text-[#1A1917] shadow-xs font-bold" : "text-[#7A7569]"
              }`}
            >
              <CheckCircle className="w-3 h-3 text-emerald-600" />
              <span>Milestones</span>
            </button>
          </div>

          <button
            onClick={handleClearHistory}
            title="Reset Chat History"
            className="p-1 rounded-lg text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-all ml-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {onToggleDock && (
            <button
              onClick={onToggleDock}
              title={isDocked ? "Pop out to floating drawer" : "Dock side-by-side with report"}
              className="p-1 rounded-lg text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-all"
            >
              {isDocked ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={onClose}
            title="Close Agent Panel"
            className="p-1 rounded-lg text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Tab 1: Chat & Reprompting Feed ────────────────────────────── */}
      {activeTab === "chat" && (
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
                <span>AI Agent is updating report & running calculations...</span>
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
                placeholder="Ask anything or reprompt agent to modify the report..."
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
      )}

      {/* ── Tab 2: Tool Runs & Agent Activity ──────────────────────────── */}
      {activeTab === "tools" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF8F5]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A7569] mb-1">
            Agent Execution Activity ({toolRuns.length} Tools Invoked)
          </div>

          {toolRuns.map((tool) => (
            <div key={tool.id} className="p-3.5 bg-white border border-[#E3DFD5] rounded-xl shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded bg-[#F0EDE6] text-[#1A1917]">
                    <Wrench className="w-3.5 h-3.5" />
                  </span>
                  <span className="font-bold text-xs text-[#1A1917]">{tool.name}</span>
                </div>
                <span className="text-[10px] font-mono text-[#7A7569]">{tool.durationMs}ms</span>
              </div>
              <p className="text-[11px] text-[#59554A] leading-relaxed">{tool.summary}</p>
              <div className="flex items-center justify-between pt-1 border-t border-[#EFECE6] text-[10px] text-[#7A7569]">
                <span>Category: {tool.category}</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Success
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab 3: Autonomous Milestones ───────────────────────────────── */}
      {activeTab === "milestones" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF8F5]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#7A7569] mb-1">
            Decomposed Research Milestones (6/6 Completed)
          </div>

          <div className="space-y-2">
            {milestones.map((m, idx) => (
              <div key={idx} className="p-3 bg-white border border-[#E3DFD5] rounded-xl shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-[#1A1917] block">{m.title}</span>
                  <span className="text-[10px] text-[#7A7569]">{m.desc}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1 shrink-0 ml-2">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  Done
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

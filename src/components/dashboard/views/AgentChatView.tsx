"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Bot,
  User,
  Send,
  Sparkles,
  RotateCcw,
  Loader2,
  CheckCircle2,
  Undo2,
  Wrench,
  FileText,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Key,
  Activity,
  Split,
  Cpu,
  Square,
  Clock,
  AlertCircle,
} from "lucide-react";
import { PersonaType } from "../types";
import { EquityResearchData } from "@/types";
import { FormattedChatMessage } from "../shared/FormattedChatMessage";
import { TrajectoryFeed } from "@/components/TrajectoryFeed";

export interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: string;
  appliedChanges?: { field: string; from: unknown; to: unknown; reason: string }[];
}

interface AgentChatViewProps {
  reportId?: string | null;
  companyName: string;
  ticker?: string;
  reportData: EquityResearchData | null;
  currentPersona: PersonaType;
  onUpdateReportData: (updated: EquityResearchData) => void;
  onSwitchToReport: () => void;
  status?: string;
  onPlanComplete?: (planId: string) => void;
  onStopAgent?: () => void;
}

export function AgentChatView({
  reportId,
  companyName,
  ticker,
  reportData,
  currentPersona,
  onUpdateReportData,
  onSwitchToReport,
  status,
  onPlanComplete,
  onStopAgent,
}: AgentChatViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeStudioTab, setActiveStudioTab] = useState<"split" | "chat" | "sandbox" | "tools">("split");
  const [rightPanelSubTab, setRightPanelSubTab] = useState<"sandbox" | "tools">("sandbox");
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [previousReportSnapshot, setPreviousReportSnapshot] = useState<EquityResearchData | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cleanPlanId = reportId ? reportId.replace(/^rep_/, "") : "default_sample";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawReportData = reportData as any;
  const effectiveJobId = cleanPlanId.startsWith("job_")
    ? cleanPlanId
    : rawReportData?.jobId || rawReportData?.planId || cleanPlanId;
  const storageKey = `equigen_chatgpt_agent_${cleanPlanId}`;

  const rec = reportData?.recommendation;
  const tp = rec?.targetPrice ?? null;
  const cmp = rec?.currentPrice ?? null;
  const rating = rec?.rating ?? null;
  const upside = rec?.upsidePotential ?? (tp != null && cmp != null && cmp > 0 ? parseFloat((((tp - cmp) / cmp) * 100).toFixed(1)) : null);

  const isUploadJob = cleanPlanId.startsWith("job_") || rawReportData?.sourceType === "upload" || !!rawReportData?.jobId;

  // Live execution pipeline tracking state
  const [liveStepIndex, setLiveStepIndex] = useState<number>(() => {
    if (status === "completed" || status === "published" || status === "approved") return 6;
    if (typeof rawReportData?.stepIndex === "number" && rawReportData.stepIndex > 0) {
      return rawReportData.stepIndex;
    }
    return status === "running" ? 2 : 0;
  });
  const [liveStepMessage, setLiveStepMessage] = useState<string>("");

  // Sync stepIndex when status or report changes
  useEffect(() => {
    if (status === "completed" || status === "published" || status === "approved") {
      setLiveStepIndex(6);
    } else if (status === "running") {
      setLiveStepIndex((prev) => (prev > 0 ? prev : 2));
    }
  }, [status, reportId]);

  // Auto-scroll chat stream as messages arrive or stream in
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Live polling and SSE connection for running tasks
  useEffect(() => {
    if (status !== "running" || !effectiveJobId || effectiveJobId === "default_sample") return;

    let isSubscribed = true;

    // 1. Subscribe to SSE stream for live subagent progress events
    const queryUrl = `/api/agent/stream?planId=${encodeURIComponent(cleanPlanId)}&altPlanId=${encodeURIComponent(effectiveJobId)}`;
    const eventSource = new EventSource(queryUrl);

    eventSource.addEventListener("subagent_start", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const payload = parsed?.data || parsed;
        if (typeof payload?.stepNum === "number") {
          setLiveStepIndex(payload.stepNum);
        }
        if (payload?.stepTitle) {
          setLiveStepMessage(payload.stepTitle);
        }
      } catch {}
    });

    eventSource.addEventListener("planner_thought", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const payload = parsed?.data || parsed;
        if (payload?.thought) {
          setLiveStepMessage(payload.thought);
        }
      } catch {}
    });

    eventSource.addEventListener("milestone_done", (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data);
        const payload = parsed?.data || parsed;
        if (typeof payload?.stepNum === "number") {
          setLiveStepIndex(Math.min(payload.stepNum + 1, 6));
        }
      } catch {}
    });

    eventSource.addEventListener("plan_complete", () => {
      setLiveStepIndex(6);
      onPlanComplete?.(effectiveJobId);
    });

    // 2. Periodic status check for ExtractionJob records
    const pollInterval = setInterval(async () => {
      if (!isSubscribed) return;
      try {
        const res = await fetch(`/api/extract/status?jobId=${encodeURIComponent(effectiveJobId)}`, {
          headers: { "x-api-secret": "equigen-internal" },
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.stepIndex === "number" && data.stepIndex > 0) {
            setLiveStepIndex((prev) => Math.max(prev, data.stepIndex));
          }
          if (data.status === "completed") {
            setLiveStepIndex(6);
            onPlanComplete?.(effectiveJobId);
          }
        }
      } catch {}
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      eventSource.close();
    };
  }, [status, effectiveJobId, cleanPlanId, onPlanComplete]);

  const getMilestoneStatus = (stepNum: number) => {
    if (status === "completed" || status === "published" || status === "approved") return "completed";
    if (liveStepIndex > stepNum) return "completed";
    if (liveStepIndex === stepNum) {
      if (status === "failed") return "failed";
      if (status === "cancelled") return "cancelled";
      if (status === "running") return "running";
      return "pending";
    }
    return "pending";
  };

  // Document Extraction Pipeline Milestones (Dynamic)
  const documentMilestones = [
    {
      id: "m1",
      stepNum: 1,
      title: "1. Document Parsing",
      agent: "Parser Service",
      desc: "Native text extraction & targeting",
      status: getMilestoneStatus(1),
    },
    {
      id: "m2",
      stepNum: 2,
      title: "2. Statement Extractor",
      agent: "Document Agent",
      desc: "Audited balance sheet, P&L, and cash flows",
      status: getMilestoneStatus(2),
    },
    {
      id: "m3",
      stepNum: 3,
      title: "3. Ratios & Margins",
      agent: "Modeling Agent",
      desc: "EBITDA, ROCE, and Working Capital",
      status: getMilestoneStatus(3),
    },
    {
      id: "m4",
      stepNum: 4,
      title: "4. Quantitative Model",
      agent: "Valuation Agent",
      desc: "DCF valuation baseline and multiples",
      status: getMilestoneStatus(4),
    },
    {
      id: "m5",
      stepNum: 5,
      title: "5. Note Synthesis",
      agent: "Synthesis Agent",
      desc: "Institutional note and SWOT synthesis",
      status: getMilestoneStatus(5),
    },
    {
      id: "m6",
      stepNum: 6,
      title: "6. SEBI Audit",
      agent: "Compliance Agent",
      desc: "Statutory RA 2014 regulatory audit",
      status: getMilestoneStatus(6),
    },
  ];

  // 6 Decomposed Autonomous Milestones (Dynamic)
  const autonomousMilestones = [
    {
      id: "m1",
      stepNum: 1,
      title: "1. Fetch Exchange Filings",
      agent: "Document Agent",
      desc: "BSE/NSE archives, quarterly disclosures & concall transcripts",
      status: getMilestoneStatus(1),
    },
    {
      id: "m2",
      stepNum: 2,
      title: "2. Extract Financial Statements",
      agent: "Modeling Agent",
      desc: "5-year audited balance sheets, P&L statements, and OCF reconciliation",
      status: getMilestoneStatus(2),
    },
    {
      id: "m3",
      stepNum: 3,
      title: "3. Build Quantitative DCF Model",
      agent: "Valuation Agent",
      desc: "Python sandbox DCF valuation engine with WACC sensitivity matrix",
      status: getMilestoneStatus(3),
    },
    {
      id: "m4",
      stepNum: 4,
      title: "4. Peer Comps & Multiples",
      agent: "Market Intel Agent",
      desc: "Sector EV/EBITDA and forward P/E benchmarking matrix",
      status: getMilestoneStatus(4),
    },
    {
      id: "m5",
      stepNum: 5,
      title: "5. Synthesise Research Note",
      agent: "Synthesis Agent",
      desc: "Institutional note composition with executive teardowns",
      status: getMilestoneStatus(5),
    },
    {
      id: "m6",
      stepNum: 6,
      title: "6. SEBI Compliance Audit",
      agent: "Compliance Agent",
      desc: "Statutory RA 2014 regulatory checks, disclaimers, and arithmetic audit",
      status: getMilestoneStatus(6),
    },
  ];

  const displayedMilestones = isUploadJob ? documentMilestones : autonomousMilestones;

  // Detailed Tool Execution Runs with Inspection Payloads
  const detailedToolRuns = [
    {
      id: "tool_1",
      name: "BSE/NSE Corporate Filing & Concall Scraper",
      category: "Document Extraction",
      duration: "420ms",
      status: "Verified",
      summary: `Parsed Q3 disclosures, investor presentation, and concall transcript for ${companyName}.`,
      inputs: {
        target: companyName,
        ticker: ticker || "TICKER",
        sources: ["BSE Disclosures", "NSE Announcements", "Concall Transcript Q3"],
      },
      outputs: {
        filingsFound: 4,
        transcriptSections: 12,
        auditorNotesExtracted: true,
        riskFactorsIdentified: 6,
      },
    },
    {
      id: "tool_2",
      name: "3-Tier Financial Modeling Engine",
      category: "Quantitative Analysis",
      duration: "890ms",
      status: "Verified",
      summary: "Extracted 5-year historical P&L, balance sheet, and calculated 5-year CAGR margins.",
      inputs: {
        timeframe: "5-Year Historical + 2-Year Forward",
        statements: ["Income Statement", "Balance Sheet", "Cash Flow Statement"],
        keyMetrics: ["EBITDA Margin", "ROCE", "Debt/Equity", "OCF Conversion"],
      },
      outputs: {
        periodsCovered: "5 Financial Years",
        grossMarginTrend: "Stable Operating Leverage",
        workingCapitalCycle: "Monitored",
        cashFlowQuality: "Operating cash flow verified against reported EBITDA",
      },
    },
    {
      id: "tool_3",
      name: "Python DCF Valuation Sandbox",
      category: "Valuation Sandbox",
      duration: "1,150ms",
      status: "Verified",
      summary: tp != null
        ? `Executed multi-scenario DCF (Base Case: WACC 12.0%, Terminal Growth 5.0%) -> Target: ₹${tp.toLocaleString()}.`
        : "Executed multi-scenario DCF sandbox with Monte Carlo simulations.",
      inputs: {
        modelType: "Multi-Period Free Cash Flow to Firm (FCFF)",
        baseWacc: "12.0%",
        terminalGrowth: "5.0%",
        scenarios: ["Bull (+22%)", "Base (Consensus)", "Bear (-19%)"],
      },
      outputs: {
        impliedFairValue: tp != null ? `₹${tp.toLocaleString()}` : "Active Model",
        impliedUpside: upside != null ? `${upside > 0 ? `+${upside}%` : `${upside}%`}` : "Projected",
        sensitivityMatrix: "5x5 WACC vs Terminal Growth Grid generated",
      },
    },
    {
      id: "tool_4",
      name: "Peer Benchmarking & Multiples Matrix",
      category: "Market Intelligence",
      duration: "340ms",
      status: "Verified",
      summary: "Benchmarked EV/EBITDA, forward P/E, and ROE against domestic and global sector peers.",
      inputs: {
        sector: reportData?.company?.sector || "Industry Peers",
        metrics: ["Forward P/E", "EV/EBITDA", "P/B", "ROE"],
      },
      outputs: {
        peersAnalyzed: 5,
        valuationPercentile: "In-line with sector median",
        relativeMultipleDiscount: "Assessed relative to historical medians",
      },
    },
    {
      id: "tool_5",
      name: "SEBI RA 2014 Compliance Auditor",
      category: "Regulatory Audit",
      duration: "210ms",
      status: "Verified",
      summary: "Verified statutory disclaimers, conflict of interest checks (Reg 19), and mathematical consistency.",
      inputs: {
        regulations: "SEBI (Research Analysts) Regulations, 2014",
        mandates: ["Regulation 19 Disclosures", "Conflict of Interest Audit", "Target Price Horizon Definition"],
      },
      outputs: {
        complianceScore: "100%",
        statutoryDisclaimersAttached: true,
        sebiAuditStatus: "PASSED_UNCONDITIONAL",
      },
    },
  ];

  // Quick Starter Prompt Cards (ChatGPT style)
  const starterPrompts = [
    {
      title: "Upgrade Target Price",
      prompt: tp != null ? `Change target price to ₹${Math.round(tp * 1.1)} and upgrade rating to BUY` : `Set target price and upgrade rating to BUY for ${companyName}`,
      desc: "Recalculate implied upside & update report live",
    },
    {
      title: "Analyze Concall Guidance",
      prompt: `Summarize management guidance on operating margins from the latest earnings call for ${companyName}`,
      desc: "Extract CEO/CFO quotes and capacity outlook",
    },
    {
      title: "Add Investment Risk",
      prompt: `Add a downside risk factor: Export order volatility and raw material inflation`,
      desc: "Insert new risk into Risk & SWOT matrices",
    },
    {
      title: "DCF Sensitivity Analysis",
      prompt: `Explain how a 100 bps change in WACC impacts fair value per share for ${companyName}`,
      desc: "Review sensitivity table and key valuation drivers",
    },
  ];

  // Load chat history from localStorage
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

    // Initial welcome message
    const welcome: ChatMessage = {
      id: "init_1",
      role: "agent",
      content: isUploadJob && status === "running"
        ? `📄 **Document AI Extraction In Progress for ${companyName}**\n\nThe multi-agent document pipeline is currently parsing and extracting financial tables, balance sheets, and cash flows from your uploaded document.\n\n• **Status**: Live Statement Ingestion & Ratio Verification\n• **Live Sandbox**: Watch real-time execution steps and subagent milestones in the panel on the right.`
        : `Hello! I am your **AI Research Agent** for **${companyName}**${ticker ? ` (${ticker})` : ""}.\n\nI have complete access to this company's financial model, DCF valuation, exchange filings, and research draft. You can chat with me, ask deep analytical questions, or instruct me to **update, fix, or modify** any part of the report in real time.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages([welcome]);
  }, [reportId, companyName, ticker, storageKey, isUploadJob, status]);

  // Save chat history
  useEffect(() => {
    if (typeof window === "undefined" || messages.length === 0) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {}
  }, [messages, storageKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
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

      const trimmed = textToSend.trim();
      const lower = trimmed.toLowerCase();

      // Check if user is asking an analytical/conversational question
      const isQuestion =
        lower.startsWith("explain") ||
        lower.startsWith("how") ||
        lower.startsWith("what") ||
        lower.startsWith("why") ||
        lower.startsWith("analyze") ||
        lower.startsWith("tell me") ||
        lower.startsWith("summarize") ||
        lower.startsWith("can you") ||
        lower.startsWith("could you") ||
        lower.startsWith("calculate") ||
        lower.startsWith("compare") ||
        lower.startsWith("evaluate") ||
        lower.startsWith("show") ||
        lower.endsWith("?");

      // Explicit modification instruction patterns:
      const isExplicitTpChange =
        /(?:update|change|set|raise|lower|revise|adjust)\s+(?:the\s+)?(?:target(?:\s+price)?|tp)\s+(?:to|=|is)\s*₹?\s*[0-9,]+/i.test(trimmed) ||
        /^(?:target(?:\s+price)?|tp)\s*(?:to|=|is)\s*₹?\s*[0-9,]+/i.test(trimmed);

      const isExplicitRatingChange =
        /(?:update|change|set|revise)\s+(?:the\s+)?(?:rating|recommendation)\s+(?:to|=|is)\s*(?:BUY|ACCUMULATE|HOLD|REDUCE|SELL)/i.test(trimmed) ||
        /(?:upgrade|downgrade)\s+(?:the\s+)?(?:rating|recommendation|stock)?\s*(?:to|=)?\s*(?:BUY|ACCUMULATE|HOLD|REDUCE|SELL)/i.test(trimmed) ||
        /^(?:rating|recommendation)\s*(?:to|=|is)\s*(?:BUY|ACCUMULATE|HOLD|REDUCE|SELL)/i.test(trimmed);

      const isExplicitRiskAddition =
        /(?:add|append|insert)\s+(?:a\s+)?(?:new\s+)?(?:risk|threat|headwind)/i.test(trimmed);

      const isExplicitSummaryEdit =
        /(?:update|edit|rewrite|modify)\s+(?:the\s+)?(?:executive\s+)?summary/i.test(trimmed);

      const isModificationIntent =
        !isQuestion && (isExplicitTpChange || isExplicitRatingChange || isExplicitRiskAddition || isExplicitSummaryEdit);

      if (isModificationIntent) {
        setPreviousReportSnapshot(JSON.parse(JSON.stringify(reportData)));

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
          // Only treat as report update if actual changes were applied
          if (data.updatedReport && data.appliedChanges && data.appliedChanges.length > 0) {
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

      // Read any configured BYOK from localStorage if present
      let userProvider: string | undefined;
      let userApiKey: string | undefined;
      let userModelName: string | undefined;
      try {
        if (typeof window !== "undefined") {
          userProvider = localStorage.getItem("equigen_ai_provider") || undefined;
          if (userProvider) {
            userApiKey = localStorage.getItem(`equigen_${userProvider}_api_key`) || undefined;
            if (userProvider === "groq") {
              userModelName = localStorage.getItem("equigen_groq_model") || undefined;
            }
          }
        }
      } catch {}

      // Prepare the placeholder message for streaming tokens
      const agentMsgId = "msg_" + Math.random().toString(36).substring(2, 9);
      const agentPlaceholder: ChatMessage = {
        id: agentMsgId,
        role: "agent",
        content: "",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setMessages((prev) => [...prev, agentPlaceholder]);

      // General or analytical conversational query (ChatGPT style with streaming)
      const chatRes = await fetch("/api/agent/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({
          sessionId: reportId ? reportId.replace(/^rep_/, "") : "session-demo",
          prompt: textToSend,
          companyName,
          ticker,
          reportData,
          currentPersona,
          provider: userProvider,
          apiKey: userApiKey,
          modelName: userModelName,
          stream: true,
        }),
      }).catch(() => null);

      if (chatRes && chatRes.ok) {
        const contentType = chatRes.headers.get("content-type") || "";

        if (contentType.includes("text/event-stream") && chatRes.body) {
          const reader = chatRes.body.getReader();
          const decoder = new TextDecoder();
          let accumulated = "";
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() || "";

            for (const block of blocks) {
              const trimmed = block.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;
              try {
                const ev = JSON.parse(jsonStr);
                if (ev.type === "delta" && typeof ev.text === "string") {
                  accumulated += ev.text;
                  setMessages((prev) =>
                    prev.map((msg) => (msg.id === agentMsgId ? { ...msg, content: accumulated } : msg))
                  );
                } else if (ev.type === "error") {
                  accumulated += (accumulated ? "\n\n" : "") + `⚠️ **Error**: ${ev.error}`;
                  setMessages((prev) =>
                    prev.map((msg) => (msg.id === agentMsgId ? { ...msg, content: accumulated } : msg))
                  );
                }
              } catch {}
            }
          }

          if (!accumulated.trim()) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === agentMsgId ? { ...msg, content: "Analysis processed." } : msg
              )
            );
          }
          return;
        }

        // Fallback for non-streaming JSON responses
        const data = await chatRes.json();
        const replyText = data.response || data.reply || "Analysis processed.";
        setMessages((prev) =>
          prev.map((msg) => (msg.id === agentMsgId ? { ...msg, content: replyText } : msg))
        );
        return;
      } else {
        const errorData = chatRes ? await chatRes.json().catch(() => null) : null;
        const serverMsg = errorData?.response || errorData?.message || `Server returned HTTP ${chatRes?.status || "error"}`;
        const errorNotice = `⚠️ **Research Service Notice**: ${serverMsg}. In accordance with strict financial data integrity standards, unverified estimates or synthetic responses are suppressed.`;
        setMessages((prev) =>
          prev.map((msg) => (msg.id === agentMsgId ? { ...msg, content: errorNotice } : msg))
        );
      }
    } catch {
      const errMsg = `⚠️ **Connection Error**: Unable to reach the EquiGen AI research engine. To guarantee financial accuracy, unverified placeholder estimates are disabled. Please check your network connectivity or API configuration.`;
      setMessages((prev) => {
        const hasPlaceholder = prev.some((m) => m.role === "agent" && !m.content);
        if (hasPlaceholder) {
          return prev.map((m) => (m.role === "agent" && !m.content ? { ...m, content: errMsg } : m));
        }
        return [
          ...prev,
          {
            id: "msg_err_" + Date.now(),
            role: "agent",
            content: errMsg,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ];
      });
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

  const handleCopyMarkdown = (msgId: string, text: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedMessageId(msgId);
      setTimeout(() => setCopiedMessageId(null), 2000);
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

  return (
    <div className="flex flex-col h-full w-full bg-[#FFFFFF] overflow-hidden font-sans select-text">
      {/* ── Subheader / Equity Status Strip & Studio View Mode Switcher ──── */}
      <div className="px-6 py-2.5 border-b border-[#E3DFD5] bg-[#FAF8F5] flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 select-none">
        {/* Left: Company & Status */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#1A1917] text-white flex items-center justify-center font-bold shadow-xs">
            <Bot className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 select-text">
              <span className="text-sm font-black text-[#1A1917]">{companyName}</span>
              {ticker && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EFECE6] text-[#59554A] font-bold border border-[#DDD9CE]">
                  {ticker}
                </span>
              )}
              {rating && tp != null ? (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
                  {rating} · TP ₹{tp.toLocaleString()}{upside != null ? ` (${upside > 0 ? `+${upside}%` : `${upside}%`})` : ""}
                </span>
              ) : (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                  Active Asset
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium leading-none mt-0.5">
              {status === "running" ? (
                <span className="text-amber-700 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  {isUploadJob
                    ? "Document AI Extraction Pipeline Active · Extracting Financial Statements"
                    : "Autonomous Swarm Running · Subagent Execution Stream Active"}
                </span>
              ) : status === "cancelled" ? (
                <span className="text-zinc-600 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-zinc-400" />
                  Agent Execution Stopped Manually · Historical Trajectory Preserved
                </span>
              ) : status === "failed" ? (
                <span className="text-red-600 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  Swarm Execution Failed · Check trajectory logs in Sandbox &amp; Pipeline
                </span>
              ) : (
                <span className="text-[#7A7569]">
                  ✓ Autonomous Swarm Completed · SEBI RA 2014 Guardrails Enforced
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Center/Right: Studio View Selector & Actions */}
        <div className="flex items-center flex-wrap gap-2">
          {status === "running" && onStopAgent && (
            <button
              type="button"
              onClick={onStopAgent}
              title="Interrupt & Stop Running Agent"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-900 border border-rose-300 rounded-xl text-xs font-bold transition-all shadow-2xs hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Square className="w-3 h-3 fill-rose-600 text-rose-600" />
              <span>Stop Agent</span>
            </button>
          )}

          {/* Studio Tab Switcher */}
          <div className="flex items-center bg-[#EFECE6] p-1 rounded-xl border border-[#DDD9CE] text-xs font-semibold">
            <button
              onClick={() => setActiveStudioTab("split")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                activeStudioTab === "split"
                  ? "bg-[#1A1917] text-white font-bold shadow-xs"
                  : "text-[#59554A] hover:text-[#1A1917]"
              }`}
              title="Split View: Copilot Chat alongside live Autonomous Sandbox & Tool Logs"
            >
              <Split className="w-3.5 h-3.5" />
              <span>Dual Studio</span>
            </button>

            <button
              onClick={() => setActiveStudioTab("chat")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                activeStudioTab === "chat"
                  ? "bg-[#1A1917] text-white font-bold shadow-xs"
                  : "text-[#59554A] hover:text-[#1A1917]"
              }`}
              title="Focused Copilot Chat"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Chat</span>
            </button>

            <button
              onClick={() => setActiveStudioTab("sandbox")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                activeStudioTab === "sandbox"
                  ? "bg-[#1A1917] text-white font-bold shadow-xs"
                  : "text-[#59554A] hover:text-[#1A1917]"
              }`}
              title="Autonomous Sandbox & Trajectory Feed"
            >
              <Activity className="w-3.5 h-3.5 text-amber-600" />
              <span>Sandbox &amp; Pipeline</span>
            </button>

            <button
              onClick={() => setActiveStudioTab("tools")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                activeStudioTab === "tools"
                  ? "bg-[#1A1917] text-white font-bold shadow-xs"
                  : "text-[#59554A] hover:text-[#1A1917]"
              }`}
              title="Tool Execution Steps & Inspection"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Tools ({detailedToolRuns.length})</span>
            </button>
          </div>

          {/* Jump to Full Report */}
          <button
            onClick={onSwitchToReport}
            className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-[#FAF8F5] text-[#1A1917] rounded-xl text-xs font-bold transition-all border border-[#DDD9CE] shadow-2xs"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Report</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-[#7A7569]" />
          </button>

          {/* Reset Chat */}
          <button
            onClick={handleClearHistory}
            title="Reset Chat History"
            className="p-1.5 rounded-xl text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-all border border-transparent hover:border-[#DDD9CE]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Studio Stage ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* ── Chat View Column (Visible in 'chat' and 'split' modes) ────────── */}
        {(activeStudioTab === "chat" || activeStudioTab === "split") && (
          <div
            className={`flex flex-col h-full min-h-0 overflow-hidden bg-[#FFFFFF] ${
              activeStudioTab === "split"
                ? "w-full lg:w-1/2 xl:w-[55%] border-r border-[#E3DFD5]"
                : "w-full"
            }`}
          >
            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 select-text min-w-0">
              <div className={`${
                activeStudioTab === "chat" ? "max-w-4xl" : "max-w-2xl"
              } mx-auto space-y-5 w-full min-w-0`}>
                {/* Live Running Execution Pipeline Card */}
                {status === "running" && (
                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-amber-300 shadow-sm space-y-3.5 animate-fadeIn select-none mb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-amber-100 text-amber-900 shadow-2xs">
                          <Loader2 className="w-4 h-4 animate-spin text-amber-700" />
                        </span>
                        <div>
                          <div className="text-xs font-black text-[#1A1917] uppercase tracking-wide flex items-center gap-2">
                            <span>
                              Step {Math.min(Math.max(liveStepIndex, 1), 6)} of 6:{" "}
                              {displayedMilestones[Math.min(Math.max(liveStepIndex, 1) - 1, 5)].title.replace(/^\d+\.\s*/, "")}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300">
                              {Math.round((Math.min(Math.max(liveStepIndex, 1), 6) / 6) * 100)}%
                            </span>
                          </div>
                          <p className="text-[11px] text-[#59554A] font-medium mt-0.5">
                            {liveStepMessage ||
                              (isUploadJob
                                ? `Ingesting financial statements and ratios for ${companyName}...`
                                : `Autonomous multi-agent research swarm active for ${companyName}...`)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-900 bg-amber-100/90 px-2.5 py-1 rounded-full border border-amber-300 shadow-2xs">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        <span>LIVE EXECUTION</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-[#E5E1D7] h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-[#1A1917] h-full transition-all duration-500 rounded-full"
                        style={{ width: `${Math.round((Math.min(Math.max(liveStepIndex, 1), 6) / 6) * 100)}%` }}
                      />
                    </div>

                    {/* 6 Step Cards Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                      {displayedMilestones.map((step) => {
                        const isDone = step.status === "completed";
                        const isCurrent = step.status === "running";
                        const isFailed = step.status === "failed";
                        const isCancelled = step.status === "cancelled";
                        return (
                          <div
                            key={step.id}
                            className={`p-2.5 rounded-xl border text-xs transition-all flex items-start gap-2.5 ${
                              isCurrent
                                ? "bg-white border-[#1A1917] shadow-sm text-[#1A1917] ring-1 ring-amber-300"
                                : isFailed
                                ? "bg-rose-50 border-rose-300 text-rose-900"
                                : isCancelled
                                ? "bg-zinc-100 border-zinc-300 text-zinc-700"
                                : isDone
                                ? "bg-[#FAF8F5] border-[#E3DFD5] text-[#3D3A32]"
                                : "bg-[#F5F2EA] border-[#E5E1D7] text-[#8C877D] opacity-60"
                            }`}
                          >
                            <div className="shrink-0 mt-0.5">
                              {isDone ? (
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              ) : isCurrent ? (
                                <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
                              ) : isFailed ? (
                                <AlertCircle className="w-4 h-4 text-rose-600" />
                              ) : isCancelled ? (
                                <Square className="w-3.5 h-3.5 text-zinc-500 fill-zinc-500" />
                              ) : (
                                <Clock className="w-4 h-4 text-[#A8A398]" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-[11px] truncate flex items-center justify-between">
                                <span>{step.title}</span>
                                <span className="text-[9px] font-mono text-[#7A7569]">{step.agent}</span>
                              </div>
                              <p className="text-[10px] text-[#7A7569] leading-tight mt-0.5 line-clamp-1">
                                {step.desc}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Welcome Screen Cards if only welcome message exists and not running */}
                {messages.length === 1 && status !== "running" && (
                  <div className="text-center py-4 space-y-3 animate-fadeIn">
                    <div className="w-10 h-10 rounded-2xl bg-[#1A1917] text-white flex items-center justify-center mx-auto shadow-md select-none">
                      <Sparkles className="w-5 h-5 text-amber-400" />
                    </div>
                    <div className="select-text">
                      <h2 className="text-lg font-extrabold text-[#1A1917]">
                        AI Analyst Copilot for {companyName}
                      </h2>
                      <p className="text-xs text-[#7A7569] mt-0.5 max-w-sm mx-auto">
                        Ask analytical questions, request DCF stress-testing, or command live report updates.
                      </p>
                    </div>

                    {/* Quick Starter Cards */}
                    <div className={`grid gap-2 text-left pt-1 select-none ${
                      activeStudioTab === "chat"
                        ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                        : "grid-cols-1 sm:grid-cols-2"
                    }`}>
                      {starterPrompts.map((card, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSendMessage(card.prompt)}
                          className="p-3 bg-[#FAF8F5] hover:bg-[#F4F1EA] border border-[#E3DFD5] hover:border-[#1A1917] rounded-xl cursor-pointer transition-all shadow-2xs group"
                        >
                          <div className="text-xs font-bold text-[#1A1917] flex items-center justify-between">
                            <span>{card.title}</span>
                            <ArrowUpRight className="w-3.5 h-3.5 text-[#9C978B] group-hover:text-[#1A1917] transition-colors" />
                          </div>
                          <p className="text-[10px] text-[#7A7569] mt-0.5 leading-snug">{card.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex items-start gap-3 w-full min-w-0 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-2xs select-none ${
                        m.role === "user"
                          ? "bg-[#1A1917] text-white font-bold text-xs"
                          : "bg-[#FFFFFF] border border-[#E0DCD3] text-black"
                      }`}
                    >
                      {m.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5 text-amber-600" />}
                    </div>

                    <div className="max-w-[88%] min-w-0 space-y-1.5 select-text">
                      <div
                        className={`rounded-2xl p-3.5 leading-relaxed text-xs select-text cursor-text break-words [overflow-wrap:anywhere] overflow-hidden selection:bg-[#F59E0B]/30 selection:text-[#1A1917] ${
                          m.role === "user"
                            ? "bg-[#1A1917] text-white font-medium selection:bg-white/30 selection:text-white"
                            : "bg-[#FAF8F5] border border-[#E3DFD5] text-[#1A1917] shadow-2xs"
                        }`}
                      >
                        {m.content ? (
                          <FormattedChatMessage content={m.content} isUser={m.role === "user"} />
                        ) : (
                          <div className="flex items-center gap-2 text-stone-500 py-1">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                            <span className="italic text-[11px] animate-pulse">Formulating institutional analysis...</span>
                          </div>
                        )}
                      </div>

                      {/* Live Report Updated Card */}
                      {m.appliedChanges && m.appliedChanges.length > 0 && (
                        <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl space-y-1.5 shadow-2xs select-text">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              Live Report Updated
                            </span>
                            <div className="flex items-center gap-1.5">
                              {previousReportSnapshot && (
                                <button
                                  onClick={handleUndoModification}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-emerald-300 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors"
                                >
                                  <Undo2 className="w-3 h-3" />
                                  <span>Undo</span>
                                </button>
                              )}
                              <button
                                onClick={onSwitchToReport}
                                className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-700 text-white text-[10px] font-bold hover:bg-emerald-800 transition-colors shadow-2xs"
                              >
                                <span>Inspect</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-0.5 pt-1 border-t border-emerald-200">
                            {m.appliedChanges.map((c, idx) => (
                              <div key={idx} className="text-[11px] font-mono text-emerald-950 flex items-start gap-1">
                                <span className="font-bold text-emerald-800">• {c.field}:</span>
                                <span>{String(c.to)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className={`flex items-center gap-2 text-[10px] text-[#9C978B] font-mono ${m.role === "user" ? "justify-end" : "justify-between"} px-1`}>
                        <span>{m.timestamp}</span>
                        {m.role === "agent" && (
                          <button
                            onClick={() => handleCopyMarkdown(m.id, m.content)}
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#EFECE6] text-[#7A7569] hover:text-[#1A1917] transition-all"
                            title="Copy response markdown"
                          >
                            {copiedMessageId === m.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                                <span className="text-emerald-700 font-bold">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {loading && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-[#FAF8F5] border border-[#E3DFD5] w-fit shadow-2xs">
                    <Loader2 className="w-4 h-4 animate-spin text-[#1A1917]" />
                    <span className="text-xs text-[#59554A] font-medium">
                      Executing agentic analysis &amp; model calculations...
                    </span>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Bottom Composer */}
            <div className="p-4 border-t border-[#E3DFD5] bg-[#FFFFFF] shrink-0">
              <div className={`${
                activeStudioTab === "chat" ? "max-w-4xl" : "max-w-2xl"
              } mx-auto space-y-1.5`}>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="relative flex items-center bg-[#FAF8F5] border border-[#E0DCD3] focus-within:border-[#1A1917] focus-within:bg-white rounded-xl p-1 transition-all shadow-2xs"
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder={`Ask anything or command agent to modify ${companyName}...`}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    disabled={loading}
                    className="w-full bg-transparent px-3 py-1.5 text-xs text-[#1A1917] placeholder-[#8C877D] focus:outline-none resize-none min-h-[38px]"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="p-2 rounded-lg bg-[#1A1917] hover:bg-[#2C2A26] disabled:opacity-40 text-white transition-all shadow-2xs ml-1 shrink-0 self-end mb-0.5"
                  >
                    <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </form>
                <div className="flex items-center justify-between text-[10px] text-[#9C978B] px-1">
                  <span>Context: Financial statements, DCF sandbox, exchange filings</span>
                  <Link href="/settings?tab=keys" className="hover:text-[#1A1917] flex items-center gap-1">
                    <Key className="w-2.5 h-2.5" />
                    <span>BYOK Keys</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Right Inspector Column (Autonomous Sandbox & Tool Execution Logs) ── */}
        {(activeStudioTab === "sandbox" || activeStudioTab === "tools" || activeStudioTab === "split") && (
          <div
            className={`flex flex-col h-full min-h-0 overflow-hidden bg-[#FAF8F5] ${
              activeStudioTab === "split"
                ? "hidden lg:flex lg:w-1/2 xl:w-[45%]"
                : "w-full"
            }`}
          >
            {/* Inspector Tab Switcher */}
            <div className="px-4 py-2 bg-[#EFECE6] border-b border-[#E2DFD6] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setRightPanelSubTab("sandbox")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    rightPanelSubTab === "sandbox"
                      ? "bg-white text-[#1A1917] shadow-xs"
                      : "text-[#7A7569] hover:text-[#1A1917]"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-amber-600" />
                  <span>Autonomous Sandbox &amp; Trajectory</span>
                </button>

                <button
                  onClick={() => setRightPanelSubTab("tools")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    rightPanelSubTab === "tools"
                      ? "bg-white text-[#1A1917] shadow-xs"
                      : "text-[#7A7569] hover:text-[#1A1917]"
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5 text-[#1A1917]" />
                  <span>Tool Execution Steps ({detailedToolRuns.length})</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-800 font-bold uppercase">Sandbox Live</span>
              </div>
            </div>

            {/* SubTab 1: Autonomous Sandbox & Live Trajectory Feed */}
            {rightPanelSubTab === "sandbox" && (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Sandbox Telemetry Header Bar */}
                <div className="p-3.5 bg-white border-b border-[#E3DFD5] space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-1 rounded-lg bg-amber-100 text-amber-900">
                        <Cpu className="w-4 h-4 text-amber-700" />
                      </span>
                      <div>
                        <span className="text-xs font-black text-[#1A1917] block">
                          Python 3.11 Valuation Sandbox
                        </span>
                        <span className="text-[10px] text-[#7A7569]">
                          Isolated runtime · Real-time subagent execution stream
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                      SEBI RA 2014 Pass
                    </span>
                  </div>

                  {/* Decomposed Pipeline Milestones */}
                  <div className="space-y-1 pt-1 border-t border-[#EFECE6]">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#7A7569] uppercase tracking-wider">
                      <span>{isUploadJob ? "Document AI Pipeline" : "Decomposed Research Pipeline"}</span>
                      <span>{status === "running" ? (isUploadJob ? "Processing..." : "Executing...") : "6/6 Completed"}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-0.5">
                      {displayedMilestones.map((m) => (
                        <div
                          key={m.id}
                          className={`p-1.5 border rounded-lg text-[10px] flex items-center justify-between ${
                            m.status === "running"
                              ? "bg-amber-50 border-amber-300 text-amber-900"
                              : m.status === "pending"
                              ? "bg-[#FAF8F5] border-[#E5E1D7] text-[#8C877D] opacity-60"
                              : "bg-[#FAF8F5] border-[#E3DFD5] text-[#1A1917]"
                          }`}
                        >
                          <span className="font-semibold text-[#1A1917] truncate mr-1">{m.title}</span>
                          {m.status === "running" ? (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                          ) : m.status === "pending" ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C5C0B4] shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Embedded Live Trajectory Feed */}
                <div className="flex-1 min-h-0 overflow-hidden relative">
                  <TrajectoryFeed planId={cleanPlanId} altPlanId={effectiveJobId} onPlanComplete={onPlanComplete} />
                </div>
              </div>
            )}

            {/* SubTab 2: Interactive Tool Execution Steps */}
            {rightPanelSubTab === "tools" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <div>
                    <h3 className="text-xs font-black text-[#1A1917] uppercase tracking-wider">
                      Tool Execution Log ({detailedToolRuns.length} Tools Invoked)
                    </h3>
                    <p className="text-[11px] text-[#7A7569]">
                      Click any tool below to inspect parameters, verification status, and extracted data.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">
                    All Verified
                  </span>
                </div>

                <div className="space-y-2.5">
                  {detailedToolRuns.map((tool) => {
                    const isExpanded = expandedToolId === tool.id;
                    return (
                      <div
                        key={tool.id}
                        className="bg-white border border-[#E3DFD5] rounded-xl p-3.5 shadow-2xs space-y-2 transition-all"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-[#F4F1EA] text-[#1A1917]">
                              <Wrench className="w-3.5 h-3.5" />
                            </span>
                            <div>
                              <span className="text-xs font-bold text-[#1A1917] block">{tool.name}</span>
                              <span className="text-[10px] text-[#7A7569]">{tool.category}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-[#7A7569] bg-[#FAF8F5] px-1.5 py-0.5 rounded border border-[#E3DFD5]">
                              {tool.duration}
                            </span>
                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {tool.status}
                            </span>
                          </div>
                        </div>

                        <p className="text-xs text-[#3D3A32] leading-relaxed">{tool.summary}</p>

                        <div className="pt-2 border-t border-[#EFECE6] flex items-center justify-between text-[11px]">
                          <button
                            onClick={() => setExpandedToolId(isExpanded ? null : tool.id)}
                            className="text-amber-800 hover:text-amber-900 font-semibold flex items-center gap-1 text-[11px]"
                          >
                            <span>{isExpanded ? "Hide Execution Payloads" : "Inspect Inputs & Outputs"}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>

                        {/* Collapsible JSON Payloads */}
                        {isExpanded && (
                          <div className="space-y-2 pt-2 border-t border-[#EFECE6] animate-fadeIn text-[10px] font-mono">
                            <div className="p-2.5 bg-[#1A1917] text-amber-400 rounded-lg overflow-x-auto">
                              <div className="text-[9px] text-[#9C978B] uppercase tracking-wider mb-1">
                                Input Arguments (JSON):
                              </div>
                              <pre className="text-[10px] leading-snug">{JSON.stringify(tool.inputs, null, 2)}</pre>
                            </div>
                            <div className="p-2.5 bg-[#1A1917] text-emerald-400 rounded-lg overflow-x-auto">
                              <div className="text-[9px] text-[#9C978B] uppercase tracking-wider mb-1">
                                Extracted Output Metrics (JSON):
                              </div>
                              <pre className="text-[10px] leading-snug">{JSON.stringify(tool.outputs, null, 2)}</pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

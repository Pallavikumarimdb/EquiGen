"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  FileText,
  ArrowUpRight,
  Copy,
  Check,
  Key,
  Activity,
  Split,
  Square,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Edit2,
  RotateCw,
  ArrowDown,
  BarChart2,
  FileSpreadsheet,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { PersonaType } from "../types";
import { EquityResearchData } from "@/types";
import { FormattedChatMessage } from "../shared/FormattedChatMessage";
import { TrajectoryFeed } from "@/components/TrajectoryFeed";
import { useConversationManager, ChatNode } from "@/hooks/useConversationManager";
import { InAppExcelModeler } from "../shared/InAppExcelModeler";
import { InAppWordEditor } from "../shared/InAppWordEditor";

export type ChatMessage = ChatNode;

interface AgentChatViewProps {
  reportId?: string | null;
  companyName: string;
  ticker?: string;
  reportData: EquityResearchData | null;
  currentPersona?: PersonaType;
  onUpdateReportData: (updated: EquityResearchData) => void;
  onSwitchToReport: () => void;
  status?: string;
  onPlanComplete?: (planId: string) => void;
  onStopAgent?: () => void;
  initialStudioTab?: "split" | "chat" | "excel" | "word" | "pipeline";
  onDownloadPdf?: () => void;
  onDownloadExcel?: () => void;
  onDownloadDocx?: () => void;
  isDownloadingPdf?: boolean;
  isDownloadingExcel?: boolean;
  isDownloadingDocx?: boolean;
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: string | null;
}

export function AgentChatView({
  reportId,
  companyName,
  ticker,
  reportData,
  onUpdateReportData,
  onSwitchToReport,
  status,
  onPlanComplete,
  onStopAgent,
  initialStudioTab = "split",
  onDownloadPdf,
  onDownloadExcel,
  onDownloadDocx,
  isDownloadingPdf,
  isDownloadingExcel,
  isDownloadingDocx,
  reviewerName,
  sebiRegNo,
  approvedAt,
}: AgentChatViewProps) {
  const {
    activeThread: messages,
    isStreaming,
    sendPrompt,
    stopGeneration,
    editUserMessage,
    regenerateMessage,
    switchBranch,
    getBranchInfo,
    addCustomTurn,
    clearHistory: handleClearHistory,
  } = useConversationManager({
    sessionId: reportId ? reportId.replace(/^rep_/, "") : "session-demo",
    reportId,
    companyName,
    ticker,
    reportData,
    onUpdateReportData,
  });

  const [input, setInput] = useState("");
  const [isModifying, setIsModifying] = useState(false);
  const loading = isStreaming || isModifying;
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [studioView, setStudioView] = useState<"split" | "chat" | "canvas">(() => {
    if (initialStudioTab === "chat") return "chat";
    return "split";
  });
  const [activeCanvasTab, setActiveCanvasTab] = useState<"excel" | "word" | "pipeline">(() => {
    if (initialStudioTab === "word") return "word";
    if (initialStudioTab === "pipeline") return "pipeline";
    return "excel";
  });

  useEffect(() => {
    if (initialStudioTab === "chat") {
      setStudioView("chat");
    } else if (initialStudioTab === "excel") {
      setStudioView("split");
      setActiveCanvasTab("excel");
    } else if (initialStudioTab === "word") {
      setStudioView("split");
      setActiveCanvasTab("word");
    } else if (initialStudioTab === "pipeline") {
      setStudioView("split");
      setActiveCanvasTab("pipeline");
    } else if (initialStudioTab === "split") {
      setStudioView("split");
    }
  }, [initialStudioTab]);

  const [previousReportSnapshot, setPreviousReportSnapshot] = useState<EquityResearchData | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const cleanPlanId = reportId ? reportId.replace(/^rep_/, "") : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawReportData = reportData as any;
  const effectiveJobId = cleanPlanId.startsWith("job_")
    ? cleanPlanId
    : rawReportData?.jobId || rawReportData?.planId || cleanPlanId;

  const rec = reportData?.recommendation;
  const tp = rec?.targetPrice ?? null;
  const cmp = rec?.currentPrice ?? null;
  const rating = rec?.rating ?? null;
  const upside = rec?.upsidePotential ?? (tp != null && cmp != null && cmp > 0 ? parseFloat((((tp - cmp) / cmp) * 100).toFixed(1)) : null);

  const isUploadJob = cleanPlanId.startsWith("job_") || rawReportData?.sourceType === "upload" || !!rawReportData?.jobId;

  // Live execution pipeline tracking state
  const [liveStepIndex, setLiveStepIndex] = useState<number>(() => {
    if (status === "completed" || status === "published") return 6;
    if (typeof rawReportData?.stepIndex === "number" && rawReportData.stepIndex > 0) {
      return rawReportData.stepIndex;
    }
    return status === "running" || status === "pending" || status === "approved" ? 1 : 0;
  });
  const [liveStepMessage, setLiveStepMessage] = useState<string>("");

  // Sync stepIndex when status or report changes
  useEffect(() => {
    if (status === "completed" || status === "published") {
      setLiveStepIndex(6);
    } else if (status === "running" || status === "pending" || status === "approved") {
      setLiveStepIndex((prev) => (prev > 0 ? prev : 1));
    }
  }, [status, reportId]);

  // Keyboard shortcut: Escape stops AI generation mid-stream
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isStreaming) {
        stopGeneration();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isStreaming, stopGeneration]);

  // Smart auto-scroll: scroll to bottom unless user manually scrolled up to inspect prior turns
  useEffect(() => {
    if (!userScrolledUp) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, loading, userScrolledUp]);

  const handleChatScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 120;
    setUserScrolledUp(!isNearBottom);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUserScrolledUp(false);
  };

  const onPlanCompleteRef = useRef(onPlanComplete);
  useEffect(() => {
    onPlanCompleteRef.current = onPlanComplete;
  }, [onPlanComplete]);

  // Live polling and SSE connection for running tasks
  useEffect(() => {
    if (status !== "running" || !effectiveJobId) return;
    // Don't connect SSE to transient unpersisted client IDs (avoids 403 errors and reconnect churn)
    if (effectiveJobId.startsWith("plan_")) return;

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
      onPlanCompleteRef.current?.(effectiveJobId);
    });

    // 2. Periodic status check for ExtractionJob records (only for uploaded document jobs)
    const pollInterval = setInterval(async () => {
      if (!isSubscribed) return;
      if (!effectiveJobId || !effectiveJobId.startsWith("job_")) return;
      try {
        const res = await fetch(`/api/extract/status?jobId=${encodeURIComponent(effectiveJobId)}`);
        if (res.ok) {
          const data = await res.json();
          if (typeof data.stepIndex === "number" && data.stepIndex > 0) {
            setLiveStepIndex((prev) => Math.max(prev, data.stepIndex));
          }
          if (data.status === "completed") {
            setLiveStepIndex(6);
            onPlanCompleteRef.current?.(effectiveJobId);
          }
        }
      } catch {}
    }, 2500);

    return () => {
      isSubscribed = false;
      clearInterval(pollInterval);
      eventSource.close();
    };
  }, [status, effectiveJobId, cleanPlanId]);

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

  // Quick Starter Prompt Cards (ChatGPT style)
  const starterPrompts = [
    {
      title: "Upgrade Target Price",
      prompt: tp != null ? `Change target price to ₹${Math.round(tp * 1.1)} and upgrade rating to BUY` : `Set target price and upgrade rating to BUY for ${companyName || "the target equity"}`,
      desc: "Recalculate implied upside & update report live",
    },
    {
      title: "Recalculate DCF Model",
      prompt: `Set WACC to 10.5% and EBITDA margin to 21%`,
      desc: "Live recalculate 3-statement model & DCF target price",
    },
    {
      title: "Add Investment Risk",
      prompt: `Add a downside risk factor: Export order volatility and raw material inflation`,
      desc: "Insert new risk into Risk & SWOT matrices",
    },
    {
      title: "DCF Sensitivity Analysis",
      prompt: `Explain how a 100 bps change in WACC impacts fair value per share for ${companyName || "this company"}`,
      desc: "Review sensitivity table and key valuation drivers",
    },
  ];

  const isModificationInstruction = (text: string): boolean => {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
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

    const isExplicitTpChange =
      /(?:update|change|set|raise|lower|revise|adjust)\s+(?:the\s+)?(?:target(?:\s+price)?|tp)\s+(?:to|=|is)\s*₹?\s*[0-9,]+/i.test(trimmed) ||
      /^(?:target(?:\s+price)?|tp)\s*(?:to|=|is)\s*₹?\s*[0-9,]+/i.test(trimmed);

    const isExplicitRatingChange =
      /(?:update|change|set|revise)\s+(?:the\s+)?(?:rating|recommendation)\s+(?:to|=|is)\s*(?:BUY|ACCUMULATE|HOLD|REDUCE|SELL)/i.test(trimmed) ||
      /(?:upgrade|downgrade)\s+(?:the\s+)?(?:rating|recommendation|stock)?\s*(?:to|=)?\s*(?:BUY|ACCUMULATE|HOLD|REDUCE|SELL)/i.test(trimmed) ||
      /^(?:rating|recommendation)\s*(?:to|=|is)\s*(?:BUY|ACCUMULATE|HOLD|REDUCE|SELL)/i.test(trimmed);

    const isExplicitWaccChange =
      /(?:update|change|set|revise|adjust)\s+(?:the\s+)?(?:wacc|discount\s+rate|cost\s+of\s+capital)\s*(?:to|=|is)?\s*[0-9.]+/i.test(trimmed) ||
      /^(?:wacc|discount\s+rate)\s*(?:to|=|is)\s*[0-9.]+/i.test(trimmed);

    const isExplicitTgChange =
      /(?:update|change|set|revise|adjust)\s+(?:the\s+)?(?:terminal\s+growth(?:\s+rate)?|terminal\s+g)\s*(?:to|=|is)?\s*[0-9.]+/i.test(trimmed) ||
      /^(?:terminal\s+growth|terminal\s+g)\s*(?:to|=|is)\s*[0-9.]+/i.test(trimmed);

    const isExplicitMarginChange =
      /(?:update|change|set|revise|adjust)\s+(?:the\s+)?(?:ebitda\s+margin|operating\s+margin|margin)\s*(?:to|=|is)?\s*[0-9.]+/i.test(trimmed) ||
      /^(?:ebitda\s+margin|margin)\s*(?:to|=|is)\s*[0-9.]+/i.test(trimmed);

    const isExplicitGrowthChange =
      /(?:update|change|set|revise|adjust)\s+(?:the\s+)?(?:revenue\s+growth|sales\s+growth|growth\s+rate|topline\s+growth)\s*(?:to|=|is)?\s*[0-9.]+/i.test(trimmed) ||
      /^(?:revenue\s+growth|sales\s+growth|growth\s+rate)\s*(?:to|=|is)\s*[0-9.]+/i.test(trimmed);

    const isExplicitWcChange =
      /(?:update|change|set|revise|adjust)\s+(?:the\s+)?(?:dso|dio|dpo|working\s+capital|receivables?\s+days|inventory\s+days|payables?\s+days)\s*(?:to|=|is)?\s*[0-9.]+/i.test(trimmed) ||
      /^(?:dso|dio|dpo)\s*(?:to|=|is)\s*[0-9.]+/i.test(trimmed);

    const isExplicitCapexChange =
      /(?:update|change|set|revise|adjust)\s+(?:the\s+)?(?:capex|capital\s+expenditure)\s*(?:to|=|is)?\s*[0-9.]+/i.test(trimmed) ||
      /^(?:capex)\s*(?:to|=|is)\s*[0-9.]+/i.test(trimmed);

    const isExplicitRiskAddition =
      /(?:add|append|insert)\s+(?:a\s+)?(?:new\s+)?(?:risk|threat|headwind)/i.test(trimmed);

    const isExplicitSummaryEdit =
      /(?:update|edit|rewrite|modify)\s+(?:the\s+)?(?:executive\s+)?(?:summary|thesis)/i.test(trimmed);

    const isGeneralModifyCmd =
      /(?:modify|patch|update)\s+(?:the\s+)?(?:report|dashboard|model|dcf|assumptions|drivers)/i.test(trimmed);

    return (
      !isQuestion &&
      (isExplicitTpChange ||
        isExplicitRatingChange ||
        isExplicitWaccChange ||
        isExplicitTgChange ||
        isExplicitMarginChange ||
        isExplicitGrowthChange ||
        isExplicitWcChange ||
        isExplicitCapexChange ||
        isExplicitRiskAddition ||
        isExplicitSummaryEdit ||
        isGeneralModifyCmd)
    );
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || loading) return;

    setInput("");

    // 1. Check if user instructed an explicit report modification
    if (isModificationInstruction(textToSend)) {
      if (!reportData) return;
      setIsModifying(true);
      setPreviousReportSnapshot(JSON.parse(JSON.stringify(reportData)));

      try {
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
          if (data.updatedReport && data.appliedChanges && data.appliedChanges.length > 0) {
            onUpdateReportData(data.updatedReport);
            addCustomTurn(textToSend, data.reply, data.appliedChanges);
            return;
          }
        }
      } catch (err) {
        console.warn("[AgentChatView] Report modify failed, falling back to chat:", err);
      } finally {
        setIsModifying(false);
      }
    }

    // 2. Multi-turn streaming chat via centralized AI engine
    await sendPrompt(textToSend);
  };

  const handleSaveEdit = async (nodeId: string) => {
    if (!editingContent.trim() || isStreaming) return;
    const content = editingContent.trim();
    setEditingNodeId(null);
    setEditingContent("");
    await editUserMessage(nodeId, content);
  };

  const handleUndoModification = () => {
    if (previousReportSnapshot) {
      onUpdateReportData(previousReportSnapshot);
      addCustomTurn(
        "Undo previous modification",
        "↩️ Undid previous report modifications. Canvas restored to prior state.",
      );
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

  return (
    <div className="flex flex-col h-full w-full bg-[#FFFFFF] overflow-hidden font-sans select-text">
      {/* ── Singular Studio Header: Active Company + Connected Canvas Switcher + Controls ── */}
      <div className="h-12 px-3 sm:px-4 border-b border-[#E3DFD5] bg-[#FAF8F5] flex items-center justify-between gap-2 sm:gap-4 shrink-0 select-none">
        {/* Left: Bot Identity + Active Target Company Info */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#1A1917] text-white flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Bot className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 truncate select-text">
            <span className="text-xs font-black text-[#1A1917] truncate">{companyName || "AI Research Studio"}</span>
            {ticker && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#EFECE6] text-[#59554A] font-bold border border-[#DDD9CE] shrink-0">
                {ticker}
              </span>
            )}
            {rating && tp != null ? (
              <span
                className={`hidden md:inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 border ${
                  rating.toUpperCase().includes("BUY")
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : rating.toUpperCase().includes("SELL")
                    ? "bg-rose-50 text-rose-800 border-rose-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {rating} · ₹{tp.toLocaleString()} TP
                {upside != null && Math.abs(upside) < 500
                  ? ` (${upside > 0 ? `+${upside}%` : `${upside}%`})`
                  : ""}
              </span>
            ) : null}
            <span className="hidden xl:flex items-center gap-1 text-[10px] font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>ONLINE</span>
            </span>
          </div>
        </div>

        {/* Center / Right: Connected Artifact Switcher + Export + Layout & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Stop Agent Button */}
          {(status === "running" || status === "pending" || status === "approved" || isStreaming) && (
            <button
              type="button"
              onClick={() => {
                stopGeneration();
                if (onStopAgent) onStopAgent();
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
            >
              <Square className="w-3 h-3 fill-rose-600 text-rose-600" />
              <span>Stop</span>
            </button>
          )}

          {/* Artifact Tabs: Excel Model | Word Note | Stream */}
          <div className="flex items-center bg-[#EFECE6] p-0.5 rounded-lg border border-[#DDD9CE] text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setActiveCanvasTab("excel");
                if (studioView === "chat") setStudioView("split");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeCanvasTab === "excel" && studioView !== "chat"
                  ? "bg-[#002060] text-white font-bold shadow-xs"
                  : "text-[#002060] hover:bg-[#DBEAFE]/70"
              }`}
              title="3-Statement & DCF Modeler"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Excel Model</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveCanvasTab("word");
                if (studioView === "chat") setStudioView("split");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeCanvasTab === "word" && studioView !== "chat"
                  ? "bg-[#1D4ED8] text-white font-bold shadow-xs"
                  : "text-[#1D4ED8] hover:bg-blue-100/70"
              }`}
              title="Research Note Word Document"
            >
              <FileText className="w-3.5 h-3.5 text-blue-300" />
              <span className="hidden sm:inline">Word Note</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveCanvasTab("pipeline");
                if (studioView === "chat") setStudioView("split");
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                activeCanvasTab === "pipeline" && studioView !== "chat"
                  ? "bg-[#1A1917] text-white font-bold shadow-xs"
                  : "text-[#59554A] hover:text-[#1A1917]"
              }`}
              title="Agent Milestones & Execution Stream"
            >
              <Activity className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden lg:inline">Stream</span>
            </button>
          </div>

          {/* Layout Controls: Focus Chat / Maximize Canvas / Split View */}
          <div className="flex items-center gap-1">
            {studioView === "split" ? (
              <>
                <button
                  type="button"
                  onClick={() => setStudioView("chat")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-[#FAF8F5] text-[#59554A] hover:text-[#1A1917] border border-[#DDD9CE] text-xs font-medium transition-all cursor-pointer shadow-2xs"
                  title="Focus Chat (Full Width)"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Focus Chat</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStudioView("canvas")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-[#FAF8F5] text-[#59554A] hover:text-[#1A1917] border border-[#DDD9CE] text-xs font-medium transition-all cursor-pointer shadow-2xs"
                  title="Maximize Canvas (Full Width)"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">Maximize</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setStudioView("split")}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-[#FAF8F5] text-[#1A1917] border border-[#DDD9CE] text-xs font-medium transition-all cursor-pointer shadow-2xs"
                title="Restore Side-by-Side Split View"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Split View</span>
              </button>
            )}
          </div>

          {/* Reset Chat History */}
          <button
            onClick={handleClearHistory}
            title="Reset Chat History"
            className="p-1.5 rounded-lg text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Studio Stage ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        {/* ── Chat View Column (Visible in 'chat' and 'split' modes) ────────── */}
        {(studioView === "chat" || studioView === "split") && (
          <div
            className={`flex flex-col h-full min-h-0 overflow-hidden bg-[#FFFFFF] ${
              studioView === "split"
                ? "w-full lg:w-[46%] xl:w-[44%] border-r border-[#E3DFD5]"
                : "w-full"
            }`}
          >
            {/* Message Stream */}
            <div
              ref={chatScrollContainerRef}
              onScroll={handleChatScroll}
              className="flex-1 overflow-y-auto px-5 py-5 space-y-5 select-text min-w-0"
            >
              <div className={`${
                studioView === "chat" ? "max-w-4xl" : "max-w-2xl"
              } mx-auto space-y-5 w-full min-w-0`}>
                {/* Live Running Execution Status Bar */}
                {status === "running" && (
                  <div className="p-3 rounded-xl bg-[#FAF8F5] border border-amber-200 shadow-2xs space-y-2 animate-fadeIn select-none">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="p-1.5 rounded-lg bg-amber-100 text-amber-900 shrink-0">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                        </span>
                        <div className="min-w-0">
                          <div className="font-bold text-[#1A1917] truncate flex items-center gap-2">
                            <span>
                              Step {Math.min(Math.max(liveStepIndex, 1), 6)} of 6:{" "}
                              {displayedMilestones[Math.min(Math.max(liveStepIndex, 1) - 1, 5)].title.replace(/^\d+\.\s*/, "")}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#7A7569] truncate">
                            {liveStepMessage ||
                              (isUploadJob
                                ? `Extracting financials & ratios for ${companyName}...`
                                : `Autonomous multi-agent research swarm active for ${companyName}...`)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded-md border border-amber-300 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                        <span>{Math.round((Math.min(Math.max(liveStepIndex, 1), 6) / 6) * 100)}%</span>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-[#E5E1D7] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#1A1917] h-full transition-all duration-500 rounded-full"
                        style={{ width: `${Math.round((Math.min(Math.max(liveStepIndex, 1), 6) / 6) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.map((m: ChatNode) => {
                  const branch = getBranchInfo(m.id);
                  const isUser = m.role === "user";
                  const isEditingThis = editingNodeId === m.id;

                  return (
                    <div
                      key={m.id}
                      className={`group flex items-start gap-3 w-full min-w-0 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-2xs select-none ${
                          isUser
                            ? "bg-[#1A1917] text-white font-bold text-xs"
                            : "bg-[#FFFFFF] border border-[#E0DCD3] text-black"
                        }`}
                      >
                        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5 text-amber-600" />}
                      </div>

                      <div className={`max-w-[88%] min-w-0 space-y-1.5 select-text ${isUser ? "items-end" : "items-start"}`}>
                        {/* Message Bubble or Inline Editor */}
                        {isEditingThis ? (
                          <div className="p-3 bg-[#FAF8F5] border-2 border-[#1A1917] rounded-2xl shadow-sm space-y-2 w-full min-w-[280px]">
                            <textarea
                              value={editingContent}
                              onChange={(e) => setEditingContent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveEdit(m.id);
                                }
                                if (e.key === "Escape") {
                                  setEditingNodeId(null);
                                  setEditingContent("");
                                }
                              }}
                              className="w-full bg-white text-xs text-[#1A1917] p-2 rounded-xl border border-[#DDD9CE] focus:outline-none focus:border-[#1A1917] resize-none min-h-[64px]"
                              autoFocus
                            />
                            <div className="flex items-center justify-end gap-1.5 text-xs">
                              <button
                                onClick={() => {
                                  setEditingNodeId(null);
                                  setEditingContent("");
                                }}
                                className="px-2.5 py-1 rounded-lg bg-[#EFECE6] hover:bg-[#E5E1D7] text-[#59554A] font-medium transition-colors"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveEdit(m.id)}
                                disabled={!editingContent.trim() || isStreaming}
                                className="px-3 py-1 rounded-lg bg-[#1A1917] hover:bg-[#2C2A26] text-white font-bold disabled:opacity-40 transition-colors shadow-2xs"
                              >
                                Save &amp; Submit
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`rounded-2xl p-3.5 leading-relaxed text-xs select-text cursor-text break-words [overflow-wrap:anywhere] overflow-hidden selection:bg-[#F59E0B]/30 selection:text-[#1A1917] ${
                              isUser
                                ? "bg-[#1A1917] text-white font-medium selection:bg-white/30 selection:text-white"
                                : "bg-[#FAF8F5] border border-[#E3DFD5] text-[#1A1917] shadow-2xs"
                            }`}
                          >
                            {m.content ? (
                              <FormattedChatMessage content={m.content} isUser={isUser} />
                            ) : m.status === "stopped" ? (
                              <div className="flex items-center gap-2 text-stone-500 py-1 select-none">
                                <Square className="w-3.5 h-3.5 text-rose-500 fill-rose-500 shrink-0" />
                                <span className="italic text-[11px] text-stone-600 font-medium">Analysis generation stopped by analyst.</span>
                              </div>
                            ) : !isStreaming && !loading ? (
                              <div className="flex items-center gap-2 text-stone-400 py-1 select-none">
                                <span className="italic text-[11px]">Analysis cancelled.</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-stone-500 py-1">
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 shrink-0" />
                                <span className="italic text-[11px] animate-pulse">Formulating institutional analysis...</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Live Report & Financial Model Updated Card */}
                        {m.appliedChanges && m.appliedChanges.length > 0 && (
                          <div className="p-3 bg-emerald-50/90 border border-emerald-300 rounded-xl space-y-2 shadow-2xs select-text">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Live Model &amp; Report Updated
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
                                  onClick={() => {
                                    setActiveCanvasTab("excel");
                                    setStudioView("split");
                                  }}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#002060] text-white text-[10px] font-bold hover:bg-[#001848] transition-colors shadow-2xs cursor-pointer"
                                  title="Inspect updated spreadsheet model alongside chat"
                                >
                                  <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                                  <span>Inspect Excel</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setActiveCanvasTab("word");
                                    setStudioView("split");
                                  }}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#1D4ED8] text-white text-[10px] font-bold hover:bg-[#173FAD] transition-colors shadow-2xs cursor-pointer"
                                  title="Inspect updated research note docx alongside chat"
                                >
                                  <FileText className="w-3 h-3 text-blue-300" />
                                  <span>Inspect Word</span>
                                </button>
                                <button
                                  onClick={onSwitchToReport}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-emerald-300 text-[10px] font-bold text-emerald-900 hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer"
                                  title="View published multi-tab report"
                                >
                                  <span>Report</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <div className="space-y-0.5 pt-1 border-t border-emerald-200">
                              {(m.appliedChanges || []).map((c: { field: string; to: unknown }, idx: number) => (
                                <div key={idx} className="text-[11px] font-mono text-emerald-950 flex items-start gap-1">
                                  <span className="font-bold text-emerald-800">• {c.field}:</span>
                                  <span>{String(c.to)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Message Toolbar: Branching, Status, Copy, Edit, Regenerate */}
                        <div
                          className={`flex items-center gap-2 text-[10px] text-[#9C978B] font-mono ${
                            isUser ? "justify-end" : "justify-between"
                          } px-1`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{m.timestamp}</span>

                            {/* Branching Navigator (< 1 / 2 >) */}
                            {branch.totalVersions > 1 && (
                              <div className="flex items-center gap-0.5 bg-[#EFECE6] px-1.5 py-0.5 rounded-md border border-[#DDD9CE] text-[#59554A] font-bold select-none">
                                <button
                                  type="button"
                                  disabled={!branch.hasPrevious}
                                  onClick={() => switchBranch(m.id, "prev")}
                                  className="p-0.5 hover:text-[#1A1917] disabled:opacity-25 transition-colors"
                                  title="Previous version"
                                >
                                  <ChevronLeft className="w-3 h-3" />
                                </button>
                                <span className="px-0.5">
                                  {branch.currentIndex + 1}/{branch.totalVersions}
                                </span>
                                <button
                                  type="button"
                                  disabled={!branch.hasNext}
                                  onClick={() => switchBranch(m.id, "next")}
                                  className="p-0.5 hover:text-[#1A1917] disabled:opacity-25 transition-colors"
                                  title="Next version"
                                >
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}

                            {/* Stopped Badge */}
                            {m.status === "stopped" && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] rounded-md border border-amber-200 font-bold uppercase">
                                Stopped
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            {/* User Edit Button */}
                            {isUser && !isEditingThis && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNodeId(m.id);
                                  setEditingContent(m.content);
                                }}
                                disabled={isStreaming}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#EFECE6] text-[#7A7569] hover:text-[#1A1917] transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
                                title="Edit message"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span className="hidden sm:inline">Edit</span>
                              </button>
                            )}

                            {/* Agent Regenerate Button */}
                            {!isUser && m.content && (
                              <button
                                type="button"
                                onClick={() => regenerateMessage(m.id)}
                                disabled={isStreaming}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#EFECE6] text-[#7A7569] hover:text-[#1A1917] transition-all opacity-0 group-hover:opacity-100 disabled:opacity-40"
                                title="Regenerate alternative answer"
                              >
                                <RotateCw className="w-3 h-3" />
                                <span className="hidden sm:inline">Retry</span>
                              </button>
                            )}

                            {/* Copy Button */}
                            {m.content && (
                              <button
                                type="button"
                                onClick={() => handleCopyMarkdown(m.id, m.content)}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-[#EFECE6] text-[#7A7569] hover:text-[#1A1917] transition-all"
                                title="Copy markdown"
                              >
                                {copiedMessageId === m.id ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600 stroke-[2.5]" />
                                    <span className="text-emerald-700 font-bold">Copied!</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span className="hidden sm:inline">Copy</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

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

              {/* Floating Jump to Latest Button */}
              {userScrolledUp && (
                <button
                  type="button"
                  onClick={scrollToBottom}
                  className="sticky bottom-2 mx-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A1917] text-white text-xs font-bold shadow-lg hover:bg-[#2C2A26] transition-all z-20"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Scroll to latest</span>
                </button>
              )}
            </div>

            {/* Bottom Composer with Stop Control */}
            <div className="p-4 border-t border-[#E3DFD5] bg-[#FFFFFF] shrink-0">
              <div className={`${
                studioView === "chat" ? "max-w-4xl" : "max-w-2xl"
              } mx-auto space-y-2`}>
                {/* Sleek horizontal quick starter suggestions when beginning conversation */}
                {messages.length <= 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar select-none">
                    <span className="text-[10px] font-semibold text-[#8C877D] shrink-0 uppercase tracking-wider mr-0.5">Quick:</span>
                    {starterPrompts.map((card, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSendMessage(card.prompt)}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAF8F5] hover:bg-[#F2EFE9] border border-[#E3DFD5] hover:border-[#1A1917] text-left text-[11px] font-medium text-[#1A1917] transition-all"
                      >
                        <span>{card.title}</span>
                        <ArrowUpRight className="w-3 h-3 text-[#9C978B]" />
                      </button>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleSendMessage();
                  }}
                  className="relative flex items-center bg-[#FAF8F5] border border-[#E0DCD3] focus-within:border-[#1A1917] focus-within:bg-white rounded-xl p-1 transition-all shadow-2xs"
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    placeholder={
                      isStreaming
                        ? "AI is streaming response... (Click Stop or press Esc to cancel)"
                        : `Ask anything or command agent to modify ${companyName || "the model & report"}...`
                    }
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (isStreaming) {
                          stopGeneration();
                        } else {
                          void handleSendMessage();
                        }
                      }
                    }}
                    disabled={isModifying}
                    className="w-full bg-transparent px-3 py-1.5 text-xs text-[#1A1917] placeholder-[#8C877D] focus:outline-none resize-none min-h-[38px]"
                  />

                  {/* Dynamic Action Button: Stop if streaming, Send if idle */}
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={stopGeneration}
                      className="p-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-2xs ml-1 shrink-0 self-end mb-0.5 flex items-center gap-1.5 animate-pulse cursor-pointer"
                      title="Stop generating (Esc)"
                    >
                      <Square className="w-3.5 h-3.5 fill-white" />
                      <span className="text-[10px] font-bold hidden sm:inline">Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!input.trim() || loading}
                      className="p-2 rounded-lg bg-[#1A1917] hover:bg-[#2C2A26] disabled:opacity-40 text-white transition-all shadow-2xs ml-1 shrink-0 self-end mb-0.5 cursor-pointer"
                      title="Send message (Enter)"
                    >
                      <Send className="w-3.5 h-3.5 stroke-[2.5]" />
                    </button>
                  )}
                </form>

                <div className="flex items-center justify-between text-[10px] text-[#9C978B] px-1">
                  <span>Live 3-statement model &amp; research note directly react to prompts · Press Esc to Stop</span>
                  <Link href="/settings?tab=keys" className="hover:text-[#1A1917] flex items-center gap-1">
                    <Key className="w-2.5 h-2.5" />
                    <span>BYOK Keys</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Right Column: Connected Reactive Canvas Artifact ─────────────── */}
        {(studioView === "split" || studioView === "canvas") && (
          <div
            className={`flex flex-col h-full min-h-0 overflow-hidden bg-[#FAF8F5] ${
              studioView === "split"
                ? "hidden lg:flex flex-1 min-w-0"
                : "w-full"
            }`}
          >
            {/* Canvas Body: Reactive to Central Agent Chat */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {/* ── Active Canvas: Excel Model ──────────────────────────── */}
              {activeCanvasTab === "excel" && (
                <div className="h-full p-4 sm:p-6">
                  {reportData ? (
                    <InAppExcelModeler
                      reportData={reportData}
                      companyName={companyName}
                      ticker={ticker}
                      onSendChatPrompt={(promptText) => {
                        void handleSendMessage(promptText);
                      }}
                      onUpdateReportData={onUpdateReportData}
                      onDownloadExcel={onDownloadExcel}
                      isDownloadingExcel={isDownloadingExcel}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center max-w-md p-8 bg-white border border-[#E3DFD5] rounded-3xl shadow-sm space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto shadow-2xs">
                          <FileSpreadsheet className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-extrabold text-[#1A1917]">No Active Financial Model</h3>
                        <p className="text-xs text-[#7A7569] leading-relaxed">
                          Select an equity from your coverage list on the left, or launch research on any listed company to view and edit its live 3-statement financial model.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Active Canvas: Word Doc ─────────────────────────────── */}
              {activeCanvasTab === "word" && (
                <div className="h-full p-4 sm:p-6">
                  {reportData ? (
                    <InAppWordEditor
                      reportData={reportData}
                      companyName={companyName}
                      ticker={ticker}
                      onSendChatPrompt={(promptText) => {
                        void handleSendMessage(promptText);
                      }}
                      onUpdateReportData={onUpdateReportData}
                      onDownloadDocx={onDownloadDocx}
                      onDownloadPdf={onDownloadPdf}
                      isDownloadingDocx={isDownloadingDocx}
                      isDownloadingPdf={isDownloadingPdf}
                      reviewerName={reviewerName}
                      sebiRegNo={sebiRegNo}
                      approvedAt={approvedAt}
                      status={status}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center max-w-md p-8 bg-white border border-[#E3DFD5] rounded-3xl shadow-sm space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center mx-auto shadow-2xs">
                          <FileText className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-extrabold text-[#1A1917]">No Active Research Note</h3>
                        <p className="text-xs text-[#7A7569] leading-relaxed">
                          Select an equity from your coverage list on the left, or prompt the AI agent to draft an institutional research note.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Active Canvas: Research Milestones & Trajectory Stream ─ */}
              {activeCanvasTab === "pipeline" && (
                <div className="h-full flex flex-col min-h-0 overflow-hidden">
                  {/* Milestones Overview Header */}
                  <div className="p-3 bg-white border-b border-[#E3DFD5] space-y-2 shrink-0">
                    <div className="flex items-center justify-between text-[10px] font-bold text-[#7A7569] uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-amber-600" />
                        {isUploadJob ? "Document AI Extraction Pipeline" : "Autonomous Research Milestones"}
                      </span>
                      <span className="text-emerald-800 font-mono">
                        {status === "running" || status === "pending" || status === "approved"
                          ? `Executing (Step ${liveStepIndex}/6)...`
                          : "6/6 Completed"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
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

                  {/* Embedded Live Trajectory Feed */}
                  <div className="flex-1 min-h-0 overflow-hidden relative">
                    <TrajectoryFeed planId={cleanPlanId} altPlanId={effectiveJobId} onPlanComplete={onPlanComplete} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { HeaderNav } from "./dashboard/HeaderNav";
import { CoverageSidebar } from "./dashboard/CoverageSidebar";
import { NewResearchModal, type LaunchResearchParams } from "./dashboard/NewResearchModal";
import { AgentChatView } from "./dashboard/views/AgentChatView";
import { SignoffModal } from "./dashboard/SignoffModal";
import { UnifiedReportView } from "./dashboard/views/UnifiedReportView";
import {
  DashboardHistoryItem,
  UserSessionProfile,
  DashboardToast,
  HistoryFilterType,
} from "./dashboard/types";
import { EquityResearchData } from "@/types";
import { normalizeEquityResearchData } from "@/lib/utils/report-normalizer";
import {
  Sparkles,
  Building2,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";

interface DashboardProps {
  initialReportId?: string;
  initialViewMode?: "report" | "agent";
}

export default function Dashboard({ initialReportId, initialViewMode = "report" }: DashboardProps) {
  const router = useRouter();



  // Navigation & Primary View Mode (Report vs Agent)
  const [activeViewMode, setActiveViewMode] = useState<"report" | "agent">(initialViewMode);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNewResearchOpen, setIsNewResearchOpen] = useState(false);
  const [isSignoffOpen, setIsSignoffOpen] = useState(false);

  // Data & Session States
  const [user, setUser] = useState<UserSessionProfile | null>(null);
  const [history, setHistory] = useState<DashboardHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Active Research Data
  const [activeReportId, setActiveReportId] = useState<string | null>(initialReportId || null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [reportData, setReportData] = useState<EquityResearchData | null>(null);
  const [reportPdfBase64, setReportPdfBase64] = useState<string | null>(null);
  const [activeReportStatus, setActiveReportStatus] = useState<string>("draft");
  const [reviewerName, setReviewerName] = useState<string>("");
  const [sebiRegNo, setSebiRegNo] = useState<string>("");
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);

  // Status & Notifications
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  // URL Synchronization Helper (shallow SPA update without triggering Next.js route remount)
  const syncUrl = useCallback((reportId: string | null, mode: "report" | "agent") => {
    if (typeof window === "undefined") return;

    if (!reportId) {
      if (window.location.pathname !== "/") {
        try {
          const state = { ...(window.history.state || {}), __NA: true };
          window.history.replaceState(state, "", "/");
        } catch {
          window.history.replaceState(null, "", "/");
        }
        router.replace("/");
      }
      return;
    }

    // Never sync transient client-side optimistic IDs to the browser URL bar
    if (reportId.startsWith("plan_") || reportId.startsWith("job_")) return;

    const cleanId = reportId.replace(/^rep_/, "");
    const newPath = mode === "agent" ? `/agent/${cleanId}` : `/research/${cleanId}`;
    if (window.location.pathname !== newPath) {
      try {
        const state = { ...(window.history.state || {}), __NA: true };
        window.history.replaceState(state, "", newPath);
      } catch {
        window.history.replaceState(null, "", newPath);
      }
    }
  }, [router]);

  // Helper to completely clear active report state and redirect back to root dashboard
  const resetToEmptyState = useCallback(() => {
    setActiveReportId(null);
    setActiveSessionId(null);
    setCompanyName("");
    setReportData(null);
    setReportPdfBase64(null);
    setActiveReportStatus("draft");
    setActiveViewMode("report");
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("equigen_active_report_id");
      }
    } catch {}
    if (typeof window !== "undefined" && window.location.pathname !== "/") {
      try {
        const state = { ...(window.history.state || {}), __NA: true };
        window.history.replaceState(state, "", "/");
      } catch {
        window.history.replaceState(null, "", "/");
      }
    }
    router.replace("/");
  }, [router]);

  // Toast Helper
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };



  // Fetch Current User
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.plan ? { ...data.user, plan: data.plan } : data.user);
          if (data.user?.name) setReviewerName(data.user.name);
          if (data.user?.sebiRegNo) setSebiRegNo(data.user.sebiRegNo);
        } else if (res.status === 401) {
          router.push("/signin");
        }
      } catch (err) {
        console.warn("User session check:", err);
      }
    };
    fetchUser();
  }, [router]);

  // Fetch History and Plans
  const fetchHistory = async (isInitial = false) => {
    try {
      const historyRes = await fetch("/api/history").catch(() => null);
      const items: DashboardHistoryItem[] = [];

      if (historyRes && historyRes.ok) {
        const data = await historyRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((item: any) => {
          const isAuto =
            item.sourceType === "autonomous" ||
            item.fileName === "Autonomous Research" ||
            (item.fileName ? item.fileName.toLowerCase().includes("autonomous") : false) ||
            item.id?.startsWith("plan_") ||
            item.companyName?.toLowerCase().startsWith("initiation of coverage") ||
            item.modelUsedForFinancials?.toLowerCase().includes("orchestrator") ||
            item.reportData?.sourceType === "autonomous";
          items.push({
            id: item.id,
            companyName: item.companyName,
            fileName: item.fileName,
            createdAt: item.createdAt,
            reportData: normalizeEquityResearchData(item.reportData),
            reportPdfBase64: item.pdfBase64,
            status: item.status || "draft",
            reviewerName: item.reviewerName,
            sebiRegNo: item.sebiRegNo,
            approvedAt: item.approvedAt,
            modelUsedForFinancials: item.modelUsedForFinancials,
            sourceType: isAuto ? "autonomous" : "manual",
          });
        });
      }

      // Helper to check whether an item has actual parsed report data vs a bare skeleton
      const isRichItem = (it: DashboardHistoryItem) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rd = it.reportData as any;
        if (!rd) return false;
        return Boolean(
          (Array.isArray(rd.sections) && rd.sections.length > 0) ||
          (typeof rd.executiveSummary === "string" && rd.executiveSummary.trim().length > 0) ||
          rd.companyData?.pe != null ||
          rd.recommendation?.targetPrice != null ||
          it.status === "completed" ||
          it.status === "pending_review" ||
          it.status === "published"
        );
      };

      // Deduplicate items by normalized ID, prioritizing real reports over skeleton placeholders
      const uniqueMap = new Map<string, DashboardHistoryItem>();

      for (const item of items) {
        const cleanId = item.id.replace(/^rep_/, "");
        const existing = uniqueMap.get(cleanId);
        if (!existing) {
          uniqueMap.set(cleanId, item);
        } else {
          // If existing is a bare skeleton but new candidate is a rich report, replace it
          if (!isRichItem(existing) && isRichItem(item)) {
            uniqueMap.set(cleanId, item);
          }
        }
      }

      const uniqueItems = Array.from(uniqueMap.values());

      // If coverage universe is completely empty (all reports were deleted or DB reset)
      if (uniqueItems.length === 0) {
        setHistory([]);
        resetToEmptyState();
        return;
      }

      // When merging background updates into history, preserve any active/running jobs without creating ghost duplicates
      // and ALWAYS pin running/pending items to the top of the history list
      setHistory((prev) => {
        const runningFromPrev = prev.filter((p) => {
          const isRunning = p.status === "running" || p.status === "pending" || p.status === "throttled";
          if (!isRunning) return false;
          const cleanPId = p.id.replace(/^rep_/, "");
          const alreadyInUnique = uniqueItems.some((u) => {
            const cleanUId = u.id.replace(/^rep_/, "");
            return u.id === p.id || cleanUId === cleanPId || (p.id.startsWith("plan_") && u.sourceType === "autonomous" && u.companyName === p.companyName);
          });
          return !alreadyInUnique;
        });

        const merged = [...runningFromPrev, ...uniqueItems];
        const running = merged.filter((i) => i.status === "running" || i.status === "pending" || i.status === "throttled");
        const nonRunning = merged.filter((i) => !(i.status === "running" || i.status === "pending" || i.status === "throttled"));
        return [...running, ...nonRunning];
      });

      // If activeReportId is set and this is a background sync/refetch
      if (activeReportId && !isInitial) {
        const cleanActiveId = activeReportId.replace(/^rep_/, "");
        const existing = uniqueItems.find(
          (i) => i.id === activeReportId || i.id.replace(/^rep_/, "") === cleanActiveId || i.id === `rep_${cleanActiveId}`
        );
        if (existing) {
          const cleanExistingId = existing.id.replace(/^rep_/, "");
          if (cleanExistingId !== cleanActiveId) {
            setActiveReportId(cleanExistingId);
          }
          // Do not let "approved" or pending DB status downgrade active running state
          const isActivelyRunning = activeReportStatus === "running" || activeReportStatus === "pending";
          const existingIsRunning = existing.status === "running" || existing.status === "pending" || existing.status === "approved" || existing.status === "throttled";
          if (isActivelyRunning && existingIsRunning) {
            setActiveReportStatus("running");
          } else {
            setActiveReportStatus(existing.status || "published");
          }

          if (existing.reportData && (isRichItem(existing) || !reportData || !isRichItem({ reportData } as DashboardHistoryItem))) {
            setReportData(existing.reportData);
          }
          if (existing.companyName) {
            setCompanyName(existing.companyName);
          }
          if (existing.reportPdfBase64) {
            setReportPdfBase64(existing.reportPdfBase64);
          }
          return;
        }

        // If active report is currently executing, pending, or in loading state, NEVER fall back to another company
        const isCurrentlyBusy =
          activeReportStatus === "running" ||
          activeReportStatus === "pending" ||
          activeReportId.startsWith("plan_") ||
          activeReportId.startsWith("job_") ||
          loading;

        if (isCurrentlyBusy) {
          // If activeReportId was an extraction job and a generated report for it is now present
          if (activeReportId.startsWith("job_")) {
            const generatedReport = uniqueItems.find(
              (i) =>
                !i.id.startsWith("job_") &&
                !i.id.startsWith("plan_") &&
                (i.reportData as unknown as Record<string, unknown> | null)?.jobId === activeReportId
            );
            if (generatedReport) {
              setActiveReportId(generatedReport.id);
              setActiveReportStatus(generatedReport.status || "draft");
              if (generatedReport.reportData) setReportData(generatedReport.reportData);
              if (generatedReport.companyName) setCompanyName(generatedReport.companyName);
              if (generatedReport.reportPdfBase64) setReportPdfBase64(generatedReport.reportPdfBase64);
              return;
            }
          }
          // Keep active view on the currently executing swarm run
          return;
        }

        // Active report was explicitly deleted or no longer exists: fallback to first report or reset to empty
        if (uniqueItems.length > 0) {
          handleSelectReport(uniqueItems[0]);
        } else {
          resetToEmptyState();
        }
        return;
      }

      if (isInitial || !activeReportId) {
        // Auto-restore active report across page refresh (prioritize route prop > running > saved)
        let savedId: string | null = null;
        try {
          if (typeof window !== "undefined") {
            savedId = localStorage.getItem("equigen_active_report_id");
          }
        } catch { }

        const cleanInitialId = initialReportId ? initialReportId.replace(/^rep_/, "") : null;
        const initialItem = cleanInitialId
          ? uniqueItems.find((i) => i.id === initialReportId || i.id.replace(/^rep_/, "") === cleanInitialId || i.id === `rep_${cleanInitialId}`)
          : null;

        const runningItem = uniqueItems.find((i) => i.status === "running" || i.status === "pending");
        const savedItem = savedId ? uniqueItems.find((i) => i.id === savedId || i.id.replace(/^rep_/, "") === savedId.replace(/^rep_/, "")) : null;
        const targetItem = initialItem || runningItem || savedItem || (uniqueItems.length > 0 ? uniqueItems[0] : null);

        if (targetItem) {
          const targetMode = initialReportId ? initialViewMode : activeViewMode;
          const cleanTargetId = targetItem.id.replace(/^rep_/, "");
          setActiveReportId(cleanTargetId);
          setActiveSessionId(cleanTargetId);
          setCompanyName(targetItem.companyName);
          setReportData(targetItem.reportData);
          setReportPdfBase64(targetItem.reportPdfBase64);
          setActiveReportStatus(targetItem.status || "draft");
          setReviewerName(targetItem.reviewerName || user?.name || "");
          setSebiRegNo(targetItem.sebiRegNo || user?.sebiRegNo || "");
          setApprovedAt(targetItem.approvedAt || null);
          setActiveViewMode(targetMode);
          syncUrl(cleanTargetId, targetMode);
        } else {
          resetToEmptyState();
        }
      }
    } catch (err) {
      console.warn("Failed to load history:", err);
    } finally {
      if (isInitial) {
        setIsLoadingHistory(false);
      }
    }
  };

  useEffect(() => {
    fetchHistory(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Polling interval to auto-update status when any item is running or pending
  useEffect(() => {
    const hasRunning = history.some((item) => item.status === "running" || item.status === "pending");
    if (!hasRunning) return;

    const interval = setInterval(() => {
      fetchHistory(false);
    }, 4000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  // Select Report
  const handleSelectReport = (item: DashboardHistoryItem) => {
    // Retain user's current view mode (Report vs Agent) unless target item is actively running
    const targetMode = item.status === "running" || item.status === "pending" ? "agent" : activeViewMode;
    const cleanId = item.id.replace(/^rep_/, "");
    setActiveReportId(cleanId);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("equigen_active_report_id", cleanId);
      }
    } catch { }
    setActiveSessionId(cleanId);
    setCompanyName(item.companyName);
    setReportData(item.reportData);
    setReportPdfBase64(item.reportPdfBase64);
    setActiveReportStatus(item.status || "draft");
    setReviewerName(item.reviewerName || user?.name || "");
    setSebiRegNo(item.sebiRegNo || user?.sebiRegNo || "");
    setApprovedAt(item.approvedAt || null);
    setActiveViewMode(targetMode);
    syncUrl(cleanId, targetMode);
  };

  // Delete Report
  const handleDeleteReport = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const cleanId = id.replace(/^rep_/, "");
    const repId = `rep_${cleanId}`;

    let remainingAfterDelete: DashboardHistoryItem[] = [];
    setHistory((prev) => {
      const filtered = prev.filter((h) => h.id !== id && h.id !== cleanId && h.id !== repId);
      remainingAfterDelete = filtered;
      return filtered;
    });

    try {
      await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const isCurrentActive = activeReportId === id || activeReportId === cleanId || activeReportId === repId;

      if (remainingAfterDelete.length === 0) {
        // All reports deleted from the universe: cleanly reset state and redirect to http://localhost:3000/
        resetToEmptyState();
      } else if (isCurrentActive) {
        // Current report was deleted, switch to the next available report in the universe
        handleSelectReport(remainingAfterDelete[0]);
      }

      showToast("Report deleted from universe", "info");
      fetchHistory();
    } catch {
      showToast("Failed to delete report", "error");
    }
  };

  // Stop / Interrupt Running Agent or Extraction Job
  const handleStopProcess = async (e?: React.MouseEvent, idToStop?: string) => {
    if (e) e.stopPropagation();
    const targetId = idToStop || activeReportId;
    if (!targetId) return;

    const cleanId = targetId.replace(/^rep_/, "");

    // Optimistically mark as cancelled in local history state immediately
    setHistory((prev) =>
      prev.map((h) =>
        h.id === targetId || h.id === cleanId || h.id === `rep_${cleanId}`
          ? { ...h, status: "cancelled" }
          : h
      )
    );

    if (activeReportId === targetId || activeReportId === cleanId) {
      setActiveReportStatus("cancelled");
    }

    try {
      showToast("Interrupting & stopping running agent...", "info");
      const res = await fetch("/api/agent/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetId }),
      });

      if (res.ok) {
        showToast("Agent process stopped successfully", "success");
      } else {
        // Fallback: steer cancel
        await fetch("/api/agent/steer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId: cleanId, eventType: "cancel" }),
        });
        showToast("Agent process stopped", "info");
      }
      fetchHistory(false);
    } catch (err) {
      console.error("Failed to stop process:", err);
      showToast("Failed to stop agent process", "error");
    }
  };

  // Launch Unified Research Swarm (Autonomous AI Swarm + Optional PDF Filing Enrichment)
  const handleLaunchResearch = async ({
    companyName: compName,
    ticker: tickerInput,
    depth = "standard",
    promptGoal: goalText,
    file,
  }: LaunchResearchParams) => {
    setIsNewResearchOpen(false);
    setLoading(true);

    const cleanInputTicker = (tickerInput || "").trim().toUpperCase();
    const derivedTicker = cleanInputTicker || compName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10) || "TICKER";
    const tempPlanId = `plan_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const newSessionId = `session_${Date.now()}`;
    const reportFileName = file ? file.name : "Autonomous Research";

    const prevActiveReportId = activeReportId;
    const prevActiveSessionId = activeSessionId;
    const prevCompanyName = companyName;
    const prevReportData = reportData;
    const prevReportPdfBase64 = reportPdfBase64;
    const prevActiveReportStatus = activeReportStatus;
    const prevActiveViewMode = activeViewMode;

    // 1. Immediately create optimistic item in sidebar (using file.name if attached)
    const optimisticPlanItem: DashboardHistoryItem = {
      id: tempPlanId,
      companyName: compName,
      fileName: reportFileName,
      createdAt: new Date().toISOString(),
      reportData: {
        company: { name: compName, ticker: derivedTicker },
        sourceType: "autonomous",
        planId: tempPlanId,
        fileName: reportFileName,
        status: "running",
      } as unknown as EquityResearchData,
      reportPdfBase64: null,
      status: "running",
      sourceType: "autonomous",
    };

    // 2. Immediately switch active report & sidebar selection to this new run
    setHistory((prev) => [optimisticPlanItem, ...prev.filter((h) => h.id !== tempPlanId)]);
    setActiveReportId(tempPlanId);
    setActiveSessionId(newSessionId);
    setCompanyName(compName);
    setReportData(null);
    setReportPdfBase64(null);
    setActiveReportStatus("running");
    setActiveViewMode("agent");

    if (file) {
      showToast(`Uploading ${file.name} & deploying multi-agent research swarm for ${compName}...`, "info");
    } else {
      showToast(`Deploying multi-agent research swarm for ${compName}...`, "info");
    }

    try {
      let uploadedDocPayload: { fileName: string; textSummary?: string; documentId?: string } | undefined = undefined;

      // If a filing PDF is provided, process it and pass text excerpt / documentId to swarm
      if (file) {
        let rawText = "";
        let documentId: string | null = null;
        const isLargeFile = file.size > 4 * 1024 * 1024;

        if (!isLargeFile) {
          try {
            const formData = new FormData();
            formData.append("file", file);
            const uploadRes = await fetch("/api/upload", {
              method: "POST",
              body: formData,
            });
            if (uploadRes.ok) {
              const uploadData = await uploadRes.json();
              rawText = uploadData.text || "";
              documentId = uploadData.targeting?.documentId ?? null;
            } else if (uploadRes.status === 402) {
              const quotaErr = await uploadRes.json().catch(() => ({}));
              throw new Error(quotaErr.message || "Monthly research limit reached. Deleting reports does not refund quota. Please upgrade in Settings & Billing.");
            }
          } catch (uploadErr) {
            if (uploadErr instanceof Error && uploadErr.message.includes("Monthly research limit")) {
              throw uploadErr;
            }
            // Fall through to client-side extraction
          }
        }

        if (!rawText) {
          try {
            const { extractText } = await import("unpdf");
            const arrayBuffer = await file.arrayBuffer();
            const extracted = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
            rawText = (extracted.text as string) || "";
          } catch (unpdfErr) {
            console.warn("[Dashboard] Client-side PDF extraction error:", unpdfErr);
          }
        }

        if (rawText) {
          uploadedDocPayload = {
            fileName: file.name,
            textSummary: rawText.slice(0, 15000), // Rich context chunk for LLM planning & synthesis
            documentId: documentId || undefined,
          };
        }
      }

      const fullGoal = goalText || `Initiation of coverage on ${compName}${cleanInputTicker ? ` (${cleanInputTicker})` : ""} — 5-year DCF, peer multiples, and SEBI compliance audit`;
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalText: fullGoal,
          companyName: compName,
          ticker: cleanInputTicker || undefined,
          depth,
          sessionId: newSessionId,
          uploadedDocument: uploadedDocPayload,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const plan = data.plan;
        if (plan && plan.id) {
          // Replace tempPlanId with real plan.id across history and active state
          setHistory((prev) =>
            prev.map((item) =>
              item.id === tempPlanId
                ? {
                  ...item,
                  id: plan.id,
                  fileName: reportFileName,
                  reportData: {
                    ...(item.reportData as unknown as Record<string, unknown>),
                    planId: plan.id,
                    fileName: reportFileName,
                  } as unknown as EquityResearchData,
                }
                : item
            )
          );
          setActiveReportId(plan.id);
          setActiveSessionId(plan.sessionId || `session_${plan.id}`);
          syncUrl(plan.id, "agent");

          // Auto approve research plan
          await fetch(`/api/agent/plan/${plan.id}/approve`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ actorId: "analyst" }),
          }).catch(() => { });

          // Trigger Master Orchestrator background execution
          fetch("/api/agent/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ planId: plan.id }),
          }).catch((err) => console.warn("[Dashboard] Failed to trigger execution:", err));

          showToast(`Autonomous swarm running for ${compName}`, "success");
          fetchHistory(false);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 402 || errData.code === "quota_exceeded") {
          throw new Error(errData.message || "Monthly research report limit reached (3/3 on Freemium plan). Deleting saved reports does not refund quota. Please upgrade in Settings & Billing.");
        }
        throw new Error(errData.message || "Failed to dispatch plan");
      }
    } catch (err) {
      console.error("[Dashboard] handleLaunchResearch error:", err);
      // Clean up the optimistic temporary plan item from history and rollback view state
      setHistory((prev) => prev.filter((h) => h.id !== tempPlanId));
      setActiveReportId(prevActiveReportId);
      setActiveSessionId(prevActiveSessionId);
      setCompanyName(prevCompanyName);
      setReportData(prevReportData);
      setReportPdfBase64(prevReportPdfBase64);
      setActiveReportStatus(prevActiveReportStatus);
      setActiveViewMode(prevActiveViewMode);

      let msg = err instanceof Error ? err.message : "Error dispatching swarm";
      if (msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
        msg = "Network timeout while deploying research swarm. Please retry.";
      }
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  // Live Report Update Handler (called by Copilot to update/fix/modify the report)
  const handleUpdateReportData = (updated: EquityResearchData) => {
    setReportData(updated);
    if (activeReportId) {
      setHistory((prev) =>
        prev.map((item) =>
          item.id === activeReportId ? { ...item, reportData: updated } : item
        )
      );
    }
    showToast(`Report for ${companyName} modified & updated live by AI Copilot!`, "success");
  };

  // Signoff Success Handler
  const handleSignoffSuccess = (rName: string, sReg: string) => {
    setActiveReportStatus("approved");
    setReviewerName(rName);
    setSebiRegNo(sReg);
    setApprovedAt(new Date().toISOString());
    showToast(`Report for ${companyName} certified and approved under SEBI RA Reg. 2014!`, "success");
    fetchHistory();
  };

  // PDF Download Trigger
  const handleDownloadPdf = async () => {
    if (!activeReportId) return;
    setIsDownloadingPdf(true);
    showToast("Compiling institutional PDF report...", "info");

    try {
      let blob: Blob | null = null;
      let filename = `${companyName.replace(/[^a-zA-Z0-9]/g, "_")}_Research_Report.pdf`;

      if (reportPdfBase64) {
        const bytes = Uint8Array.from(atob(reportPdfBase64), (c) => c.charCodeAt(0));
        blob = new Blob([bytes], { type: "application/pdf" });
      } else {
        const cleanId = activeReportId.replace(/^rep_/, "");
        const queryParams = new URLSearchParams({
          id: cleanId,
          ticker: reportData?.company?.ticker || "TICKER",
          companyName: companyName,
        });

        let res = await fetch(`/api/download?${queryParams.toString()}`);

        // If authenticity gate blocked download, check if user can override or if report is approved/published
        if (res.status === 409) {
          const errData = await res.json().catch(() => ({}));
          const canOverride =
            errData.canOverride ||
            user?.role === "reviewer" ||
            user?.role === "admin" ||
            user?.role === "research_analyst" ||
            activeReportStatus === "approved" ||
            activeReportStatus === "published";

          if (canOverride) {
            queryParams.set("overrideQuality", "true");
            queryParams.set(
              "overrideReason",
              `Institutional analyst inspection and export authorization for ${companyName}`
            );
            res = await fetch(`/api/download?${queryParams.toString()}`);
          } else {
            throw new Error(errData.message || "Authenticity gate blocked export. Reviewer override required.");
          }
        }

        // If not found in DB or download failed, fall back to compiling current client reportData
        if (!res.ok && reportData) {
          try {
            const compileRes = await fetch("/api/report", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(reportData),
            });
            if (compileRes.ok) {
              const compileData = await compileRes.json();
              if (compileData.pdfBase64) {
                const bytes = Uint8Array.from(atob(compileData.pdfBase64), (c) => c.charCodeAt(0));
                blob = new Blob([bytes], { type: "application/pdf" });
                setReportPdfBase64(compileData.pdfBase64);
              }
            }
          } catch {
            // best-effort fallback
          }
        }

        if (!blob) {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `PDF download failed (HTTP ${res.status}).`);
          }
          blob = await res.blob();
          const disposition = res.headers.get("content-disposition") || "";
          const match = disposition.match(/filename="?([^";]+)"?/i);
          if (match && match[1]) filename = match[1];
        }
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      showToast("PDF report downloaded successfully!", "success");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "PDF download failed. Please try again.";
      showToast(errMsg, "error");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Excel Download Trigger
  const handleDownloadExcel = async () => {
    if (!activeReportId) return;
    setIsDownloadingExcel(true);
    showToast("Exporting 3-statement financial model to Excel...", "info");

    try {
      const cleanId = activeReportId.replace(/^rep_/, "");
      const res = await fetch(`/api/excel/export?reportId=${encodeURIComponent(cleanId)}`);
      if (!res.ok) throw new Error("Excel export failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${companyName.replace(/[^a-zA-Z0-9]/g, "_")}_3Statement_Model.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      showToast("Excel workbook exported successfully!", "success");
    } catch {
      showToast("Excel export failed.", "error");
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  // Sign out
  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/signin");
      router.refresh();
    } catch {
      router.push("/signin");
    }
  };

  const ticker = reportData?.company?.ticker || undefined;

  const handleViewModeChange = (mode: "report" | "agent") => {
    setActiveViewMode(mode);
    if (activeReportId) {
      syncUrl(activeReportId, mode);
    }
  };

  const handlePlanComplete = (completedJobId?: string) => {
    void completedJobId;
    fetchHistory(false);
    showToast("Autonomous research completed! Full research note is ready.", "success");
  };

  const handleSwitchToReport = useCallback(() => {
    setActiveViewMode("report");
    if (activeReportId) {
      syncUrl(activeReportId.replace(/^rep_/, ""), "report");
    }
  }, [activeReportId, syncUrl]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F4EE] text-[#1A1917] antialiased font-sans overflow-hidden">
      {/* ── Top Command Bar ─────────────────────────────────────────────── */}
      <HeaderNav
        activeViewMode={activeViewMode}
        onViewModeChange={handleViewModeChange}
        activeCompanyName={companyName}
        activeTicker={ticker}
        onOpenNewResearch={() => setIsNewResearchOpen(true)}
        user={user}
        onSignOut={handleSignOut}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        hasActiveReport={!!reportData}
        onOpenSignoff={() => setIsSignoffOpen(true)}
        activeReportStatus={activeReportStatus}
      />

      {/* ── Main Workspace Body ─────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Collapsible Coverage Universe Sidebar */}
        <CoverageSidebar
          isOpen={isSidebarOpen}
          onToggleOpen={() => setIsSidebarOpen(!isSidebarOpen)}
          history={history}
          activeReportId={activeReportId}
          onSelectReport={handleSelectReport}
          onDeleteReport={handleDeleteReport}
          onStopProcess={handleStopProcess}
          historyFilter={historyFilter}
          onFilterChange={setHistoryFilter}
          searchQuery={searchQuery}
          onOpenNewResearch={() => setIsNewResearchOpen(true)}
          isLoading={isLoadingHistory}
        />

        {/* ── Primary Central Stage ─────────────────────────────────────── */}
        {isLoadingHistory && !reportData ? (
          <main className="flex-1 flex items-center justify-center h-full bg-[#FAF8F5]">
            <div className="text-center max-w-sm p-8 bg-white border border-[#E3DFD5] rounded-3xl shadow-sm animate-pulse space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#1A1917] text-amber-400 flex items-center justify-center mx-auto shadow-sm">
                <Sparkles className="w-6 h-6 animate-spin" />
              </div>
              <h3 className="text-sm font-extrabold text-[#1A1917]">Loading Coverage Universe...</h3>
              <p className="text-xs text-[#7A7569]">
                Connecting to institutional database & autonomous research streams.
              </p>
            </div>
          </main>
        ) : activeViewMode === "report" || (!activeReportId && !reportData && history.length === 0) ? (
          /* Mode 1 & Universe Empty State: Complete Equity Research Report Page */
          <main className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto p-4 sm:p-6 transition-all duration-300">
            {reportData ? (
              <UnifiedReportView
                reportData={reportData}
                companyName={companyName}
                ticker={ticker}
                onOpenSignoff={() => setIsSignoffOpen(true)}
                onDownloadPdf={handleDownloadPdf}
                onDownloadExcel={handleDownloadExcel}
                isDownloadingPdf={isDownloadingPdf}
                isDownloadingExcel={isDownloadingExcel}
                onAskCopilotPrompt={(_prompt) => {
                  setActiveViewMode("agent");
                }}
                reviewerName={reviewerName}
                sebiRegNo={sebiRegNo}
                approvedAt={approvedAt}
                status={activeReportStatus}
              />
            ) : (
              /* Empty State */
              <div className="flex-1 flex items-center justify-center h-full">
                <div className="text-center max-w-md p-8 bg-white border border-[#E3DFD5] rounded-3xl shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center mx-auto mb-3">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-extrabold text-[#1A1917]">No Active Research Note</h3>
                  <p className="text-xs text-[#7A7569] mt-1.5 mb-5 leading-relaxed">
                    Select a company from your coverage universe on the left, or deploy the autonomous multi-agent swarm to analyze a new equity.
                  </p>
                  <button
                    onClick={() => setIsNewResearchOpen(true)}
                    className="px-5 py-2.5 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-xs font-bold rounded-xl shadow-xs transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-amber-400" />
                    Launch New Research
                  </button>
                </div>
              </div>
            )}
          </main>
        ) : (
          /* Mode 2: Complete ChatGPT-Style AI Agent & Chat Page */
          <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-white animate-fadeIn">
            <AgentChatView
              key={activeSessionId || activeReportId?.replace(/^rep_/, "") || "agent_view_empty"}
              reportId={activeReportId}
              companyName={companyName}
              ticker={ticker}
              reportData={reportData}
              status={activeReportStatus}
              onUpdateReportData={handleUpdateReportData}
              onSwitchToReport={handleSwitchToReport}
              onPlanComplete={handlePlanComplete}
              onStopAgent={() => handleStopProcess(undefined, activeReportId || undefined)}
            />
          </main>
        )}
      </div>

      {/* ── Modals & Dialogs ───────────────────────────────────────────── */}
      {/* 1. New Research Wizard Modal */}
      <NewResearchModal
        isOpen={isNewResearchOpen}
        onClose={() => setIsNewResearchOpen(false)}
        onLaunchResearch={handleLaunchResearch}
      />

      {/* 2. SEBI Compliance Sign-off Modal */}
      <SignoffModal
        isOpen={isSignoffOpen}
        onClose={() => setIsSignoffOpen(false)}
        reportId={activeReportId}
        companyName={companyName}
        defaultReviewerName={reviewerName}
        defaultSebiRegNo={sebiRegNo}
        onSignoffSuccess={handleSignoffSuccess}
      />

      {/* ── Toast Notifications ────────────────────────────────────────── */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-medium animate-fadeIn ${toast.type === "success"
                ? "bg-emerald-950/90 text-emerald-200 border-emerald-500/40"
                : toast.type === "error"
                  ? "bg-rose-950/90 text-rose-200 border-rose-500/40"
                  : "bg-slate-900/90 text-slate-100 border-white/15"
              }`}
          >
            {toast.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
            {toast.type === "error" && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            {toast.type === "info" && <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />}
            <span>{toast.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
              className="ml-2 text-white/50 hover:text-white pointer-events-auto"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

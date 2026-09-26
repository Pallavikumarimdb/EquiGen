"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HeaderNav } from "./dashboard/HeaderNav";
import { CoverageSidebar } from "./dashboard/CoverageSidebar";
import { NewResearchModal } from "./dashboard/NewResearchModal";
import { AgentChatView } from "./dashboard/views/AgentChatView";
import { SignoffModal } from "./dashboard/SignoffModal";
import { BuySideView } from "./dashboard/views/BuySideView";
import { SellSideView } from "./dashboard/views/SellSideView";
import { IndividualView } from "./dashboard/views/IndividualView";
import {
  PersonaType,
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

// Initial default fallback company data if workspace is completely fresh
const DEFAULT_SAMPLE_REPORT: EquityResearchData = {
  company: {
    name: "Tata Motors Limited",
    ticker: "TATAMOTORS",
    sector: "Automotive & Mobility",
    industry: "Commercial & Passenger Vehicles",
    reportDate: new Date().toLocaleDateString(undefined, { dateStyle: "medium" }),
  },
  recommendation: {
    rating: "BUY",
    currentPrice: 948,
    targetPrice: 1140,
    upsidePotential: 20.3,
    rationale: [
      "JLR margin resilience led by strong Defender and Range Rover order backlog",
      "Domestic EV volume leadership with >65% market share in passenger electric vehicles",
      "Aggressive net debt reduction targeting near-zero automotive net debt by FY25",
    ],
  },
  companyData: {
    marketCap: 348500,
    highLow52W: "₹635 — ₹1,179",
    enterpriseValue: 375000,
    outstandingShares: 332,
    freeFloat: "54.2%",
    dividendYield: "0.6%",
    beta: 1.25,
  },
  executiveSummary:
    "Tata Motors Limited is positioned at the intersection of a luxury SUV super-cycle at JLR and a structural domestic electrification shift. We initiate coverage with a BUY recommendation and a 12-month target price of ₹1,140 based on SOTP and DCF valuation.",
  swotAnalysis: {
    strengths: [
      "Global luxury brand equity through Jaguar Land Rover with high average selling prices",
      "Commanding domestic market share in medium and heavy commercial vehicles (M&HCV)",
      "Strong vertical integration in electric vehicle powertrain through Tata AutoComp and Tata Power",
    ],
    weaknesses: [
      "Cyclical sensitivity in European and UK automotive markets exposed to macroeconomic slowdown",
      "Heavy capex requirements for continuous battery technology evolution and autonomous platforms",
      "UK manufacturing operations exposed to British pound and euro foreign exchange fluctuations",
    ],
    opportunities: [
      "De-merger into two separate listed entities (Commercial Vehicles & Passenger Vehicles) unlocking sum-of-the-parts value",
      "Rapid export ramp-up of modern EV platforms to Middle East and Southeast Asian markets",
      "Commercial vehicle fleet modernization driven by government scrappage policy incentives",
    ],
    threats: [
      "Intensifying domestic EV competition from global and Chinese OEM entrants",
      "Supply chain disruptions in critical power semiconductors and raw battery minerals",
      "Stricter Euro-7 emissions and safety regulatory compliance deadlines",
    ],
  },
  fiveYearSummary: [
    { period: "FY22", sales: 278454, ebitda: 24813, ebitdaMargin: 8.9, patAdjusted: -11441, pe: null, roe: -24.5, deRatio: 2.1 },
    { period: "FY23", sales: 345967, ebitda: 37011, ebitdaMargin: 10.7, patAdjusted: 2414, pe: 58.2, roe: 5.4, deRatio: 1.6 },
    { period: "FY24", sales: 437928, ebitda: 62800, ebitdaMargin: 14.3, patAdjusted: 31807, pe: 11.2, roe: 36.2, deRatio: 0.8 },
    { period: "FY25E", sales: 482000, ebitda: 71300, ebitdaMargin: 14.8, patAdjusted: 35400, pe: 9.8, roe: 28.5, deRatio: 0.4 },
    { period: "FY26E", sales: 535000, ebitda: 81800, ebitdaMargin: 15.3, patAdjusted: 41200, pe: 8.4, roe: 26.1, deRatio: 0.2 },
  ],
  keyFinancials: {
    incomeStatement: [],
    balanceSheet: [],
    cashFlow: [],
  },
  valuationAnalysis: "Discounted Cash Flow (DCF) with 12.0% WACC and 5.0% Terminal Growth Rate.",
  investmentRisks: ["Commodity price volatility", "Cyclical European slowdown", "EV platform competition"],
  competitors: [
    { name: "Mahindra & Mahindra", ticker: "M&M", currentPrice: 2840, targetPrice: 3200, recommendation: "BUY" },
    { name: "Maruti Suzuki", ticker: "MARUTI", currentPrice: 12150, targetPrice: 13400, recommendation: "ACCUMULATE" },
    { name: "Ashok Leyland", ticker: "ASHOKLEY", currentPrice: 228, targetPrice: 265, recommendation: "BUY" },
  ],
};

interface DashboardProps {
  initialReportId?: string;
  initialViewMode?: "report" | "agent";
}

export default function Dashboard({ initialReportId, initialViewMode = "report" }: DashboardProps) {
  const router = useRouter();

  // Persona State (Buy-Side vs Sell-Side vs Individual)
  const [currentPersona, setCurrentPersona] = useState<PersonaType>("buyside");

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
  const [_activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [reportData, setReportData] = useState<EquityResearchData | null>(null);
  const [reportPdfBase64, setReportPdfBase64] = useState<string | null>(null);
  const [activeReportStatus, setActiveReportStatus] = useState<string>("draft");
  const [reviewerName, setReviewerName] = useState<string>("");
  const [sebiRegNo, setSebiRegNo] = useState<string>("");
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(true);

  // Status & Notifications
  const [_loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  // URL Synchronization Helper
  const syncUrl = (reportId: string | null, mode: "report" | "agent") => {
    if (!reportId || typeof window === "undefined") return;
    const cleanId = reportId.replace(/^rep_/, "");
    const newPath = mode === "agent" ? `/agent/${cleanId}` : `/research/${cleanId}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, "", newPath);
    }
  };

  // Toast Helper
  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  // Load Persona preference from localStorage on mount
  useEffect(() => {
    try {
      const savedPersona = localStorage.getItem("equigen_persona") as PersonaType;
      if (savedPersona === "buyside" || savedPersona === "sellside" || savedPersona === "individual") {
        setCurrentPersona(savedPersona);
      }
    } catch {}
  }, []);

  const handlePersonaChange = (p: PersonaType) => {
    setCurrentPersona(p);
    try {
      localStorage.setItem("equigen_persona", p);
    } catch {}
    showToast(`Switched to ${p === "buyside" ? "Buy-Side Fundamental" : p === "sellside" ? "Sell-Side Institutional" : "Individual Researcher"} Workspace`, "info");
  };

  // Fetch Current User
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          if (data.user?.name) setReviewerName(data.user.name);
          if (data.user?.sebiRegNo) setSebiRegNo(data.user.sebiRegNo);
        }
      } catch (err) {
        console.warn("User session check:", err);
      }
    };
    fetchUser();
  }, []);

  // Global prevention for unintended browser file navigation (e.g. dropping a PDF outside the drop zone)
  // This prevents the browser from attempting to navigate to file:/// links, which triggers Security Errors
  useEffect(() => {
    const preventFileDropNavigation = (e: DragEvent) => {
      e.preventDefault();
    };
    window.addEventListener("dragenter", preventFileDropNavigation, true);
    window.addEventListener("dragover", preventFileDropNavigation, true);
    window.addEventListener("drop", preventFileDropNavigation, true);
    return () => {
      window.removeEventListener("dragenter", preventFileDropNavigation, true);
      window.removeEventListener("dragover", preventFileDropNavigation, true);
      window.removeEventListener("drop", preventFileDropNavigation, true);
    };
  }, []);

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

      // Deduplicate items by normalized ID
      const seenIds = new Set<string>();
      const uniqueItems: DashboardHistoryItem[] = [];

      for (const item of items) {
        const cleanId = item.id.replace(/^rep_/, "");
        if (!seenIds.has(cleanId) && !seenIds.has(item.id)) {
          seenIds.add(cleanId);
          seenIds.add(item.id);
          seenIds.add(`rep_${cleanId}`);
          uniqueItems.push(item);
        }
      }

      // Add default sample report to top if empty
      if (uniqueItems.length === 0) {
        uniqueItems.push({
          id: "rep_default_sample",
          companyName: "Tata Motors Limited",
          fileName: "Tata_Motors_Initiation.pdf",
          createdAt: new Date().toISOString(),
          reportData: DEFAULT_SAMPLE_REPORT,
          reportPdfBase64: null,
          status: "draft",
          sourceType: "autonomous",
        });
      }

      // When merging background updates into history, preserve any active/running jobs
      setHistory((prev) => {
        const runningFromPrev = prev.filter(
          (p) =>
            (p.status === "running" || p.status === "pending" || p.status === "throttled") &&
            !uniqueItems.some((u) => u.id === p.id)
        );
        return [...runningFromPrev, ...uniqueItems];
      });

      // If activeReportId is set and this is a background sync/refetch
      if (activeReportId && !isInitial) {
        const cleanActiveId = activeReportId.replace(/^rep_/, "");
        const existing = uniqueItems.find(
          (i) => i.id === activeReportId || i.id.replace(/^rep_/, "") === cleanActiveId || i.id === `rep_${cleanActiveId}`
        );
        if (existing) {
          if (existing.id !== activeReportId) {
            setActiveReportId(existing.id);
          }
          setActiveReportStatus(existing.status || "published");
          if (existing.reportData) {
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
      }

      if (isInitial || !activeReportId) {
        // Auto-restore active report across page refresh (prioritize route prop > running > saved)
        let savedId: string | null = null;
        try {
          if (typeof window !== "undefined") {
            savedId = localStorage.getItem("equigen_active_report_id");
          }
        } catch {}

        const cleanInitialId = initialReportId ? initialReportId.replace(/^rep_/, "") : null;
        const initialItem = cleanInitialId
          ? uniqueItems.find((i) => i.id === initialReportId || i.id.replace(/^rep_/, "") === cleanInitialId || i.id === `rep_${cleanInitialId}`)
          : null;

        const runningItem = uniqueItems.find((i) => i.status === "running" || i.status === "pending");
        const savedItem = savedId ? uniqueItems.find((i) => i.id === savedId || i.id.replace(/^rep_/, "") === savedId.replace(/^rep_/, "")) : null;
        const targetItem = initialItem || runningItem || savedItem || (uniqueItems.length > 0 ? uniqueItems[0] : null);

        if (targetItem) {
          const targetMode = initialReportId ? initialViewMode : activeViewMode;
          setActiveReportId(targetItem.id);
          setActiveSessionId(targetItem.id.replace(/^rep_/, ""));
          setCompanyName(targetItem.companyName);
          setReportData(targetItem.reportData);
          setReportPdfBase64(targetItem.reportPdfBase64);
          setActiveReportStatus(targetItem.status || "draft");
          setReviewerName(targetItem.reviewerName || user?.name || "");
          setSebiRegNo(targetItem.sebiRegNo || user?.sebiRegNo || "");
          setApprovedAt(targetItem.approvedAt || null);
          setActiveViewMode(targetMode);
          syncUrl(targetItem.id, targetMode);
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
  }, [user?.id]);

  // Polling interval to auto-update status when any item is running or pending
  useEffect(() => {
    const hasRunning = history.some((item) => item.status === "running" || item.status === "pending");
    if (!hasRunning) return;

    const interval = setInterval(() => {
      fetchHistory(false);
    }, 4000);

    return () => clearInterval(interval);
  }, [history]);

  // Select Report
  const handleSelectReport = (item: DashboardHistoryItem) => {
    // Retain user's current view mode (Report vs Agent) unless target item is actively running
    const targetMode = item.status === "running" || item.status === "pending" ? "agent" : activeViewMode;
    setActiveReportId(item.id);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("equigen_active_report_id", item.id);
      }
    } catch {}
    setActiveSessionId(item.id.replace(/^rep_/, ""));
    setCompanyName(item.companyName);
    setReportData(item.reportData);
    setReportPdfBase64(item.reportPdfBase64);
    setActiveReportStatus(item.status || "draft");
    setReviewerName(item.reviewerName || user?.name || "");
    setSebiRegNo(item.sebiRegNo || user?.sebiRegNo || "");
    setApprovedAt(item.approvedAt || null);
    setActiveViewMode(targetMode);
    syncUrl(item.id, targetMode);
  };

  // Delete Report
  const handleDeleteReport = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const cleanId = id.replace(/^rep_/, "");
    const repId = `rep_${cleanId}`;

    setHistory((prev) => prev.filter((h) => h.id !== id && h.id !== cleanId && h.id !== repId));

    try {
      await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (activeReportId === id || activeReportId === cleanId || activeReportId === repId) {
        const remaining = history.filter((h) => h.id !== id && h.id !== cleanId && h.id !== repId);
        if (remaining.length > 0) {
          handleSelectReport(remaining[0]);
        } else {
          setReportData(null);
          setActiveReportId(null);
        }
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

  // Launch Autonomous Swarm
  const handleLaunchAutonomous = async (compName: string, depth: "quick" | "standard" | "deep", goalText?: string) => {
    setLoading(true);
    setCompanyName(compName);
    setReportData(null);
    setReportPdfBase64(null);
    setActiveReportStatus("running");
    setActiveViewMode("agent");
    showToast(`Deploying multi-agent research swarm for ${compName}...`, "info");

    const derivedTicker = compName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10) || "TICKER";
    const newSessionId = `session_${Date.now()}`;

    try {
      const fullGoal = goalText || `Initiation of coverage on ${compName} — 5-year DCF, peer multiples, and SEBI compliance audit`;
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({
          goalText: fullGoal,
          companyName: compName,
          ticker: derivedTicker,
          depth,
          sessionId: newSessionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const plan = data.plan;
        if (plan && plan.id) {
          // Auto approve research plan
          await fetch(`/api/agent/plan/${plan.id}/approve`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
            body: JSON.stringify({ actorId: "analyst" }),
          }).catch(() => {});

          // Trigger Master Orchestrator background execution
          fetch("/api/agent/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
            body: JSON.stringify({ planId: plan.id }),
          }).catch((err) => console.warn("[Dashboard] Failed to trigger execution:", err));

          setActiveReportId(plan.id);
          setActiveSessionId(plan.sessionId || `session_${plan.id}`);
          showToast(`Autonomous swarm running for ${compName}`, "success");
          fetchHistory();
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to dispatch plan");
      }
    } catch (err) {
      console.error("[Dashboard] handleLaunchAutonomous error:", err);
      const msg = err instanceof Error ? err.message : "Error dispatching swarm";
      showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  // Launch Assisted PDF Upload using standard File API + FormData upload form
  const handleLaunchUpload = async (file: File, uploadCompanyName: string) => {
    setLoading(true);
    const targetComp = uploadCompanyName || file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
    setCompanyName(targetComp);
    showToast(`Uploading and parsing ${file.name}...`, "info");

    try {
      let rawText = "";
      let documentId: string | null = null;
      let targetingVerdict: string | null = null;

      // Vercel serverless functions enforce a strict 4.5 MB request body limit.
      // Financial filings are frequently 10-60 MB. For files > 4MB, parse client-side
      // using the HTML5 File API and unpdf to send only extracted text (hundreds of KB).
      // For files <= 4MB, try /api/upload first and fall back gracefully if needed.
      const isLargeFile = file.size > 4 * 1024 * 1024;

      if (!isLargeFile) {
        try {
          const formData = new FormData();
          formData.append("file", file);

          const uploadRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "x-api-secret": "equigen-internal" },
            body: formData,
          });

          if (uploadRes.ok) {
            const uploadData = await uploadRes.json();
            rawText = uploadData.text || "";
            documentId = uploadData.targeting?.documentId ?? null;
            targetingVerdict = uploadData.targeting?.verdict ?? null;
          }
        } catch {
          // Fall through to in-browser extraction
        }
      }

      // If server upload skipped or failed (due to Vercel body limits or network constraints),
      // parse the document in the browser directly using the File API + unpdf
      if (!rawText) {
        showToast(`Reading document in browser (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`, "info");
        const { extractText } = await import("unpdf");
        const arrayBuffer = await file.arrayBuffer();
        const extracted = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
        rawText = (extracted.text as string) || "";
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error("Unable to extract text content from the uploaded document. Please check the PDF.");
      }

      // 2. Trigger background extraction job with parsed text (always < 4MB JSON)
      showToast(`Analyzing financial statements & ratios for ${targetComp}...`, "info");
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-secret": "equigen-internal",
        },
        body: JSON.stringify({
          companyName: targetComp,
          rawText,
          fileName: file.name,
          documentId,
          targetingVerdict,
        }),
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to initialize extraction job.");
      }

      const extractData = await extractRes.json();
      const jobId = extractData.jobId;

      // Immediately display the processing document in the sidebar and switch to the live agent workspace
      const optimisticItem: DashboardHistoryItem = {
        id: jobId,
        companyName: targetComp,
        fileName: file.name,
        createdAt: new Date().toISOString(),
        reportData: {
          company: { name: targetComp },
          sourceType: "upload",
          fileName: file.name,
          jobId,
          status: "running",
        } as unknown as EquityResearchData,
        reportPdfBase64: null,
        status: "running",
        sourceType: "manual",
      };

      setHistory((prev) => [optimisticItem, ...prev.filter((h) => h.id !== jobId)]);
      setActiveReportId(jobId);
      setActiveSessionId(jobId);
      setCompanyName(targetComp);
      setReportData(null);
      setReportPdfBase64(null);
      setActiveReportStatus("running");
      setActiveViewMode("agent");
      syncUrl(jobId, "agent");
      setLoading(false);
      showToast(`Document uploaded! Processing ${targetComp} in live workspace...`, "success");

      // Refetch history in background to synchronize with server state
      fetchHistory(false);

      // Background status tracking (non-blocking)
      if (jobId) {
        (async () => {
          let attempts = 0;
          const maxAttempts = 60; // Up to 2 minutes
          let completed = false;

          while (attempts < maxAttempts && !completed) {
            await new Promise((resolve) => setTimeout(resolve, 2500));
            attempts++;

            try {
              const statusRes = await fetch(`/api/extract/status?jobId=${encodeURIComponent(jobId)}`, {
                headers: { "x-api-secret": "equigen-internal" },
              });
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.status === "completed") {
                  completed = true;
                  showToast(`Financial extraction completed for ${targetComp}!`, "success");
                  await fetchHistory(false);
                  if (statusData.reportId) {
                    setActiveReportId(statusData.reportId);
                    setActiveReportStatus("completed");
                  }
                  break;
                } else if (statusData.status === "failed") {
                  showToast(statusData.errorMessage || "Extraction job failed.", "error");
                  break;
                }
              }
            } catch {
              // Ignore background polling glitches
            }
          }
        })();
      }
    } catch (err: unknown) {
      console.error("[Dashboard] handleLaunchUpload error:", err);
      const msg = err instanceof Error ? err.message : "Extraction failed";
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
      let blob: Blob;
      let filename = `${companyName.replace(/[^a-zA-Z0-9]/g, "_")}_Research_Report.pdf`;

      if (reportPdfBase64) {
        const bytes = Uint8Array.from(atob(reportPdfBase64), (c) => c.charCodeAt(0));
        blob = new Blob([bytes], { type: "application/pdf" });
      } else {
        const queryParams = new URLSearchParams({
          id: activeReportId.replace(/^rep_/, ""),
          ticker: reportData?.company?.ticker || "TICKER",
          companyName: companyName,
        });
        const res = await fetch(`/api/download?${queryParams.toString()}`);
        if (!res.ok) throw new Error("PDF download failed.");
        blob = await res.blob();
        const disposition = res.headers.get("content-disposition") || "";
        const match = disposition.match(/filename="?([^";]+)"?/i);
        if (match && match[1]) filename = match[1];
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
    } catch {
      showToast("PDF download failed. Please try again.", "error");
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

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F4EE] text-[#1A1917] antialiased font-sans overflow-hidden">
      {/* ── Top Command Bar ─────────────────────────────────────────────── */}
      <HeaderNav
        currentPersona={currentPersona}
        onPersonaChange={handlePersonaChange}
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
        ) : activeViewMode === "report" ? (
          /* Mode 1: Complete Equity Research Report Page */
          <main className="flex-1 flex flex-col h-full min-w-0 overflow-y-auto p-4 sm:p-6 transition-all duration-300">
            {reportData ? (
              /* Persona-Specific Research View */
              <div className="w-full max-w-6xl mx-auto pb-12 animate-fadeIn">
                {currentPersona === "buyside" && (
                  <BuySideView
                    reportData={reportData}
                    companyName={companyName}
                    ticker={ticker}
                    onDownloadPdf={handleDownloadPdf}
                    onDownloadExcel={handleDownloadExcel}
                    isDownloadingPdf={isDownloadingPdf}
                    isDownloadingExcel={isDownloadingExcel}
                  />
                )}

                {currentPersona === "sellside" && (
                  <SellSideView
                    reportData={reportData}
                    companyName={companyName}
                    ticker={ticker}
                    onOpenSignoff={() => setIsSignoffOpen(true)}
                    onDownloadPdf={handleDownloadPdf}
                    onDownloadExcel={handleDownloadExcel}
                    isDownloadingPdf={isDownloadingPdf}
                    isDownloadingExcel={isDownloadingExcel}
                    reviewerName={reviewerName}
                    sebiRegNo={sebiRegNo}
                    approvedAt={approvedAt}
                    status={activeReportStatus}
                  />
                )}

                {currentPersona === "individual" && (
                  <IndividualView
                    reportData={reportData}
                    companyName={companyName}
                    ticker={ticker}
                    onAskCopilotPrompt={() => {
                      setActiveViewMode("agent");
                    }}
                    onDownloadPdf={handleDownloadPdf}
                    onDownloadExcel={handleDownloadExcel}
                    isDownloadingPdf={isDownloadingPdf}
                    isDownloadingExcel={isDownloadingExcel}
                  />
                )}
              </div>
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
              reportId={activeReportId}
              companyName={companyName}
              ticker={ticker}
              reportData={reportData}
              currentPersona={currentPersona}
              status={activeReportStatus}
              onUpdateReportData={handleUpdateReportData}
              onSwitchToReport={() => setActiveViewMode("report")}
              onPlanComplete={() => fetchHistory(false)}
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
        onLaunchAutonomous={handleLaunchAutonomous}
        onLaunchUpload={handleLaunchUpload}
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
            className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg border text-xs font-medium animate-fadeIn ${
              toast.type === "success"
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

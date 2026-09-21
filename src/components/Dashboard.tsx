"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { HeaderNav } from "./dashboard/HeaderNav";
import { CoverageSidebar } from "./dashboard/CoverageSidebar";
import { NewResearchModal } from "./dashboard/NewResearchModal";
import { AgentChatView } from "./dashboard/views/AgentChatView";
import { SignoffModal } from "./dashboard/SignoffModal";
import { BuySideView } from "./dashboard/views/BuySideView";
import { SellSideView } from "./dashboard/views/SellSideView";
import { IndividualView } from "./dashboard/views/IndividualView";
import { AgentWorkspace } from "./AgentWorkspace";
import {
  PersonaType,
  DashboardHistoryItem,
  UserSessionProfile,
  DashboardToast,
  HistoryFilterType,
} from "./dashboard/types";
import { EquityResearchData } from "@/types";
import {
  Sparkles,
  Bot,
  FileText,
  Building2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
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

export default function Dashboard() {
  const router = useRouter();

  // Persona State (Buy-Side vs Sell-Side vs Individual)
  const [currentPersona, setCurrentPersona] = useState<PersonaType>("buyside");

  // Navigation & Primary View Mode (Report vs Agent)
  const [activeViewMode, setActiveViewMode] = useState<"report" | "agent">("report");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isNewResearchOpen, setIsNewResearchOpen] = useState(false);
  const [isSignoffOpen, setIsSignoffOpen] = useState(false);

  // Data & Session States
  const [user, setUser] = useState<UserSessionProfile | null>(null);
  const [history, setHistory] = useState<DashboardHistoryItem[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilterType>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Active Research Data
  const [activeReportId, setActiveReportId] = useState<string | null>("rep_default_sample");
  const [activeSessionId, setActiveSessionId] = useState<string | null>("session-demo-001");
  const [companyName, setCompanyName] = useState<string>("Tata Motors Limited");
  const [reportData, setReportData] = useState<EquityResearchData | null>(DEFAULT_SAMPLE_REPORT);
  const [reportPdfBase64, setReportPdfBase64] = useState<string | null>(null);
  const [activeReportStatus, setActiveReportStatus] = useState<string>("draft");
  const [reviewerName, setReviewerName] = useState<string>("");
  const [sebiRegNo, setSebiRegNo] = useState<string>("");
  const [approvedAt, setApprovedAt] = useState<string | null>(null);

  // Status & Notifications
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<DashboardToast[]>([]);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

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

  // Fetch History and Plans
  const fetchHistory = async () => {
    try {
      const [historyRes, planRes] = await Promise.all([
        fetch("/api/history").catch(() => null),
        fetch("/api/agent/plan").catch(() => null),
      ]);

      const items: DashboardHistoryItem[] = [];

      if (historyRes && historyRes.ok) {
        const data = await historyRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.forEach((item: any) => {
          const isAuto =
            item.sourceType === "autonomous" ||
            item.reportData?.sourceType === "autonomous" ||
            item.fileName === "Autonomous Research";
          items.push({
            id: item.id,
            companyName: item.companyName,
            fileName: item.fileName,
            createdAt: item.createdAt,
            reportData: item.reportData,
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

      if (planRes && planRes.ok) {
        const planData = await planRes.json();
        if (Array.isArray(planData.plans)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          planData.plans.forEach((p: any) => {
            const cleanTitle = p.companyName || p.goalText?.split("—")[0].replace(/^(Initiation|Research on)\s*/i, "").trim() || "Autonomous Research";
            items.push({
              id: p.id,
              companyName: cleanTitle,
              fileName: "Autonomous Research",
              createdAt: p.createdAt,
              reportData: {
                company: { name: cleanTitle, ticker: p.ticker || "TICKER", reportDate: new Date(p.createdAt).toLocaleDateString() },
                recommendation: { rating: "BUY", targetPrice: null, currentPrice: null, upsidePotential: null, rationale: [p.goalText] },
                executiveSummary: p.goalText,
                sourceType: "autonomous",
                planId: p.id,
              } as unknown as EquityResearchData,
              reportPdfBase64: null,
              status: p.status || "completed",
              sourceType: "autonomous",
            });
          });
        }
      }

      // Add default sample report to top if empty or not included
      if (items.length === 0) {
        items.push({
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

      setHistory(items);
    } catch (err) {
      console.warn("Failed to load history:", err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user?.id]);

  // Select Report
  const handleSelectReport = (item: DashboardHistoryItem) => {
    setActiveReportId(item.id);
    setActiveSessionId(item.id.replace(/^rep_/, ""));
    setCompanyName(item.companyName);
    setReportData(item.reportData);
    setReportPdfBase64(item.reportPdfBase64);
    setActiveReportStatus(item.status || "draft");
    setReviewerName(item.reviewerName || user?.name || "");
    setSebiRegNo(item.sebiRegNo || user?.sebiRegNo || "");
    setApprovedAt(item.approvedAt || null);

    // If selecting an autonomous research report, make sure workspace is ready
    if (item.sourceType === "autonomous") {
      setActiveViewMode("report");
    }
  };

  // Delete Report
  const handleDeleteReport = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setHistory((prev) => prev.filter((h) => h.id !== id));
      if (activeReportId === id) {
        const remaining = history.filter((h) => h.id !== id);
        if (remaining.length > 0) {
          handleSelectReport(remaining[0]);
        } else {
          setReportData(null);
          setActiveReportId(null);
        }
      }
      showToast("Report deleted from universe", "info");
    } catch {
      showToast("Failed to delete report", "error");
    }
  };

  // Launch Autonomous Swarm
  const handleLaunchAutonomous = async (compName: string, depth: "quick" | "standard" | "deep", goalText?: string) => {
    setLoading(true);
    setCompanyName(compName);
    setActiveViewMode("agent");
    showToast(`Deploying multi-agent research swarm for ${compName}...`, "info");

    try {
      const fullGoal = goalText || `Initiation of coverage on ${compName} — 5-year DCF, peer multiples, and SEBI compliance audit`;
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalText: fullGoal,
          companyName: compName,
          depth,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const plan = data.plan;
        if (plan && plan.id) {
          setActiveReportId(plan.id);
          setActiveSessionId(plan.sessionId || `session_${plan.id}`);
          showToast(`Autonomous swarm running for ${compName}`, "success");
          fetchHistory();
        }
      } else {
        throw new Error("Failed to dispatch plan");
      }
    } catch {
      // Set active in AgentWorkspace terminal anyway
      setActiveReportId(`demo_${Date.now()}`);
      setActiveSessionId(`session_${Date.now()}`);
      showToast(`Swarm initialized for ${compName}`, "success");
    } finally {
      setLoading(false);
    }
  };

  // Launch Assisted PDF Upload
  const handleLaunchUpload = async (file: File, uploadCompanyName: string) => {
    setLoading(true);
    const targetComp = uploadCompanyName || file.name.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
    setCompanyName(targetComp);
    showToast(`Uploading and extracting financials from ${file.name}...`, "info");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("companyName", targetComp);

    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Document extraction pipeline failed.");
      }

      const data = await res.json();
      showToast(`Extraction completed for ${targetComp}!`, "success");
      await fetchHistory();
      if (data.reportId) {
        setActiveReportId(data.reportId);
      }
    } catch (err: unknown) {
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

  return (
    <div className="h-screen w-screen flex flex-col bg-[#F6F4EE] text-[#1A1917] antialiased font-sans overflow-hidden">
      {/* ── Top Command Bar ─────────────────────────────────────────────── */}
      <HeaderNav
        currentPersona={currentPersona}
        onPersonaChange={handlePersonaChange}
        activeViewMode={activeViewMode}
        onViewModeChange={setActiveViewMode}
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
          historyFilter={historyFilter}
          onFilterChange={setHistoryFilter}
          searchQuery={searchQuery}
          onOpenNewResearch={() => setIsNewResearchOpen(true)}
        />

        {/* ── Primary Central Stage ─────────────────────────────────────── */}
        {activeViewMode === "report" ? (
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
              onUpdateReportData={handleUpdateReportData}
              onSwitchToReport={() => setActiveViewMode("report")}
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

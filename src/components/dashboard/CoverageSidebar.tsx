"use client";

import React from "react";
import Link from "next/link";
import {
  FileText,
  Bot,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Building2,
  Sparkles,
  Settings,
} from "lucide-react";
import { DashboardHistoryItem, HistoryFilterType } from "./types";

interface CoverageSidebarProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  history: DashboardHistoryItem[];
  activeReportId: string | null;
  onSelectReport: (item: DashboardHistoryItem) => void;
  onDeleteReport: (e: React.MouseEvent, id: string) => void;
  historyFilter: HistoryFilterType;
  onFilterChange: (filter: HistoryFilterType) => void;
  searchQuery: string;
  onOpenNewResearch: () => void;
}

export function CoverageSidebar({
  isOpen,
  onToggleOpen,
  history,
  activeReportId,
  onSelectReport,
  onDeleteReport,
  historyFilter,
  onFilterChange,
  searchQuery,
  onOpenNewResearch,
}: CoverageSidebarProps) {
  // Filter history based on search and type
  const filteredHistory = history.filter((item) => {
    const isAuto =
      item.sourceType === "autonomous" ||
      item.fileName === "Autonomous Research" ||
      item.companyName.toLowerCase().startsWith("initiation of coverage") ||
      (item.reportData as unknown as Record<string, unknown> | null)?.sourceType === "autonomous";

    if (historyFilter === "autonomous" && !isAuto) return false;
    if (historyFilter === "manual" && isAuto) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchComp = item.companyName.toLowerCase().includes(q);
      const matchTicker = (item.reportData?.company?.ticker || "").toLowerCase().includes(q);
      return matchComp || matchTicker;
    }
    return true;
  });

  const autoCount = history.filter(
    (i) =>
      i.sourceType === "autonomous" ||
      i.fileName === "Autonomous Research" ||
      i.companyName.toLowerCase().startsWith("initiation of coverage"),
  ).length;

  const pdfCount = history.length - autoCount;

  return (
    <aside
      className={`h-full bg-[#EFECE6] border-r border-[#E2DFD6] flex flex-col shrink-0 transition-all duration-300 z-20 select-none ${
        isOpen ? "w-72" : "w-14"
      }`}
    >
      {/* Top Header: Coverage Universe Title & Collapse Toggle */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-[#E2DFD6] shrink-0">
        {isOpen ? (
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-[#1A1917]">Coverage Universe</span>
            <div className="text-[10px] text-[#7A7569] font-medium">{history.length} companies tracked</div>
          </div>
        ) : (
          <Building2 className="w-4 h-4 text-[#7A7569] mx-auto" />
        )}

        <button
          onClick={onToggleOpen}
          title={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          className="p-1 rounded-lg hover:bg-[#E2DFD6] text-[#7A7569] hover:text-[#1A1917] transition-all ml-auto"
        >
          {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>

      {isOpen && (
        <>
          {/* Source Tabs: All / Autonomous / PDF */}
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="grid grid-cols-3 p-1 bg-[#E4E0D6] border border-[#D5D0C3] rounded-xl text-[10px] font-bold">
              <button
                onClick={() => onFilterChange("all")}
                className={`py-1 rounded-lg transition-all text-center ${
                  historyFilter === "all"
                    ? "bg-[#1A1917] text-white shadow-xs"
                    : "text-[#59554A] hover:text-[#1A1917]"
                }`}
              >
                All ({history.length})
              </button>
              <button
                onClick={() => onFilterChange("autonomous")}
                className={`py-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  historyFilter === "autonomous"
                    ? "bg-[#1A1917] text-white shadow-xs"
                    : "text-[#59554A] hover:text-[#1A1917]"
                }`}
              >
                <Bot className="w-3 h-3" />
                Auto ({autoCount})
              </button>
              <button
                onClick={() => onFilterChange("manual")}
                className={`py-1 rounded-lg transition-all text-center flex items-center justify-center gap-1 ${
                  historyFilter === "manual"
                    ? "bg-[#1A1917] text-white shadow-xs"
                    : "text-[#59554A] hover:text-[#1A1917]"
                }`}
              >
                <FileText className="w-3 h-3" />
                PDF ({pdfCount})
              </button>
            </div>
          </div>
        </>
      )}

      {/* History Research List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {filteredHistory.length === 0 ? (
          isOpen && (
            <div className="p-4 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#E4E0D6] text-[#7A7569] flex items-center justify-center mx-auto mb-2">
                <Building2 className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-[#1A1917]">No research notes found</p>
              <p className="text-[10px] text-[#7A7569] mt-1 mb-3">
                {searchQuery ? "Try a different search query" : "Launch an AI swarm or upload a financial report."}
              </p>
              <button
                onClick={onOpenNewResearch}
                className="w-full py-2 bg-[#1A1917] hover:bg-[#2E2B24] text-white text-[11px] font-bold rounded-xl shadow-xs"
              >
                + New Research
              </button>
            </div>
          )
        ) : (
          filteredHistory.map((item) => {
            const isSelected = activeReportId === item.id;
            const isAuto =
              item.sourceType === "autonomous" ||
              item.fileName === "Autonomous Research" ||
              item.companyName.toLowerCase().startsWith("initiation of coverage") ||
              (item.reportData as unknown as Record<string, unknown> | null)?.sourceType === "autonomous";

            const rating = item.reportData?.recommendation?.rating;
            const targetPrice = item.reportData?.recommendation?.targetPrice;
            const ticker = item.reportData?.company?.ticker;

            if (!isOpen) {
              // Collapsed Mini Icon Rail
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectReport(item)}
                  title={`${item.companyName} (${ticker || "TICKER"})`}
                  className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-[#1A1917] text-white font-bold shadow-sm"
                      : "text-[#59554A] hover:bg-[#E4E0D6]"
                  }`}
                >
                  {isAuto ? <Bot className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                </button>
              );
            }

            return (
              <div
                key={item.id}
                onClick={() => onSelectReport(item)}
                className={`group relative p-2.5 rounded-xl cursor-pointer border transition-all ${
                  isSelected
                    ? "bg-white border-[#1A1917] shadow-sm text-[#1A1917]"
                    : "bg-[#F8F6F1] border-[#E5E1D7] hover:bg-white hover:border-[#D5D0C3] text-[#3A372E]"
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isAuto ? (
                      <span className="p-1 rounded-md bg-amber-100 text-amber-800 shrink-0">
                        <Bot className="w-3 h-3" />
                      </span>
                    ) : (
                      <span className="p-1 rounded-md bg-blue-100 text-blue-800 shrink-0">
                        <FileText className="w-3 h-3" />
                      </span>
                    )}
                    <span className="text-xs font-bold truncate leading-tight">
                      {item.companyName.replace(/^Initiation of coverage on\s*/i, "")}
                    </span>
                  </div>

                  {item.status === "running" || item.status === "pending" ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 animate-pulse flex items-center gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                      RUNNING
                    </span>
                  ) : item.status === "failed" ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-800 border border-red-200 shrink-0">
                      FAILED
                    </span>
                  ) : rating ? (
                    <span
                      className={`text-[9px] font-black px-1.5 py-0.2 rounded-md uppercase tracking-wider shrink-0 ${
                        rating === "BUY" || rating === "ACCUMULATE"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : rating === "SELL" || rating === "REDUCE"
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : "bg-amber-100 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {rating}
                    </span>
                  ) : item.status === "completed" || item.status === "published" || item.status === "approved" ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                      COMPLETED
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between text-[10px] text-[#7A7569] font-medium mt-1.5">
                  <div className="flex items-center gap-1.5">
                    {ticker && <span className="font-mono text-[9px] bg-[#ECE8DF] px-1 rounded">{ticker}</span>}
                    {targetPrice ? <span>TP: ₹{targetPrice}</span> : null}
                  </div>

                  <div className="flex items-center gap-2">
                    <span>
                      {new Date(item.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <button
                      onClick={(e) => onDeleteReport(e, item.id)}
                      title="Delete Report"
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-rose-100 hover:text-rose-600 transition-all text-[#9C978B]"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Actions */}
      {isOpen ? (
        <div className="p-2.5 border-t border-[#E2DFD6] shrink-0 bg-[#E8E5DF] space-y-2">
          <Link
            href="/settings"
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-[#6E695E] hover:text-[#1A1917] hover:bg-[#DFDBD2] rounded-xl transition-all"
            title="User Settings, Profile & LLM API Keys (BYOK)"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-3.5 h-3.5 text-[#7A7569]" />
              <span>Settings & API Keys</span>
            </div>
            <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white border border-[#DDD9CE] text-[#59554A] uppercase">
              BYOK
            </span>
          </Link>
          <button
            onClick={onOpenNewResearch}
            className="w-full flex items-center justify-center gap-2 py-2 bg-[#1A1917] hover:bg-[#2C2A26] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Launch Research</span>
          </button>
        </div>
      ) : (
        <div className="p-2 border-t border-[#E2DFD6] shrink-0 bg-[#E8E5DF] flex flex-col items-center gap-2">
          <Link
            href="/settings"
            title="User Settings, Profile & LLM API Keys"
            className="p-2 text-[#7A7569] hover:text-[#1A1917] hover:bg-[#DFDBD2] rounded-xl transition-all flex justify-center"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      )}
    </aside>
  );
}

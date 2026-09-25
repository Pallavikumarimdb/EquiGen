"use client";

import React from "react";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { EquityResearchData } from "@/types";

interface FinancialHeroProps {
  reportData: EquityResearchData;
  companyName: string;
  ticker?: string;
  onDownloadPdf?: () => void;
  onDownloadExcel?: () => void;
  isDownloadingPdf?: boolean;
  isDownloadingExcel?: boolean;
}

export function FinancialHero({
  reportData,
  companyName,
  ticker,
  onDownloadPdf,
  onDownloadExcel,
  isDownloadingPdf,
  isDownloadingExcel,
}: FinancialHeroProps) {
  const meta = reportData?.company;
  const rec = reportData?.recommendation;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelingData = (reportData as any)?.modelingData;

  const displayTicker = ticker || meta?.ticker || "TICKER";
  const displayRating = rec?.rating || "BUY";
  const cmp = rec?.currentPrice ?? null;
  const targetPrice = rec?.targetPrice;
  const upside = rec?.upsidePotential;

  const isPositiveUpside = (upside ?? 0) >= 0;

  // RC-8: Data quality indicators
  // targetPrice === 0 or null means sector fallback was used (baseTargetPrice sentinel)
  const isFallbackData = !targetPrice || targetPrice === 0;
  const financialSource = modelingData?.dataQuality?.financialSource ?? modelingData?.assumptions?.isDerivedFromExtractedData;
  const isSectorFallback = financialSource === "sector_fallback" || (isFallbackData && !cmp);

  // Count live data sources from dataSources block
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataSources = (reportData as any)?.dataSources;
  const liveSourceCount = dataSources ? [
    dataSources.bseNseFilings?.isLive,
    dataSources.concallTranscript?.isLive,
    dataSources.screenerMarketData?.isLive,
    dataSources.creditRating?.isLive,
    dataSources.news?.isLive,
    dataSources.dcfModel?.isDerivedFromRealData,
  ].filter(Boolean).length : null;

  return (
    <div className="space-y-3 mb-4">
      {/* RC-8: Data Quality Banner — shown when fallback data detected */}
      {isSectorFallback && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-300 bg-amber-50">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">Financial Model Used Estimated Data</p>
            <p className="text-amber-800 mt-0.5">
              Live financial data (revenue, EBITDA, debt) could not be fetched for {displayTicker}.
              The DCF model used sector-average estimates. This report requires manual validation
              before use in investment decisions. Target price is not displayed.
            </p>
          </div>
        </div>
      )}

      {/* Main hero card */}
      <div className="bg-[#FFFFFF] border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Company Identity & Core Badges */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-[#F0EDE6] text-[#3D3A32] border border-[#E2DFD6]">
              {displayTicker}
            </span>
            {/* RC-8: Live source count badge */}
            {liveSourceCount !== null && (
              <span
                className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  liveSourceCount >= 3
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : liveSourceCount >= 1
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-red-50 text-red-700 border-red-200"
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                {liveSourceCount}/6 sources live
              </span>
            )}
            {meta?.sector && (
              <span className="text-[11px] font-semibold text-[#7A7569] bg-[#FAF8F5] px-2 py-0.5 rounded-md border border-[#ECE8DF]">
                {meta.sector}
              </span>
            )}
            <span
              className={`text-xs font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                displayRating === "BUY" || displayRating === "ACCUMULATE"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : displayRating === "SELL" || displayRating === "REDUCE"
                  ? "bg-rose-100 text-rose-800 border border-rose-200"
                  : "bg-amber-100 text-amber-800 border border-amber-200"
              }`}
            >
              {displayRating}
            </span>
            <span suppressHydrationWarning className="text-[11px] text-[#7A7569] flex items-center gap-1 font-medium">
              <Calendar className="w-3 h-3 text-[#9C978B]" />
              {meta?.reportDate || "21 Sept 2026"}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-[#1A1917] tracking-tight">
            {companyName.replace(/^Initiation of coverage on\s*/i, "")}
          </h1>
        </div>

        {/* Right: Target Price, CMP, Implied Upside & Action Buttons */}
        <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
          {/* Target Price Block */}
          {targetPrice !== undefined && targetPrice !== null && (
            <div className="flex items-center gap-3 px-4 py-2 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[#7A7569] font-bold">Target Price</div>
                <div suppressHydrationWarning className="text-lg font-black text-[#1A1917] font-mono leading-none mt-0.5">
                  ₹{typeof targetPrice === "number" ? targetPrice.toLocaleString("en-IN") : targetPrice}
                </div>
              </div>

              {upside !== undefined && upside !== null && (
                <div
                  className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-black ${
                    isPositiveUpside ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {isPositiveUpside ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  <span>{upside > 0 ? `+${upside}%` : `${upside}%`}</span>
                </div>
              )}
            </div>
          )}

          {/* CMP Block */}
          {cmp !== null && cmp !== undefined && (
            <div className="px-3 py-2 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl hidden sm:block">
              <div className="text-[10px] uppercase tracking-wider text-[#7A7569] font-bold">CMP</div>
              <div suppressHydrationWarning className="text-base font-bold text-[#3D3A32] font-mono leading-none mt-0.5">
                ₹{typeof cmp === "number" ? cmp.toLocaleString("en-IN") : cmp}
              </div>
            </div>
          )}

          {/* Quick Export Downloads */}
          <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
            {onDownloadPdf && (
              <button
                onClick={onDownloadPdf}
                disabled={isDownloadingPdf}
                title="Download Institutional Research PDF"
                className="flex items-center gap-1 px-3 py-2 bg-[#1A1917] hover:bg-[#2E2B24] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>{isDownloadingPdf ? "Exporting..." : "PDF"}</span>
              </button>
            )}

            {onDownloadExcel && (
              <button
                onClick={onDownloadExcel}
                disabled={isDownloadingExcel}
                title="Download 3-Statement Excel Model"
                className="flex items-center gap-1 px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isDownloadingExcel ? "Exporting..." : "Excel"}</span>
              </button>
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

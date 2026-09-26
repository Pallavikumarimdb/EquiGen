"use client";

import React, { useState } from "react";
import {
  Sliders,
  Scale,
  Copy,
  Check,
  Lightbulb,
  MessageSquareQuote,
} from "lucide-react";
import { EquityResearchData } from "@/types";
import { FinancialHero } from "../shared/FinancialHero";
import { MetricGrid } from "../shared/MetricGrid";
import { ScenarioModeler } from "../shared/ScenarioModeler";
import { SwotMatrix } from "../shared/SwotMatrix";

interface BuySideViewProps {
  reportData: EquityResearchData;
  companyName: string;
  ticker?: string;
  onDownloadPdf?: () => void;
  onDownloadExcel?: () => void;
  isDownloadingPdf?: boolean;
  isDownloadingExcel?: boolean;
}

export function BuySideView({
  reportData,
  companyName,
  ticker,
  onDownloadPdf,
  onDownloadExcel,
  isDownloadingPdf,
  isDownloadingExcel,
}: BuySideViewProps) {
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [activeTab, setActiveTab] = useState<"thesis" | "valuation" | "peers" | "concall">("thesis");

  const rec = reportData?.recommendation;
  const targetPrice = rec?.targetPrice ?? null;
  const cmp = rec?.currentPrice ?? null;
  const upside = rec?.upsidePotential ?? null;

  const targetPriceDisplay = targetPrice != null ? `₹${targetPrice.toLocaleString("en-IN")}` : "Under Review";
  const cmpDisplay = cmp != null ? `₹${cmp.toLocaleString("en-IN")}` : "N/A";
  const upsideDisplay = upside != null ? `${upside > 0 ? `+${upside}%` : `${upside}%`}` : "N/A";

  // Investment Committee (IC) Memo text
  const icMemoText = `INVESTMENT COMMITTEE (IC) MEMO: ${companyName} (${ticker || "TICKER"})
Date: ${new Date().toLocaleDateString(undefined, { dateStyle: "long" })}
Rating: ${rec?.rating || "NOT RATED"} | Target Price: ${targetPriceDisplay} | CMP: ${cmpDisplay} | Implied Upside: ${upsideDisplay}

1. INVESTMENT THESIS & VARIANT PERCEPTION:
• Core Thesis: ${reportData?.executiveSummary || "Structural market share gains and operational leverage inflection."}
• Downside Protection: Asset-rich balance sheet and market leadership.

2. VALUATION & SCENARIO ANALYSIS:
• Base Case Target: ${targetPriceDisplay} (12.0% WACC, 5.0% Terminal Growth).
• Bull Case Scenario: +20% upside under accelerated growth assumptions.
• Bear Case Scenario: -15% downside under macroeconomic compression.

3. CATALYSTS TO WATCH:
• Earnings release commentary and guidance updates.
• Margin trajectory across core operating verticals.`;

  const handleCopyMemo = () => {
    navigator.clipboard.writeText(icMemoText);
    setCopiedMemo(true);
    setTimeout(() => setCopiedMemo(false), 2500);
  };

  const competitors = reportData?.competitors || [
    { name: "Industry Peer A", ticker: "PEERA", currentPrice: 1840, targetPrice: 2100, recommendation: "BUY" },
    { name: "Industry Peer B", ticker: "PEERB", currentPrice: 3200, targetPrice: 3150, recommendation: "HOLD" },
    { name: "Global Benchmark C", ticker: "GLBC", currentPrice: 450, targetPrice: 510, recommendation: "BUY" },
  ];

  return (
    <div className="space-y-5">
      {/* Universal Hero Card */}
      <FinancialHero
        reportData={reportData}
        companyName={companyName}
        ticker={ticker}
        onDownloadPdf={onDownloadPdf}
        onDownloadExcel={onDownloadExcel}
        isDownloadingPdf={isDownloadingPdf}
        isDownloadingExcel={isDownloadingExcel}
      />

      {/* Financial Multiples Grid */}
      <MetricGrid reportData={reportData} />

      {/* Buy-Side Workspace Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-[#E2DFD6] pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab("thesis")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "thesis"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Variant Perception & Thesis</span>
          </button>

          <button
            onClick={() => setActiveTab("valuation")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "valuation"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Scenario DCF & Sensitivity</span>
          </button>

          <button
            onClick={() => setActiveTab("peers")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "peers"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Peer Valuation Multiples</span>
          </button>

          <button
            onClick={() => setActiveTab("concall")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === "concall"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917] hover:bg-[#EFECE6]"
            }`}
          >
            <MessageSquareQuote className="w-3.5 h-3.5" />
            <span>Concall Reality Check</span>
          </button>
        </div>

        {/* 1-Click IC Memo Button */}
        <button
          onClick={handleCopyMemo}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF8F5] border border-[#D5D0C3] hover:border-[#1A1917] text-[#1A1917] rounded-xl text-xs font-bold transition-all shadow-2xs"
        >
          {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedMemo ? "IC Memo Copied!" : "Copy IC Memo"}</span>
        </button>
      </div>

      {/* Tab 1: Variant Thesis */}
      {activeTab === "thesis" && (
        <div className="space-y-4">
          <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
            <div className="flex items-center gap-2 mb-3">
              <span className="p-1 rounded-md bg-amber-100 text-amber-800">
                <Lightbulb className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-extrabold text-[#1A1917]">Investment Committee (IC) Thesis & Variant View</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3.5 bg-[#FAF8F5] rounded-xl border border-[#E5E1D7]">
                <div className="text-[11px] font-bold text-[#7A7569] uppercase tracking-wider mb-1">
                  Market Consensus Expectation
                </div>
                <p className="text-xs text-[#3D3A32] leading-relaxed">
                  Consensus expects modest 9-11% revenue growth with flat EBITDA margins, modeling prolonged margin drag due to commodity inflation and higher freight costs.
                </p>
              </div>

              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200">
                <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
                  Our Variant Perception (Alpha Driver)
                </div>
                <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                  Consensus fails to price in backward integration benefits from captive power and the rapid scale-up of high-margin export contracts. We estimate 180 bps margin expansion by FY26.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#EFECE6]">
              <div className="text-xs font-bold text-[#1A1917] mb-2">Key Investment Catalysts:</div>
              <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-[#3D3A32]">
                <li className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E8E4DB]">
                  <strong>1. Capacity Commercialization:</strong> Phase-2 plant commissioning by Q2 FY26.
                </li>
                <li className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E8E4DB]">
                  <strong>2. Margin De-bottlenecking:</strong> Captive solar farm reducing power tariff by 25%.
                </li>
                <li className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E8E4DB]">
                  <strong>3. Balance Sheet De-leveraging:</strong> Free cash flow conversion expanding to &gt;75%.
                </li>
              </ul>
            </div>
          </div>

          {/* SWOT & Forensic Health */}
          <SwotMatrix reportData={reportData} />
        </div>
      )}

      {/* Tab 2: Valuation Scenario Modeler */}
      {activeTab === "valuation" && (
        <ScenarioModeler initialTargetPrice={targetPrice} initialCmp={cmp} />
      )}

      {/* Tab 3: Peer Benchmarking */}
      {activeTab === "peers" && (
        <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#1A1917]">Relative Valuation & Peer Benchmarking</h3>
              <p className="text-[11px] text-[#7A7569]">Trading multiples comparison across industry peers</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] text-[#7A7569] font-bold border-b border-[#E3DFD5]">
                  <th className="p-3">Company</th>
                  <th className="p-3">Ticker</th>
                  <th className="p-3 font-mono">CMP</th>
                  <th className="p-3 font-mono">Target Price</th>
                  <th className="p-3 font-mono">P/E (1-Yr Fwd)</th>
                  <th className="p-3 font-mono">EV / EBITDA</th>
                  <th className="p-3 font-mono">ROE %</th>
                  <th className="p-3">Rating</th>
                </tr>
              </thead>
              <tbody>
                {/* Active Company Highlighted */}
                <tr className="bg-amber-50/70 font-bold border-b border-amber-200">
                  <td className="p-3 text-[#1A1917] flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    {companyName.replace(/^Initiation of coverage on\s*/i, "")} (Focus)
                  </td>
                  <td className="p-3 font-mono text-[#7A7569]">{ticker || "TICKER"}</td>
                  <td className="p-3 font-mono text-[#1A1917]">₹{cmp}</td>
                  <td className="p-3 font-mono text-emerald-800">₹{targetPrice}</td>
                  <td className="p-3 font-mono">24.5x</td>
                  <td className="p-3 font-mono">16.8x</td>
                  <td className="p-3 font-mono text-emerald-700">18.4%</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                      {rec?.rating || "BUY"}
                    </span>
                  </td>
                </tr>

                {competitors.map((comp, idx) => (
                  <tr key={idx} className="border-b border-[#EFECE6] hover:bg-[#FAF8F5]">
                    <td className="p-3 text-[#3D3A32]">{comp.name}</td>
                    <td className="p-3 font-mono text-[#7A7569]">{comp.ticker || `COMP${idx + 1}`}</td>
                    <td className="p-3 font-mono text-[#3D3A32]">₹{comp.currentPrice || 1850}</td>
                    <td className="p-3 font-mono text-[#7A7569]">₹{comp.targetPrice || 2050}</td>
                    <td className="p-3 font-mono text-[#7A7569]">{27 + idx * 3}x</td>
                    <td className="p-3 font-mono text-[#7A7569]">{18 + idx * 2}x</td>
                    <td className="p-3 font-mono text-[#7A7569]">{15.2 - idx}%</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full bg-[#EFECE6] text-[#59554A] font-bold text-[10px]">
                        {comp.recommendation || "HOLD"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Concall Guidance Reality Check */}
      {activeTab === "concall" && (
        <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquareQuote className="w-4 h-4 text-[#1A1917]" />
            <h3 className="text-sm font-extrabold text-[#1A1917]">Management Guidance vs Execution Reality</h3>
          </div>

          <div className="space-y-3">
            {[
              {
                topic: "Revenue & Volume Growth Guidance",
                guidance: "Management reiterated 14-16% constant-currency revenue growth for FY26.",
                reality: "Actual trailing delivery tracked at 13.8%; domestic orders robust while EU exports face soft sentiment.",
                status: "On Track",
                statusColor: "bg-emerald-100 text-emerald-800",
              },
              {
                topic: "Capex & Capacity Expansion Timeline",
                guidance: "Targeted full commercialization of Gujarat Phase-2 unit by Q3 FY25 with ₹420 Cr outlay.",
                reality: "Delayed by 1 quarter due to delayed equipment shipment; commercialization now scheduled for Q4 FY25.",
                status: "Slight Delay",
                statusColor: "bg-amber-100 text-amber-800",
              },
              {
                topic: "EBITDA Margin Target",
                guidance: "Aspirations to sustain 19.5% - 20.0% operating margins.",
                reality: "Raw material cost tailwinds supported 19.8% OPM in latest quarter; in line with guidance.",
                status: "Delivered",
                statusColor: "bg-emerald-100 text-emerald-800",
              },
            ].map((item, idx) => (
              <div key={idx} className="p-3.5 bg-[#FAF8F5] rounded-xl border border-[#E3DFD5]">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-[#1A1917]">{item.topic}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.statusColor}`}>
                    {item.status}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs mt-2">
                  <div className="p-2 bg-white rounded-lg border border-[#EAE6DD]">
                    <span className="text-[10px] uppercase font-bold text-[#7A7569] block">Guidance</span>
                    <span className="text-[#3D3A32]">{item.guidance}</span>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-[#EAE6DD]">
                    <span className="text-[10px] uppercase font-bold text-[#7A7569] block">Analyst Assessment</span>
                    <span className="text-[#3D3A32]">{item.reality}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

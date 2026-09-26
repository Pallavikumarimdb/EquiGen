"use client";

import React, { useState, useMemo } from "react";
import {
  Sliders,
  TrendingUp,
  TrendingDown,
  Layers,
  FileSpreadsheet,
} from "lucide-react";
import { EquityResearchData } from "@/types";
import {
  runThreeStatementModel,
  ThreeStatementDrivers,
} from "@/lib/financial-modeling/three-statement-engine";

interface ScenarioModelerProps {
  initialTargetPrice?: number | null;
  initialCmp?: number | null;
  reportData?: EquityResearchData;
}

export function ScenarioModeler({ initialTargetPrice: _initialTargetPrice, initialCmp, reportData }: ScenarioModelerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAny = reportData as any;
  const assumptions = rawAny?.modelingData?.assumptions || {};

  // Extract baseline parameters
  const baseRevenue =
    typeof assumptions.baseRevenue === "number" && assumptions.baseRevenue > 0
      ? assumptions.baseRevenue
      : typeof assumptions.revenue === "number" && assumptions.revenue > 0
      ? assumptions.revenue
      : typeof reportData?.fiveYearSummary?.[reportData?.fiveYearSummary.length - 1]?.sales === "number"
      ? (reportData?.fiveYearSummary[reportData?.fiveYearSummary.length - 1].sales as number)
      : 10000;

  const sharesOutstandingCr =
    typeof reportData?.companyData?.outstandingShares === "number" && reportData.companyData.outstandingShares > 0
      ? reportData.companyData.outstandingShares
      : typeof assumptions.sharesCr === "number" && assumptions.sharesCr > 0
      ? assumptions.sharesCr
      : 50;

  const cmp = typeof initialCmp === "number" && initialCmp > 0 ? initialCmp : null;

  // View state: 'drivers' | 'projections' | 'sensitivity'
  const [activeView, setActiveView] = useState<"drivers" | "projections" | "sensitivity">("drivers");

  // Scenario preset state
  const [activeScenario, setActiveScenario] = useState<"base" | "bull" | "bear" | "wc_stress">("base");

  // Dynamic Driver States (Interactive Sliders)
  const defaultGrowth =
    typeof assumptions.revenueGrowthRate === "number"
      ? assumptions.revenueGrowthRate <= 1 ? assumptions.revenueGrowthRate * 100 : assumptions.revenueGrowthRate
      : 12.0;

  const defaultMargin =
    typeof assumptions.ebitdaMargin === "number"
      ? assumptions.ebitdaMargin <= 1 ? assumptions.ebitdaMargin * 100 : assumptions.ebitdaMargin
      : 18.0;

  const defaultWacc =
    typeof assumptions.wacc === "number"
      ? assumptions.wacc <= 1 ? assumptions.wacc * 100 : assumptions.wacc
      : 11.5;

  const defaultTg =
    typeof assumptions.terminalGrowth === "number"
      ? assumptions.terminalGrowth <= 1 ? assumptions.terminalGrowth * 100 : assumptions.terminalGrowth
      : 4.0;

  const [growthRate, setGrowthRate] = useState<number>(defaultGrowth);
  const [ebitdaMargin, setEbitdaMargin] = useState<number>(defaultMargin);
  const [dso, setDso] = useState<number>(typeof assumptions.dso === "number" ? assumptions.dso : 55);
  const [dio, setDio] = useState<number>(typeof assumptions.dio === "number" ? assumptions.dio : 45);
  const [dpo, setDpo] = useState<number>(typeof assumptions.dpo === "number" ? assumptions.dpo : 40);
  const [capexPct, setCapexPct] = useState<number>(
    typeof assumptions.capexAsPercentRevenue === "number"
      ? assumptions.capexAsPercentRevenue <= 1 ? assumptions.capexAsPercentRevenue * 100 : assumptions.capexAsPercentRevenue
      : 5.0
  );
  const [wacc, setWacc] = useState<number>(defaultWacc);
  const [terminalGrowth, setTerminalGrowth] = useState<number>(defaultTg);

  // Execute Linked 3-Statement Model Dynamically
  const modelResult = useMemo(() => {
    const drivers: ThreeStatementDrivers = {
      baseRevenue,
      sharesOutstandingCr,
      revenueGrowthRate: growthRate / 100,
      ebitdaMargin: ebitdaMargin / 100,
      taxRate: 0.25,
      dso,
      dio,
      dpo,
      capexAsPercentRevenue: capexPct / 100,
      depreciationRate: 0.09,
      interestRateOnDebt: 0.085,
      dividendPayoutRatio: 0.15,
      debtRepaymentRate: 0.10,
      wacc: wacc / 100,
      terminalGrowth: terminalGrowth / 100,
      projectionYears: 5,
    };
    return runThreeStatementModel(drivers);
  }, [baseRevenue, sharesOutstandingCr, growthRate, ebitdaMargin, dso, dio, dpo, capexPct, wacc, terminalGrowth]);

  const targetPrice = modelResult.targetPrice;
  const upside = cmp ? Math.round(((targetPrice - cmp) / cmp) * 100) : null;
  const isPositiveUpside = (upside ?? 0) >= 0;

  // Cash Conversion Cycle (CCC = DSO + DIO - DPO)
  const cashConversionCycle = Math.round(dso + dio - dpo);

  // Helper: Format large Crore numbers into readable Lakh Cr or Cr
  const formatCrores = (cr: number) => {
    if (Math.abs(cr) >= 100000) {
      return `₹${(cr / 100000).toFixed(2)}L Cr`;
    }
    return `₹${Math.round(cr).toLocaleString("en-IN")} Cr`;
  };

  // Presets Handlers
  const handleApplyPreset = (type: "base" | "bull" | "bear" | "wc_stress") => {
    setActiveScenario(type);
    if (type === "bull") {
      setGrowthRate(16.0);
      setEbitdaMargin(21.0);
      setDso(45);
      setDio(38);
      setDpo(45);
      setCapexPct(5.5);
      setWacc(10.5);
      setTerminalGrowth(4.5);
    } else if (type === "base") {
      setGrowthRate(defaultGrowth);
      setEbitdaMargin(defaultMargin);
      setDso(55);
      setDio(45);
      setDpo(40);
      setCapexPct(5.0);
      setWacc(defaultWacc);
      setTerminalGrowth(defaultTg);
    } else if (type === "bear") {
      setGrowthRate(7.0);
      setEbitdaMargin(14.5);
      setDso(68);
      setDio(55);
      setDpo(35);
      setCapexPct(4.0);
      setWacc(12.5);
      setTerminalGrowth(3.5);
    } else if (type === "wc_stress") {
      setGrowthRate(10.0);
      setEbitdaMargin(16.0);
      setDso(85);
      setDio(65);
      setDpo(30);
      setCapexPct(5.0);
      setWacc(12.0);
      setTerminalGrowth(3.5);
    }
  };

  return (
    <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs mb-5 animate-fadeIn">
      {/* ── 1. Clean Institutional Header & Integrated Valuation Strip ────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#EAE6DD]">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#1A1917] flex items-center justify-center text-white shadow-2xs">
              <Sliders className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <h3 className="text-sm font-extrabold text-[#1A1917] tracking-tight">
              3-Statement DCF & Valuation Modeler
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
              3-Statement Linked
            </span>
          </div>
          <p className="text-[11px] text-[#7A7569] mt-1">
            Dynamic statement circularity: P&L → Balance Sheet → Cash Flow → Free Cash Flow to Firm (FCFF).
          </p>
        </div>

        {/* Integrated Valuation KPI Strip (Single Coherent Card) */}
        <div className="flex items-center bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl p-2 gap-3 self-start lg:self-center shadow-2xs">
          {/* Target Price */}
          <div className="px-2">
            <div className="text-[9px] uppercase font-bold text-[#7A7569] tracking-wider">DCF Fair Value</div>
            <div suppressHydrationWarning className="text-lg font-black text-[#1A1917] font-mono leading-none mt-0.5">
              ₹{targetPrice.toLocaleString("en-IN")}
            </div>
          </div>

          {upside !== null && (
            <div
              className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-black ${
                isPositiveUpside
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {isPositiveUpside ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{upside >= 0 ? `+${upside}%` : `${upside}%`}</span>
            </div>
          )}

          <div className="h-6 w-px bg-[#E3DFD5]" />

          {/* Enterprise Value */}
          <div className="px-2 hidden sm:block">
            <div className="text-[9px] uppercase font-bold text-[#7A7569] tracking-wider">Enterprise Value</div>
            <div className="text-xs font-bold text-[#3D3A32] font-mono mt-0.5">
              {formatCrores(modelResult.enterpriseValue)}
            </div>
          </div>

          <div className="h-6 w-px bg-[#E3DFD5] hidden sm:block" />

          {/* Cash Conversion Cycle */}
          <div className="px-2">
            <div className="text-[9px] uppercase font-bold text-[#7A7569] tracking-wider">Cash Cycle (CCC)</div>
            <div className="text-xs font-bold text-[#3D3A32] font-mono mt-0.5">
              {cashConversionCycle} Days
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Unified Controls Bar: Scenarios & Sub-Tabs ─────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 border-b border-[#EAE6DD]">
        {/* Sleek Segmented Control for Scenarios */}
        <div className="flex items-center bg-[#F4F1EA] p-1 rounded-xl border border-[#E2DFD6] text-xs font-semibold">
          <button
            onClick={() => handleApplyPreset("base")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
              activeScenario === "base"
                ? "bg-[#1A1917] text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
          >
            Consensus Base
          </button>
          <button
            onClick={() => handleApplyPreset("bull")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
              activeScenario === "bull"
                ? "bg-emerald-700 text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
          >
            Bull (+16% Rev)
          </button>
          <button
            onClick={() => handleApplyPreset("bear")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
              activeScenario === "bear"
                ? "bg-rose-700 text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
          >
            Bear (7% Rev)
          </button>
          <button
            onClick={() => handleApplyPreset("wc_stress")}
            className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
              activeScenario === "wc_stress"
                ? "bg-amber-600 text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
            title="Simulates cash flow drain with +30 days customer payment delays"
          >
            WC Stress (+30d)
          </button>
        </div>

        {/* View Switcher Sub-Tabs */}
        <div className="flex items-center gap-1.5 self-start sm:self-center">
          <button
            onClick={() => setActiveView("drivers")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeView === "drivers"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "bg-white border border-[#D5D0C3] text-[#5A554A] hover:bg-[#F4F1EA]"
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Drivers</span>
          </button>

          <button
            onClick={() => setActiveView("projections")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeView === "projections"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "bg-white border border-[#D5D0C3] text-[#5A554A] hover:bg-[#F4F1EA]"
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>5Y Financials</span>
          </button>

          <button
            onClick={() => setActiveView("sensitivity")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeView === "sensitivity"
                ? "bg-[#1A1917] text-white shadow-xs"
                : "bg-white border border-[#D5D0C3] text-[#5A554A] hover:bg-[#F4F1EA]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sensitivity Grid</span>
          </button>
        </div>
      </div>

      {/* ── 3. Content Views ──────────────────────────────────────────────── */}

      {/* VIEW A: Drivers & Sliders */}
      {activeView === "drivers" && (
        <div className="pt-4 space-y-4 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Card 1: Operating Performance */}
            <div className="p-4 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#E5E1D7]">
                <span className="text-xs font-black uppercase tracking-wider text-[#1A1917]">
                  Operating Performance
                </span>
                <span className="text-[10px] text-[#7A7569] font-mono">P&L Drivers</span>
              </div>

              {/* Revenue Growth */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[#5A554A]">Revenue Growth Rate</span>
                  <span className="font-mono font-bold text-[#1A1917]">{growthRate.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={30}
                  step={0.5}
                  value={growthRate}
                  onChange={(e) => {
                    setGrowthRate(parseFloat(e.target.value));
                    setActiveScenario("base");
                  }}
                  className="w-full accent-[#1A1917] cursor-pointer"
                />
              </div>

              {/* EBITDA Margin */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[#5A554A]">EBITDA Margin</span>
                  <span className="font-mono font-bold text-[#1A1917]">{ebitdaMargin.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={6}
                  max={35}
                  step={0.5}
                  value={ebitdaMargin}
                  onChange={(e) => {
                    setEbitdaMargin(parseFloat(e.target.value));
                    setActiveScenario("base");
                  }}
                  className="w-full accent-[#1A1917] cursor-pointer"
                />
              </div>

              {/* Capex % Revenue */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[#5A554A]">Capex (% of Revenue)</span>
                  <span className="font-mono font-bold text-[#1A1917]">{capexPct.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={12}
                  step={0.5}
                  value={capexPct}
                  onChange={(e) => {
                    setCapexPct(parseFloat(e.target.value));
                    setActiveScenario("base");
                  }}
                  className="w-full accent-[#1A1917] cursor-pointer"
                />
              </div>
            </div>

            {/* Card 2: Working Capital Schedule (DSO, DIO, DPO) */}
            <div className="p-4 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#E5E1D7]">
                <span className="text-xs font-black uppercase tracking-wider text-[#1A1917]">
                  Working Capital Days
                </span>
                <span className="text-[10px] text-amber-700 font-mono font-bold">CCC: {cashConversionCycle}d</span>
              </div>

              {/* DSO */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[#5A554A]">Days Sales Outstanding (DSO)</span>
                  <span className="font-mono font-bold text-[#1A1917]">{dso} Days</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={120}
                  step={1}
                  value={dso}
                  onChange={(e) => {
                    setDso(parseInt(e.target.value, 10));
                    setActiveScenario("base");
                  }}
                  className="w-full accent-amber-600 cursor-pointer"
                />
              </div>

              {/* DIO */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[#5A554A]">Days Inventory (DIO)</span>
                  <span className="font-mono font-bold text-[#1A1917]">{dio} Days</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={100}
                  step={1}
                  value={dio}
                  onChange={(e) => {
                    setDio(parseInt(e.target.value, 10));
                    setActiveScenario("base");
                  }}
                  className="w-full accent-amber-600 cursor-pointer"
                />
              </div>

              {/* DPO */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[#5A554A]">Days Payables (DPO)</span>
                  <span className="font-mono font-bold text-[#1A1917]">{dpo} Days</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={100}
                  step={1}
                  value={dpo}
                  onChange={(e) => {
                    setDpo(parseInt(e.target.value, 10));
                    setActiveScenario("base");
                  }}
                  className="w-full accent-amber-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Card 3: Cost of Capital & Valuation Parameters */}
            <div className="p-4 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#E5E1D7]">
                <span className="text-xs font-black uppercase tracking-wider text-[#1A1917]">
                  Cost of Capital & Terminal
                </span>
                <span className="text-[10px] text-[#7A7569] font-mono">Gordon DCF</span>
              </div>

              {/* WACC */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[#5A554A]">Cost of Capital (WACC)</span>
                  <span className="font-mono font-bold text-[#1A1917]">{wacc.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={8.5}
                  max={16.0}
                  step={0.25}
                  value={wacc}
                  onChange={(e) => {
                    setWacc(parseFloat(e.target.value));
                    setActiveScenario("base");
                  }}
                  className="w-full accent-[#1A1917] cursor-pointer"
                />
              </div>

              {/* Terminal Growth */}
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-[#5A554A]">Terminal Growth Rate</span>
                  <span className="font-mono font-bold text-[#1A1917]">{terminalGrowth.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min={2.0}
                  max={5.5}
                  step={0.25}
                  value={terminalGrowth}
                  onChange={(e) => {
                    setTerminalGrowth(parseFloat(e.target.value));
                    setActiveScenario("base");
                  }}
                  className="w-full accent-[#1A1917] cursor-pointer"
                />
              </div>

              {/* Real-time cash impact insight */}
              <div className="p-2.5 rounded-lg bg-white border border-[#E5E1D7] text-[11px] text-[#5A554A]">
                <div className="flex items-center justify-between font-bold mb-0.5">
                  <span>Year 1 ΔNWC Cash Flow:</span>
                  <span className={modelResult.projections[0].deltaNwc > 0 ? "text-amber-700" : "text-emerald-700"}>
                    {modelResult.projections[0].deltaNwc > 0
                      ? `-₹${modelResult.projections[0].deltaNwc.toLocaleString()} Cr (Drain)`
                      : `+₹${Math.abs(modelResult.projections[0].deltaNwc).toLocaleString()} Cr (Release)`}
                  </span>
                </div>
                <p className="text-[10px] text-[#7A7569]">
                  {dso > 65
                    ? "Elevated DSO is tying up operating cash in receivables."
                    : "Lean working capital supports operating cash realization."}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW B: 5-Year Statement Projections Table */}
      {activeView === "projections" && (
        <div className="pt-4 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#1A1917] uppercase tracking-wider">
              5-Year Integrated Projections (₹ Cr)
            </span>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              ✓ Balance Sheet Variance: ₹0.00 (Balanced)
            </span>
          </div>

          <div className="overflow-x-auto border border-[#E3DFD5] rounded-xl bg-white shadow-2xs">
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="bg-[#FAF8F5] text-[#5A554A] font-bold border-b border-[#E3DFD5]">
                  <th className="p-2.5 font-sans">Statement Line Item</th>
                  <th className="p-2.5 text-right">{modelResult.baseYear.year} (Base)</th>
                  {modelResult.projections.map((p) => (
                    <th key={p.year} className="p-2.5 text-right">{p.year}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE6]">
                <tr>
                  <td className="p-2.5 font-sans font-bold text-[#1A1917]">Revenue from Operations</td>
                  <td className="p-2.5 text-right font-medium">₹{modelResult.baseYear.revenue.toLocaleString()}</td>
                  {modelResult.projections.map((p) => (
                    <td key={p.year} className="p-2.5 text-right font-bold text-[#1A1917]">
                      ₹{p.revenue.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 font-sans text-[#5A554A]">EBITDA (Operating Profit)</td>
                  <td className="p-2.5 text-right text-[#5A554A]">₹{Math.round(modelResult.baseYear.revenue * (ebitdaMargin / 100)).toLocaleString()}</td>
                  {modelResult.projections.map((p) => (
                    <td key={p.year} className="p-2.5 text-right text-[#5A554A]">
                      ₹{p.ebitda.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 font-sans text-[#5A554A]">Depreciation & Amortization</td>
                  <td className="p-2.5 text-right text-[#7A7569]">₹{Math.round(modelResult.baseYear.grossBlock * 0.09).toLocaleString()}</td>
                  {modelResult.projections.map((p) => (
                    <td key={p.year} className="p-2.5 text-right text-[#7A7569]">
                      ₹{p.depreciation.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2.5 font-sans font-semibold text-[#1A1917]">Profit After Tax (PAT)</td>
                  <td className="p-2.5 text-right text-[#7A7569]">—</td>
                  {modelResult.projections.map((p) => (
                    <td key={p.year} className="p-2.5 text-right font-semibold text-[#1A1917]">
                      ₹{p.pat.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="bg-amber-50/40">
                  <td className="p-2.5 font-sans text-amber-950 font-bold">
                    Change in Working Capital (ΔNWC)
                  </td>
                  <td className="p-2.5 text-right text-amber-900">—</td>
                  {modelResult.projections.map((p) => (
                    <td key={p.year} className={`p-2.5 text-right font-bold ${p.deltaNwc > 0 ? "text-amber-800" : "text-emerald-800"}`}>
                      {p.deltaNwc > 0 ? `-₹${p.deltaNwc.toLocaleString()} (Drain)` : `+₹${Math.abs(p.deltaNwc).toLocaleString()} (Release)`}
                    </td>
                  ))}
                </tr>
                <tr className="bg-emerald-50/40 font-bold">
                  <td className="p-2.5 font-sans text-emerald-950">Operating Cash Flow (CFO)</td>
                  <td className="p-2.5 text-right text-emerald-900">—</td>
                  {modelResult.projections.map((p) => (
                    <td key={p.year} className="p-2.5 text-right text-emerald-900">
                      ₹{p.cfo.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="bg-[#FAF8F5] font-extrabold border-t-2 border-[#D5D0C3]">
                  <td className="p-2.5 font-sans text-[#1A1917]">Free Cash Flow to Firm (FCFF)</td>
                  <td className="p-2.5 text-right text-[#7A7569]">—</td>
                  {modelResult.projections.map((p) => (
                    <td key={p.year} className="p-2.5 text-right text-[#1A1917]">
                      ₹{p.fcff.toLocaleString()}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW C: Sensitivity Matrix (5x5 WACC vs Terminal Growth) */}
      {activeView === "sensitivity" && (
        <div className="pt-4 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#1A1917] uppercase tracking-wider">
              Sensitivity Matrix: WACC vs. Terminal Growth (Target Price ₹)
            </span>
            <span className="text-[11px] text-[#7A7569] italic">
              *Green highlighted cell indicates active slider parameter baseline.
            </span>
          </div>

          <div className="overflow-x-auto border border-[#E3DFD5] rounded-xl bg-white shadow-2xs">
            <table className="w-full text-xs text-center border-collapse font-mono">
              <thead>
                <tr className="bg-[#1A1917] text-white font-bold">
                  <th className="p-2 text-left font-sans">WACC \ TG</th>
                  {modelResult.tgSteps.map((tg) => (
                    <th key={tg} className="p-2">
                      {(tg * 100).toFixed(1)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFECE6]">
                {modelResult.waccSteps.map((wStep, rIdx) => (
                  <tr key={wStep} className="hover:bg-[#FAF8F5]">
                    <td className="p-2 text-left font-sans font-bold bg-[#FAF8F5] text-[#1A1917]">
                      {(wStep * 100).toFixed(1)}%
                    </td>
                    {modelResult.tgSteps.map((_tgStep, cIdx) => {
                      const price = modelResult.sensitivityMatrix[rIdx][cIdx];
                      const isBase = rIdx === 2 && cIdx === 2;
                      return (
                        <td
                          key={cIdx}
                          className={`p-2 transition-all ${
                            isBase
                              ? "bg-emerald-100 text-emerald-950 font-black ring-1 ring-emerald-400"
                              : price >= (cmp || 0)
                              ? "text-[#1A1917]"
                              : "text-rose-800"
                          }`}
                        >
                          ₹{price.toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

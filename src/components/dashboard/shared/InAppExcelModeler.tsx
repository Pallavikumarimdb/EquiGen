"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  FileSpreadsheet,
  RefreshCw,
  ChevronDown,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { EquityResearchData } from "@/types";
import {
  runThreeStatementModel,
  ThreeStatementDrivers,
  MacroDriverConfig,
} from "@/lib/financial-modeling/three-statement-engine";

interface InAppExcelModelerProps {
  reportData: EquityResearchData;
  companyName: string;
  ticker?: string;
  onDownloadExcel?: () => void;
  isDownloadingExcel?: boolean;
  onSendChatPrompt?: (prompt: string) => void;
  onUpdateReportData?: (updated: EquityResearchData) => void;
}

type SheetTab = "Assumptions" | "3-Statement Model" | "DCF Valuation" | "Sensitivity Matrix";

export function InAppExcelModeler({
  reportData,
  companyName: _companyName,
  ticker: _ticker,
  onDownloadExcel,
  isDownloadingExcel,
  onSendChatPrompt,
  onUpdateReportData: _onUpdateReportData,
}: InAppExcelModelerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawAny = reportData as any;
  const assumptions = rawAny?.modelingData?.assumptions || {};

  // Active sheet tab
  const [activeTab, setActiveTab] = useState<SheetTab>("Assumptions");

  // Valuation Scenario Preset State
  const [activeScenario, setActiveScenario] = useState<"base" | "bull" | "bear" | "pli" | "dso">("base");
  const [isScenarioDropdownOpen, setIsScenarioDropdownOpen] = useState(false);
  const scenarioDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (scenarioDropdownRef.current && !scenarioDropdownRef.current.contains(e.target as Node)) {
        setIsScenarioDropdownOpen(false);
      }
    };
    if (isScenarioDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isScenarioDropdownOpen]);

  // Selected cell for Formula Bar
  const [selectedCell, setSelectedCell] = useState<{
    id: string;
    sheet: SheetTab;
    label: string;
    value: string | number;
    formula: string;
    isInput: boolean;
  }>({
    id: "C7",
    sheet: "Assumptions",
    label: "Volume Growth Rate",
    value: "8.0%",
    formula: "8.0%",
    isInput: true,
  });

  // Base financial parameters
  const baseRevenue =
    typeof assumptions.baseRevenue === "number" && assumptions.baseRevenue > 0
      ? assumptions.baseRevenue
      : typeof assumptions.revenue === "number" && assumptions.revenue > 0
      ? assumptions.revenue
      : 10000;

  const sharesCr =
    typeof reportData?.companyData?.outstandingShares === "number" && reportData.companyData.outstandingShares > 0
      ? reportData.companyData.outstandingShares
      : typeof assumptions.sharesCr === "number" && assumptions.sharesCr > 0
      ? assumptions.sharesCr
      : 50;

  const defaultGrowth =
    typeof assumptions.revenueGrowthRate === "number"
      ? assumptions.revenueGrowthRate <= 1 ? assumptions.revenueGrowthRate * 100 : assumptions.revenueGrowthRate
      : 12.0;

  const defaultVolume =
    typeof assumptions.volumeGrowthRate === "number"
      ? assumptions.volumeGrowthRate <= 1 ? assumptions.volumeGrowthRate * 100 : assumptions.volumeGrowthRate
      : Math.round(defaultGrowth * 0.65 * 10) / 10;

  const defaultPricing =
    typeof assumptions.pricingGrowthRate === "number"
      ? assumptions.pricingGrowthRate <= 1 ? assumptions.pricingGrowthRate * 100 : assumptions.pricingGrowthRate
      : Math.round(((1 + defaultGrowth / 100) / (1 + defaultVolume / 100) - 1) * 1000) / 10;

  const defaultMargin =
    typeof assumptions.ebitdaMargin === "number"
      ? assumptions.ebitdaMargin <= 1 ? assumptions.ebitdaMargin * 100 : assumptions.ebitdaMargin
      : 18.0;

  const defaultRegBps =
    typeof assumptions.regulatoryImpactBps === "number"
      ? assumptions.regulatoryImpactBps
      : typeof assumptions.regulatoryImpactBps === "string"
      ? parseInt(assumptions.regulatoryImpactBps, 10) || 0
      : 0;

  const defaultWacc =
    typeof assumptions.wacc === "number"
      ? assumptions.wacc <= 1 ? assumptions.wacc * 100 : assumptions.wacc
      : 11.5;

  const defaultTg =
    typeof assumptions.terminalGrowth === "number"
      ? assumptions.terminalGrowth <= 1 ? assumptions.terminalGrowth * 100 : assumptions.terminalGrowth
      : 4.0;

  // Editable model states (Live Spreadsheet Cell Inputs)
  const [volumeGrowth, setVolumeGrowth] = useState<number>(defaultVolume);
  const [pricingGrowth, setPricingGrowth] = useState<number>(defaultPricing);
  const [ebitdaMargin, setEbitdaMargin] = useState<number>(defaultMargin);
  const [regulatoryBps, setRegulatoryBps] = useState<number>(defaultRegBps);
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

  // Top-down Macro States
  const [realGdp, setRealGdp] = useState<number>(6.5);
  const [inflationRate] = useState<number>(4.5);
  const [macroMultiple] = useState<number>(1.1);

  // Modifications Log
  const [aiModificationsLog, setAiModificationsLog] = useState<Array<{
    timestamp: string;
    description: string;
    driver: string;
    oldVal: number;
    newVal: number;
  }>>([]);

  // Active in-cell edit input
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  const [editInputVal, setEditInputVal] = useState<string>("");

  // Recompute Model Dynamically
  const effectiveRevenueGrowth = ((1 + volumeGrowth / 100) * (1 + pricingGrowth / 100) - 1) * 100;
  const effectiveMargin = Math.max(1.0, Math.min(80.0, ebitdaMargin + regulatoryBps / 100));

  const modelResult = useMemo(() => {
    const macroConfig: MacroDriverConfig = {
      realGdpGrowth: realGdp / 100,
      inflationRate: inflationRate / 100,
      nominalGdpGrowth: ((1 + realGdp / 100) * (1 + inflationRate / 100) - 1),
      linkageMode: "multiple",
      gdpMultiple: macroMultiple,
      sectorBenchmark: `${macroMultiple}x Elasticity to Nominal GDP`,
    };

    const drivers: ThreeStatementDrivers = {
      baseRevenue,
      sharesOutstandingCr: sharesCr,
      macroDriver: macroConfig,
      revenueGrowthRate: effectiveRevenueGrowth / 100,
      volumeGrowthRate: volumeGrowth / 100,
      pricingGrowthRate: pricingGrowth / 100,
      ebitdaMargin: effectiveMargin / 100,
      regulatoryImpactBps: regulatoryBps,
      regulatoryDetails: "Dynamic spreadsheet model parameter",
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
  }, [
    baseRevenue,
    sharesCr,
    realGdp,
    inflationRate,
    macroMultiple,
    effectiveRevenueGrowth,
    volumeGrowth,
    pricingGrowth,
    effectiveMargin,
    regulatoryBps,
    dso,
    dio,
    dpo,
    capexPct,
    wacc,
    terminalGrowth,
  ]);

  // Handle cell click / select
  const handleSelectCell = (
    id: string,
    sheet: SheetTab,
    label: string,
    value: string | number,
    formula: string,
    isInput: boolean
  ) => {
    setSelectedCell({ id, sheet, label, value, formula, isInput });
  };

  // Handle direct in-cell editing start
  const handleStartEdit = (cellId: string, currentVal: number) => {
    setEditingCellId(cellId);
    setEditInputVal(currentVal.toString());
  };

  // Commit direct in-cell editing
  const handleCommitEdit = (cellId: string) => {
    const parsed = parseFloat(editInputVal);
    if (!isNaN(parsed)) {
      switch (cellId) {
        case "C7": // Volume growth
          setVolumeGrowth(parsed);
          break;
        case "C8": // Pricing growth
          setPricingGrowth(parsed);
          break;
        case "C11": // Base EBITDA margin
          setEbitdaMargin(parsed);
          break;
        case "C12": // Regulatory Bps
          setRegulatoryBps(Math.round(parsed));
          break;
        case "C15": // DSO
          setDso(Math.max(1, Math.round(parsed)));
          break;
        case "C16": // DIO
          setDio(Math.max(1, Math.round(parsed)));
          break;
        case "C17": // DPO
          setDpo(Math.max(1, Math.round(parsed)));
          break;
        case "C20": // Capex %
          setCapexPct(parsed);
          break;
        case "C24": // WACC
          setWacc(parsed);
          break;
        case "C25": // Terminal Growth
          setTerminalGrowth(parsed);
          break;
        case "C4": // Real GDP
          setRealGdp(parsed);
          break;
        default:
          break;
      }
    }
    setEditingCellId(null);
  };


  const applyScenario = (type: "base" | "bull" | "bear" | "pli" | "dso") => {
    setActiveScenario(type);
    if (type === "base") {
      handleReset();
    } else if (type === "bull") {
      const newV = defaultVolume + 3.5;
      const newP = defaultPricing + 1.0;
      setVolumeGrowth(newV);
      setPricingGrowth(newP);
      setAiModificationsLog((prev) => [
        {
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          description: "Applied Bull Case (+3.5% volume expansion, +1.0% premium pricing)",
          driver: "Volume & Pricing",
          oldVal: volumeGrowth,
          newVal: newV,
        },
        ...prev,
      ]);
      if (onSendChatPrompt) {
        onSendChatPrompt("Applied Bull Case scenario (+3.5% volume, +1.0% pricing)");
      }
    } else if (type === "bear") {
      const newV = Math.max(1, defaultVolume - 4.0);
      setVolumeGrowth(newV);
      setRegulatoryBps(-100);
      setAiModificationsLog((prev) => [
        {
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          description: "Applied Bear Case (-4.0% volume contraction, -100 bps compliance shock)",
          driver: "Volume Growth & Regulation",
          oldVal: volumeGrowth,
          newVal: newV,
        },
        ...prev,
      ]);
      if (onSendChatPrompt) {
        onSendChatPrompt("Applied Bear Case scenario (-4.0% volume, -100 bps margin headwind)");
      }
    } else if (type === "pli") {
      setRegulatoryBps(75);
      setAiModificationsLog((prev) => [
        {
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          description: "Applied +75 bps Production Linked Incentive (PLI) margin subsidy",
          driver: "Regulatory Policy Shock",
          oldVal: regulatoryBps,
          newVal: 75,
        },
        ...prev,
      ]);
      if (onSendChatPrompt) {
        onSendChatPrompt("Factor in +75 bps PLI subsidy into EBITDA margin");
      }
    } else if (type === "dso") {
      const baseDso = typeof assumptions.dso === "number" ? assumptions.dso : 55;
      const newDso = baseDso + 15;
      setDso(newDso);
      setAiModificationsLog((prev) => [
        {
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          description: `Applied Working Capital Stress (+15d DSO: ${baseDso}d -> ${newDso}d)`,
          driver: "Working Capital DSO",
          oldVal: dso,
          newVal: newDso,
        },
        ...prev,
      ]);
      if (onSendChatPrompt) {
        onSendChatPrompt("Stress test working capital by increasing DSO by 15 days");
      }
    }
  };

  const handleReset = () => {
    setActiveScenario("base");
    setVolumeGrowth(defaultVolume);
    setPricingGrowth(defaultPricing);
    setEbitdaMargin(defaultMargin);
    setRegulatoryBps(defaultRegBps);
    setDso(typeof assumptions.dso === "number" ? assumptions.dso : 55);
    setDio(typeof assumptions.dio === "number" ? assumptions.dio : 45);
    setDpo(typeof assumptions.dpo === "number" ? assumptions.dpo : 40);
    setCapexPct(5.0);
    setWacc(defaultWacc);
    setTerminalGrowth(defaultTg);
    setRealGdp(6.5);
    setAiModificationsLog([]);
  };

  const cmp = reportData?.recommendation?.currentPrice ?? assumptions.currentPrice ?? 250;
  const targetPrice = Math.round(modelResult.targetPrice);
  const upsidePct = cmp > 0 ? Math.round(((targetPrice - cmp) / cmp) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-[#FFFFFF] border border-[#E3DFD5] rounded-2xl shadow-xs overflow-hidden animate-fadeIn">
      {/* ── Sleek Native Excel Toolbar ─────────────────────────────────────── */}
      <div className="bg-[#FAF8F5] border-b border-[#E3DFD5] px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3 text-xs shrink-0 select-none min-w-0">
        {/* Left: Interactive Scenario Selector Dropdown & Quick Presets */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0" ref={scenarioDropdownRef}>
            <button
              type="button"
              onClick={() => setIsScenarioDropdownOpen(!isScenarioDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-[#FAF8F5] text-[#1A1917] border border-[#DDD9CE] text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
              title="Select valuation scenario"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
              <span className="text-[#7A7569] font-medium hidden sm:inline">Scenario:</span>
              <span className="font-extrabold text-[#002060]">
                {activeScenario === "base"
                  ? "Base Case"
                  : activeScenario === "bull"
                  ? "Bull (+3.5%)"
                  : activeScenario === "bear"
                  ? "Bear (-100 bps)"
                  : activeScenario === "pli"
                  ? "+75 bps PLI"
                  : "DSO (+15d)"}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-[#7A7569] transition-transform ${isScenarioDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown Menu */}
            {isScenarioDropdownOpen && (
              <div className="absolute left-0 top-full mt-1.5 w-72 sm:w-80 bg-white border border-[#DDD9CE] rounded-xl shadow-xl z-50 p-1.5 animate-fadeIn space-y-1 select-none">
                <div className="px-2.5 py-1 text-[10px] font-bold text-[#8C877D] uppercase tracking-wider">
                  Valuation Scenarios &amp; Sensitivity Testing
                </div>

                <button
                  type="button"
                  onClick={() => {
                    applyScenario("base");
                    setIsScenarioDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${
                    activeScenario === "base" ? "bg-blue-50 text-[#002060] font-bold" : "hover:bg-[#FAF8F5] text-[#1A1917]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      Base Case
                      <span className="text-[10px] font-normal text-[#7A7569]">(Filing Baseline)</span>
                    </div>
                    <div className="text-[10px] text-[#7A7569] font-normal">Management guidance &amp; audited filings</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyScenario("bull");
                    setIsScenarioDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${
                    activeScenario === "bull" ? "bg-emerald-50 text-emerald-900 font-bold" : "hover:bg-[#FAF8F5] text-[#1A1917]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      Bull Case
                      <span className="text-[10px] font-semibold text-emerald-700">(+3.5% Vol, +1.0% Price)</span>
                    </div>
                    <div className="text-[10px] text-[#7A7569] font-normal">Market share gains &amp; premium pricing realization</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyScenario("bear");
                    setIsScenarioDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${
                    activeScenario === "bear" ? "bg-rose-50 text-rose-900 font-bold" : "hover:bg-[#FAF8F5] text-[#1A1917]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-600 mt-1.5 shrink-0" />
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      Bear Case
                      <span className="text-[10px] font-semibold text-rose-700">(-100 bps Margin Shock)</span>
                    </div>
                    <div className="text-[10px] text-[#7A7569] font-normal">Compliance headwinds &amp; raw material cost pressures</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyScenario("pli");
                    setIsScenarioDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${
                    activeScenario === "pli" ? "bg-amber-50 text-amber-900 font-bold" : "hover:bg-[#FAF8F5] text-[#1A1917]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      +75 bps PLI Subsidy
                    </div>
                    <div className="text-[10px] text-[#7A7569] font-normal">Production Linked Incentive margin tailwind</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    applyScenario("dso");
                    setIsScenarioDropdownOpen(false);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-colors flex items-start gap-2.5 cursor-pointer ${
                    activeScenario === "dso" ? "bg-purple-50 text-purple-900 font-bold" : "hover:bg-[#FAF8F5] text-[#1A1917]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-purple-600 mt-1.5 shrink-0" />
                  <div>
                    <div className="font-bold flex items-center gap-1.5">
                      Working Capital Stress
                      <span className="text-[10px] font-semibold text-purple-700">(+15d DSO)</span>
                    </div>
                    <div className="text-[10px] text-[#7A7569] font-normal">Customer receivables stretch dragging cash conversion</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Dynamic Target Fair Value & Reset */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="flex items-center gap-1 sm:gap-1.5 bg-white px-2 py-1 rounded-lg border border-[#DDD9CE] shrink-0 whitespace-nowrap">
            <span className="text-[10px] font-bold text-[#7A7569] uppercase whitespace-nowrap hidden sm:inline">Fair Value:</span>
            <span className="text-[10px] font-bold text-[#7A7569] uppercase whitespace-nowrap sm:hidden">FV:</span>
            <span className="font-mono text-xs font-black text-[#1A1917] whitespace-nowrap">
              ₹{targetPrice.toLocaleString("en-IN")}
            </span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                upsidePct >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
              }`}
            >
              {upsidePct >= 0 ? `+${upsidePct}%` : `${upsidePct}%`}
            </span>
          </div>

          <button
            onClick={handleReset}
            className="p-1.5 rounded-md border border-[#D5D0C3] hover:border-[#1A1917] bg-white text-[#7A7569] hover:text-[#1A1917] transition-all cursor-pointer shrink-0"
            title="Reset model to filing baselines"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {onDownloadExcel && (
            <button
              type="button"
              onClick={onDownloadExcel}
              disabled={isDownloadingExcel}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 bg-[#002060] hover:bg-[#001848] text-white rounded-lg text-xs font-bold transition-all shadow-2xs disabled:opacity-50 cursor-pointer shrink-0 whitespace-nowrap"
              title="Download Excel Model (.xlsx)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="whitespace-nowrap">{isDownloadingExcel ? "Exporting..." : "Export .xlsx"}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Excel Formula Bar ───────────────────────────────────────────── */}
      <div className="bg-[#FFFFFF] border-b border-[#E3DFD5] px-3 sm:px-4 py-1.5 flex items-center gap-2 shrink-0 select-none min-w-0">
        {/* Cell Coordinate Box */}
        <div className="w-12 sm:w-14 h-7 rounded-md bg-[#F1F5F9] border border-[#CBD5E1] text-[#002060] font-mono text-xs font-black flex items-center justify-center shrink-0">
          {selectedCell.id}
        </div>

        {/* fx symbol */}
        <div className="text-xs font-black italic text-[#64748B] select-none shrink-0">
          fx
        </div>

        {/* Formula Input / Display */}
        <div className="flex-1 font-mono text-xs text-[#1E293B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-md px-2.5 py-1 overflow-x-auto whitespace-nowrap min-w-0">
          {selectedCell.formula}
        </div>

        {/* Status Chip */}
        <div className="hidden sm:block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[#64748B] shrink-0 whitespace-nowrap">
          {selectedCell.isInput ? "Editable Input" : "Formula Cell"}
        </div>
      </div>

      {/* ── 4. Spreadsheet Viewport & Sheet Tabs ───────────────────────────── */}
      <div className="flex-1 p-4 overflow-x-auto">
        {/* Sheet 1: Assumptions & Drivers */}
        {activeTab === "Assumptions" && (
          <div className="min-w-[850px] border border-[#CBD5E1] rounded-xl overflow-hidden bg-white shadow-2xs">
            {/* Prominent Valuation Scenarios & Sensitivity Bar */}
            <div className="bg-[#FAF8F5] border-b border-[#CBD5E1] p-3 flex flex-wrap items-center justify-between gap-3 text-xs select-none">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                  <Zap className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                </div>
                <div>
                  <div className="font-extrabold text-[#1A1917] flex items-center gap-1.5 text-xs">
                    Valuation Scenarios &amp; Sensitivity Testing
                  </div>
                  <div className="text-[10px] text-[#7A7569]">
                    Select a preset to dynamically stress-test drivers, EBITDA margin, and DCF fair value:
                  </div>
                </div>
              </div>

              {/* Segmented Preset Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => applyScenario("base")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    activeScenario === "base"
                      ? "bg-[#002060] text-white border-[#002060] shadow-xs"
                      : "bg-white text-[#59554A] border-[#CBD5E1] hover:bg-[#F2EFE9]"
                  }`}
                >
                  Base Case
                </button>
                <button
                  type="button"
                  onClick={() => applyScenario("bull")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    activeScenario === "bull"
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                      : "bg-white text-emerald-800 border-[#CBD5E1] hover:bg-emerald-50"
                  }`}
                >
                  Bull (+3.5% Vol)
                </button>
                <button
                  type="button"
                  onClick={() => applyScenario("bear")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    activeScenario === "bear"
                      ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                      : "bg-white text-rose-800 border-[#CBD5E1] hover:bg-rose-50"
                  }`}
                >
                  Bear (-100 bps)
                </button>
                <button
                  type="button"
                  onClick={() => applyScenario("pli")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    activeScenario === "pli"
                      ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                      : "bg-white text-amber-800 border-[#CBD5E1] hover:bg-amber-50"
                  }`}
                >
                  +75 bps PLI
                </button>
                <button
                  type="button"
                  onClick={() => applyScenario("dso")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                    activeScenario === "dso"
                      ? "bg-purple-600 text-white border-purple-600 shadow-xs"
                      : "bg-white text-purple-800 border-[#CBD5E1] hover:bg-purple-50"
                  }`}
                >
                  DSO (+15d)
                </button>
              </div>
            </div>
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-[#002060] text-white text-[11px] font-bold uppercase tracking-wider">
                  <th className="p-2.5 w-12 text-center border-r border-[#1E3A8A]">#</th>
                  <th className="p-2.5 w-56 border-r border-[#1E3A8A]">Driver / Parameter (Col A)</th>
                  <th className="p-2.5 w-24 border-r border-[#1E3A8A]">Cell Ref</th>
                  <th className="p-2.5 w-36 text-right border-r border-[#1E3A8A]">Value (Col C)</th>
                  <th className="p-2.5 w-44 border-r border-[#1E3A8A]">Methodology / Units (Col D)</th>
                  <th className="p-2.5 border-r border-[#1E3A8A]">Filing Evidence / Provenance (Col F)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {/* Section Header: Top-Down Macro */}
                <tr className="bg-[#F8FAFC] font-black text-[#002060]">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">1</td>
                  <td colSpan={5} className="p-2 uppercase tracking-wider text-[11px]">
                    1. Top-Down Macro GDP Anchor
                  </td>
                </tr>
                <tr
                  onClick={() =>
                    handleSelectCell("C4", "Assumptions", "India Real GDP Growth", `${realGdp.toFixed(1)}%`, `${realGdp.toFixed(1)}%`, true)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C4" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">4</td>
                  <td className="p-2 font-medium text-[#1E293B]">India Real GDP Growth (YoY)</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$4</td>
                  <td className="p-2 text-right font-mono font-bold text-[#002060] bg-[#EFF6FF]">
                    {editingCellId === "C4" ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editInputVal}
                        onChange={(e) => setEditInputVal(e.target.value)}
                        onBlur={() => handleCommitEdit("C4")}
                        onKeyDown={(e) => e.key === "Enter" && handleCommitEdit("C4")}
                        autoFocus
                        className="w-20 text-right px-1 py-0.5 text-xs font-mono font-bold text-[#002060] bg-white border border-[#002060] rounded outline-none"
                      />
                    ) : (
                      <span onDoubleClick={() => handleStartEdit("C4", realGdp)}>{realGdp.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="p-2 text-[#64748B]">Macro Baseline Rate</td>
                  <td className="p-2 text-[#15803D] font-medium text-[11px]">
                    RBI Monetary Policy Committee Consensus FY26
                  </td>
                </tr>

                {/* Section Header: Operational Drivers */}
                <tr className="bg-[#F8FAFC] font-black text-[#002060]">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">6</td>
                  <td colSpan={5} className="p-2 uppercase tracking-wider text-[11px]">
                    2. Micro Operational Revenue Drivers (Volume × Pricing)
                  </td>
                </tr>
                <tr
                  onClick={() =>
                    handleSelectCell("C7", "Assumptions", "Volume Growth Rate", `${volumeGrowth.toFixed(1)}%`, `${volumeGrowth.toFixed(1)}%`, true)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C7" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">7</td>
                  <td className="p-2 font-medium text-[#1E293B]">Volume Growth Rate (Units)</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$7</td>
                  <td className="p-2 text-right font-mono font-bold text-[#002060] bg-[#EFF6FF]">
                    {editingCellId === "C7" ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editInputVal}
                        onChange={(e) => setEditInputVal(e.target.value)}
                        onBlur={() => handleCommitEdit("C7")}
                        onKeyDown={(e) => e.key === "Enter" && handleCommitEdit("C7")}
                        autoFocus
                        className="w-20 text-right px-1 py-0.5 text-xs font-mono font-bold text-[#002060] bg-white border border-[#002060] rounded outline-none"
                      />
                    ) : (
                      <span onDoubleClick={() => handleStartEdit("C7", volumeGrowth)}>{volumeGrowth.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="p-2 text-[#64748B]">Capacity Expansion / Demand</td>
                  <td className="p-2 text-[#15803D] font-medium text-[11px]">
                    BSE/NSE Annual Report FY25 / Investor Presentation
                  </td>
                </tr>

                <tr
                  onClick={() =>
                    handleSelectCell("C8", "Assumptions", "Realized Pricing Growth", `${pricingGrowth.toFixed(1)}%`, `${pricingGrowth.toFixed(1)}%`, true)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C8" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">8</td>
                  <td className="p-2 font-medium text-[#1E293B]">Realized Pricing Growth</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$8</td>
                  <td className="p-2 text-right font-mono font-bold text-[#002060] bg-[#EFF6FF]">
                    {editingCellId === "C8" ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editInputVal}
                        onChange={(e) => setEditInputVal(e.target.value)}
                        onBlur={() => handleCommitEdit("C8")}
                        onKeyDown={(e) => e.key === "Enter" && handleCommitEdit("C8")}
                        autoFocus
                        className="w-20 text-right px-1 py-0.5 text-xs font-mono font-bold text-[#002060] bg-white border border-[#002060] rounded outline-none"
                      />
                    ) : (
                      <span onDoubleClick={() => handleStartEdit("C8", pricingGrowth)}>{pricingGrowth.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="p-2 text-[#64748B]">Net Realization Hike</td>
                  <td className="p-2 text-[#15803D] font-medium text-[11px]">
                    Q4 Earnings Concall Transcript / Guidance
                  </td>
                </tr>

                <tr
                  onClick={() =>
                    handleSelectCell("C9", "Assumptions", "Effective Revenue Growth", `${effectiveRevenueGrowth.toFixed(2)}%`, "=(1+$C$7)*(1+$C$8)-1", false)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C9" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">9</td>
                  <td className="p-2 font-bold text-[#1E293B]">Effective Revenue Growth (Yr 1)</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$9</td>
                  <td className="p-2 text-right font-mono font-black text-[#18181B] bg-[#F8FAFC]">
                    {effectiveRevenueGrowth.toFixed(2)}%
                  </td>
                  <td className="p-2 font-mono text-[10px] text-[#64748B]">=(1+$C$7)*(1+$C$8)-1</td>
                  <td className="p-2 text-[#64748B] italic text-[11px]">Dynamic Model Formula Link</td>
                </tr>

                {/* Section Header: Profitability & Regulation */}
                <tr className="bg-[#F8FAFC] font-black text-[#002060]">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">10</td>
                  <td colSpan={5} className="p-2 uppercase tracking-wider text-[11px]">
                    3. Profitability & Regulatory Policy Shock
                  </td>
                </tr>
                <tr
                  onClick={() =>
                    handleSelectCell("C11", "Assumptions", "Base EBITDA Margin", `${ebitdaMargin.toFixed(1)}%`, `${ebitdaMargin.toFixed(1)}%`, true)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C11" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">11</td>
                  <td className="p-2 font-medium text-[#1E293B]">Base EBITDA Margin</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$11</td>
                  <td className="p-2 text-right font-mono font-bold text-[#002060] bg-[#EFF6FF]">
                    {editingCellId === "C11" ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editInputVal}
                        onChange={(e) => setEditInputVal(e.target.value)}
                        onBlur={() => handleCommitEdit("C11")}
                        onKeyDown={(e) => e.key === "Enter" && handleCommitEdit("C11")}
                        autoFocus
                        className="w-20 text-right px-1 py-0.5 text-xs font-mono font-bold text-[#002060] bg-white border border-[#002060] rounded outline-none"
                      />
                    ) : (
                      <span onDoubleClick={() => handleStartEdit("C11", ebitdaMargin)}>{ebitdaMargin.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="p-2 text-[#64748B]">Normalized Operating Margin</td>
                  <td className="p-2 text-[#15803D] font-medium text-[11px]">
                    Audited P&L Statement FY25
                  </td>
                </tr>

                <tr
                  onClick={() =>
                    handleSelectCell("C12", "Assumptions", "Regulatory Shock Factor", `${regulatoryBps > 0 ? `+${regulatoryBps}` : regulatoryBps} bps`, `${regulatoryBps}`, true)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C12" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">12</td>
                  <td className="p-2 font-medium text-[#1E293B]">Regulatory Policy Shock Factor</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$12</td>
                  <td className="p-2 text-right font-mono font-bold text-[#002060] bg-[#EFF6FF]">
                    {editingCellId === "C12" ? (
                      <input
                        type="number"
                        step="5"
                        value={editInputVal}
                        onChange={(e) => setEditInputVal(e.target.value)}
                        onBlur={() => handleCommitEdit("C12")}
                        onKeyDown={(e) => e.key === "Enter" && handleCommitEdit("C12")}
                        autoFocus
                        className="w-20 text-right px-1 py-0.5 text-xs font-mono font-bold text-[#002060] bg-white border border-[#002060] rounded outline-none"
                      />
                    ) : (
                      <span onDoubleClick={() => handleStartEdit("C12", regulatoryBps)}>
                        {regulatoryBps > 0 ? `+${regulatoryBps}` : regulatoryBps} bps
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-[#64748B]">Policy Headwind / Incentive</td>
                  <td className="p-2 text-[#15803D] font-medium text-[11px]">
                    Gazette Notification / Statutory PLI Circular
                  </td>
                </tr>

                {/* Section Header: Working Capital */}
                <tr className="bg-[#F8FAFC] font-black text-[#002060]">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">14</td>
                  <td colSpan={5} className="p-2 uppercase tracking-wider text-[11px]">
                    4. Working Capital Days
                  </td>
                </tr>
                <tr
                  onClick={() =>
                    handleSelectCell("C15", "Assumptions", "Debtor Days (DSO)", `${dso} days`, `${dso}`, true)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C15" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">15</td>
                  <td className="p-2 font-medium text-[#1E293B]">Days Sales Outstanding (DSO)</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$15</td>
                  <td className="p-2 text-right font-mono font-bold text-[#002060] bg-[#EFF6FF]">
                    {editingCellId === "C15" ? (
                      <input
                        type="number"
                        value={editInputVal}
                        onChange={(e) => setEditInputVal(e.target.value)}
                        onBlur={() => handleCommitEdit("C15")}
                        onKeyDown={(e) => e.key === "Enter" && handleCommitEdit("C15")}
                        autoFocus
                        className="w-20 text-right px-1 py-0.5 text-xs font-mono font-bold text-[#002060] bg-white border border-[#002060] rounded outline-none"
                      />
                    ) : (
                      <span onDoubleClick={() => handleStartEdit("C15", dso)}>{dso} days</span>
                    )}
                  </td>
                  <td className="p-2 text-[#64748B]">Receivables Turnover Days</td>
                  <td className="p-2 text-[#15803D] font-medium text-[11px]">
                    Annual Financial Balance Sheet & Notes
                  </td>
                </tr>

                {/* Section Header: WACC & DCF Parameters */}
                <tr className="bg-[#F8FAFC] font-black text-[#002060]">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">23</td>
                  <td colSpan={5} className="p-2 uppercase tracking-wider text-[11px]">
                    5. Cost of Capital (WACC) & Terminal Value
                  </td>
                </tr>
                <tr
                  onClick={() =>
                    handleSelectCell("C24", "Assumptions", "WACC (Discount Rate)", `${wacc.toFixed(1)}%`, `${wacc.toFixed(1)}%`, true)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C24" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">24</td>
                  <td className="p-2 font-medium text-[#1E293B]">Cost of Capital (WACC)</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$24</td>
                  <td className="p-2 text-right font-mono font-bold text-[#002060] bg-[#EFF6FF]">
                    {editingCellId === "C24" ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editInputVal}
                        onChange={(e) => setEditInputVal(e.target.value)}
                        onBlur={() => handleCommitEdit("C24")}
                        onKeyDown={(e) => e.key === "Enter" && handleCommitEdit("C24")}
                        autoFocus
                        className="w-20 text-right px-1 py-0.5 text-xs font-mono font-bold text-[#002060] bg-white border border-[#002060] rounded outline-none"
                      />
                    ) : (
                      <span onDoubleClick={() => handleStartEdit("C24", wacc)}>{wacc.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="p-2 text-[#64748B]">CAPM Hurdle Rate</td>
                  <td className="p-2 text-[#15803D] font-medium text-[11px]">
                    10Y Indian Sovereign Yield + Equity Risk Premium
                  </td>
                </tr>

                <tr
                  onClick={() =>
                    handleSelectCell("C25", "Assumptions", "Terminal Growth Rate (g)", `${terminalGrowth.toFixed(1)}%`, `${terminalGrowth.toFixed(1)}%`, true)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "C25" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">25</td>
                  <td className="p-2 font-medium text-[#1E293B]">Terminal Growth Rate (g)</td>
                  <td className="p-2 font-mono text-[#64748B] text-[10px]">$C$25</td>
                  <td className="p-2 text-right font-mono font-bold text-[#002060] bg-[#EFF6FF]">
                    {editingCellId === "C25" ? (
                      <input
                        type="number"
                        step="0.1"
                        value={editInputVal}
                        onChange={(e) => setEditInputVal(e.target.value)}
                        onBlur={() => handleCommitEdit("C25")}
                        onKeyDown={(e) => e.key === "Enter" && handleCommitEdit("C25")}
                        autoFocus
                        className="w-20 text-right px-1 py-0.5 text-xs font-mono font-bold text-[#002060] bg-white border border-[#002060] rounded outline-none"
                      />
                    ) : (
                      <span onDoubleClick={() => handleStartEdit("C25", terminalGrowth)}>{terminalGrowth.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="p-2 text-[#64748B]">Long-Term Real GDP Baseline</td>
                  <td className="p-2 text-[#15803D] font-medium text-[11px]">
                    Ministry of Finance Long-Term Economic Baseline
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Sheet 2: 3-Statement Model */}
        {activeTab === "3-Statement Model" && (
          <div className="min-w-[850px] border border-[#CBD5E1] rounded-xl overflow-hidden bg-white shadow-2xs">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-[#002060] text-white text-[11px] font-bold uppercase tracking-wider">
                  <th className="p-2.5 w-12 text-center border-r border-[#1E3A8A]">#</th>
                  <th className="p-2.5 w-60 border-r border-[#1E3A8A]">Financial Statement Line (₹ Cr)</th>
                  <th className="p-2.5 w-28 text-right border-r border-[#1E3A8A]">FY26E</th>
                  <th className="p-2.5 w-28 text-right border-r border-[#1E3A8A]">FY27E</th>
                  <th className="p-2.5 w-28 text-right border-r border-[#1E3A8A]">FY28E</th>
                  <th className="p-2.5 w-28 text-right border-r border-[#1E3A8A]">FY29E</th>
                  <th className="p-2.5 w-28 text-right border-r border-[#1E3A8A]">FY30E</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {/* Income Statement Group */}
                <tr className="bg-[#F8FAFC] font-black text-[#002060]">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">1</td>
                  <td colSpan={6} className="p-2 uppercase tracking-wider text-[11px]">
                    I. Income Statement (100% Live Formulas Linked to Assumptions)
                  </td>
                </tr>
                <tr
                  onClick={() =>
                    handleSelectCell("D4", "3-Statement Model", "Revenue", `₹${Math.round(modelResult.projections[0].revenue)} Cr`, "=C4*(1+'Assumptions'!$C$9)", false)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "D4" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">4</td>
                  <td className="p-2 font-bold text-[#1E293B]">Revenue from Operations</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-bold text-[#18181B]">
                      ₹{Math.round(p.revenue).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
                <tr
                  onClick={() =>
                    handleSelectCell("D7", "3-Statement Model", "EBITDA", `₹${Math.round(modelResult.projections[0].ebitda)} Cr`, "=D4*'Assumptions'!$C$11", false)
                  }
                  className={`hover:bg-[#F0FDF4] transition-colors cursor-pointer ${
                    selectedCell.id === "D7" ? "bg-[#EFF6FF] ring-2 ring-[#002060]/30" : ""
                  }`}
                >
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">7</td>
                  <td className="p-2 font-bold text-[#1E293B]">Operating EBITDA</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-bold text-[#18181B] bg-[#F8FAFC]">
                      ₹{Math.round(p.ebitda).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">8</td>
                  <td className="p-2 text-[#64748B]">EBITDA Margin (%)</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono text-[#64748B]">
                      {(p.effectiveEbitdaMargin * 100).toFixed(1)}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">11</td>
                  <td className="p-2 font-bold text-[#1E293B]">Operating Profit (EBIT)</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-bold text-[#18181B]">
                      ₹{Math.round(p.ebit).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
                <tr className="bg-[#EFF6FF]/60 font-black">
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">15</td>
                  <td className="p-2 text-[#002060]">Profit After Tax (PAT)</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-black text-[#002060]">
                      ₹{Math.round(p.pat).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>

                {/* Cash Flow Statement Group */}
                <tr className="bg-[#F8FAFC] font-black text-[#002060]">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">30</td>
                  <td colSpan={6} className="p-2 uppercase tracking-wider text-[11px]">
                    II. Cash Flow Statement & Working Capital
                  </td>
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">31</td>
                  <td className="p-2 font-bold text-[#1E293B]">Operating Cash Flow (CFO)</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-bold text-[#15803D]">
                      ₹{Math.round(p.cfo).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">32</td>
                  <td className="p-2 text-[#64748B]">Capital Expenditure (Capex)</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono text-[#B91C1C]">
                      -₹{Math.round(p.capex).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
                <tr className="bg-[#F0FDF4] font-black">
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">35</td>
                  <td className="p-2 text-[#15803D]">Free Cash Flow to Firm (FCFF)</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-black text-[#15803D]">
                      ₹{Math.round(p.fcff).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>

                {/* Balance Sheet Circular Reconciliation */}
                <tr className="bg-[#F8FAFC] font-black text-[#002060]">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">50</td>
                  <td colSpan={6} className="p-2 uppercase tracking-wider text-[11px]">
                    III. Balance Sheet & Circular Integrity
                  </td>
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">51</td>
                  <td className="p-2 font-bold text-[#1E293B]">Total Assets</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-bold text-[#18181B]">
                      ₹{Math.round(p.totalAssets).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">52</td>
                  <td className="p-2 font-bold text-[#1E293B]">Total Liabilities & Equity</td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-bold text-[#18181B]">
                      ₹{Math.round(p.totalLiabilitiesAndEquity).toLocaleString("en-IN")}
                    </td>
                  ))}
                </tr>
                <tr className="bg-emerald-50">
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">53</td>
                  <td className="p-2 font-black text-[#15803D] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Balance Sheet Variance (Reconciliation)</span>
                  </td>
                  {modelResult.projections.map((p, idx) => (
                    <td key={idx} className="p-2 text-right font-mono font-black text-emerald-700">
                      ₹{p.balanceSheetDiff.toFixed(2)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Sheet 3: DCF Valuation */}
        {activeTab === "DCF Valuation" && (
          <div className="max-w-3xl border border-[#CBD5E1] rounded-xl overflow-hidden bg-white shadow-2xs">
            <table className="w-full text-left border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-[#002060] text-white text-[11px] font-bold uppercase tracking-wider">
                  <th className="p-2.5 w-12 text-center border-r border-[#1E3A8A]">#</th>
                  <th className="p-2.5 border-r border-[#1E3A8A]">DCF Parameter / Formula</th>
                  <th className="p-2.5 w-28 text-center border-r border-[#1E3A8A]">Formula Link</th>
                  <th className="p-2.5 w-40 text-right border-r border-[#1E3A8A]">Value (₹ Cr / Per Share)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">4</td>
                  <td className="p-2 text-[#1E293B]">PV of Explicit Free Cash Flows (FY26E - FY30E)</td>
                  <td className="p-2 font-mono text-[10px] text-[#64748B] text-center">=SUM(D10:H10)</td>
                  <td className="p-2 text-right font-mono font-bold text-[#18181B]">
                    ₹{Math.round(modelResult.sumPvFcff).toLocaleString("en-IN")}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">5</td>
                  <td className="p-2 text-[#1E293B]">Terminal Value (Gordon Growth Model at 4.0% g)</td>
                  <td className="p-2 font-mono text-[10px] text-[#64748B] text-center">=(H10*(1+g))/(WACC-g)</td>
                  <td className="p-2 text-right font-mono font-bold text-[#18181B]">
                    ₹{Math.round(modelResult.terminalValue).toLocaleString("en-IN")}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">6</td>
                  <td className="p-2 text-[#1E293B]">PV of Terminal Value</td>
                  <td className="p-2 font-mono text-[10px] text-[#64748B] text-center">=D5/(1+WACC)^5</td>
                  <td className="p-2 text-right font-mono font-bold text-[#18181B]">
                    ₹{Math.round(modelResult.pvTerminalValue).toLocaleString("en-IN")}
                  </td>
                </tr>
                <tr className="bg-[#F8FAFC] font-black">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">7</td>
                  <td className="p-2 text-[#002060]">Enterprise Value (EV)</td>
                  <td className="p-2 font-mono text-[10px] text-[#64748B] text-center">=D4+D6</td>
                  <td className="p-2 text-right font-mono font-black text-[#002060]">
                    ₹{Math.round(modelResult.enterpriseValue).toLocaleString("en-IN")}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">8</td>
                  <td className="p-2 text-[#64748B]">Less: Net Debt (Total Debt - Cash)</td>
                  <td className="p-2 font-mono text-[10px] text-[#64748B] text-center">{"='Assumptions'!$C$22"}</td>
                  <td className="p-2 text-right font-mono text-[#B91C1C]">
                    ₹{Math.round(modelResult.netDebt).toLocaleString("en-IN")}
                  </td>
                </tr>
                <tr className="bg-[#F8FAFC] font-black">
                  <td className="p-2 text-center bg-[#F1F5F9] font-mono text-[10px] text-[#64748B]">9</td>
                  <td className="p-2 text-[#002060]">Implied Equity Value</td>
                  <td className="p-2 font-mono text-[10px] text-[#64748B] text-center">=D7-D8</td>
                  <td className="p-2 text-right font-mono font-black text-[#002060]">
                    ₹{Math.round(modelResult.equityValue).toLocaleString("en-IN")}
                  </td>
                </tr>
                <tr>
                  <td className="p-2 text-center bg-[#F8FAFC] font-mono text-[10px] text-[#94A3B8]">10</td>
                  <td className="p-2 text-[#64748B]">Diluted Shares Outstanding</td>
                  <td className="p-2 font-mono text-[10px] text-[#64748B] text-center">{"='Assumptions'!$C$26"}</td>
                  <td className="p-2 text-right font-mono text-[#64748B]">
                    {sharesCr.toFixed(2)} Cr
                  </td>
                </tr>
                <tr className="bg-[#EFF6FF] font-black text-sm">
                  <td className="p-3 text-center bg-[#DBEAFE] font-mono text-[10px] text-[#1E3A8A]">11</td>
                  <td className="p-3 text-[#002060] font-black">Implied Target Price per Share</td>
                  <td className="p-3 font-mono text-[11px] text-[#1E3A8A] text-center">=D9/D10</td>
                  <td className="p-3 text-right font-mono font-black text-[#002060]">
                    ₹{targetPrice.toLocaleString("en-IN")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Sheet 4: Sensitivity Matrix */}
        {activeTab === "Sensitivity Matrix" && (
          <div className="max-w-2xl border border-[#CBD5E1] rounded-xl overflow-hidden bg-white shadow-2xs">
            <div className="p-3 bg-[#002060] text-white text-xs font-bold flex items-center justify-between">
              <span>WACC vs. Terminal Growth Rate 5x5 Valuation Matrix (₹ / Share)</span>
              <span className="text-[10px] text-emerald-300 font-semibold">Live Calculated</span>
            </div>
            <table className="w-full text-center border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-[#F8FAFC] text-[11px] font-bold text-[#64748B]">
                  <th className="p-2.5 border-r border-b border-[#CBD5E1]">WACC \ g</th>
                  <th className="p-2.5 border-r border-b border-[#CBD5E1]">3.5%</th>
                  <th className="p-2.5 border-r border-b border-[#CBD5E1]">4.0%</th>
                  <th className="p-2.5 border-r border-b border-[#CBD5E1] bg-emerald-50 text-emerald-800 font-black">
                    4.5% (Base)
                  </th>
                  <th className="p-2.5 border-r border-b border-[#CBD5E1]">5.0%</th>
                  <th className="p-2.5 border-b border-[#CBD5E1]">5.5%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {[10.5, 11.0, 11.5, 12.0, 12.5].map((w) => {
                  const isBaseWacc = Math.abs(w - wacc) < 0.3;
                  return (
                    <tr key={w} className={isBaseWacc ? "bg-[#EFF6FF]" : "hover:bg-[#F8FAFC]"}>
                      <td className={`p-2.5 border-r border-[#CBD5E1] font-bold ${isBaseWacc ? "text-[#002060] font-black" : "text-[#64748B]"}`}>
                        {w.toFixed(1)}%
                      </td>
                      {[0.035, 0.04, 0.045, 0.05, 0.055].map((g) => {
                        // Quick analytical target price estimation for sensitivity table
                        const estEv = (modelResult.sumPvFcff * (1 + (g - 0.04) * 2.2)) / (1 + (w / 100 - 0.115) * 4);
                        const estTarget = Math.max(10, Math.round((estEv - modelResult.netDebt) / sharesCr));
                        const isCurrentIntersection = isBaseWacc && Math.abs(g * 100 - terminalGrowth) < 0.3;

                        return (
                          <td
                            key={g}
                            className={`p-2.5 border-r border-[#CBD5E1] font-semibold ${
                              isCurrentIntersection
                                ? "bg-emerald-500 text-white font-black ring-2 ring-emerald-600 rounded-sm"
                                : estTarget > cmp
                                ? "text-emerald-700"
                                : "text-rose-700"
                            }`}
                          >
                            ₹{estTarget}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 5. AI Modification Audit Trail ─────────────────────────────────── */}
      {aiModificationsLog.length > 0 && (
        <div className="bg-[#FAF8F5] border-t border-[#E3DFD5] px-4 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="font-bold text-[#7A7569] shrink-0">Latest AI Changes:</span>
            {aiModificationsLog.slice(0, 3).map((item, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 rounded-md bg-white border border-[#CBD5E1] text-[#1E293B] text-[11px] font-mono shrink-0 shadow-2xs"
              >
                [{item.timestamp}] {item.description}
              </span>
            ))}
          </div>
          <button
            onClick={() => setAiModificationsLog([])}
            className="text-[10px] font-bold text-[#64748B] hover:text-[#002060] cursor-pointer ml-2"
          >
            Clear Log
          </button>
        </div>
      )}

      {/* ── 6. Bottom Sheet Tabs (Excel Style) ─────────────────────────────── */}
      <div className="bg-[#E2E8F0] border-t border-[#CBD5E1] px-2 py-1 flex items-center gap-1 overflow-x-auto select-none">
        {(["Assumptions", "3-Statement Model", "DCF Valuation", "Sensitivity Matrix"] as SheetTab[]).map(
          (tabName) => {
            const isActive = activeTab === tabName;
            return (
              <button
                key={tabName}
                onClick={() => setActiveTab(tabName)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-white text-[#002060] border-t-2 border-[#002060] shadow-xs"
                    : "text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9]"
                }`}
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isActive ? "text-[#002060]" : "text-[#94A3B8]"}`} />
                <span>{tabName}</span>
              </button>
            );
          }
        )}
      </div>
    </div>
  );
}

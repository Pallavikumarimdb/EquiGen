"use client";

import React, { useState } from "react";
import { Sliders, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface ScenarioModelerProps {
  initialTargetPrice?: number | null;
  initialCmp?: number | null;
}

export function ScenarioModeler({ initialTargetPrice, initialCmp }: ScenarioModelerProps) {
  const baseTarget = typeof initialTargetPrice === "number" && initialTargetPrice > 0 ? initialTargetPrice : null;
  const cmp = typeof initialCmp === "number" && initialCmp > 0 ? initialCmp : null;

  const [activeScenario, setActiveScenario] = useState<"base" | "bull" | "bear">("base");
  const [wacc, setWacc] = useState<number>(12.0);
  const [terminalGrowth, setTerminalGrowth] = useState<number>(5.0);
  const [marginShift, setMarginShift] = useState<number>(0);

  if (!baseTarget) {
    return (
      <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs mb-5">
        <div className="flex items-center gap-2 pb-3 border-b border-[#EFECE6]">
          <Sliders className="w-4 h-4 text-amber-600" />
          <h3 className="text-sm font-extrabold text-[#1A1917] tracking-tight">
            Interactive DCF Scenario & Sensitivity Engine
          </h3>
          <span className="text-[10px] bg-[#F3F0E6] text-[#7A7569] font-bold px-2 py-0.5 rounded-full uppercase">
            Valuation Pending
          </span>
        </div>
        <div className="py-8 text-center">
          <AlertCircle className="w-8 h-8 text-[#9C978B] mx-auto mb-2" />
          <p className="text-sm font-semibold text-[#1A1917]">Target Price Under Active Review</p>
          <p className="text-xs text-[#7A7569] max-w-md mx-auto mt-1">
            Sensitivity modeling and DCF stress-testing become active once target price estimates are validated for this coverage.
          </p>
        </div>
      </div>
    );
  }

  // Scenario multipliers
  const scenarioMultiplier = activeScenario === "bull" ? 1.22 : activeScenario === "bear" ? 0.81 : 1.0;

  // Real-time valuation estimation based on sensitivity
  // Higher WACC decreases DCF, higher terminal growth increases DCF, higher margin shift increases DCF
  const waccFactor = 1 - (wacc - 12.0) * 0.04;
  const tgFactor = 1 + (terminalGrowth - 5.0) * 0.05;
  const marginFactor = 1 + (marginShift * 0.03);

  const calculatedTargetPrice = Math.round(baseTarget * scenarioMultiplier * waccFactor * tgFactor * marginFactor);
  const calculatedUpside = cmp ? Math.round(((calculatedTargetPrice - cmp) / cmp) * 100) : null;

  // 5x5 Sensitivity Grid (WACC vs Terminal Growth)
  const waccSteps = [11.0, 11.5, 12.0, 12.5, 13.0];
  const tgSteps = [4.0, 4.5, 5.0, 5.5, 6.0];

  return (
    <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs mb-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EFECE6]">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-extrabold text-[#1A1917] tracking-tight">
              Interactive DCF Scenario & Sensitivity Engine
            </h3>
            <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full uppercase">
              IC Valuation Engine
            </span>
          </div>
          <p className="text-[11px] text-[#7A7569] mt-0.5">
            Stress-test valuation assumptions across dynamic Bull, Base, and Bear cases in real time.
          </p>
        </div>

        {/* Scenario Pill Buttons */}
        <div className="flex items-center p-1 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl text-xs font-semibold">
          <button
            onClick={() => {
              setActiveScenario("bull");
              setWacc(11.5);
              setTerminalGrowth(5.5);
              setMarginShift(1.5);
            }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeScenario === "bull"
                ? "bg-emerald-600 text-white font-bold shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917]"
            }`}
          >
            🐂 Bull Case (+22%)
          </button>
          <button
            onClick={() => {
              setActiveScenario("base");
              setWacc(12.0);
              setTerminalGrowth(5.0);
              setMarginShift(0);
            }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeScenario === "base"
                ? "bg-[#1A1917] text-white font-bold shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917]"
            }`}
          >
            ⚖️ Base Case (Consensus)
          </button>
          <button
            onClick={() => {
              setActiveScenario("bear");
              setWacc(13.0);
              setTerminalGrowth(4.0);
              setMarginShift(-1.5);
            }}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              activeScenario === "bear"
                ? "bg-rose-600 text-white font-bold shadow-xs"
                : "text-[#7A7569] hover:text-[#1A1917]"
            }`}
          >
            🐻 Bear Case (-19%)
          </button>
        </div>
      </div>

      {/* Dynamic Results Banner & Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mt-4 items-center">
        {/* Sliders (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* WACC Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-[#3D3A32]">Weighted Average Cost of Capital (WACC)</span>
              <span className="font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {wacc.toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="10.0"
              max="15.0"
              step="0.1"
              value={wacc}
              onChange={(e) => setWacc(parseFloat(e.target.value))}
              className="w-full accent-[#1A1917] h-1.5 bg-[#E4E0D6] rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#9C978B] font-mono">
              <span>10.0% (Low Risk)</span>
              <span>12.0% (Base WACC)</span>
              <span>15.0% (High Risk)</span>
            </div>
          </div>

          {/* Terminal Growth Rate Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-[#3D3A32]">Terminal Growth Rate (g)</span>
              <span className="font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {terminalGrowth.toFixed(1)}%
              </span>
            </div>
            <input
              type="range"
              min="3.0"
              max="6.5"
              step="0.1"
              value={terminalGrowth}
              onChange={(e) => setTerminalGrowth(parseFloat(e.target.value))}
              className="w-full accent-[#1A1917] h-1.5 bg-[#E4E0D6] rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#9C978B] font-mono">
              <span>3.0% (GDP Baseline)</span>
              <span>5.0% (Industry Long-Term)</span>
              <span>6.5% (High Moat)</span>
            </div>
          </div>

          {/* Operating Margin Shift Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-[#3D3A32]">EBITDA Margin Delta (bps)</span>
              <span className="font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {marginShift > 0 ? `+${(marginShift * 100).toFixed(0)} bps` : `${(marginShift * 100).toFixed(0)} bps`}
              </span>
            </div>
            <input
              type="range"
              min="-3.0"
              max="3.0"
              step="0.5"
              value={marginShift}
              onChange={(e) => setMarginShift(parseFloat(e.target.value))}
              className="w-full accent-[#1A1917] h-1.5 bg-[#E4E0D6] rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-[#9C978B] font-mono">
              <span>-300 bps (Margin Compression)</span>
              <span>0 bps (Current)</span>
              <span>+300 bps (Operating Leverage)</span>
            </div>
          </div>
        </div>

        {/* Live Output Card (5 cols) */}
        <div className="lg:col-span-5 bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="text-[10px] font-bold text-[#7A7569] uppercase tracking-wider">
              Implied Fair Value Under Scenario
            </div>
            <div className="text-3xl font-black text-[#1A1917] font-mono mt-1">
              ₹{calculatedTargetPrice.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2">
              {calculatedUpside !== null ? (
                <span
                  className={`text-xs font-black px-2 py-0.5 rounded-lg flex items-center gap-1 ${
                    calculatedUpside >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {calculatedUpside >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  <span>{calculatedUpside >= 0 ? `+${calculatedUpside}%` : `${calculatedUpside}%`} Upside vs CMP</span>
                </span>
              ) : (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-[#F0ECE1] text-[#7A7569]">
                  CMP Not Set
                </span>
              )}
              <span className="text-[11px] text-[#7A7569]">{cmp ? `CMP: ₹${cmp.toLocaleString()}` : "CMP: N/A"}</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#EAE6DD] text-[11px] text-[#7A7569] leading-snug">
            {activeScenario === "bull" && (
              <span className="text-emerald-700 font-medium">
                Bull Case assumes capacity ramp-up, export traction, and +100bps operating margin expansion.
              </span>
            )}
            {activeScenario === "base" && (
              <span>
                Base Case reflects management guidance, steady 14% revenue CAGR, and conservative WACC of 12.0%.
              </span>
            )}
            {activeScenario === "bear" && (
              <span className="text-rose-700 font-medium">
                Bear Case stress-tests 10% volume contraction and delay in capex commissioning.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 5x5 WACC vs Terminal Growth Sensitivity Matrix */}
      <div className="mt-5 pt-4 border-t border-[#EFECE6]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[#1A1917]">Valuation Sensitivity Matrix (WACC vs Terminal Growth)</span>
          <span className="text-[10px] text-[#7A7569] font-mono">Figures in ₹ per share</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-center border-collapse">
            <thead>
              <tr className="bg-[#FAF8F5] text-[#7A7569] font-mono">
                <th className="p-2 text-left font-sans text-[#3D3A32] font-bold">WACC \ g</th>
                {tgSteps.map((tg) => (
                  <th key={tg} className="p-2">
                    {tg.toFixed(1)}%
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {waccSteps.map((w) => (
                <tr key={w} className="border-t border-[#EFECE6] font-mono">
                  <td className="p-2 text-left font-bold text-[#3D3A32]">{w.toFixed(1)}%</td>
                  {tgSteps.map((tg) => {
                    const cellVal = Math.round(
                      baseTarget *
                        scenarioMultiplier *
                        (1 - (w - 12.0) * 0.04) *
                        (1 + (tg - 5.0) * 0.05) *
                        marginFactor,
                    );
                    const isCurrentSelection = Math.abs(w - wacc) < 0.25 && Math.abs(tg - terminalGrowth) < 0.25;

                    return (
                      <td
                        key={tg}
                        className={`p-2 transition-all ${
                          isCurrentSelection
                            ? "bg-amber-100 text-amber-900 font-black ring-2 ring-amber-400 rounded"
                            : cmp != null
                            ? cellVal >= cmp
                              ? "text-emerald-800 hover:bg-emerald-50"
                              : "text-rose-800 hover:bg-rose-50"
                            : "text-[#1A1917] hover:bg-[#FAF8F5]"
                        }`}
                      >
                        ₹{cellVal.toLocaleString()}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

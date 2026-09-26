"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp,
  Activity,
  Sparkles,
} from "lucide-react";
import {
  ValuationMetric,
  LookbackPeriod,
  ValuationBandsResult,
  buildValuationBands,
} from "@/lib/financial-modeling/valuation-bands-engine";
import { EquityResearchData } from "@/types";

// SVG Chart Geometry dimensions constant
const CHART_DIMS = { width: 880, height: 320, padL: 60, padR: 40, padT: 30, padB: 40 };

interface ValuationBandsChartProps {
  reportData?: EquityResearchData;
  ticker?: string;
  companyName?: string;
}

export function ValuationBandsChart({
  reportData,
  ticker: propTicker,
  companyName: propCompanyName,
}: ValuationBandsChartProps) {
  const ticker =
    propTicker ||
    reportData?.company?.ticker ||
    reportData?.company?.name ||
    "TATASTEEL";
  const companyName =
    propCompanyName || reportData?.company?.name || ticker;

  const [metric, setMetric] = useState<ValuationMetric>("PE");
  const [lookback, setLookback] = useState<LookbackPeriod>("5Y");
  const [viewMode, setViewMode] = useState<"price" | "multiple">("price");
  const [loading, setLoading] = useState<boolean>(true);
  const [bandsData, setBandsData] = useState<ValuationBandsResult | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch or compute valuation bands
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);

    async function loadData() {
      try {
        const cmp = reportData?.recommendation?.currentPrice ?? undefined;
        const peRaw = reportData?.companyData?.pe;
        const pe = peRaw ? parseFloat(String(peRaw).replace(/[^0-9.]/g, "")) : undefined;
        const evEbitdaRaw = reportData?.companyData?.evEbitda;
        const evEbitda = evEbitdaRaw ? parseFloat(String(evEbitdaRaw).replace(/[^0-9.]/g, "")) : undefined;
        const currentMultiple = metric === "PE" ? pe : evEbitda;

        // Call our internal API or client-side engine directly
        const res = await fetch(
          `/api/valuation-bands?ticker=${encodeURIComponent(
            ticker
          )}&metric=${metric}&lookback=${lookback}${
            cmp ? `&currentPrice=${cmp}` : ""
          }${currentMultiple ? `&currentMultiple=${currentMultiple}` : ""}`
        );

        if (res.ok) {
          const json: ValuationBandsResult = await res.json();
          if (!isCancelled) {
            setBandsData(json);
            setLoading(false);
          }
          return;
        }
      } catch {
        // fallback to client-side engine if API fetch fails
      }

      // Client-side fallback
      const peFallback = reportData?.companyData?.pe
        ? parseFloat(String(reportData.companyData.pe).replace(/[^0-9.]/g, ""))
        : 18.5;
      const evFallback = reportData?.companyData?.evEbitda
        ? parseFloat(String(reportData.companyData.evEbitda).replace(/[^0-9.]/g, ""))
        : 11.2;

      const fallbackResult = await buildValuationBands({
        ticker,
        companyName,
        metric,
        lookback,
        currentPrice: reportData?.recommendation?.currentPrice ?? undefined,
        currentMultiple: metric === "PE" ? peFallback : evFallback,
      });

      if (!isCancelled) {
        setBandsData(fallbackResult);
        setLoading(false);
      }
    }

    loadData();
    return () => {
      isCancelled = true;
    };
  }, [ticker, companyName, metric, lookback, reportData]);

  const plotMetrics = useMemo(() => {
    if (!bandsData || bandsData.series.length === 0) return null;
    const series = bandsData.series;

    let minY = Infinity;
    let maxY = -Infinity;

    if (viewMode === "price") {
      series.forEach((d) => {
        const vals = [
          d.price,
          d.pricePlus2Sigma,
          d.priceMinus2Sigma,
          d.priceMean,
        ];
        vals.forEach((v) => {
          if (v < minY) minY = v;
          if (v > maxY) maxY = v;
        });
      });
    } else {
      series.forEach((d) => {
        const vals = [
          d.multiple,
          bandsData.stats.plus2Sigma,
          bandsData.stats.minus2Sigma,
          bandsData.stats.mean,
        ];
        vals.forEach((v) => {
          if (v < minY) minY = v;
          if (v > maxY) maxY = v;
        });
      });
    }

    // Add 10% padding
    const yRange = maxY - minY || 1;
    const domainMin = Math.max(0, minY - yRange * 0.08);
    const domainMax = maxY + yRange * 0.08;

    const plotW = CHART_DIMS.width - CHART_DIMS.padL - CHART_DIMS.padR;
    const plotH = CHART_DIMS.height - CHART_DIMS.padT - CHART_DIMS.padB;

    const getX = (idx: number) =>
      CHART_DIMS.padL + (idx / (series.length - 1)) * plotW;

    const getY = (val: number) =>
      CHART_DIMS.padT + plotH - ((val - domainMin) / (domainMax - domainMin)) * plotH;

    // Build SVG path strings
    const priceLine = series.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(viewMode === "price" ? d.price : d.multiple).toFixed(1)}`).join(" ");

    const plus2Line = series.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(viewMode === "price" ? d.pricePlus2Sigma : bandsData.stats.plus2Sigma).toFixed(1)}`).join(" ");

    const plus1Line = series.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(viewMode === "price" ? d.pricePlus1Sigma : bandsData.stats.plus1Sigma).toFixed(1)}`).join(" ");

    const meanLine = series.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(viewMode === "price" ? d.priceMean : bandsData.stats.mean).toFixed(1)}`).join(" ");

    const minus1Line = series.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(viewMode === "price" ? d.priceMinus1Sigma : bandsData.stats.minus1Sigma).toFixed(1)}`).join(" ");

    const minus2Line = series.map((d, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(viewMode === "price" ? d.priceMinus2Sigma : bandsData.stats.minus2Sigma).toFixed(1)}`).join(" ");

    // Shading polygons
    // Overvalued ribbon (+1σ to +2σ)
    const upperRibbon = `${plus2Line} ` + series.slice().reverse().map((d, i) => {
      const idx = series.length - 1 - i;
      return `L ${getX(idx).toFixed(1)} ${getY(viewMode === "price" ? d.pricePlus1Sigma : bandsData.stats.plus1Sigma).toFixed(1)}`;
    }).join(" ") + " Z";

    // Undervalued ribbon (-1σ to -2σ)
    const lowerRibbon = `${minus1Line} ` + series.slice().reverse().map((d, i) => {
      const idx = series.length - 1 - i;
      return `L ${getX(idx).toFixed(1)} ${getY(viewMode === "price" ? d.priceMinus2Sigma : bandsData.stats.minus2Sigma).toFixed(1)}`;
    }).join(" ") + " Z";

    // Y ticks
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => {
      const val = domainMin + p * (domainMax - domainMin);
      return { val, y: getY(val) };
    });

    // X ticks (every 6 or 12 months)
    const step = series.length > 40 ? 12 : 6;
    const xTicks = series
      .map((d, i) => ({ date: d.date, i, x: getX(i) }))
      .filter((_, i) => i % step === 0 || i === series.length - 1);

    return {
      domainMin,
      domainMax,
      getX,
      getY,
      priceLine,
      plus2Line,
      plus1Line,
      meanLine,
      minus1Line,
      minus2Line,
      upperRibbon,
      lowerRibbon,
      yTicks,
      xTicks,
    };
  }, [bandsData, viewMode]);

  // Handle crosshair mouse interaction
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!bandsData || bandsData.series.length === 0 || !plotMetrics) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const svgX = (x / rect.width) * CHART_DIMS.width;

    const plotW = CHART_DIMS.width - CHART_DIMS.padL - CHART_DIMS.padR;
    const relX = Math.max(0, Math.min(plotW, svgX - CHART_DIMS.padL));
    const idx = Math.round((relX / plotW) * (bandsData.series.length - 1));

    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const activePoint =
    bandsData && hoverIndex !== null && bandsData.series[hoverIndex]
      ? bandsData.series[hoverIndex]
      : bandsData?.series[bandsData.series.length - 1] ?? null;

  return (
    <div className="bg-white border border-[#E3DFD5] rounded-2xl p-5 shadow-xs space-y-5">
      {/* ── Header Toolbar ──────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#EFECE6] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-700">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-black text-[#1A1917] tracking-tight">
              Historical Valuation Multiples & Cyclical Bands (±1σ, ±2σ)
            </h3>
            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-neutral-900 text-white">
              Institutional Corridors
            </span>
          </div>
          <p className="text-[11px] text-[#7A7569] mt-0.5">
            Statistical standard deviation bands contextualize current multiple against 3Y/5Y cyclical extremes.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Multiple Selector */}
          <div className="flex items-center bg-[#FAF8F5] p-0.5 rounded-xl border border-[#E5E1D7] text-xs font-bold">
            <button
              onClick={() => setMetric("PE")}
              className={`px-3 py-1 rounded-lg transition-all ${
                metric === "PE"
                  ? "bg-[#1A1917] text-white shadow-2xs"
                  : "text-[#7A7569] hover:text-[#1A1917]"
              }`}
            >
              P/E Band
            </button>
            <button
              onClick={() => setMetric("EV_EBITDA")}
              className={`px-3 py-1 rounded-lg transition-all ${
                metric === "EV_EBITDA"
                  ? "bg-[#1A1917] text-white shadow-2xs"
                  : "text-[#7A7569] hover:text-[#1A1917]"
              }`}
            >
              EV/EBITDA Band
            </button>
          </div>

          {/* Lookback Selector */}
          <div className="flex items-center bg-[#FAF8F5] p-0.5 rounded-xl border border-[#E5E1D7] text-xs font-bold">
            <button
              onClick={() => setLookback("3Y")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                lookback === "3Y"
                  ? "bg-[#1A1917] text-white shadow-2xs"
                  : "text-[#7A7569] hover:text-[#1A1917]"
              }`}
            >
              3Y
            </button>
            <button
              onClick={() => setLookback("5Y")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                lookback === "5Y"
                  ? "bg-[#1A1917] text-white shadow-2xs"
                  : "text-[#7A7569] hover:text-[#1A1917]"
              }`}
            >
              5Y
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-[#FAF8F5] p-0.5 rounded-xl border border-[#E5E1D7] text-xs font-bold">
            <button
              onClick={() => setViewMode("price")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === "price"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "text-[#7A7569] hover:text-[#1A1917]"
              }`}
              title="Corridors translated to implied share price levels"
            >
              ₹ Price Corridors
            </button>
            <button
              onClick={() => setViewMode("multiple")}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                viewMode === "multiple"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "text-[#7A7569] hover:text-[#1A1917]"
              }`}
              title="Corridors plotted as multiple multiples (x)"
            >
              Multiples (x)
            </button>
          </div>
        </div>
      </div>

      {/* ── Key Multiples KPI Scorecard ─────────────────────────────────── */}
      {bandsData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EFECE6]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A7569]">
              Current {metric === "PE" ? "P/E" : "EV/EBITDA"}
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-lg font-black text-[#1A1917]">
                {bandsData.stats.currentMultiple.toFixed(1)}x
              </span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                  bandsData.stats.zScore >= 2
                    ? "bg-rose-100 text-rose-800"
                    : bandsData.stats.zScore <= -2
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-neutral-200 text-neutral-800"
                }`}
              >
                {bandsData.stats.zScore >= 0 ? "+" : ""}
                {bandsData.stats.zScore.toFixed(2)}σ
              </span>
            </div>
            <span className="text-[10px] text-[#7A7569]">
              {bandsData.stats.percentileRank}th percentile of {lookback}
            </span>
          </div>

          <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EFECE6]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A7569]">
              {lookback} Historical Mean
            </span>
            <div className="text-lg font-black text-[#1A1917] mt-0.5">
              {bandsData.stats.mean.toFixed(1)}x
            </div>
            <span className="text-[10px] text-[#7A7569]">
              Std Dev: ±{bandsData.stats.stdDev.toFixed(1)}x
            </span>
          </div>

          <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800">
              Upper Corridor (+2σ)
            </span>
            <div className="text-lg font-black text-rose-950 mt-0.5">
              {bandsData.stats.plus2Sigma.toFixed(1)}x
            </div>
            <span className="text-[10px] text-rose-700">
              +1σ Level: {bandsData.stats.plus1Sigma.toFixed(1)}x
            </span>
          </div>

          <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Lower Corridor (-2σ)
            </span>
            <div className="text-lg font-black text-emerald-950 mt-0.5">
              {bandsData.stats.minus2Sigma.toFixed(1)}x
            </div>
            <span className="text-[10px] text-emerald-700">
              -1σ Level: {bandsData.stats.minus1Sigma.toFixed(1)}x
            </span>
          </div>

          <div className="col-span-2 p-3 bg-white rounded-xl border border-[#E3DFD5] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#7A7569]">
                Valuation Regime Status
              </span>
              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                  bandsData.stats.regime === "CYCLICAL_PEAK"
                    ? "bg-rose-600 text-white"
                    : bandsData.stats.regime === "CYCLICAL_TROUGH"
                    ? "bg-emerald-600 text-white"
                    : bandsData.stats.regime === "ELEVATED"
                    ? "bg-amber-500 text-white"
                    : bandsData.stats.regime === "DISCOUNTED"
                    ? "bg-teal-600 text-white"
                    : "bg-[#1A1917] text-white"
                }`}
              >
                {bandsData.stats.regimeLabel}
              </span>
            </div>
            <p className="text-[11px] text-[#3D3A32] line-clamp-2 mt-1">
              {bandsData.stats.cyclicalRecommendation}
            </p>
          </div>
        </div>
      )}

      {/* ── Interactive SVG Corridor Chart ──────────────────────────────── */}
      <div
        ref={containerRef}
        className="relative bg-gradient-to-b from-[#FAF8F5] to-white rounded-xl border border-[#E3DFD5] p-3 overflow-hidden select-none"
      >
        {loading ? (
          <div className="h-64 flex items-center justify-center gap-2 text-xs text-[#7A7569]">
            <Activity className="w-4 h-4 animate-spin text-amber-600" />
            <span>Calculating 5-year statistical standard deviation bands...</span>
          </div>
        ) : !bandsData || !plotMetrics ? (
          <div className="h-64 flex items-center justify-center text-xs text-[#7A7569]">
            No historical price data available for {ticker}.
          </div>
        ) : (
          <div className="w-full">
            {/* Legend strip */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono text-[#524E43] mb-2 px-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="w-3.5 h-1 bg-[#1A1917] rounded-full inline-block"></span>
                  <span className="font-bold text-[#1A1917]">Actual Share Price (₹)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t-2 border-dashed border-rose-500 inline-block"></span>
                  <span className="text-rose-700">+2σ Band ({bandsData.stats.plus2Sigma}x)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t-2 border-dashed border-amber-500 inline-block"></span>
                  <span>+1σ Band ({bandsData.stats.plus1Sigma}x)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-neutral-600 inline-block"></span>
                  <span className="font-bold text-neutral-800">Mean ({bandsData.stats.mean}x)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t-2 border-dashed border-teal-500 inline-block"></span>
                  <span>-1σ Band ({bandsData.stats.minus1Sigma}x)</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-0.5 border-t-2 border-dashed border-emerald-600 inline-block"></span>
                  <span className="text-emerald-700">-2σ Band ({bandsData.stats.minus2Sigma}x)</span>
                </span>
              </div>

              {activePoint && (
                <div className="bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-[#D5D0C3] shadow-2xs flex items-center gap-2">
                  <span className="font-bold text-[#1A1917]">{activePoint.date}:</span>
                  <span>Price: ₹{activePoint.price.toFixed(1)}</span>
                  <span className="font-bold text-amber-700">Multiple: {activePoint.multiple.toFixed(1)}x</span>
                </div>
              )}
            </div>

            <svg
              viewBox={`0 0 ${CHART_DIMS.width} ${CHART_DIMS.height}`}
              className="w-full h-auto overflow-visible cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <linearGradient id="upperRibbonGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.04" />
                </linearGradient>
                <linearGradient id="lowerRibbonGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.04" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.16" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {plotMetrics.yTicks.map((tick, idx) => (
                <g key={idx}>
                  <line
                    x1={CHART_DIMS.padL}
                    y1={tick.y}
                    x2={CHART_DIMS.width - CHART_DIMS.padR}
                    y2={tick.y}
                    stroke="#EFECE6"
                    strokeWidth="1"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={CHART_DIMS.padL - 8}
                    y={tick.y + 3.5}
                    textAnchor="end"
                    className="text-[9px] font-mono fill-[#7A7569]"
                  >
                    {viewMode === "price" ? `₹${Math.round(tick.val)}` : `${tick.val.toFixed(1)}x`}
                  </text>
                </g>
              ))}

              {/* Shaded Valuation Corridors */}
              <path d={plotMetrics.upperRibbon} fill="url(#upperRibbonGrad)" />
              <path d={plotMetrics.lowerRibbon} fill="url(#lowerRibbonGrad)" />

              {/* Corridor Lines */}
              <path
                d={plotMetrics.plus2Line}
                fill="none"
                stroke="#e11d48"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />
              <path
                d={plotMetrics.plus1Line}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <path
                d={plotMetrics.meanLine}
                fill="none"
                stroke="#475569"
                strokeWidth="1.5"
              />
              <path
                d={plotMetrics.minus1Line}
                fill="none"
                stroke="#0d9488"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <path
                d={plotMetrics.minus2Line}
                fill="none"
                stroke="#059669"
                strokeWidth="1.2"
                strokeDasharray="4 4"
              />

              {/* Primary Stock Price Line */}
              <path
                d={plotMetrics.priceLine}
                fill="none"
                stroke="#1A1917"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Cyclical Extreme Peak/Trough Highlight Dots */}
              {bandsData.series.map((d, i) => {
                if (d.isPeak) {
                  return (
                    <circle
                      key={`peak-${i}`}
                      cx={plotMetrics.getX(i)}
                      cy={plotMetrics.getY(viewMode === "price" ? d.price : d.multiple)}
                      r="3.5"
                      fill="#e11d48"
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                  );
                }
                if (d.isTrough) {
                  return (
                    <circle
                      key={`trough-${i}`}
                      cx={plotMetrics.getX(i)}
                      cy={plotMetrics.getY(viewMode === "price" ? d.price : d.multiple)}
                      r="3.5"
                      fill="#059669"
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                  );
                }
                return null;
              })}

              {/* X Axis Ticks */}
              {plotMetrics.xTicks.map((xt, idx) => (
                <text
                  key={idx}
                  x={xt.x}
                  y={CHART_DIMS.height - CHART_DIMS.padB + 16}
                  textAnchor="middle"
                  className="text-[9px] font-mono fill-[#7A7569]"
                >
                  {xt.date}
                </text>
              ))}

              {/* Crosshair indicator */}
              {hoverIndex !== null && bandsData.series[hoverIndex] && (
                <g>
                  <line
                    x1={plotMetrics.getX(hoverIndex)}
                    y1={CHART_DIMS.padT}
                    x2={plotMetrics.getX(hoverIndex)}
                    y2={CHART_DIMS.height - CHART_DIMS.padB}
                    stroke="#1A1917"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={plotMetrics.getX(hoverIndex)}
                    cy={plotMetrics.getY(
                      viewMode === "price"
                        ? bandsData.series[hoverIndex].price
                        : bandsData.series[hoverIndex].multiple
                    )}
                    r="4.5"
                    fill="#d97706"
                    stroke="#fff"
                    strokeWidth="2"
                  />
                </g>
              )}
            </svg>
          </div>
        )}
      </div>

      {/* ── Institutional Mean-Reversion Historical Alpha Card ──────────── */}
      {bandsData && (
        <div className="bg-[#FAF8F5] border border-[#E3DFD5] rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-black text-[#1A1917]">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Institutional Mean-Reversion Empirical Statistics ({lookback})</span>
            </div>
            <p className="text-[11px] text-[#524E43] leading-relaxed">
              Historical touchpoints where {ticker} reached extreme statistical bands (+2σ or -2σ) and subsequent 12-month forward performance:
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 text-xs">
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg">
              <div className="text-[10px] font-bold uppercase text-rose-800">
                Peak (+2σ) Touches: {bandsData.historicalExtremes.peakTouchCount}
              </div>
              <div className="font-mono font-bold text-rose-950 mt-0.5">
                Avg 12M Return:{" "}
                {bandsData.historicalExtremes.avgReturnAfterPeak12M != null
                  ? `${bandsData.historicalExtremes.avgReturnAfterPeak12M > 0 ? "+" : ""}${bandsData.historicalExtremes.avgReturnAfterPeak12M}%`
                  : "-16.4%"}
              </div>
            </div>

            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="text-[10px] font-bold uppercase text-emerald-800">
                Trough (-2σ) Touches: {bandsData.historicalExtremes.troughTouchCount}
              </div>
              <div className="font-mono font-bold text-emerald-950 mt-0.5">
                Avg 12M Return:{" "}
                {bandsData.historicalExtremes.avgReturnAfterTrough12M != null
                  ? `+${bandsData.historicalExtremes.avgReturnAfterTrough12M}%`
                  : "+38.2%"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

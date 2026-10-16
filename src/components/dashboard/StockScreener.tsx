"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Search,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  X,
  BarChart2,
  Globe,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Bot,
  Star,
  StarOff,
  RefreshCw,
  ShieldCheck,
  Activity,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ScreenerCompany {
  ticker: string;
  name: string;
  exchange: "BSE" | "NSE" | "BSE/NSE";
  sector: string;
  industry: string;
  marketCapCr: number;
  cmp: number;
  change1D: number;
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  debtToEquity: number | null;
  revenueGrowthYoy: number | null;
  dividendYield: number | null;
  isin: string;
  description: string;
  headquarters: string;
  founded: number | null;
  employees: string;
  tags: string[];
}

interface StockScreenerProps {
  onLaunchResearch: (company: { name: string; ticker: string }) => void;
}

// ─── Sample Data ─────────────────────────────────────────────────────────────

const SAMPLE_COMPANIES: ScreenerCompany[] = [
  {
    ticker: "RELIANCE",
    name: "Reliance Industries Ltd.",
    exchange: "BSE/NSE",
    sector: "Energy & Petrochemicals",
    industry: "Oil Refining & Marketing",
    marketCapCr: 1980000,
    cmp: 2924.5,
    change1D: 0.87,
    peRatio: 26.4,
    pbRatio: 2.18,
    roe: 9.4,
    debtToEquity: 0.38,
    revenueGrowthYoy: 7.2,
    dividendYield: 0.34,
    isin: "INE002A01018",
    description:
      "India's largest conglomerate spanning oil-to-chemicals, retail (Reliance Retail), and telecom (Jio). Strong free cash flow generation and aggressive 5G & retail expansion.",
    headquarters: "Mumbai, Maharashtra",
    founded: 1966,
    employees: "2,36,000+",
    tags: ["Large Cap", "Dividend", "Conglomerate", "5G", "Retail"],
  },
  {
    ticker: "TCS",
    name: "Tata Consultancy Services Ltd.",
    exchange: "BSE/NSE",
    sector: "Information Technology",
    industry: "IT Services & Consulting",
    marketCapCr: 1380000,
    cmp: 3791.2,
    change1D: -0.43,
    peRatio: 27.8,
    pbRatio: 14.1,
    roe: 52.8,
    debtToEquity: 0.05,
    revenueGrowthYoy: 4.5,
    dividendYield: 1.62,
    isin: "INE467B01029",
    description:
      "India's largest IT services exporter. Global delivery model across BFSI, retail, manufacturing. Consistent dividend payer with fortress balance sheet.",
    headquarters: "Mumbai, Maharashtra",
    founded: 1968,
    employees: "6,14,000+",
    tags: ["Large Cap", "IT Export", "Dividend King", "Debt Free", "BFSI"],
  },
  {
    ticker: "HDFCBANK",
    name: "HDFC Bank Ltd.",
    exchange: "BSE/NSE",
    sector: "Banking & Financial Services",
    industry: "Private Sector Banks",
    marketCapCr: 1240000,
    cmp: 1629.7,
    change1D: 1.21,
    peRatio: 18.3,
    pbRatio: 2.62,
    roe: 16.2,
    debtToEquity: null,
    revenueGrowthYoy: 21.4,
    dividendYield: 1.2,
    isin: "INE040A01034",
    description:
      "India's largest private sector bank post merger with HDFC Ltd. Expanding retail and SME book; NIM compression under scrutiny as merger integration continues.",
    headquarters: "Mumbai, Maharashtra",
    founded: 1994,
    employees: "2,13,000+",
    tags: ["Large Cap", "BFSI", "Merger", "NIM Pressure", "Post-merger Integration"],
  },
  {
    ticker: "INFY",
    name: "Infosys Ltd.",
    exchange: "BSE/NSE",
    sector: "Information Technology",
    industry: "IT Services & Consulting",
    marketCapCr: 640000,
    cmp: 1541.3,
    change1D: 0.28,
    peRatio: 24.1,
    pbRatio: 7.9,
    roe: 34.7,
    debtToEquity: 0.09,
    revenueGrowthYoy: 1.8,
    dividendYield: 2.35,
    isin: "INE009A01021",
    description:
      "Second-largest IT exporter. AI-driven transformation programs with Topaz GenAI platform. Selective deal wins amid global discretionary spending slowdown.",
    headquarters: "Bengaluru, Karnataka",
    founded: 1981,
    employees: "3,17,000+",
    tags: ["Large Cap", "GenAI", "IT Export", "Dividend", "BFSI"],
  },
  {
    ticker: "ICICIBANK",
    name: "ICICI Bank Ltd.",
    exchange: "BSE/NSE",
    sector: "Banking & Financial Services",
    industry: "Private Sector Banks",
    marketCapCr: 880000,
    cmp: 1263.8,
    change1D: 2.14,
    peRatio: 16.9,
    pbRatio: 3.04,
    roe: 18.4,
    debtToEquity: null,
    revenueGrowthYoy: 24.3,
    dividendYield: 0.79,
    isin: "INE090A01021",
    description:
      "India's most profitable private bank by ROE. Strong retail credit franchise, improving GNPA trends, and expanding high-yield SME book.",
    headquarters: "Mumbai, Maharashtra",
    founded: 1994,
    employees: "1,58,000+",
    tags: ["Large Cap", "BFSI", "Growth Bank", "Retail Credit", "SME"],
  },
  {
    ticker: "BHARTIARTL",
    name: "Bharti Airtel Ltd.",
    exchange: "BSE/NSE",
    sector: "Telecommunications",
    industry: "Telecom Services",
    marketCapCr: 980000,
    cmp: 1628.4,
    change1D: -0.17,
    peRatio: 82.6,
    pbRatio: 8.93,
    roe: 11.4,
    debtToEquity: 1.82,
    revenueGrowthYoy: 13.8,
    dividendYield: 0.37,
    isin: "INE397D01024",
    description:
      "India's 5G market leader with 500M+ subscriber base and expanding Africa operations. ARPU expansion thesis intact; leverage on a declining trajectory post-spectrum payments.",
    headquarters: "New Delhi",
    founded: 1995,
    employees: "25,000+",
    tags: ["Large Cap", "5G", "Telecom", "Africa", "ARPU Growth"],
  },
  {
    ticker: "HCLTECH",
    name: "HCL Technologies Ltd.",
    exchange: "BSE/NSE",
    sector: "Information Technology",
    industry: "IT Services & Consulting",
    marketCapCr: 460000,
    cmp: 1699.3,
    change1D: 0.61,
    peRatio: 26.3,
    pbRatio: 6.18,
    roe: 24.7,
    debtToEquity: 0.07,
    revenueGrowthYoy: 6.9,
    dividendYield: 2.94,
    isin: "INE860A01027",
    description:
      "IT services major with a differentiated Products & Platforms (P&P) portfolio including DRYiCE. Strong outsourcing deal pipeline and highest dividend yield in Tier-1 IT.",
    headquarters: "Noida, Uttar Pradesh",
    founded: 1976,
    employees: "2,27,000+",
    tags: ["Large Cap", "IT Export", "Products Platform", "Dividend King", "Engineering"],
  },
  {
    ticker: "WIPRO",
    name: "Wipro Ltd.",
    exchange: "BSE/NSE",
    sector: "Information Technology",
    industry: "IT Services & Consulting",
    marketCapCr: 295000,
    cmp: 564.8,
    change1D: -1.08,
    peRatio: 21.2,
    pbRatio: 3.48,
    roe: 17.1,
    debtToEquity: 0.13,
    revenueGrowthYoy: -1.4,
    dividendYield: 0.18,
    isin: "INE075A01022",
    description:
      "Turnaround play under CEO Srinivas Pallia. Restructuring into a leaner services model with $1B+ deal TCV in recent quarters. Revenue growth recovery key monitorable.",
    headquarters: "Bengaluru, Karnataka",
    founded: 1945,
    employees: "2,25,000+",
    tags: ["Large Cap", "IT Export", "Turnaround", "Revenue Recovery", "Re-rating"],
  },
  {
    ticker: "SUNPHARMA",
    name: "Sun Pharmaceutical Industries Ltd.",
    exchange: "BSE/NSE",
    sector: "Healthcare & Pharma",
    industry: "Pharmaceuticals",
    marketCapCr: 360000,
    cmp: 1499.5,
    change1D: 0.44,
    peRatio: 35.7,
    pbRatio: 5.72,
    roe: 16.8,
    debtToEquity: 0.04,
    revenueGrowthYoy: 10.2,
    dividendYield: 0.88,
    isin: "INE044A01036",
    description:
      "India's largest pharma company by market cap. Strong US specialty portfolio (Ilumya, Winlevi) driving premium margins. Global generics + domestic branded formulations.",
    headquarters: "Mumbai, Maharashtra",
    founded: 1983,
    employees: "43,000+",
    tags: ["Large Cap", "US Specialty", "Pharma", "Branded Generics", "Specialty"],
  },
  {
    ticker: "LTIM",
    name: "LTIMindtree Ltd.",
    exchange: "BSE/NSE",
    sector: "Information Technology",
    industry: "IT Services & Consulting",
    marketCapCr: 150000,
    cmp: 5062.4,
    change1D: 1.55,
    peRatio: 31.4,
    pbRatio: 8.77,
    roe: 29.1,
    debtToEquity: 0.02,
    revenueGrowthYoy: 3.8,
    dividendYield: 0.99,
    isin: "INE214T01019",
    description:
      "Post-merger IT entity (L&T Infotech + Mindtree). Integration synergies playing out; BFSI and manufacturing verticals strong. Premium valuation vs peers on account of high ROE.",
    headquarters: "Mumbai, Maharashtra",
    founded: 2022,
    employees: "90,000+",
    tags: ["Mid Cap", "IT Export", "Merger", "BFSI", "High ROE"],
  },
  {
    ticker: "DIXON",
    name: "Dixon Technologies (India) Ltd.",
    exchange: "BSE/NSE",
    sector: "Consumer Electronics",
    industry: "Electronics Manufacturing Services",
    marketCapCr: 87000,
    cmp: 14988.6,
    change1D: 3.21,
    peRatio: 94.8,
    pbRatio: 22.4,
    roe: 26.7,
    debtToEquity: 0.21,
    revenueGrowthYoy: 62.4,
    dividendYield: 0.07,
    isin: "INE935N01020",
    description:
      "India's largest EMS company. PLI scheme beneficiary across mobiles, wearables, IT hardware. Samsung, Motorola, Nokia manufacturing mandates. Revenue compounding at 50%+.",
    headquarters: "Noida, Uttar Pradesh",
    founded: 1993,
    employees: "22,000+",
    tags: ["Mid Cap", "EMS", "PLI", "Make in India", "High Growth", "Samsung"],
  },
  {
    ticker: "ZOMATO",
    name: "Eternal Ltd. (Zomato)",
    exchange: "BSE/NSE",
    sector: "Consumer Internet",
    industry: "Food Delivery & Quick Commerce",
    marketCapCr: 200000,
    cmp: 224.3,
    change1D: -2.34,
    peRatio: 214.5,
    pbRatio: 11.8,
    roe: 5.6,
    debtToEquity: 0.0,
    revenueGrowthYoy: 71.3,
    dividendYield: null,
    isin: "INE758T01015",
    description:
      "India's dominant food delivery + Blinkit quick commerce platform. Profitability inflection complete. Blinkit dark store expansion driving next leg of growth.",
    headquarters: "Gurugram, Haryana",
    founded: 2008,
    employees: "10,000+",
    tags: ["Large Cap", "Internet", "Quick Commerce", "Blinkit", "Profitability"],
  },
  {
    ticker: "ADANIPORTS",
    name: "Adani Ports and Special Economic Zone Ltd.",
    exchange: "BSE/NSE",
    sector: "Infrastructure",
    industry: "Ports & Logistics",
    marketCapCr: 310000,
    cmp: 1363.9,
    change1D: 0.91,
    peRatio: 28.7,
    pbRatio: 4.63,
    roe: 17.2,
    debtToEquity: 0.67,
    revenueGrowthYoy: 22.1,
    dividendYield: 0.51,
    isin: "INE742F01042",
    description:
      "India's largest private port operator with 13 ports. Logistics corridor and inland container depot network. Foreign cargo mix improving EBITDA margins.",
    headquarters: "Ahmedabad, Gujarat",
    founded: 1998,
    employees: "15,000+",
    tags: ["Large Cap", "Infrastructure", "Ports", "Logistics", "Adani Group"],
  },
  {
    ticker: "BAJFINANCE",
    name: "Bajaj Finance Ltd.",
    exchange: "BSE/NSE",
    sector: "Banking & Financial Services",
    industry: "Non-Banking Finance",
    marketCapCr: 430000,
    cmp: 6983.2,
    change1D: -0.72,
    peRatio: 27.4,
    pbRatio: 5.68,
    roe: 22.4,
    debtToEquity: null,
    revenueGrowthYoy: 28.7,
    dividendYield: 0.42,
    isin: "INE296A01024",
    description:
      "India's most profitable NBFC. Consumer finance, SME, and rural franchise driving AUM growth. Transition to deposits book is credit positive long-term.",
    headquarters: "Pune, Maharashtra",
    founded: 1987,
    employees: "50,000+",
    tags: ["Large Cap", "NBFC", "Consumer Finance", "Rural", "High ROE"],
  },
  {
    ticker: "TATAPOWER",
    name: "Tata Power Company Ltd.",
    exchange: "BSE/NSE",
    sector: "Utilities",
    industry: "Power Generation & Transmission",
    marketCapCr: 130000,
    cmp: 406.7,
    change1D: 1.89,
    peRatio: 38.2,
    pbRatio: 5.14,
    roe: 14.3,
    debtToEquity: 1.14,
    revenueGrowthYoy: 16.4,
    dividendYield: 0.45,
    isin: "INE245A01021",
    description:
      "India's integrated power utility with 14 GW capacity. Renewable energy transition via solar EPC and rooftop solar (Tata Power Solar). EV charging roll-out.",
    headquarters: "Mumbai, Maharashtra",
    founded: 1919,
    employees: "14,000+",
    tags: ["Mid Cap", "Renewable", "Solar", "EV Charging", "Clean Energy"],
  },
  {
    ticker: "DMART",
    name: "Avenue Supermarts Ltd. (DMart)",
    exchange: "BSE/NSE",
    sector: "Consumer Staples",
    industry: "Retail",
    marketCapCr: 265000,
    cmp: 4085.1,
    change1D: 0.13,
    peRatio: 82.3,
    pbRatio: 13.9,
    roe: 18.2,
    debtToEquity: 0.11,
    revenueGrowthYoy: 17.6,
    dividendYield: null,
    isin: "INE192R01011",
    description:
      "India's highest-quality retail compounder. Owned-store model with industry-leading SSSG. Quick commerce (DMart Ready) scale-up weighing on near-term ROE.",
    headquarters: "Mumbai, Maharashtra",
    founded: 2002,
    employees: "12,000+",
    tags: ["Large Cap", "Retail", "SSSG", "Compounder", "No Debt"],
  },
  {
    ticker: "NESTLEIND",
    name: "Nestle India Ltd.",
    exchange: "BSE/NSE",
    sector: "Consumer Staples",
    industry: "Food & Beverages",
    marketCapCr: 220000,
    cmp: 2281.6,
    change1D: -0.34,
    peRatio: 63.8,
    pbRatio: 71.2,
    roe: 120.8,
    debtToEquity: 0.0,
    revenueGrowthYoy: 9.4,
    dividendYield: 1.54,
    isin: "INE239A01016",
    description:
      "India's highest-ROE consumer company. Maggi (noodles), KitKat, Munch, Milkmaid -- all No. 1 market leaders. Rural distribution expansion underway.",
    headquarters: "Gurugram, Haryana",
    founded: 1959,
    employees: "8,500+",
    tags: ["Large Cap", "FMCG", "Premium Brand", "Dividend", "Debt Free"],
  },
  {
    ticker: "POLYCAB",
    name: "Polycab India Ltd.",
    exchange: "BSE/NSE",
    sector: "Industrials",
    industry: "Cables & Wires",
    marketCapCr: 82000,
    cmp: 5407.9,
    change1D: 2.77,
    peRatio: 42.6,
    pbRatio: 8.94,
    roe: 23.1,
    debtToEquity: 0.03,
    revenueGrowthYoy: 19.3,
    dividendYield: 0.56,
    isin: "INE455K01017",
    description:
      "India's largest cables & wires manufacturer. Expanding into FMEG (fans, lights, switches). PLI and infrastructure capex tailwind through FY27.",
    headquarters: "Mumbai, Maharashtra",
    founded: 1996,
    employees: "20,000+",
    tags: ["Mid Cap", "Infrastructure", "PLI", "FMEG", "High Growth"],
  },
  {
    ticker: "MARICO",
    name: "Marico Ltd.",
    exchange: "BSE/NSE",
    sector: "Consumer Staples",
    industry: "FMCG -- Personal Care",
    marketCapCr: 78000,
    cmp: 604.4,
    change1D: -0.51,
    peRatio: 47.9,
    pbRatio: 13.8,
    roe: 30.5,
    debtToEquity: 0.0,
    revenueGrowthYoy: 5.8,
    dividendYield: 1.52,
    isin: "INE196A01026",
    description:
      "Parachute coconut oil market leader with Foods (Saffola) pivot. International business scaling in MENA and SEA. Premium D2C brands (True Roots, Beardo).",
    headquarters: "Mumbai, Maharashtra",
    founded: 1990,
    employees: "8,000+",
    tags: ["Mid Cap", "FMCG", "D2C", "International", "Dividend"],
  },
  {
    ticker: "IRCTC",
    name: "Indian Railway Catering and Tourism Corporation Ltd.",
    exchange: "BSE/NSE",
    sector: "Travel & Tourism",
    industry: "Rail Catering & Ticketing",
    marketCapCr: 70000,
    cmp: 879.6,
    change1D: 0.63,
    peRatio: 52.4,
    pbRatio: 17.8,
    roe: 36.9,
    debtToEquity: 0.0,
    revenueGrowthYoy: 14.7,
    dividendYield: 1.02,
    isin: "INE335Y01020",
    description:
      "PSU monopoly on Indian Railways online ticketing, catering and tourism. 80%+ digital ticket market share. High-margin internet ticketing convenience fee is a moat.",
    headquarters: "New Delhi",
    founded: 1999,
    employees: "1,400+",
    tags: ["Mid Cap", "PSU", "Monopoly", "Tourism", "High ROE"],
  },
];

const SECTORS = [
  "All Sectors",
  "Information Technology",
  "Banking & Financial Services",
  "Healthcare & Pharma",
  "Energy & Petrochemicals",
  "Consumer Staples",
  "Telecommunications",
  "Consumer Internet",
  "Infrastructure",
  "Industrials",
  "Utilities",
  "Travel & Tourism",
  "Consumer Electronics",
];

const EXCHANGES = ["All Exchanges", "BSE", "NSE", "BSE/NSE"];

const MARKET_CAP_FILTERS = [
  { label: "All", min: 0, max: Infinity },
  { label: "Large Cap (>20,000 Cr)", min: 20000, max: Infinity },
  { label: "Mid Cap (5,000-20,000 Cr)", min: 5000, max: 20000 },
  { label: "Small Cap (<5,000 Cr)", min: 0, max: 5000 },
];

const formatCr = (v: number): string => {
  if (v >= 100000) return `Rs.${(v / 100000).toFixed(1)}L Cr`;
  if (v >= 1000) return `Rs.${(v / 1000).toFixed(1)}k Cr`;
  return `Rs.${v.toFixed(0)} Cr`;
};

const num = (v: number | null, decimals = 1): string =>
  v != null ? v.toFixed(decimals) : "--";

// ─── Change Badge ─────────────────────────────────────────────────────────────

function ChangeBadge({ value }: { value: number }) {
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold text-xs">
        <ArrowUpRight className="w-3 h-3" />
        {value.toFixed(2)}%
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-rose-500 font-semibold text-xs">
        <ArrowDownRight className="w-3 h-3" />
        {Math.abs(value).toFixed(2)}%
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-slate-400 font-semibold text-xs">
      <Minus className="w-3 h-3" />
      0.00%
    </span>
  );
}

// ─── Detail Sidebar ───────────────────────────────────────────────────────────

function CompanyDetailSidebar({
  company,
  onClose,
  onLaunch,
}: {
  company: ScreenerCompany;
  onClose: () => void;
  onLaunch: () => void;
}) {
  const metrics = [
    { label: "CMP", value: `Rs.${company.cmp.toLocaleString("en-IN")}` },
    { label: "Market Cap", value: formatCr(company.marketCapCr) },
    { label: "P/E Ratio", value: num(company.peRatio) },
    { label: "P/B Ratio", value: num(company.pbRatio) },
    { label: "ROE", value: company.roe != null ? `${company.roe.toFixed(1)}%` : "--" },
    {
      label: "Revenue Growth YoY",
      value: company.revenueGrowthYoy != null
        ? `${company.revenueGrowthYoy >= 0 ? "+" : ""}${company.revenueGrowthYoy.toFixed(1)}%`
        : "--",
    },
    {
      label: "Debt / Equity",
      value: company.debtToEquity != null ? company.debtToEquity.toFixed(2) : "--",
    },
    {
      label: "Dividend Yield",
      value: company.dividendYield != null ? `${company.dividendYield.toFixed(2)}%` : "--",
    },
    { label: "ISIN", value: company.isin },
    { label: "Exchange", value: company.exchange },
    { label: "Headquarters", value: company.headquarters },
    { label: "Employees", value: company.employees },
  ];

  const roeStrength =
    company.roe != null
      ? company.roe >= 20 ? "strong" : company.roe >= 10 ? "moderate" : "weak"
      : null;

  const debtRisk =
    company.debtToEquity != null
      ? company.debtToEquity >= 1.5 ? "high" : company.debtToEquity >= 0.5 ? "moderate" : "low"
      : null;

  const growthMomentum =
    company.revenueGrowthYoy != null
      ? company.revenueGrowthYoy >= 15 ? "strong"
        : company.revenueGrowthYoy >= 5 ? "moderate"
        : company.revenueGrowthYoy >= 0 ? "slow"
        : "declining"
      : null;

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative ml-auto w-[460px] max-w-[95vw] h-full bg-[#FAFAF8] border-l border-[#E2DFD6] flex flex-col shadow-2xl overflow-hidden"
        style={{ animation: "slideInRight 0.26s cubic-bezier(0.32,0.72,0,1) both" }}
      >
        {/* Header */}
        <div className="shrink-0 bg-[#1A1917] text-white px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold bg-amber-400 text-amber-950 px-2 py-0.5 rounded-full tracking-wide">
                  {company.ticker}
                </span>
                <span className="text-[10px] text-white/50 font-medium">{company.exchange}</span>
              </div>
              <h2 className="text-base font-black leading-tight text-white truncate pr-6">
                {company.name}
              </h2>
              <p className="text-xs text-white/50 mt-0.5">{company.sector} · {company.industry}</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-baseline gap-3 mt-3">
            <span className="text-2xl font-black text-white">
              Rs.{company.cmp.toLocaleString("en-IN")}
            </span>
            <ChangeBadge value={company.change1D} />
            <span className="ml-auto text-xs text-white/40 font-medium">{formatCr(company.marketCapCr)}</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Description */}
          <div className="px-5 py-4 border-b border-[#E2DFD6]">
            <p className="text-xs text-[#4A4844] leading-relaxed">{company.description}</p>
            {company.founded && (
              <p className="text-[10px] text-[#9A9590] mt-2 font-medium">
                Founded {company.founded} · {company.headquarters}
              </p>
            )}
          </div>

          {/* Signals */}
          <div className="px-5 py-4 border-b border-[#E2DFD6]">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#9A9590] mb-3">Analyst Signals</h3>
            <div className="flex flex-wrap gap-2">
              {roeStrength && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full ${roeStrength === "strong" ? "bg-emerald-100 text-emerald-700" : roeStrength === "moderate" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-600"}`}>
                  <Activity className="w-3 h-3" />
                  ROE {roeStrength === "strong" ? "Strong" : roeStrength === "moderate" ? "Moderate" : "Weak"}
                </span>
              )}
              {debtRisk && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full ${debtRisk === "low" ? "bg-emerald-100 text-emerald-700" : debtRisk === "moderate" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-600"}`}>
                  <ShieldCheck className="w-3 h-3" />
                  Debt {debtRisk === "low" ? "Conservative" : debtRisk === "moderate" ? "Moderate" : "High Leverage"}
                </span>
              )}
              {growthMomentum && (
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full ${growthMomentum === "strong" ? "bg-emerald-100 text-emerald-700" : growthMomentum === "moderate" ? "bg-blue-100 text-blue-700" : growthMomentum === "slow" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-600"}`}>
                  {growthMomentum === "strong" || growthMomentum === "moderate" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  Revenue {growthMomentum === "strong" ? "Accelerating" : growthMomentum === "moderate" ? "Growing" : growthMomentum === "slow" ? "Slow Growth" : "Declining"}
                </span>
              )}
              {company.debtToEquity === 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                  <ShieldCheck className="w-3 h-3" />Debt Free
                </span>
              )}
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="px-5 py-4 border-b border-[#E2DFD6]">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#9A9590] mb-3">Key Metrics</h3>
            <div className="grid grid-cols-2 gap-2">
              {metrics.map((m) => (
                <div key={m.label} className="bg-white border border-[#E6E3DC] rounded-xl px-3 py-2.5">
                  <p className="text-[9px] text-[#9A9590] font-semibold uppercase tracking-wide">{m.label}</p>
                  <p className="text-xs font-bold text-[#1A1917] mt-0.5 truncate">{m.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="px-5 py-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#9A9590] mb-3">Classification Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {company.tags.map((tag) => (
                <span key={tag} className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-[#1A1917]/5 text-[#4A4844] border border-[#E2DFD6]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="shrink-0 p-4 border-t border-[#E2DFD6] bg-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1 text-xs text-[#7A7569]">
              <p className="font-semibold text-[#1A1917] text-sm">{company.name}</p>
              <p className="text-[10px] mt-0.5">Launch a full institutional research note. AI fetches BSE/NSE filings, builds DCF model and synthesis.</p>
            </div>
          </div>
          <button
            onClick={onLaunch}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-sm font-bold rounded-2xl shadow-sm transition-all group"
          >
            <Bot className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            Launch Deep Research Agent
            <ArrowUpRight className="w-4 h-4 opacity-60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
          <p className="text-center text-[9px] text-[#9A9590] mt-2">Sources: BSE/NSE filings only · SEBI RA compliant output</p>
        </div>
      </div>
    </aside>
  );
}

// ─── Company Card ─────────────────────────────────────────────────────────────

function CompanyCard({
  company,
  isSelected,
  isWatchlisted,
  onClick,
  onToggleWatchlist,
}: {
  company: ScreenerCompany;
  isSelected: boolean;
  isWatchlisted: boolean;
  onClick: () => void;
  onToggleWatchlist: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative flex items-center gap-3 px-4 py-3.5 rounded-2xl border cursor-pointer transition-all duration-150 select-none ${
        isSelected
          ? "bg-[#1A1917] border-[#1A1917] shadow-lg"
          : "bg-white border-[#E6E3DC] hover:border-[#C8C4BC] hover:shadow-sm hover:bg-[#FAFAF8]"
      }`}
    >
      <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-black text-xs transition-colors ${isSelected ? "bg-amber-400 text-amber-950" : "bg-[#F0EDE7] text-[#1A1917] group-hover:bg-[#E8E5DF]"}`}>
        {company.ticker.substring(0, 4)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-bold truncate ${isSelected ? "text-white" : "text-[#1A1917]"}`}>
            {company.name.replace(" Ltd.", "").replace(" Limited", "")}
          </span>
          <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${isSelected ? "bg-white/10 text-white/60" : "bg-[#F0EDE7] text-[#7A7569]"}`}>
            {company.exchange}
          </span>
        </div>
        <p className={`text-[10px] truncate mt-0.5 ${isSelected ? "text-white/50" : "text-[#9A9590]"}`}>
          {company.sector}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className={`text-sm font-black ${isSelected ? "text-white" : "text-[#1A1917]"}`}>
          Rs.{company.cmp.toLocaleString("en-IN")}
        </p>
        <ChangeBadge value={company.change1D} />
      </div>

      <div className="shrink-0 w-20 text-right hidden sm:block">
        <p className={`text-[10px] font-semibold ${isSelected ? "text-white/60" : "text-[#7A7569]"}`}>
          {formatCr(company.marketCapCr)}
        </p>
        <p className={`text-[9px] ${isSelected ? "text-white/30" : "text-[#AEAAA4]"}`}>Mkt Cap</p>
      </div>

      <button
        onClick={onToggleWatchlist}
        title={isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}
        className={`shrink-0 p-1.5 rounded-lg transition-all ${isSelected ? (isWatchlisted ? "text-amber-400 hover:text-amber-300" : "text-white/20 hover:text-amber-400") : (isWatchlisted ? "text-amber-500 hover:text-amber-600" : "text-[#C8C4BC] hover:text-amber-500 opacity-0 group-hover:opacity-100")}`}
      >
        {isWatchlisted ? <Star className="w-3.5 h-3.5 fill-current" /> : <StarOff className="w-3.5 h-3.5" />}
      </button>

      <ChevronRight className={`shrink-0 w-4 h-4 transition-transform ${isSelected ? "text-white/50 translate-x-0.5" : "text-[#C8C4BC] opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5"}`} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function StockScreener({ onLaunchResearch }: StockScreenerProps) {
  const [query, setQuery] = useState("");
  const [selectedSector, setSelectedSector] = useState("All Sectors");
  const [selectedExchange, setSelectedExchange] = useState("All Exchanges");
  const [selectedMcapIndex, setSelectedMcapIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<"marketCap" | "change1D" | "roe" | "revenueGrowth">("marketCap");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [selectedCompany, setSelectedCompany] = useState<ScreenerCompany | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [showWatchlistOnly, setShowWatchlistOnly] = useState(false);

  const mcapFilter = MARKET_CAP_FILTERS[selectedMcapIndex];

  const filtered = useMemo(() => {
    let list = [...SAMPLE_COMPANIES];
    if (showWatchlistOnly) list = list.filter((c) => watchlist.has(c.ticker));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.ticker.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.sector.toLowerCase().includes(q) ||
          c.industry.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (selectedSector !== "All Sectors") list = list.filter((c) => c.sector === selectedSector);
    if (selectedExchange !== "All Exchanges") list = list.filter((c) => c.exchange === selectedExchange || c.exchange === "BSE/NSE");
    list = list.filter((c) => c.marketCapCr >= mcapFilter.min && c.marketCapCr < mcapFilter.max);
    list.sort((a, b) => {
      let va = 0, vb = 0;
      if (sortBy === "marketCap") { va = a.marketCapCr; vb = b.marketCapCr; }
      else if (sortBy === "change1D") { va = a.change1D; vb = b.change1D; }
      else if (sortBy === "roe") { va = a.roe ?? -Infinity; vb = b.roe ?? -Infinity; }
      else if (sortBy === "revenueGrowth") { va = a.revenueGrowthYoy ?? -Infinity; vb = b.revenueGrowthYoy ?? -Infinity; }
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return list;
  }, [query, selectedSector, selectedExchange, mcapFilter, sortBy, sortDir, watchlist, showWatchlistOnly]);

  const handleSort = useCallback((col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(col); setSortDir("desc"); }
  }, [sortBy]);

  const handleToggleWatchlist = useCallback((e: React.MouseEvent, ticker: string) => {
    e.stopPropagation();
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }, []);

  const handleLaunch = useCallback(() => {
    if (!selectedCompany) return;
    onLaunchResearch({ name: selectedCompany.name, ticker: selectedCompany.ticker });
    setSelectedCompany(null);
  }, [selectedCompany, onLaunchResearch]);

  const SortBtn = ({ col, label }: { col: typeof sortBy; label: string }) => (
    <button
      onClick={() => handleSort(col)}
      className={`flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${sortBy === col ? "bg-[#1A1917] text-white" : "text-[#7A7569] hover:bg-[#E2DFD6]"}`}
    >
      {label}
      {sortBy === col ? (sortDir === "desc" ? <TrendingDown className="w-3 h-3 ml-0.5" /> : <TrendingUp className="w-3 h-3 ml-0.5" />) : <Minus className="w-3 h-3 ml-0.5 opacity-30" />}
    </button>
  );

  return (
    <div className="flex flex-col h-full bg-[#F6F4EE] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-[#E2DFD6] px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#1A1917] flex items-center justify-center">
              <BarChart2 className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h1 className="text-sm font-black text-[#1A1917]">Stock Screener</h1>
              <p className="text-[10px] text-[#9A9590]">BSE · NSE — {SAMPLE_COMPANIES.length} companies indexed</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowWatchlistOnly((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${showWatchlistOnly ? "bg-amber-400 border-amber-400 text-amber-950" : "bg-white border-[#E2DFD6] text-[#7A7569] hover:border-[#C8C4BC]"}`}
            >
              <Star className="w-3 h-3" />
              Watchlist {watchlist.size > 0 && `(${watchlist.size})`}
            </button>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${showFilters ? "bg-[#1A1917] border-[#1A1917] text-white" : "bg-white border-[#E2DFD6] text-[#7A7569] hover:border-[#C8C4BC]"}`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              Filters
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9A9590]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company name, ticker, sector, or tag..."
            className="w-full pl-8 pr-8 py-2.5 text-xs bg-[#F6F4EE] border border-[#E2DFD6] rounded-xl text-[#1A1917] placeholder-[#AEAAA4] focus:outline-none focus:ring-2 focus:ring-[#1A1917]/20 focus:border-[#1A1917]/40 transition-all"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9A9590] hover:text-[#1A1917]">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              { label: "Sector", value: selectedSector, onChange: setSelectedSector, opts: SECTORS },
              { label: "Exchange", value: selectedExchange, onChange: setSelectedExchange, opts: EXCHANGES },
            ] as const).map(({ label, value, onChange, opts }) => (
              <div key={label}>
                <label className="text-[9px] font-bold uppercase tracking-wider text-[#9A9590] mb-1 block">{label}</label>
                <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full text-xs py-2 px-2.5 rounded-xl border border-[#E2DFD6] bg-white text-[#1A1917] focus:outline-none focus:ring-2 focus:ring-[#1A1917]/20">
                  {opts.map((o) => <option key={o}>{o}</option>)}
                </select>
              </div>
            ))}
            <div>
              <label className="text-[9px] font-bold uppercase tracking-wider text-[#9A9590] mb-1 block">Market Cap</label>
              <select value={selectedMcapIndex} onChange={(e) => setSelectedMcapIndex(Number(e.target.value))} className="w-full text-xs py-2 px-2.5 rounded-xl border border-[#E2DFD6] bg-white text-[#1A1917] focus:outline-none focus:ring-2 focus:ring-[#1A1917]/20">
                {MARKET_CAP_FILTERS.map((f, i) => <option key={f.label} value={i}>{f.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Sort */}
        <div className="flex items-center gap-1 mt-3">
          <span className="text-[9px] text-[#9A9590] font-semibold uppercase tracking-wider mr-1">Sort:</span>
          <SortBtn col="marketCap" label="Mkt Cap" />
          <SortBtn col="change1D" label="1D Change" />
          <SortBtn col="roe" label="ROE" />
          <SortBtn col="revenueGrowth" label="Rev Growth" />
          <span className="ml-auto text-[10px] text-[#9A9590]">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Globe className="w-8 h-8 text-[#C8C4BC] mb-2" />
            <p className="text-sm font-bold text-[#4A4844]">No companies found</p>
            <p className="text-xs text-[#9A9590] mt-1">Try adjusting your filters or search query.</p>
            <button
              onClick={() => { setQuery(""); setSelectedSector("All Sectors"); setSelectedExchange("All Exchanges"); setSelectedMcapIndex(0); setShowWatchlistOnly(false); }}
              className="mt-3 flex items-center gap-1.5 text-xs text-[#7A7569] hover:text-[#1A1917] font-semibold transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset all filters
            </button>
          </div>
        ) : (
          filtered.map((company) => (
            <CompanyCard
              key={company.ticker}
              company={company}
              isSelected={selectedCompany?.ticker === company.ticker}
              isWatchlisted={watchlist.has(company.ticker)}
              onClick={() => setSelectedCompany((prev) => prev?.ticker === company.ticker ? null : company)}
              onToggleWatchlist={(e) => handleToggleWatchlist(e, company.ticker)}
            />
          ))
        )}
      </div>

      {/* Sidebar */}
      {selectedCompany && (
        <CompanyDetailSidebar
          company={selectedCompany}
          onClose={() => setSelectedCompany(null)}
          onLaunch={handleLaunch}
        />
      )}
    </div>
  );
}

"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  BarChart3,
  Sparkles,
  Bot,
  Search,
  LogOut,
  FileText,
  Key,
  Settings,
  User,
  Building2,
  Shield,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { PersonaType, UserSessionProfile } from "./types";

interface HeaderNavProps {
  currentPersona: PersonaType;
  onPersonaChange: (persona: PersonaType) => void;
  activeViewMode: "report" | "agent";
  onViewModeChange: (mode: "report" | "agent") => void;
  activeCompanyName?: string;
  activeTicker?: string;
  onOpenNewResearch: () => void;
  user: UserSessionProfile | null;
  onSignOut: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  hasActiveReport: boolean;
  onOpenSignoff?: () => void;
  activeReportStatus?: string;
}

export function HeaderNav({
  currentPersona,
  onPersonaChange,
  activeViewMode,
  onViewModeChange,
  onOpenNewResearch,
  user,
  onSignOut,
  searchQuery,
  onSearchChange,
}: HeaderNavProps) {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Get user initials for avatar
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "EQ";

  return (
    <header className="h-[68px] w-full bg-[#FFFFFF] border-b border-[#E3DFD5] px-6 flex items-center justify-between text-[#1A1917] shrink-0 z-30 select-none shadow-2xs">
      {/* ── Left: Brand & Primary Mode / Persona Switchers ──────────────── */}
      <div className="flex items-center gap-5">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#1A1917] flex items-center justify-center text-white shadow-sm">
            <BarChart3 className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-extrabold tracking-tight text-[#1A1917]">EquiGen</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F1EFEA] text-[#7A7569] border border-[#E3DFD5] tracking-wider uppercase">
              PRO
            </span>
          </div>
        </div>

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-[#E3DFD5]" />

        {/* ── 2 Individual Togglable Sections: Report & Agent ────────── */}
        <div className="flex items-center bg-[#F4F1EA] p-1 rounded-xl border border-[#E2DFD6] text-xs font-semibold shadow-2xs">
          <button
            onClick={() => onViewModeChange("report")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all ${
              activeViewMode === "report"
                ? "bg-[#1A1917] text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
            title="Switch to complete equity research report view"
          >
            <FileText className="w-4 h-4" />
            <span>Report</span>
          </button>

          <button
            onClick={() => onViewModeChange("agent")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg transition-all ${
              activeViewMode === "agent"
                ? "bg-[#1A1917] text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
            title="Switch to complete ChatGPT-style AI agent and reprompt page"
          >
            <Bot className="w-4 h-4 text-amber-500" />
            <span>Agent</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          </button>
        </div>

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-[#E3DFD5]" />

        {/* Persona Switcher (Segmented Control for Report views) */}
        <div className="flex items-center bg-[#F4F1EA] p-1 rounded-xl border border-[#E2DFD6] text-xs font-semibold">
          <button
            onClick={() => onPersonaChange("buyside")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentPersona === "buyside"
                ? "bg-[#1A1917] text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
          >
            Buy-Side
          </button>

          <button
            onClick={() => onPersonaChange("sellside")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentPersona === "sellside"
                ? "bg-[#1A1917] text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
          >
            Sell-Side
          </button>

          <button
            onClick={() => onPersonaChange("individual")}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              currentPersona === "individual"
                ? "bg-[#1A1917] text-white font-bold shadow-xs"
                : "text-[#6E695E] hover:text-[#1A1917]"
            }`}
          >
            Individual
          </button>
        </div>
      </div>

      {/* ── Center: Search Bar ────────────────────────────────────────────── */}
      <div className="hidden lg:flex items-center max-w-sm w-full mx-4">
        <div className="relative w-full">
          <Search className="w-4 h-4 text-[#8C877D] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search company, ticker, or filing..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-10 bg-[#FAF8F5] border border-[#E0DCD3] rounded-xl pl-10 pr-12 text-xs text-[#1A1917] placeholder-[#8C877D] focus:outline-none focus:border-[#1A1917] focus:bg-white transition-all shadow-2xs"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#8C877D] bg-[#EFECE6] px-1.5 py-0.5 rounded border border-[#DDD9CE]">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* ── Right: New Research & Profile ─────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Primary Action Button: + New Research */}
        <button
          onClick={onOpenNewResearch}
          className="h-10 flex items-center gap-2 px-4 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-xs font-bold rounded-xl shadow-xs active:scale-[0.98] transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span>New Research</span>
        </button>

        {/* Vertical Divider */}
        <div className="h-6 w-px bg-[#E3DFD5]" />

        {/* Interactive User Avatar & Profile Dropdown */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className={`h-10 flex items-center gap-2.5 px-3 rounded-xl border transition-all cursor-pointer ${
              isProfileOpen
                ? "bg-[#1A1917] text-white border-[#1A1917] shadow-xs"
                : "bg-[#FAF8F5] hover:bg-[#F2EFE8] text-[#1A1917] border-[#E0DCD3] hover:border-[#1A1917] shadow-2xs"
            }`}
            title="User Profile, Analyst Settings & LLM API Keys"
          >
            <div
              className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center transition-colors ${
                isProfileOpen
                  ? "bg-white text-[#1A1917]"
                  : "bg-[#1A1917] text-white"
              }`}
            >
              {initials}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold leading-tight truncate max-w-[120px]">
                {user?.name || "Pallavi Kumari"}
              </span>
              <span
                className={`text-[10px] font-medium leading-none mt-0.5 ${
                  isProfileOpen ? "text-zinc-300" : "text-[#7A7569]"
                }`}
              >
                {user?.role === "analyst" ? "Research Analyst" : user?.role || "Analyst"}
              </span>
            </div>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isProfileOpen ? "rotate-180 text-white" : "text-[#7A7569]"
              }`}
            />
          </button>

          {/* User Profile Dropdown Menu */}
          {isProfileOpen && (
            <div className="absolute right-0 top-full mt-2 w-76 bg-white rounded-2xl border border-[#E2DFD6] shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* User Profile Card Header */}
              <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EAE6DE] mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#1A1917] text-white font-black text-sm flex items-center justify-center shadow-xs">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#1A1917] truncate">
                      {user?.name || "Pallavi Kumari"}
                    </div>
                    <div className="text-[11px] text-[#7A7569] truncate">
                      {user?.email || "pallavi@equigen.ai"}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase tracking-wider">
                        {user?.role || "analyst"}
                      </span>
                      <span className="text-[10px] font-mono text-[#7A7569] font-medium truncate">
                        {user?.sebiRegNo ? `SEBI: ${user.sebiRegNo}` : "SEBI: INH000012345"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Menu Navigation Links */}
              <div className="space-y-1">
                <Link
                  href="/settings?tab=keys"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F4F1EA] text-[#1A1917] transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
                    <Key className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold flex items-center justify-between">
                      <span>Add LLM API Keys</span>
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 uppercase">
                        BYOK
                      </span>
                    </div>
                    <div className="text-[10px] text-[#7A7569] truncate">
                      Groq, OpenRouter, OpenAI credentials
                    </div>
                  </div>
                </Link>

                <Link
                  href="/settings?tab=profile"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F4F1EA] text-[#1A1917] transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-700 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold">User Settings & Profile</div>
                    <div className="text-[10px] text-[#7A7569] truncate">
                      Analyst details & SEBI registration
                    </div>
                  </div>
                </Link>

                <Link
                  href="/settings/organization"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F4F1EA] text-[#1A1917] transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold">Organization Settings</div>
                    <div className="text-[10px] text-[#7A7569] truncate">
                      Team branding, custom logo & firm info
                    </div>
                  </div>
                </Link>

                <Link
                  href="/settings?tab=compliance"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F4F1EA] text-[#1A1917] transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-700 flex items-center justify-center shrink-0">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold">Compliance Disclosures</div>
                    <div className="text-[10px] text-[#7A7569] truncate">
                      SEBI statutory guidelines & disclaimers
                    </div>
                  </div>
                </Link>
              </div>

              {/* Divider & Sign Out */}
              <div className="pt-2 mt-2 border-t border-[#EAE6DE]">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 transition-all text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

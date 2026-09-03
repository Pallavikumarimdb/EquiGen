"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Key,
  Shield,
  Building2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Save,
  LogOut,
  Cpu,
} from "lucide-react";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  sebiRegNo: string | null;
  orgName?: string;
  orgId?: string;
}

type SettingsTab = "profile" | "keys" | "compliance";

export default function UserSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("keys");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [_loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Profile Form
  const [userName, setUserName] = useState("");
  const [userSebi, setUserSebi] = useState("");

  // AI Provider & Keys State
  const [defaultProvider, setDefaultProvider] = useState("groq");
  const [defaultModel, setDefaultModel] = useState("openai/gpt-oss-120b");

  const [keysConfigured, setKeysConfigured] = useState<Record<string, boolean>>({
    groq: false,
    openrouter: false,
    openai: false,
    anthropic: false,
  });

  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({
    groq: "",
    openrouter: "",
    openai: "",
    anthropic: "",
  });

  const [showKey, setShowKey] = useState<Record<string, boolean>>({
    groq: false,
    openrouter: false,
    openai: false,
    anthropic: false,
  });

  useEffect(() => {
    fetchUserData();
    fetchKeysStatus();
  }, []);

  const fetchUserData = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setUserName(data.user.name || "");
          setUserSebi(data.user.sebiRegNo || "INH000012345");
        }
      }
    } catch {
      // Fallback demo user
      const demoUser: UserProfile = {
        id: "demo-user",
        name: "Pallavi Kumari",
        email: "pallavi@equigen.ai",
        role: "analyst",
        sebiRegNo: "INH000012345",
        orgName: "Pallavi's org",
      };
      setUser(demoUser);
      setUserName(demoUser.name);
      setUserSebi(demoUser.sebiRegNo || "");
    } finally {
      setLoading(false);
    }
  };

  const fetchKeysStatus = async () => {
    const providers = ["groq", "openrouter", "openai", "anthropic"];
    const configuredMap: Record<string, boolean> = {};

    for (const p of providers) {
      try {
        const res = await fetch(`/api/settings/keys?provider=${p}`, {
          headers: { "x-api-secret": "equigen-internal" },
        });
        if (res.ok) {
          const data = await res.json();
          configuredMap[p] = !!data.configured;
        }
      } catch {
        configuredMap[p] = false;
      }
    }
    setKeysConfigured(configuredMap);

    // Also check localStorage for client-side keys
    try {
      const localGroq = localStorage.getItem("equigen_groq_api_key");
      const localOpenai = localStorage.getItem("equigen_openai_api_key");
      const localOpenrouter = localStorage.getItem("equigen_openrouter_api_key");
      const localProvider = localStorage.getItem("equigen_ai_provider");
      const localModel = localStorage.getItem("equigen_groq_model");

      if (localProvider) setDefaultProvider(localProvider);
      if (localModel) setDefaultModel(localModel);

      setKeyInputs((prev) => ({
        ...prev,
        groq: localGroq || prev.groq,
        openai: localOpenai || prev.openai,
        openrouter: localOpenrouter || prev.openrouter,
      }));
    } catch {
      // ignore
    }
  };

  const handleSaveKey = async (provider: string) => {
    setSavingKey(provider);
    setSaveSuccess(null);
    setSaveError(null);

    const val = keyInputs[provider]?.trim() || "";

    // Save to local storage for immediate browser usage
    try {
      if (provider === "groq") localStorage.setItem("equigen_groq_api_key", val);
      if (provider === "openai") localStorage.setItem("equigen_openai_api_key", val);
      if (provider === "openrouter") localStorage.setItem("equigen_openrouter_api_key", val);
    } catch {
      // ignore
    }

    try {
      const res = await fetch("/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({ provider, apiKey: val }),
      });

      if (res.ok) {
        setKeysConfigured((prev) => ({ ...prev, [provider]: !!val }));
        setSaveSuccess(`${provider.toUpperCase()} API key saved securely.`);
        setTimeout(() => setSaveSuccess(null), 4000);
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to save key to database.");
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Error saving key");
    } finally {
      setSavingKey(null);
    }
  };

  const handleSavePreferences = () => {
    try {
      localStorage.setItem("equigen_ai_provider", defaultProvider);
      localStorage.setItem("equigen_groq_model", defaultModel);
      setSaveSuccess("AI model preferences saved successfully.");
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch {
      setSaveError("Failed to save preferences to browser storage.");
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/signout", { method: "POST" });
      window.location.href = "/signin";
    } catch {
      window.location.href = "/signin";
    }
  };

  return (
    <div className="min-h-screen bg-[#09090d] text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-white/[0.08] bg-[#111116] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Dashboard</span>
          </Link>

          <div className="h-4 w-[1px] bg-white/10" />

          <div>
            <h1 className="text-base font-bold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />
              <span>User & AI Configuration</span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Manage your analyst profile, SEBI registration credentials, and LLM inference API keys.
            </p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-white">{user.name}</div>
              <div className="text-[10px] text-slate-400">{user.orgName || "EquiGen Org"}</div>
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/30 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </header>

      {/* Main Content Body */}
      <div className="flex-1 flex max-w-6xl w-full mx-auto p-6 gap-6">
        {/* Left Settings Navigation */}
        <aside className="w-64 shrink-0 space-y-1.5">
          <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] mb-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center font-bold text-indigo-300 text-sm shadow-inner">
              {user?.name ? user.name.substring(0, 2).toUpperCase() : "AN"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-white truncate">{user?.name || "Analyst"}</div>
              <span className="inline-block mt-0.5 text-[9px] font-bold px-2 py-0.2 rounded-full uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                {user?.role || "analyst"}
              </span>
            </div>
          </div>

          {[
            { id: "keys" as const, label: "AI Providers & API Keys", icon: Key },
            { id: "profile" as const, label: "Profile & SEBI Reg", icon: User },
            { id: "compliance" as const, label: "Statutory Disclosures", icon: Shield },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                  isActive
                    ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-900/20 border border-indigo-500"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}

          {user?.role === "admin" && (
            <div className="pt-4 mt-4 border-t border-white/[0.06]">
              <Link
                href="/settings/organization"
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all"
              >
                <Building2 className="w-4 h-4 text-slate-400" />
                <span>Organization Settings</span>
              </Link>
            </div>
          )}
        </aside>

        {/* Right Settings Panel */}
        <main className="flex-1 bg-[#121217] border border-white/[0.08] rounded-2xl p-6 space-y-6 shadow-xl">
          {/* Notifications */}
          {saveSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{saveSuccess}</span>
            </div>
          )}

          {saveError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* TAB 1: AI Providers & API Keys */}
          {activeTab === "keys" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span>AI Inference Engines & API Keys</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Configure your inference credentials. EquiGen encrypts all API keys using AES-256-GCM before database storage.
                </p>
              </div>

              {/* Active Model Configuration */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-4">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Default Model Provider</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Provider</label>
                    <select
                      value={defaultProvider}
                      onChange={(e) => setDefaultProvider(e.target.value)}
                      className="w-full px-3 py-2 bg-[#16161e] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                    >
                      <option value="groq">Groq (Ultra-Low Latency LPU)</option>
                      <option value="openrouter">OpenRouter (GPT OSS 120B / DeepSeek)</option>
                      <option value="openai">OpenAI (GPT-4o / Mini)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Model Engine</label>
                    <select
                      value={defaultModel}
                      onChange={(e) => setDefaultModel(e.target.value)}
                      className="w-full px-3 py-2 bg-[#16161e] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-sans"
                    >
                      <option value="openai/gpt-oss-120b">openai/gpt-oss-120b (Primary Synthesis)</option>
                      <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Fast Analysis)</option>
                      <option value="deepseek/deepseek-chat">deepseek/deepseek-chat (Deep Financial Model)</option>
                      <option value="gpt-4o">gpt-4o (OpenAI Flagship)</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleSavePreferences}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Model Preferences</span>
                </button>
              </div>

              {/* API Keys List */}
              <div className="space-y-4">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Provider API Keys</div>

                {[
                  {
                    id: "groq",
                    name: "Groq API Key",
                    placeholder: "gsk_...",
                    desc: "Powers ultra-fast subagent planning and document table extraction.",
                  },
                  {
                    id: "openrouter",
                    name: "OpenRouter API Key",
                    placeholder: "sk-or-...",
                    desc: "Powers GPT-OSS-120B institutional report generation and sector syntheses.",
                  },
                  {
                    id: "openai",
                    name: "OpenAI API Key",
                    placeholder: "sk-proj-...",
                    desc: "Powers GPT-4o financial modeling fallback and embeddings.",
                  },
                ].map((item) => (
                  <div key={item.id} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white flex items-center gap-2">
                        {item.name}
                        {keysConfigured[item.id] ? (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                            Configured
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-400">
                            Not Set
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-500">AES-256-GCM Encrypted</span>
                    </div>

                    <p className="text-[11px] text-slate-400">{item.desc}</p>

                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showKey[item.id] ? "text" : "password"}
                          value={keyInputs[item.id] || ""}
                          onChange={(e) =>
                            setKeyInputs((prev) => ({ ...prev, [item.id]: e.target.value }))
                          }
                          placeholder={keysConfigured[item.id] ? "••••••••••••••••••••••••" : item.placeholder}
                          className="w-full px-3 py-2 pr-10 bg-[#16161e] border border-white/10 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                        >
                          {showKey[item.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <button
                        onClick={() => handleSaveKey(item.id)}
                        disabled={savingKey === item.id}
                        className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 shrink-0"
                      >
                        {savingKey === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>Save Key</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: User Profile & Credentials */}
          {activeTab === "profile" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  <span>Analyst Profile & Credentials</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Your identity as it appears on official institutional equity research reports.
                </p>
              </div>

              <div className="space-y-4 max-w-lg">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={user?.email || "pallavi@equigen.ai"}
                    className="w-full px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-slate-400 opacity-75"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
                    SEBI Research Analyst Registration Number
                  </label>
                  <input
                    type="text"
                    value={userSebi}
                    onChange={(e) => setUserSebi(e.target.value)}
                    placeholder="INH000012345"
                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    Printed automatically on Page 1 & Page 4 of all compiled PDF equity research reports.
                  </span>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">Organization</label>
                  <input
                    type="text"
                    disabled
                    value={user?.orgName || "Pallavi's org"}
                    className="w-full px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-slate-400 opacity-75"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Statutory Disclosures */}
          {activeTab === "compliance" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-bold text-white flex items-center gap-2">
                  <Shield className="w-4 h-4 text-indigo-400" />
                  <span>SEBI Compliance & Disclosure Templates</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Configure statutory disclaimers and rating scales under SEBI (Research Analysts) Regulations, 2014.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">Statutory Warning Notice</div>
                <p className="text-xs text-slate-300 font-mono bg-black/50 p-3 rounded-lg border border-white/5 leading-relaxed">
                  &quot;Investments in securities market are subject to market risks. Read all the related documents carefully before investing. Registration granted by SEBI and certification from NISM in no way guarantee performance of the intermediary or provide any assurance of returns to investors.&quot;
                </p>
                <div className="text-[10px] text-slate-500">
                  Enforced on all published research documents per SEBI Master Circular 2024.
                </div>
              </div>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">12-Month Rating Horizon Scale</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold">
                    BUY (&gt;15%)
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-emerald-300 font-bold">
                    ACCUMULATE (5-15%)
                  </div>
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold">
                    HOLD (-5% to +5%)
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-300 font-bold">
                    REDUCE (-5% to -15%)
                  </div>
                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 font-bold">
                    SELL (&lt;-15%)
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

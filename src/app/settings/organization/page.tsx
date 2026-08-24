"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus, Shield, Palette, Key, Users, CheckCircle, XCircle, Loader2 } from "lucide-react";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  sebiRegNo: string | null;
  createdAt: string;
}

interface OrgDetails {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
}

export default function OrganizationSettingsPage() {
  const [activeTab, setActiveTab] = useState<"team" | "branding" | "keys">("team");
  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [currentUser, setCurrentUser] = useState<TeamMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Branding Form State
  const [orgName, setOrgName] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0f172a");
  const [accentColor, setAccentColor] = useState("#10b981");

  // New User Form State
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("analyst");
  const [newUserSebi, setNewUserSebi] = useState("");

  // Keys Config State
  const [groqConfigured, setGroqConfigured] = useState(false);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [groqKeyInput, setGroqKeyInput] = useState("");
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    setError("");
    try {
      // 1. Fetch Me details to confirm role
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        throw new Error("Failed to authenticate session.");
      }
      const meData = await meRes.json();
      setCurrentUser(meData.user);

      // 2. Fetch Organization and User details
      const orgRes = await fetch("/api/settings/org");
      if (!orgRes.ok) {
        throw new Error("Failed to fetch organization settings.");
      }
      const orgData = await orgRes.json();
      setOrg(orgData.org);
      setUsers(orgData.users);
      setOrgName(orgData.org.name);
      setPrimaryColor(orgData.org.primaryColor || "#0f172a");
      setAccentColor(orgData.org.accentColor || "#10b981");

      // 3. Fetch API Key configurations
      const groqRes = await fetch("/api/settings/keys?provider=groq");
      const openaiRes = await fetch("/api/settings/keys?provider=openai");

      if (groqRes.ok) {
        const data = await groqRes.json();
        setGroqConfigured(data.configured);
      }
      if (openaiRes.ok) {
        const data = await openaiRes.json();
        setOpenaiConfigured(data.configured);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/settings/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateBranding",
          name: orgName,
          primaryColor,
          accentColor,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update branding.");
      
      setOrg(data.org);
      setSuccess("Branding settings updated successfully!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/settings/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addUser",
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
          sebiRegNo: newUserRole === "reviewer" ? newUserSebi : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to add user.");

      // Refresh user list
      setUsers([...users, data.user]);
      setSuccess(`Team member ${newUserName} added successfully!`);
      
      // Reset form
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("analyst");
      setNewUserSebi("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveKey = async (provider: "groq" | "openai", key: string) => {
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey: key,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Failed to update ${provider} key.`);

      if (provider === "groq") {
        setGroqConfigured(!!key);
        setGroqKeyInput("");
      } else {
        setOpenaiConfigured(!!key);
        setOpenaiKeyInput("");
      }

      setSuccess(`${provider.toUpperCase()} API key updated securely.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-400" />
          <p className="text-slate-400 text-sm">Loading Administration Settings...</p>
        </div>
      </div>
    );
  }

  // Gate the entire page for admin role
  if (currentUser && currentUser.role !== "admin") {
    return (
      <div className="min-h-screen bg-[#090d16] flex items-center justify-center p-6 text-slate-100">
        <div className="max-w-md w-full bg-slate-900/50 backdrop-blur-xl border border-rose-500/20 p-8 rounded-3xl text-center shadow-xl">
          <XCircle className="w-16 h-16 text-rose-500 mx-auto mb-4 animate-pulse" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 mb-6 text-sm">
            Only Organization Administrators have permission to manage team accounts, custom branding parameters, and API configuration.
          </p>
          <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm transition-all font-medium">
            <ArrowLeft className="w-4 h-4" /> Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans">
      {/* Header Banner */}
      <header className="border-b border-white/10 bg-slate-900/20 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 bg-slate-850 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-white">Organization Settings</h1>
            <p className="text-xs text-slate-400">{org?.name} · Administrative Console</p>
          </div>
        </div>
        <div className="text-xs font-semibold px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400">
          Admin Session
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 md:p-8 grid grid-cols-1 md:grid-cols-4 gap-8">
        
        {/* Navigation Sidebar */}
        <aside className="md:col-span-1 flex flex-col gap-2">
          <button
            onClick={() => setActiveTab("team")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${activeTab === "team" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
          >
            <Users className="w-4 h-4" /> Team Management
          </button>
          <button
            onClick={() => setActiveTab("branding")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${activeTab === "branding" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
          >
            <Palette className="w-4 h-4" /> Branding & Theme
          </button>
          <button
            onClick={() => setActiveTab("keys")}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all text-left ${activeTab === "keys" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"}`}
          >
            <Key className="w-4 h-4" /> API Keys (BYOK)
          </button>
        </aside>

        {/* Tab Detail Component */}
        <section className="md:col-span-3 flex flex-col gap-6">
          
          {/* Notifications Banner */}
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-sm flex items-start gap-2.5">
              <XCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-300 text-sm flex items-start gap-2.5">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* TEAM MANAGEMENT TAB */}
          {activeTab === "team" && (
            <div className="flex flex-col gap-6">
              
              {/* Add User Card */}
              <div className="bg-slate-900/30 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                  <UserPlus className="w-4 h-4 text-emerald-400" /> Add Team Member
                </h2>
                <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Full Name</label>
                    <input
                      type="text"
                      placeholder="Jane Analyst"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="px-4 py-2.5 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Email Address</label>
                    <input
                      type="email"
                      placeholder="jane@company.com"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="px-4 py-2.5 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Default Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                      className="px-4 py-2.5 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all"
                      required
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      className="px-4 py-2.5 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="analyst" className="bg-slate-900">Equity Analyst</option>
                      <option value="reviewer" className="bg-slate-900">Registered Analyst (RA)</option>
                      <option value="admin" className="bg-slate-900">Admin</option>
                    </select>
                  </div>

                  {newUserRole === "reviewer" && (
                    <div className="md:col-span-2 flex flex-col gap-1.5 animate-fadeIn">
                      <label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">SEBI Registration Number</label>
                      <input
                        type="text"
                        placeholder="INH123456789"
                        value={newUserSebi}
                        onChange={(e) => setNewUserSebi(e.target.value.toUpperCase())}
                        className="px-4 py-2.5 bg-emerald-500/5 border border-emerald-500/25 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all"
                        required={newUserRole === "reviewer"}
                      />
                    </div>
                  )}

                  <div className="md:col-span-2 mt-2">
                    <button type="submit" className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-all">
                      Create User Account
                    </button>
                  </div>
                </form>
              </div>

              {/* Members List Table */}
              <div className="bg-slate-900/30 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                  <Shield className="w-4 h-4 text-emerald-400" /> Active Team Members
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-white/5 text-slate-400 font-semibold">
                        <th className="pb-3 text-[11px] uppercase tracking-wider">Name</th>
                        <th className="pb-3 text-[11px] uppercase tracking-wider">Email</th>
                        <th className="pb-3 text-[11px] uppercase tracking-wider">Role</th>
                        <th className="pb-3 text-[11px] uppercase tracking-wider">SEBI Reg No</th>
                        <th className="pb-3 text-[11px] uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {users.map((member) => (
                        <tr key={member.id} className="text-slate-300 hover:bg-white/2 transition-colors">
                          <td className="py-3.5 font-medium text-white">{member.name}</td>
                          <td className="py-3.5">{member.email}</td>
                          <td className="py-3.5 capitalize">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${member.role === "admin" ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-400" : member.role === "reviewer" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-slate-500/10 border-slate-500/20 text-slate-400"}`}>
                              {member.role}
                            </span>
                          </td>
                          <td className="py-3.5 font-mono text-xs">{member.sebiRegNo || "—"}</td>
                          <td className="py-3.5 text-xs text-slate-400">
                            {new Date(member.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* BRANDING TAB */}
          {activeTab === "branding" && (
            <div className="bg-slate-900/30 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
                <Palette className="w-4 h-4 text-emerald-400" /> Branding Parameters
              </h2>
              <p className="text-slate-400 text-xs mb-6">
                Define organization parameters. Theme colors will customize the header accents and SVG combo charts on generated PDF reports and Excel workbooks.
              </p>
              
              <form onSubmit={handleUpdateBranding} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Organization / Corporate Name</label>
                  <input
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className="px-4 py-2.5 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Primary Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="w-12 h-10 bg-transparent border-0 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 px-4 py-2 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Accent / Highlight Color</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-12 h-10 bg-transparent border-0 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="flex-1 px-4 py-2 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <button type="submit" className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-all">
                    Save Branding Configurations
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* API KEYS TAB */}
          {activeTab === "keys" && (
            <div className="flex flex-col gap-6">
              
              {/* Groq Key Configuration */}
              <div className="bg-slate-900/30 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    ⚡ Groq API Key Configuration
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${groqConfigured ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                    {groqConfigured ? "Configured" : "Not Configured"}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mb-4">
                  Requires a valid `gsk_` token. Scoped organization-wide, used by LangGraph for Llama-3.3 financials extraction nodes.
                </p>
                <div className="flex gap-3">
                  <input
                    type="password"
                    placeholder={groqConfigured ? "••••••••••••••••••••••••••••••••" : "Paste your Groq API Key here"}
                    value={groqKeyInput}
                    onChange={(e) => setGroqKeyInput(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all"
                  />
                  <button
                    onClick={() => handleSaveKey("groq", groqKeyInput)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all border border-white/10"
                  >
                    Save Key
                  </button>
                </div>
              </div>

              {/* OpenAI Key Configuration */}
              <div className="bg-slate-900/30 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    🔑 OpenAI API Key Configuration
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${openaiConfigured ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"}`}>
                    {openaiConfigured ? "Configured" : "Not Configured"}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mb-4">
                  Requires a valid `sk-` token. Used for fallback extraction models (GPT-4o mini) or image-based visual parsing.
                </p>
                <div className="flex gap-3">
                  <input
                    type="password"
                    placeholder={openaiConfigured ? "••••••••••••••••••••••••••••••••" : "Paste your OpenAI API Key here"}
                    value={openaiKeyInput}
                    onChange={(e) => setOpenaiKeyInput(e.target.value)}
                    className="flex-1 px-4 py-2.5 bg-slate-800/30 border border-white/10 rounded-xl text-slate-100 text-sm focus:border-emerald-500 focus:outline-none transition-all"
                  />
                  <button
                    onClick={() => handleSaveKey("openai", openaiKeyInput)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold transition-all border border-white/10"
                  >
                    Save Key
                  </button>
                </div>
              </div>

            </div>
          )}

        </section>

      </main>
    </div>
  );
}

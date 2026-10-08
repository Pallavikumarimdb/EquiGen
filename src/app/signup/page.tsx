"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  User,
  Mail,
  Lock,
  Building2,
  ShieldCheck,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  Loader2,
  ChevronDown,
  ArrowRight,
  PenLine,
  UserCog,
  FileCheck2,
  Fingerprint,
} from "lucide-react";

const ROLES = [
  {
    value: "analyst",
    label: "Equity Research Analyst",
    icon: PenLine,
    description: "Draft, model, and analyze coverage.",
  },
  {
    value: "reviewer",
    label: "SEBI Reviewer / Lead Analyst",
    icon: ShieldCheck,
    description: "Compliance sign-off and publishing.",
  },
  {
    value: "admin",
    label: "Organization Administrator",
    icon: UserCog,
    description: "Team seats and API configuration.",
  },
] as const;

const INPUT_CLASS =
  "w-full h-11 px-3.5 bg-[#FAF8F5] border border-[#E0DCD3] rounded-xl text-xs font-medium text-[#1A1917] placeholder-[#8C877D] caret-amber-600 focus:outline-none focus:border-[#1A1917] focus:bg-white focus:ring-2 focus:ring-[#1A1917]/10 transition-all shadow-2xs";

const ICONED_INPUT_CLASS = `pl-10 ${INPUT_CLASS}`;

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState("analyst");
  const [sebiRegNo, setSebiRegNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (role === "reviewer") {
      const sebiRegex = /^INH[0-9]{9}$/;
      if (!sebiRegex.test(sebiRegNo)) {
        setError("Invalid SEBI Registration format. Must be INH followed by 9 digits (e.g. INH123456789).");
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          orgName,
          sebiRegNo: role === "reviewer" ? sebiRegNo : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Signup failed");
      }

      // If the visitor arrived from a pricing card, send them straight to checkout.
      const requestedPlan = new URLSearchParams(window.location.search).get("plan");
      const VALID_PLANS = ["pro", "desk"];
      router.push(
        requestedPlan && VALID_PLANS.includes(requestedPlan)
          ? `/billing?upgrade=${requestedPlan}`
          : "/",
      );
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-theme relative min-h-screen w-full flex flex-col bg-[#F6F4EE] text-[#1A1917] antialiased font-sans">
      {/* ── Subtle Ambient Texture ───────────────────────────────────────── */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(#D8D4C9_1px,transparent_1px)] [background-size:26px_26px] opacity-[0.35]" />
        <div className="absolute w-[520px] h-[520px] rounded-full bg-amber-300/25 blur-[130px] -top-40 -left-28" />
        <div className="absolute w-[560px] h-[560px] rounded-full bg-emerald-200/30 blur-[140px] -bottom-48 -right-32" />
      </div>

      {/* ── Top Command Bar (mirrors dashboard HeaderNav) ─────────────────── */}
      <header className="relative z-10 h-[68px] w-full bg-white border-b border-[#E3DFD5] px-5 sm:px-6 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#1A1917] flex items-center justify-center shadow-xs">
            <BarChart3 className="w-5 h-5 text-white stroke-[2.5]" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-base font-extrabold tracking-tight text-[#1A1917]">EquiGen</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F1EFEA] text-[#7A7569] border border-[#E3DFD5] tracking-wider uppercase">
              Pro
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#F4F1EA] border border-[#E2DFD6] rounded-xl text-[10px] font-bold uppercase tracking-wider text-[#6E695E]">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Institutional Research Terminal</span>
        </div>
      </header>

      {/* ── Main Workspace Body ───────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 w-full flex flex-col items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-5xl">
          {/* Page Heading */}
          <div className="text-center mb-7 animate-fadeIn">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E3DFD5] rounded-full text-[10px] font-bold uppercase tracking-wider text-[#6E695E] shadow-2xs mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Desk Onboarding
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#1A1917]">
              Create your institutional <span className="text-amber-600">workspace</span>
            </h1>
            <p className="text-xs md:text-sm text-[#7A7569] mt-2 font-medium max-w-lg mx-auto leading-relaxed">
              Provision your firm workspace, claim your research seat, and start publishing SEBI-compliant notes in minutes.
            </p>
          </div>

          {/* Onboarding Panels */}
          <div className="grid md:grid-cols-2 gap-5 items-stretch">
            {/* ── Panel 1: Seat Roles ─────────────────────────────────────── */}
            <section className="flex flex-col justify-between bg-white border border-[#E3DFD5] rounded-3xl p-6 sm:p-7 shadow-xs hover:border-[#D5D0C3] hover:shadow-sm transition-all duration-300 animate-fadeIn">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold rounded-full uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Seat Roles
                  </span>
                  <span className="text-[10px] font-medium text-[#8C877D]">RBAC enforced</span>
                </div>

                <h2 className="text-lg font-extrabold text-[#1A1917] mb-2">
                  Choose Your Desk Role
                </h2>
                <p className="text-xs text-[#59554A] leading-relaxed mb-6">
                  Every seat carries its own permission boundary across drafting, compliance sign-off, and firm administration.
                </p>

                <div className="space-y-2.5 mb-6">
                  {ROLES.map((item) => {
                    const isActive = role === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setRole(item.value)}
                        aria-pressed={isActive}
                        className={`w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                          isActive
                            ? "bg-[#FAF8F5] border-[#1A1917] shadow-2xs"
                            : "bg-white border-[#EAE6DE] hover:border-[#D5D0C3] hover:bg-[#FAF8F5]"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                            isActive
                              ? "bg-[#1A1917] border-[#1A1917] text-amber-400"
                              : "bg-[#F1EFEA] border-[#E3DFD5] text-[#7A7569]"
                          }`}
                        >
                          <item.icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#1A1917] leading-snug">{item.label}</div>
                          <div className="text-[11px] text-[#7A7569] leading-snug mt-0.5">{item.description}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-3.5 bg-[#F1EFEA] border border-[#E3DFD5] rounded-2xl flex items-start gap-2.5">
                <Building2 className="w-4 h-4 text-[#6E695E] shrink-0 mt-px" />
                <p className="text-[11px] text-[#59554A] leading-snug">
                  Your firm workspace is created automatically and the first account is promoted to{" "}
                  <strong className="text-[#1A1917]">Organization Admin</strong>.
                </p>
              </div>
            </section>

            {/* ── Panel 2: Account Creation ───────────────────────────────── */}
            <section className="flex flex-col justify-between bg-white border border-[#E3DFD5] rounded-3xl p-6 sm:p-7 shadow-xs hover:border-[#D5D0C3] hover:shadow-sm transition-all duration-300 animate-fadeIn">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1A1917] border border-[#1A1917] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Onboarding
                  </span>
                  <span className="text-[10px] font-medium text-[#8C877D]">Institutional Registration</span>
                </div>

                <h2 className="text-lg font-extrabold text-[#1A1917] mb-4">
                  Create Institutional Account
                </h2>

                {error && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-start gap-2.5 animate-scaleIn">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-px" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Full Name */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="name" className="text-[11px] font-bold text-[#7A7569] uppercase tracking-wider">
                        Full Name
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C877D]">
                          <User className="w-4 h-4" />
                        </div>
                        <input
                          id="name"
                          name="name"
                          type="text"
                          autoComplete="name"
                          placeholder="e.g. Rahul Sharma"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className={ICONED_INPUT_CLASS}
                          required
                        />
                      </div>
                    </div>

                    {/* Work Email */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="email" className="text-[11px] font-bold text-[#7A7569] uppercase tracking-wider">
                        Work Email
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C877D]">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          autoComplete="email"
                          placeholder="analyst@firm.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={ICONED_INPUT_CLASS}
                          required
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Organization */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="orgName" className="text-[11px] font-bold text-[#7A7569] uppercase tracking-wider">
                        Firm / Organization
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C877D]">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <input
                          id="orgName"
                          name="orgName"
                          type="text"
                          autoComplete="organization"
                          placeholder="e.g. Motilal Oswal"
                          value={orgName}
                          onChange={(e) => setOrgName(e.target.value)}
                          className={ICONED_INPUT_CLASS}
                          required
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="password" className="text-[11px] font-bold text-[#7A7569] uppercase tracking-wider">
                        Password
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#8C877D]">
                          <Lock className="w-4 h-4" />
                        </div>
                        <input
                          id="password"
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          placeholder="Min 8 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          minLength={8}
                          className="w-full h-11 pl-10 pr-11 bg-[#FAF8F5] border border-[#E0DCD3] rounded-xl text-xs font-medium text-[#1A1917] placeholder-[#8C877D] caret-amber-600 focus:outline-none focus:border-[#1A1917] focus:bg-white focus:ring-2 focus:ring-[#1A1917]/10 transition-all shadow-2xs"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex={-1}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#8C877D] hover:text-[#1A1917] transition-colors cursor-pointer"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Institutional Role */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="role" className="text-[11px] font-bold text-[#7A7569] uppercase tracking-wider">
                      Institutional Role
                    </label>
                    <div className="relative">
                      <select
                        id="role"
                        name="role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className={`${INPUT_CLASS} pr-10 appearance-none cursor-pointer`}
                      >
                        {ROLES.map((item) => (
                          <option key={item.value} value={item.value} className="bg-white text-[#1A1917]">
                            {item.label} ({item.description})
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#8C877D]">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* SEBI Registration (reviewers only) */}
                  {role === "reviewer" && (
                    <div className="flex flex-col gap-2 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl animate-fadeIn">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        SEBI Research Analyst Registration
                      </div>
                      <input
                        id="sebiRegNo"
                        name="sebiRegNo"
                        type="text"
                        placeholder="INH123456789"
                        value={sebiRegNo}
                        onChange={(e) => setSebiRegNo(e.target.value.toUpperCase())}
                        className="w-full h-11 px-3.5 bg-white border border-emerald-300 rounded-xl text-xs font-bold text-[#1A1917] placeholder-[#8C877D] caret-emerald-600 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/10 transition-all shadow-2xs uppercase tracking-wider"
                        required
                      />
                      <span className="text-[10px] text-emerald-800/80 leading-tight">
                        Required for official sign-off certificates. Standard format: <strong>INH</strong> followed by 9 digits.
                      </span>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="group w-full h-11 mt-1 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Creating Account...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-400 stroke-[2.5]" />
                        <span>Create Institutional Account</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="mt-6 pt-4 border-t border-[#EAE6DE] text-center text-xs text-[#7A7569]">
                Already have an account?{" "}
                <Link
                  href="/signin"
                  className="text-[#1A1917] font-bold underline underline-offset-2 decoration-amber-500 decoration-2 hover:decoration-[#1A1917] transition-colors ml-1"
                >
                  Sign In
                </Link>
              </div>
            </section>
          </div>

          {/* ── Security Strip (dark notch, echoes dashboard accent) ───────── */}
          <div className="mt-5 p-4 sm:p-5 bg-[#121110] border border-[#262420] rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 animate-fadeIn">
            <div className="flex items-center gap-2.5 sm:border-r sm:border-white/10 sm:pr-6">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-amber-400 flex items-center justify-center shrink-0">
                <Fingerprint className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white leading-tight">Enterprise-grade access</div>
                <div className="text-[10px] text-[#8C877D] font-medium">Signed session tokens</div>
              </div>
            </div>

            {[
              { icon: FileCheck2, label: "SEBI (RA) compliant note sign-off" },
              { icon: Sparkles, label: "Multi-agent research swarms" },
              { icon: ShieldCheck, label: "Full audit trail on every revision" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-[11px] text-[#C9C4B8] font-medium">
                <item.icon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ── Page Footer ──────────────────────────────────────────────────── */}
      <footer className="relative z-10 w-full px-4 py-4 text-center text-[10px] text-[#9C978B] font-medium border-t border-[#E3DFD5]">
        EquiGen Research Terminal · For institutional use only · Research is not investment advice
      </footer>
    </div>
  );
}

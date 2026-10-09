"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LockKeyhole,
  FileCheck2,
  Fingerprint,
} from "lucide-react";

type PendingAction = "credentials" | "demo" | null;

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState("");
  const router = useRouter();

  const isBusy = pending !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setPending("credentials");

    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Invalid credentials");
      }

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(null);
    }
  };

  const handleDemoLogin = async () => {
    setError("");
    setPending("demo");

    try {
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to initialize demo session");
      }

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(null);
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
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Autonomous Equity Research Workspace
            </span>
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-[#1A1917]">
              Sign in to your <span className="text-amber-600">workspace</span>
            </h1>
            <p className="text-xs md:text-sm text-[#7A7569] mt-2 font-medium max-w-lg mx-auto leading-relaxed">
              Pick up your coverage universe, autonomous research runs, and SEBI-compliant notes exactly where your desk left them.
            </p>
          </div>

          {/* Auth Cards */}
          <div className="grid md:grid-cols-2 gap-5 items-stretch">
            {/* ── Card 1: Guest Demo Access ─────────────────────────────────── */}
            <section className="flex flex-col justify-between bg-white border border-[#E3DFD5] rounded-3xl p-6 sm:p-7 shadow-xs hover:border-[#D5D0C3] hover:shadow-sm transition-all duration-300 animate-fadeIn">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 border border-amber-200 text-amber-800 text-[10px] font-bold rounded-full uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    Instant Demo
                  </span>
                  <span className="text-[10px] font-medium text-[#8C877D]">No sign up needed</span>
                </div>

                <h2 className="text-lg font-extrabold text-[#1A1917] mb-2">
                  Explore Live Workspace
                </h2>
                <p className="text-xs text-[#59554A] leading-relaxed mb-6">
                  Jump straight into pre-generated SEBI-compliant equity reports, audit reconciliation traces, interactive DCF financial modeling, and the full agentic research pipeline.
                </p>

                <div className="space-y-2.5 mb-7">
                  {[
                    "Pre-built coverage reports (LTTS, ICICI, JSW Energy)",
                    "Mathematical audit & financial extraction reconciler",
                    "Real-time trajectory feed & multi-persona views",
                  ].map((feature) => (
                    <div key={feature} className="flex items-start gap-2.5 text-xs text-[#1A1917]">
                      <div className="w-5 h-5 rounded-lg bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0 mt-px">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <span className="leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={isBusy}
                className="group w-full h-11 px-4 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-[#1A1917] text-xs font-bold rounded-xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {pending === "demo" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Initializing Demo...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Launch Demo Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </section>

            {/* ── Card 2: Workspace Login ──────────────────────────────────── */}
            <section className="flex flex-col justify-between bg-white border border-[#E3DFD5] rounded-3xl p-6 sm:p-7 shadow-xs hover:border-[#D5D0C3] hover:shadow-sm transition-all duration-300 animate-fadeIn">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1A1917] border border-[#1A1917] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Workspaces
                  </span>
                  <span className="text-[10px] font-medium text-[#8C877D]">Institutional Login</span>
                </div>

                <h2 className="text-lg font-extrabold text-[#1A1917] mb-4">
                  Sign In to Account
                </h2>

                {error && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-start gap-2.5 animate-scaleIn">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-px" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {/* Email Input */}
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
                        className="w-full h-11 pl-10 pr-3.5 bg-[#FAF8F5] border border-[#E0DCD3] rounded-xl text-xs font-medium text-[#1A1917] placeholder-[#8C877D] caret-amber-600 focus:outline-none focus:border-[#1A1917] focus:bg-white focus:ring-2 focus:ring-[#1A1917]/10 transition-all shadow-2xs"
                        required
                      />
                    </div>
                  </div>

                  {/* Password Input */}
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
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
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

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="w-full h-11 mt-1 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {pending === "credentials" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <>
                        <LockKeyhole className="w-3.5 h-3.5 text-amber-400" />
                        <span>Sign In</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="mt-6 pt-4 border-t border-[#EAE6DE] text-center text-xs text-[#7A7569]">
                Don&apos;t have an institutional account?{" "}
                <Link
                  href="/signup"
                  className="text-[#1A1917] font-bold underline underline-offset-2 decoration-amber-500 decoration-2 hover:decoration-[#1A1917] transition-colors ml-1"
                >
                  Sign Up
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
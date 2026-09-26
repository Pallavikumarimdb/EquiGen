"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
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
} from "lucide-react";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

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
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setError("");
    setLoading(true);

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
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#070b14] font-sans px-4 py-8 text-slate-100 overflow-y-auto">
      {/* Background Ambience & Gradient Orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[600px] h-[600px] rounded-full filter blur-[140px] opacity-20 bg-gradient-to-br from-emerald-500/80 to-teal-700/40 -top-32 -left-32 animate-pulse" style={{ animationDuration: "8s" }} />
        <div className="absolute w-[650px] h-[650px] rounded-full filter blur-[150px] opacity-20 bg-gradient-to-tl from-indigo-600/80 to-blue-700/40 -bottom-36 -right-36 animate-pulse" style={{ animationDuration: "10s", animationDelay: "2s" }} />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
      </div>

      {/* Brand Header */}
      <div className="relative z-10 text-center mb-8">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/25 mb-3">
          <div className="w-full h-full bg-[#070b14] rounded-[14px] flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
          Equi<span className="text-emerald-400">Gen</span>
        </h1>
        <p className="text-xs md:text-sm text-slate-400 mt-1 font-medium tracking-wide">
          Autonomous Institutional Equity Research Workspace
        </p>
      </div>

      {/* Cards Container */}
      <div className="relative z-10 w-full max-w-4xl grid md:grid-cols-2 gap-6 items-stretch">
        
        {/* Card 1: Guest Demo Access */}
        <div className="flex flex-col justify-between p-6 md:p-8 bg-slate-900/60 backdrop-blur-2xl border border-emerald-500/30 hover:border-emerald-500/50 rounded-3xl shadow-[0_20px_60px_rgba(16,185,129,0.08)] transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold rounded-full uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Instant Demo
              </span>
              <span className="text-slate-400 text-xs font-medium">No sign up needed</span>
            </div>

            <h2 className="text-xl font-bold text-white mb-2.5">
              Explore Live Workspace
            </h2>
            <p className="text-slate-300 text-xs md:text-sm leading-relaxed mb-6">
              Experience pre-generated SEBI-compliant equity reports, audit reconciliation traces, interactive DCF financial modeling, and our agentic research pipeline.
            </p>
            
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-2.5 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Pre-built coverage reports (LTTS, ICICI, JSW Energy)</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Mathematical audit & financial extraction reconciler</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Real-time trajectory feed & multi-persona views</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white text-sm font-semibold rounded-2xl shadow-lg shadow-emerald-950/50 hover:shadow-emerald-500/25 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 group cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Initializing Demo...</span>
              </>
            ) : (
              <>
                <span>Launch Demo Dashboard</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </div>

        {/* Card 2: Workspace Login */}
        <div className="flex flex-col justify-between p-6 md:p-8 bg-slate-900/80 backdrop-blur-2xl border border-slate-700/80 hover:border-slate-600 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-5">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800/90 border border-slate-700 text-slate-300 text-xs font-semibold rounded-full uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                Workspaces
              </span>
              <span className="text-slate-400 text-xs font-medium">Institutional Login</span>
            </div>
            
            <h2 className="text-xl font-bold text-white mb-4">
              Sign In to Account
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Email Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-200 tracking-wide" htmlFor="email">
                  Work Email
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-400 transition-colors">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    placeholder="analyst@firm.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/90 border border-slate-700 rounded-xl text-white text-sm font-medium placeholder:text-slate-500 focus:bg-slate-950 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none transition-all caret-emerald-400"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-200 tracking-wide" htmlFor="password">
                  Password
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-400 transition-colors">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/90 border border-slate-700 rounded-xl text-white text-sm font-medium placeholder:text-slate-500 focus:bg-slate-950 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none transition-all caret-emerald-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 bg-slate-800 hover:bg-slate-750 hover:bg-slate-700 text-white border border-slate-600/80 text-sm font-semibold rounded-xl shadow-md transition-all duration-200 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
            Don&apos;t have an institutional account?{" "}
            <Link
              href="/signup"
              className="text-emerald-400 font-semibold hover:text-emerald-300 underline underline-offset-2 transition-colors ml-1"
            >
              Sign Up
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-[#090d16] font-sans overflow-y-auto px-4 py-12 text-slate-100">
      {/* Dynamic Background Blurs */}
      <div className="absolute inset-0 z-0">
        <div className="absolute w-[500px] h-[500px] rounded-full filter blur-[120px] opacity-15 bg-radial from-emerald-500 to-transparent -top-24 -left-24 animate-pulse"></div>
        <div className="absolute w-[600px] h-[600px] rounded-full filter blur-[120px] opacity-15 bg-radial from-indigo-500 to-transparent -bottom-32 -right-32 animate-pulse" style={{ animationDelay: "2s" }}></div>
      </div>

      {/* Main Title / Brand Header */}
      <div className="relative z-10 text-center mb-10">
        <div className="inline-block text-5xl mb-3 animate-bounce" style={{ animationDuration: "4s" }}>⚡</div>
        <h1 className="text-4xl font-extrabold text-white tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
          EquiGen
        </h1>
        <p className="text-sm text-slate-400 mt-2">Professional AI-Powered Equity Research Workspace</p>
      </div>

      {/* Split Cards Container */}
      <div className="relative z-10 w-full max-w-4xl grid md:grid-cols-2 gap-6 items-stretch">
        
        {/* Card 1: Guest Demo Access (Primary visually) */}
        <div className="flex flex-col justify-between p-8 md:p-10 bg-slate-950/60 backdrop-blur-xl border border-emerald-500/35 hover:border-emerald-500/60 rounded-3xl shadow-[0_20px_50px_rgba(16,185,129,0.08)] hover:shadow-[0_20px_50px_rgba(16,185,129,0.18)] transition-all duration-300 group">
          <div>
            <div className="flex items-center justify-between mb-6">
              <span className="px-3.5 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-full uppercase tracking-wider">
                Instant Access
              </span>
              <span className="text-slate-500 text-xs">No Registration</span>
            </div>
            <h2 className="text-2xl font-bold text-white mb-3">Explore Example Dashboard</h2>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">
              Quickly preview the interactive equity research workspace. You can inspect pre-generated professional compliance reports, run audit math reconciliations, and test out the AI-Co-Pilot chat analyst with live queries.
            </p>
            
            <ul className="flex flex-col gap-3 text-slate-300 text-sm mb-8">
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>View existing research (LTTS, ICICI, JSW Energy)</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Audit correction proposals & logs</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Chat with AI Co-Pilot research agent</span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-900/30 hover:shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? "Initializing..." : "Launch Demo Dashboard"}
          </button>
        </div>

        {/* Card 2: Workspace Login (Secondary visually) */}
        <div className="flex flex-col justify-between p-8 md:p-10 bg-slate-900/30 backdrop-blur-xl border border-white/10 hover:border-white/15 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-6">
              <span className="px-3.5 py-1 bg-white/5 border border-white/10 text-slate-400 text-xs font-semibold rounded-full uppercase tracking-wider">
                Workspaces
              </span>
              <span className="text-slate-500 text-xs">Secure Sign In</span>
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-6">Workspace Sign In</h2>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm">
                  {error}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase" htmlFor="email">
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="px-4 py-2.5 bg-slate-850/40 border border-white/10 rounded-xl text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200"
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="px-4 py-2.5 bg-slate-850/40 border border-white/10 rounded-xl text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-semibold rounded-xl shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          </div>

          <div className="mt-8 text-center text-sm text-slate-400">
            Need a professional account?{" "}
            <Link href="/auth/signup" className="text-emerald-400 font-semibold hover:text-emerald-300 hover:underline transition-colors">
              Sign Up
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

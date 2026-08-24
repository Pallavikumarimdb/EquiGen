"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [role, setRole] = useState("analyst"); // Default role
  const [sebiRegNo, setSebiRegNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Dynamic SEBI Validation if reviewer
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

      router.push("/");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-[#090d16] font-sans overflow-hidden px-4 py-12 text-slate-100">
      {/* Background Blurs */}
      <div className="absolute inset-0 z-0">
        <div className="absolute w-[500px] h-[500px] rounded-full filter blur-[120px] opacity-15 bg-radial from-emerald-500 to-transparent -top-24 -left-24 animate-pulse"></div>
        <div className="absolute w-[600px] h-[600px] rounded-full filter blur-[120px] opacity-15 bg-radial from-indigo-500 to-transparent -bottom-32 -right-32 animate-pulse" style={{ animationDelay: "2s" }}></div>
      </div>

      {/* Glassmorphic Sign-up Card */}
      <div className="relative z-10 w-full max-w-lg p-8 md:p-10 bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block text-4xl mb-2 animate-bounce" style={{ animationDuration: "3s" }}>⚡</div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">EquiGen</h1>
          <p className="text-sm text-slate-400 mt-1">AI-Powered Equity Research Engine</p>
        </div>

        <h2 className="text-xl font-semibold text-slate-200 mb-6">Create Account</h2>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-sm text-left">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase" htmlFor="name">
                Full Name
              </label>
              <input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="px-4 py-3 bg-slate-800/40 border border-white/10 rounded-xl text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200"
                required
              />
            </div>

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
                className="px-4 py-3 bg-slate-800/40 border border-white/10 rounded-xl text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase" htmlFor="orgName">
                Organization / Brokerage
              </label>
              <input
                id="orgName"
                type="text"
                placeholder="Geojit Investments"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="px-4 py-3 bg-slate-800/40 border border-white/10 rounded-xl text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200"
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
                placeholder="Min 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                className="px-4 py-3 bg-slate-800/40 border border-white/10 rounded-xl text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300 tracking-wider uppercase" htmlFor="role">
              System Role
            </label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-4 py-3 bg-slate-800/40 border border-white/10 rounded-xl text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200 appearance-none cursor-pointer"
            >
              <option value="analyst" className="bg-slate-900 text-slate-100">
                Equity Analyst (Draft & Edit reports)
              </option>
              <option value="reviewer" className="bg-slate-900 text-slate-100">
                Reviewer / Registered Analyst (Approve & Sign-off reports)
              </option>
              <option value="admin" className="bg-slate-900 text-slate-100">
                Organization Administrator (Configure branding & keys)
              </option>
            </select>
          </div>

          {/* Dynamic SEBI Registered Analyst Input */}
          {role === "reviewer" && (
            <div className="flex flex-col gap-2 animate-fadeIn">
              <label className="text-xs font-semibold text-emerald-400 tracking-wider uppercase" htmlFor="sebiRegNo">
                SEBI Research Analyst Registration Number
              </label>
              <input
                id="sebiRegNo"
                type="text"
                placeholder="INH123456789"
                value={sebiRegNo}
                onChange={(e) => setSebiRegNo(e.target.value.toUpperCase())}
                className="px-4 py-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-white text-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200"
                required={role === "reviewer"}
              />
              <span className="text-slate-400 text-xs mt-0.5">
                Must match SEBI standard formatting: INH followed by 9 digits.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-900/30 hover:shadow-emerald-500/20 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
          >
            {loading ? "Creating Account..." : "Create Account"}
          </button>
        </form>

        {/* Footer Link */}
        <div className="mt-8 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/signin" className="text-emerald-400 font-semibold hover:text-emerald-300 hover:underline transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

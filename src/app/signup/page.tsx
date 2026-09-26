"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
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
} from "lucide-react";

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

    // SEBI Validation if reviewer
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
    <div className="relative min-h-screen flex items-center justify-center bg-[#070b14] font-sans px-4 py-10 text-slate-100 overflow-y-auto">
      {/* Background Ambience & Gradient Orbs */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[600px] h-[600px] rounded-full filter blur-[140px] opacity-20 bg-gradient-to-br from-emerald-500/80 to-teal-700/40 -top-32 -left-32 animate-pulse"
          style={{ animationDuration: "8s" }}
        />
        <div
          className="absolute w-[650px] h-[650px] rounded-full filter blur-[150px] opacity-20 bg-gradient-to-tl from-indigo-600/80 to-blue-700/40 -bottom-36 -right-36 animate-pulse"
          style={{ animationDuration: "10s", animationDelay: "2s" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-25" />
      </div>

      {/* Glassmorphic Sign-up Card */}
      <div className="relative z-10 w-full max-w-xl p-6 sm:p-9 bg-slate-900/85 backdrop-blur-2xl border border-slate-700/80 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] transition-all">
        
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/25 mb-2.5">
            <div className="w-full h-full bg-[#070b14] rounded-[13px] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Equi<span className="text-emerald-400">Gen</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">Create your institutional research account</p>
        </div>

        {error && (
          <div className="mb-5 p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-200 text-xs flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-200 tracking-wide" htmlFor="name">
                Full Name
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-400 transition-colors">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="name"
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/90 border border-slate-700 rounded-xl text-white text-sm font-medium placeholder:text-slate-500 focus:bg-slate-950 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none transition-all caret-emerald-400"
                  required
                />
              </div>
            </div>

            {/* Email Address */}
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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Organization */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-200 tracking-wide" htmlFor="orgName">
                Firm / Organization
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-400 transition-colors">
                  <Building2 className="w-4 h-4" />
                </div>
                <input
                  id="orgName"
                  type="text"
                  placeholder="e.g. Motilal Oswal / Kotak"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/90 border border-slate-700 rounded-xl text-white text-sm font-medium placeholder:text-slate-500 focus:bg-slate-950 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none transition-all caret-emerald-400"
                  required
                />
              </div>
            </div>

            {/* Password */}
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
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
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
          </div>

          {/* System Role */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-200 tracking-wide" htmlFor="role">
              Institutional Role
            </label>
            <div className="relative">
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-slate-700 rounded-xl text-white text-sm font-medium focus:bg-slate-950 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none transition-all appearance-none cursor-pointer pr-10"
              >
                <option value="analyst" className="bg-[#0b1329] text-white py-1">
                  Equity Research Analyst (Draft, model, and analyze)
                </option>
                <option value="reviewer" className="bg-[#0b1329] text-white py-1">
                  SEBI Reviewer / Lead Analyst (Compliance sign-off & publishing)
                </option>
                <option value="admin" className="bg-[#0b1329] text-white py-1">
                  Organization Administrator (Team & API config)
                </option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Dynamic SEBI Registered Analyst Input */}
          {role === "reviewer" && (
            <div className="flex flex-col gap-1.5 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl animate-fadeIn">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                SEBI Research Analyst Registration Number
              </div>
              <input
                id="sebiRegNo"
                type="text"
                placeholder="INH123456789"
                value={sebiRegNo}
                onChange={(e) => setSebiRegNo(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 bg-slate-950/90 border border-emerald-500/40 rounded-xl text-white text-sm font-semibold placeholder:text-slate-500 focus:bg-slate-950 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 focus:outline-none transition-all caret-emerald-400 uppercase tracking-wider"
                required={role === "reviewer"}
              />
              <span className="text-slate-300 text-[11px] leading-tight">
                Required for official sign-off certificates. Standard format: <strong className="text-emerald-300">INH</strong> followed by 9 digits.
              </span>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-950/50 hover:shadow-emerald-500/25 transition-all duration-200 active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Creating Account...</span>
              </>
            ) : (
              <>
                <span>Create Institutional Account</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link */}
        <div className="mt-6 pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
          Already have an account?{" "}
          <Link
            href="/signin"
            className="text-emerald-400 font-semibold hover:text-emerald-300 underline underline-offset-2 transition-colors ml-1"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

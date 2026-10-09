import Link from "next/link";
import {
  BarChart3,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  FileCheck2,
  Fingerprint,
  LineChart,
  GitBranch,
  Bot,
  CheckCircle2,
} from "lucide-react";
import MarketingFooter from "@/components/MarketingFooter";
import PlanGrid from "@/components/billing/PlanGrid";

const CAPABILITIES = [
  {
    icon: Bot,
    title: "Autonomous Research Runs",
    body: "Multi-agent swarms pull filings, transcripts, and sector data to draft a full research note end to end.",
  },
  {
    icon: LineChart,
    title: "Linked Financial Modeling",
    body: "Three-statement DCF with scenario toggles and historical multiple bands, reconciled to source documents.",
  },
  {
    icon: FileCheck2,
    title: "SEBI Sign-off",
    body: "Registered Analyst credentials are attached to every published note, with a full revision audit trail.",
  },
];

const TRUST_POINTS = [
  { icon: FileCheck2, label: "SEBI (RA) compliant note sign-off" },
  { icon: Sparkles, label: "Multi-agent research swarms" },
  { icon: ShieldCheck, label: "Full audit trail on every revision" },
];

export default function Landing() {
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

        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-[#F4F1EA] border border-[#E2DFD6] rounded-xl text-[10px] font-bold uppercase tracking-wider text-[#6E695E]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Institutional Research Terminal</span>
          </div>
          <Link
            href="/signin"
            className="h-9 px-3.5 flex items-center bg-white border border-[#E0DCD3] rounded-xl text-[11px] font-bold text-[#1A1917] hover:bg-[#FAF8F5] hover:border-[#D5D0C3] transition-all duration-200"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="h-9 px-3.5 flex items-center gap-1.5 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-[11px] font-bold rounded-xl shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98]"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Get Started</span>
            <span className="sm:hidden">Start</span>
          </Link>
        </div>
      </header>

      {/* ── Main Workspace Body ───────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 w-full flex flex-col items-center justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-5xl">
          {/* Hero */}
          <div id="about" className="text-center animate-fadeIn scroll-mt-24">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E3DFD5] rounded-full text-[10px] font-bold uppercase tracking-wider text-[#6E695E] shadow-2xs mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Autonomous Equity Research Workspace
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-[#1A1917] leading-[1.1] max-w-3xl mx-auto">
              Institutional equity research, <span className="text-amber-600">generated autonomously</span>
            </h1>
            <p className="text-xs md:text-sm text-[#7A7569] mt-3 font-medium max-w-xl mx-auto leading-relaxed">
              Draft, model, audit, and publish SEBI-compliant research notes from a single terminal — with
              multi-agent pipelines and a traceable audit trail on every revision.
            </p>

            {/* CTAs */}
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/signup"
                className="group w-full sm:w-auto h-12 px-6 flex items-center justify-center gap-2 bg-[#1A1917] hover:bg-[#2C2A26] text-white text-xs font-bold rounded-2xl shadow-sm hover:shadow-md transition-all duration-200 active:scale-[0.98]"
              >
                <Sparkles className="w-4 h-4 text-amber-400 stroke-[2.5]" />
                <span>Create Institutional Account</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
              <Link
                href="/signin"
                className="group w-full sm:w-auto h-12 px-6 flex items-center justify-center gap-2 bg-white border border-[#E0DCD3] hover:bg-[#FAF8F5] hover:border-[#D5D0C3] text-[#1A1917] text-xs font-bold rounded-2xl shadow-xs hover:shadow-sm transition-all duration-200 active:scale-[0.98]"
              >
                <span>Sign In or Launch Demo</span>
                <ArrowRight className="w-3.5 h-3.5 text-[#8C877D] group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>

            <p className="mt-3 text-[10px] text-[#9C978B] font-medium">
              No card required · Instant guest demo workspace available
            </p>
          </div>

          {/* Capability Cards */}
          <div id="capabilities" className="mt-10 grid sm:grid-cols-3 gap-5 scroll-mt-24">
            {CAPABILITIES.map((item) => (
              <section
                key={item.title}
                className="bg-white border border-[#E3DFD5] rounded-3xl p-6 shadow-xs hover:border-[#D5D0C3] hover:shadow-sm transition-all duration-300 animate-fadeIn"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center mb-4">
                  <item.icon className="w-5 h-5" />
                </div>
                <h2 className="text-sm font-extrabold text-[#1A1917] mb-1.5">{item.title}</h2>
                <p className="text-[11px] text-[#59554A] leading-relaxed">{item.body}</p>
              </section>
            ))}
          </div>

          {/* Onboarding Steps */}
          <div id="how-it-works" className="mt-5 bg-white border border-[#E3DFD5] rounded-3xl p-6 sm:p-7 shadow-xs animate-fadeIn scroll-mt-24">
            <div className="flex items-center justify-between mb-5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1A1917] border border-[#1A1917] text-white text-[10px] font-bold rounded-full uppercase tracking-wider">
                <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
                Onboarding
              </span>
              <span className="text-[10px] font-medium text-[#8C877D]">Three steps to first note</span>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { step: "01", title: "Register your firm", body: "Create your org workspace and claim the admin seat." },
                { step: "02", title: "Pick your desk role", body: "Analyst, SEBI reviewer, or org administrator." },
                { step: "03", title: "Launch research", body: "Spin up an autonomous run and publish with sign-off." },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-[#F1EFEA] border border-[#E3DFD5] text-[#6E695E] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-amber-600 tracking-wider">{item.step}</div>
                    <div className="text-xs font-bold text-[#1A1917] leading-snug mt-0.5">{item.title}</div>
                    <div className="text-[11px] text-[#7A7569] leading-snug mt-0.5">{item.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Pricing ──────────────────────────────────────────────────── */}
          <section id="pricing" className="mt-12 scroll-mt-24">
            <div className="text-center mb-6 animate-fadeIn">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-[#E3DFD5] rounded-full text-[10px] font-bold uppercase tracking-wider text-[#6E695E] shadow-2xs mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Pricing
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#1A1917]">
                Pay per desk, <span className="text-amber-600">not per seat sprawl</span>
              </h2>
              <p className="text-xs text-[#7A7569] mt-2 font-medium max-w-lg mx-auto leading-relaxed">
                Start free, upgrade when a covering desk needs autonomous runs and SEBI sign-off.
                Cancel at the end of any billing period.
              </p>
            </div>

            <PlanGrid mode="marketing" />
          </section>

          {/* ── Trust Strip (dark notch, echoes dashboard accent) ─────────── */}
          <div className="mt-10 p-4 sm:p-5 bg-[#121110] border border-[#262420] rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 animate-fadeIn">
            <div className="flex items-center gap-2.5 sm:border-r sm:border-white/10 sm:pr-6">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 text-amber-400 flex items-center justify-center shrink-0">
                <Fingerprint className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white leading-tight">Enterprise-grade access</div>
                <div className="text-[10px] text-[#8C877D] font-medium">Signed session tokens</div>
              </div>
            </div>

            {TRUST_POINTS.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-[11px] text-[#C9C4B8] font-medium">
                <item.icon className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}

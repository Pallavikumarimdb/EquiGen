import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — EquiGen",
  description: "How EquiGen collects, processes, and protects research workspace data.",
};

const SECTIONS = [
  {
    id: "data-collected",
    heading: "1. Data We Collect",
    body: [
      "Account data: your name, work email, organization, desk role, and — where you sign off research notes — your SEBI Research Analyst registration number.",
      "Credentials: passwords are hashed with bcrypt and never stored or transmitted in plaintext. Sessions use signed, httpOnly tokens.",
      "Workspace data: documents you upload, extracted tables and page content, generated reports, and the audit trail of state changes and sign-offs.",
      "Billing data: our payment processor, Dodo Payments, acts as merchant of record and holds your payment identity, invoices, and subscription state. We store only provider customer, checkout session, subscription, and payment identifiers plus your plan and renewal date — never full card numbers.",
    ],
  },
  {
    id: "processing",
    heading: "2. How We Process It",
    body: [
      "Uploaded documents are parsed, segmented, and summarised by third-party language models to build research notes. Those providers receive the document content required to produce the output.",
      "Audit logs record who changed or approved what, and when. These records are retained for compliance and dispute resolution.",
      "We do not sell your data, and we do not use your workspace content to train models.",
    ],
  },
  {
    id: "tenancy",
    heading: "3. Tenant Isolation",
    body: [
      "Every document, report, session, and subscription is scoped to a single organization. Access is authorised from a verified session on each request rather than from client-supplied identifiers.",
      "Billing and quota entitlements apply at the organization level, so all seats in a firm share one subscription and one quota.",
    ],
  },
  {
    id: "retention",
    heading: "4. Retention and Deletion",
    body: [
      "Workspace data is retained while your organization has an active account. Deleting a report or an organization removes its associated workspace records.",
      "Billing records are retained for the period required by applicable tax and accounting law.",
      "Session tokens expire after a limited period and can be revoked by signing out or by an administrator removing the user.",
    ],
  },
  {
    id: "security",
    heading: "5. Security",
    body: [
      "Passwords are bcrypt-hashed. Sessions are signed tokens delivered via httpOnly, SameSite cookies. Integration API keys you store are encrypted at rest with AES-256-GCM.",
      "Webhook endpoints authenticate callers with HMAC signatures compared in constant time, and payment state is only mutated from verified provider events.",
      "No system is perfectly secure. Please report suspected vulnerabilities to your account contact rather than probing production directly.",
    ],
  },
  {
    id: "rights",
    heading: "6. Your Rights",
    body: [
      "You may access, correct, or export your profile and workspace data at any time from the settings pages.",
      "You may request deletion of your organization. Some records — including audit and billing entries — must be retained where law requires it.",
      "For access or deletion requests, contact your organization administrator or the EquiGen account team.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="auth-theme relative min-h-screen w-full flex flex-col bg-[#F6F4EE] text-[#1A1917] antialiased font-sans">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(#D8D4C9_1px,transparent_1px)] [background-size:26px_26px] opacity-[0.35]" />
        <div className="absolute w-[560px] h-[560px] rounded-full bg-emerald-200/30 blur-[140px] -bottom-48 -right-32" />
      </div>

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
        <Link
          href="/"
          className="h-9 px-3.5 flex items-center gap-1.5 bg-white border border-[#E0DCD3] rounded-xl text-[11px] font-bold text-[#1A1917] hover:bg-[#FAF8F5] hover:border-[#D5D0C3] transition-all duration-200"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
      </header>

      <main className="relative z-10 flex-1 w-full flex flex-col items-center px-4 py-10 sm:py-14">
        <article className="w-full max-w-3xl bg-white border border-[#E3DFD5] rounded-3xl p-6 sm:p-9 shadow-xs animate-fadeIn">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F1EFEA] border border-[#E3DFD5] rounded-full text-[10px] font-bold uppercase tracking-wider text-[#6E695E] mb-3">
            Legal
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#1A1917]">
            Privacy <span className="text-amber-600">Policy</span>
          </h1>
          <p className="text-[11px] text-[#8C877D] font-medium mt-2 mb-8">
            Last updated {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
          </p>

          <div className="space-y-8">
            {SECTIONS.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-24">
                <h2 className="text-sm font-extrabold text-[#1A1917] mb-2.5">{section.heading}</h2>
                <div className="space-y-2.5">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-xs text-[#59554A] leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-[#EAE6DE] flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-[#7A7569] font-medium">
            <Link href="/terms" className="text-[#1A1917] font-bold underline underline-offset-2 decoration-amber-500 decoration-2 hover:decoration-[#1A1917]">
              Terms of Service
            </Link>
            <Link href="/" className="text-[#1A1917] font-bold underline underline-offset-2 decoration-amber-500 decoration-2 hover:decoration-[#1A1917]">
              Back to EquiGen
            </Link>
          </div>
        </article>
      </main>

      <footer className="relative z-10 w-full px-4 py-4 text-center text-[10px] text-[#9C978B] font-medium border-t border-[#E3DFD5]">
        EquiGen Research Terminal · For institutional use only · Research is not investment advice
      </footer>
    </div>
  );
}

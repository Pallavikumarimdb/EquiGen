import Link from "next/link";
import { BarChart3, ShieldCheck, Scale, Lock } from "lucide-react";

const COLUMNS = [
  {
    heading: "Product",
    links: [
      { label: "Capabilities", href: "/#capabilities" },
      { label: "Pricing", href: "/#pricing" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Live demo workspace", href: "/signin" },
    ],
  },
  {
    heading: "For Institutions",
    links: [
      { label: "Create an account", href: "/signup" },
      { label: "Sign in", href: "/signin" },
      { label: "SEBI sign-off", href: "/#capabilities" },
      { label: "Billing & plans", href: "/billing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About EquiGen", href: "/#about" },
      { label: "Terms of service", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Statutory disclosures", href: "/terms#disclosures" },
    ],
  },
] as const;

/**
 * Full marketing footer. Rendered on the public landing page; the auth and
 * billing screens keep their compact single-line variant so the funnel stays
 * focused on the form.
 */
export default function MarketingFooter() {
  return (
    <footer className="relative z-10 w-full bg-white border-t border-[#E3DFD5] mt-auto">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-[#1A1917] flex items-center justify-center shadow-xs">
                <BarChart3 className="w-5 h-5 text-white stroke-[2.5]" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-[#1A1917]">
                  EquiGen
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F1EFEA] text-[#7A7569] border border-[#E3DFD5] tracking-wider uppercase">
                  Pro
                </span>
              </div>
            </div>
            <p className="text-[11px] text-[#59554A] leading-relaxed max-w-xs">
              An autonomous equity research terminal for institutional desks — multi-agent
              drafting, linked financial modelling, and SEBI-compliant sign-off with a full
              audit trail.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 px-3 py-1.5 bg-[#F4F1EA] border border-[#E2DFD6] rounded-xl text-[10px] font-bold uppercase tracking-wider text-[#6E695E]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Institutional Research Terminal</span>
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="text-[11px] font-bold text-[#1A1917] uppercase tracking-wider mb-3.5">
                {column.heading}
              </h3>
              <ul className="space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[11px] text-[#7A7569] hover:text-[#1A1917] transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Compliance strip */}
        <div className="mt-10 pt-6 border-t border-[#EAE6DE] grid gap-3 sm:grid-cols-3">
          {[
            {
              icon: Scale,
              title: "Research, not advice",
              body: "Generated notes are decision support, not investment recommendations.",
            },
            {
              icon: Lock,
              title: "Data residency",
              body: "Documents and financial extracts stay inside your tenant boundary.",
            },
            {
              icon: ShieldCheck,
              title: "SEBI (RA) sign-off",
              body: "Registered Analyst credentials are recorded on every published note.",
            },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#F1EFEA] border border-[#E3DFD5] text-[#6E695E] flex items-center justify-center shrink-0">
                <item.icon className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-[#1A1917] leading-tight">
                  {item.title}
                </div>
                <div className="text-[10px] text-[#7A7569] leading-snug mt-0.5">{item.body}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Legal row */}
      <div className="border-t border-[#EAE6DE]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10px] text-[#9C978B] font-medium text-center sm:text-left">
            © {new Date().getFullYear()} EquiGen Research Terminal · For institutional use
            only · Research is not investment advice
          </p>
          <div className="flex items-center gap-5 text-[10px] text-[#9C978B] font-medium">
            <Link href="/terms" className="hover:text-[#1A1917] transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-[#1A1917] transition-colors">
              Privacy
            </Link>
            <Link href="/terms#disclosures" className="hover:text-[#1A1917] transition-colors">
              Disclosures
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

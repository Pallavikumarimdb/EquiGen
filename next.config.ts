import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * The app renders LLM-generated research content. The report HTML is written to
 * `public/temp/reports/` and served statically, and is also handed to Puppeteer via
 * `page.setContent()` for PDF generation. Neither path may execute script, so the
 * policy forbids it outright.
 *
 * `style-src` must include `'unsafe-inline'` because the report template emits inline
 * `style=` attributes for chart and table layout. `img-src` allows `data:` because
 * charts are generated as inline SVG data URIs.
 *
 * `frame-ancestors 'none'` is the clickjacking control; it supersedes X-Frame-Options
 * and is set in both places because older browsers still honour only the header.
 */
const CSP = [
  "default-src 'self'",
  // Scripts: Next injects inline bootstrap JSON, so 'unsafe-inline' is required for the
  // app shell. Report artifacts are additionally served with a stricter policy below.
  "script-src 'self' 'unsafe-inline'",
  // Next injects styles at runtime; inline styles are unavoidable here.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // No outbound fetches from the browser: no CDN, no external analytics, no remote images.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/** Stricter policy for generated report artifacts: no scripts at all. */
const ARTIFACT_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "sandbox",
].join("; ");

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "@napi-rs/canvas", "@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/report": ["./src/lib/pdf/fonts/**/*"],
  },
  // Do not advertise the framework.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            // The report renderer is server-side; the browser needs no camera,
            // microphone, geolocation or payment access.
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
      {
        // Generated report HTML is untrusted in origin terms: it contains
        // LLM-produced text and must never be able to run script, even if an escaping
        // bug is reintroduced.
        source: "/temp/reports/:path*",
        headers: [
          { key: "Content-Security-Policy", value: ARTIFACT_CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Disposition", value: "attachment" },
        ],
      },
    ];
  },
};

export default nextConfig;
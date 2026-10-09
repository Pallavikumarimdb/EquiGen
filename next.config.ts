import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * The app renders LLM-generated research content. The report HTML is handed to
 * Puppeteer via `page.setContent()` for PDF generation, and generated report
 * artifacts are served from /temp/reports. Neither may execute script.
 *
 * `'unsafe-eval'` is required ONLY in development. Next.js dev uses eval/Function for
 * source-map evaluation and React Fast Refresh; omitting it produces
 * "Uncaught EvalError: call to eval() blocked by CSP" and breaks hydration
 * entirely. It is never included in a production build.
 *
 * `'unsafe-inline'` is still required in production because Next injects inline
 * bootstrap JSON for App Router hydration. Removing it needs per-request nonces,
 * which is a larger change; it is documented in SECURITY.md as a known relaxation
 * rather than left implicit. `frame-ancestors 'none'` is the clickjacking control and
 * is set in both places because older browsers honour only X-Frame-Options.
 */
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"}`,
  // Next injects styles at runtime; inline styles are unavoidable here.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // No outbound fetches from the browser: no CDN, no external analytics, no remote
  // images. `blob:` is needed by the drag-and-drop upload preview.
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Upgrade-insecure-requests causes noise in local http:// development and can
  // rewrite asset URLs unexpectedly; production TLS is enforced by HSTS instead.
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
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
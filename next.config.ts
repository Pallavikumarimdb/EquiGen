import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "@napi-rs/canvas", "@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: {
    "/api/report": ["./src/lib/pdf/fonts/**/*"],
  },
};

export default nextConfig;

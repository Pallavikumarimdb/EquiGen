import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/report": ["./src/lib/pdf/fonts/**/*"],
  },
};

export default nextConfig;

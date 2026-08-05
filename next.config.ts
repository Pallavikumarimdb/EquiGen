import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'canvas', 'chartjs-node-canvas']
};

export default nextConfig;

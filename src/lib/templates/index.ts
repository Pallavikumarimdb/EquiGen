/**
 * Visual design tokens for the EquiGen institutional equity research report.
 *
 * These are EquiGen's own house tokens. PDF rendering now runs through
 *   src/lib/ai/html-report-generator.ts  — LLM generates full HTML
 *   src/lib/pdf/index.ts                 — Puppeteer renders HTML -> PDF
 * so this object is the nominal single source of truth for colour/type/layout
 * tokens that inline styles should be kept in sync with.
 */
export const EQUIGEN_THEME = {
  colors: {
    primary: "#0B3C5D",
    secondary: "#07877B",
    accent: "#D9B310",
    darkText: "#1D2731",
    lightBg: "#F9F9F9",
    border: "#E8E8E8",
    buyRating: "#28A745",
    sellRating: "#DC3545",
    holdRating: "#FFC107",
  },
  typography: {
    fontFamily: "Inter, Helvetica, sans-serif",
    titleSize: 24,
    h1Size: 18,
    h2Size: 14,
    bodySize: 10,
    captionSize: 8,
  },
  layout: {
    margin: 36,
    pageWidth: 595,
    pageHeight: 842,
  },
} as const;

export type EquiGenTheme = typeof EQUIGEN_THEME;
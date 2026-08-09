/**
 * Visual design system tokens for Geojit-style Equity Research Report PDF.
 */
export const GEOJIT_THEME = {
  colors: {
    primary: '#0B3C5D',
    secondary: '#328CC1',
    accent: '#D9B310',
    darkText: '#1D2731',
    lightBg: '#F9F9F9',
    border: '#E8E8E8',
    buyRating: '#28A745',
    sellRating: '#DC3545',
    holdRating: '#FFC107'
  },
  typography: {
    fontFamily: 'Inter, Helvetica, sans-serif',
    titleSize: 24,
    h1Size: 18,
    h2Size: 14,
    bodySize: 10,
    captionSize: 8
  },
  layout: {
    margin: 36,
    pageWidth: 595,
    pageHeight: 842
  }
};

export type GeojitTheme = typeof GEOJIT_THEME;

// NOTE: PDF generation has moved to:
//   src/lib/ai/html-report-generator.ts  — LLM generates full HTML
//   src/lib/pdf/index.ts                 — Puppeteer renders HTML → PDF

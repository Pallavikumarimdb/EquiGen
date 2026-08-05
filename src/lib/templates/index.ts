/**
 * Visual design system tokens for Geojit-style Equity Research Report PDF.
 */
export const GEOJIT_THEME = {
  colors: {
    primary: '#0B3C5D',      // Deep Corporate Blue
    secondary: '#328CC1',    // Medium Accent Blue
    accent: '#D9B310',       // Gold/Amber (ideal for recommendations and target badges)
    darkText: '#1D2731',     // Almost Black for text
    lightBg: '#F9F9F9',      // Warm White/Off-White for sections
    border: '#E8E8E8',       // Light grey for tables/gridlines
    buyRating: '#28A745',    // Green
    sellRating: '#DC3545',   // Red
    holdRating: '#FFC107'    // Orange/Yellow
  },
  typography: {
    fontFamily: 'Helvetica',
    titleSize: 24,
    h1Size: 18,
    h2Size: 14,
    bodySize: 10,
    captionSize: 8
  },
  layout: {
    margin: 36, // 0.5 inch margins
    pageWidth: 612, // Standard US Letter width
    pageHeight: 792 // Standard US Letter height
  }
};

export type GeojitTheme = typeof GEOJIT_THEME;

export * from './report-template';

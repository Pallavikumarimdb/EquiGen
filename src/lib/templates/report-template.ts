import { CompiledReport } from '../report/types';
import { drawBarChart, drawLineChart, ChartLayout } from '../charts';

/**
 * Geojit-style equity research report rendered directly to PDF with PDFKit.
 * Vector charts are drawn natively — no headless browser or native canvas
 * required, so the renderer runs on any Node runtime (incl. Vercel serverless).
 */

// ---------------------------------------------------------------------------
// Palette (matches the previous HTML template)
// ---------------------------------------------------------------------------
const PRIMARY = '#0B3C5D';
const SECONDARY = '#328CC1';
const BODY_TEXT = '#334155';
const MUTED = '#64748b';
const LIGHT = '#94a3b8';
const BORDER = '#e2e8f0';
const BG = '#f8fafc';
const STRONG = '#0f172a';

const RATING_COLORS: Record<string, string> = {
  BUY: '#10b981',
  ACCUMULATE: '#3b82f6',
  HOLD: '#f59e0b',
  REDUCE: '#ef4444',
  SELL: '#b91c1c'
};

// A4 geometry (points). Margins mirror the previous print CSS.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN_LEFT = 34.02;   // 1.2cm
const MARGIN_RIGHT = 34.02;  // 1.2cm
const MARGIN_BOTTOM = 51.02; // 1.8cm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
const CONTENT_BOTTOM = PAGE_HEIGHT - MARGIN_BOTTOM;

const FONT_BODY = 'Body';
const FONT_BOLD = 'BodyBold';

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 46);
  doc.save();
  doc.fillColor(SECONDARY).rect(MARGIN_LEFT, doc.y, 4, 16).fill();
  doc.fillColor(PRIMARY)
    .font(FONT_BOLD)
    .fontSize(15)
    .text(title.toUpperCase(), MARGIN_LEFT + 10, doc.y + 1, { width: CONTENT_WIDTH - 10 });
  doc.restore();
  doc.moveDown(0.8);
}

function paragraph(doc: PDFKit.PDFDocument, text: string, size = 12, color = BODY_TEXT): void {
  if (!text || !text.trim()) return;
  ensureSpace(doc, 30);
  doc.save();
  doc.font(FONT_BODY).fontSize(size).fillColor(color).text(text, MARGIN_LEFT, doc.y + 2, {
    width: CONTENT_WIDTH,
    lineGap: 3
  });
  doc.restore();
  doc.moveDown(0.6);
}

function bulletList(doc: PDFKit.PDFDocument, items: string[], color = BODY_TEXT): void {
  doc.save();
  for (const item of items) {
    if (!item || !item.trim()) continue;
    const lines = doc.heightOfString(item, { width: CONTENT_WIDTH - 16 });
    ensureSpace(doc, lines + 10);
    doc.fillColor(SECONDARY).circle(MARGIN_LEFT + 3, doc.y + 6, 2.2).fill();
    doc.font(FONT_BODY).fontSize(11.5).fillColor(color).text(item, MARGIN_LEFT + 14, doc.y + 2, {
      width: CONTENT_WIDTH - 14,
      lineGap: 2
    });
    doc.moveDown(0.35);
  }
  doc.restore();
  doc.moveDown(0.4);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > CONTENT_BOTTOM) {
    doc.addPage();
  }
}

function parseNum(value: string | number): number {
  if (typeof value === 'number') return value;
  return parseFloat(String(value).replace(/[^0-9.-]/g, '')) || 0;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(doc: PDFKit.PDFDocument, report: CompiledReport): void {
  // Double-rule brand header
  doc.save();
  doc.font(FONT_BOLD).fontSize(24).fillColor(PRIMARY).text('EQUIGEN RESEARCH', MARGIN_LEFT, doc.y, { width: CONTENT_WIDTH });
  doc.font(FONT_BODY).fontSize(11).fillColor(SECONDARY).text('EQUITY RESEARCH DIVISION', MARGIN_LEFT, doc.y + 4, { width: CONTENT_WIDTH });
  doc.y += 2;
  doc.strokeColor(PRIMARY).lineWidth(1.5).moveTo(MARGIN_LEFT, doc.y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, doc.y).stroke();
  doc.moveDown(0.35);
  doc.strokeColor(PRIMARY).lineWidth(0.7).moveTo(MARGIN_LEFT, doc.y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, doc.y).stroke();
  doc.moveDown(1.4);
  doc.restore();

  // Published line
  doc.save();
  doc.font(FONT_BODY).fontSize(10.5).fillColor(MUTED).text(
    `Published: ${report.summary.reportDate} | Ticker: ${report.summary.ticker}`,
    MARGIN_LEFT,
    doc.y,
    { width: CONTENT_WIDTH, align: 'right' }
  );
  doc.moveDown(0.8);
  doc.restore();

  // Company title
  doc.save();
  doc.font(FONT_BOLD).fontSize(21).fillColor(STRONG).text(report.summary.companyName, MARGIN_LEFT, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.2);
  doc.font(FONT_BODY).fontSize(13.5).fillColor(MUTED).text('Comprehensive Valuation & Quantitative Analysis', MARGIN_LEFT, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(1.1);
  doc.restore();
}

function renderRecommendationCard(doc: PDFKit.PDFDocument, report: CompiledReport): void {
  const rec = report.recommendation;
  const ratingColor = RATING_COLORS[rec.rating] || STRONG;

  const cardTop = doc.y;
  const cardHeight = 158;

  ensureSpace(doc, cardHeight + 20);

  const leftColWidth = (CONTENT_WIDTH - 16) / 2;
  const rightColX = MARGIN_LEFT + leftColWidth + 16;

  // Left: recommendation card with colored left edge
  doc.save();
  doc.roundedRect(MARGIN_LEFT, cardTop, leftColWidth, cardHeight, 8).fillColor(BG).fill();
  doc.roundedRect(MARGIN_LEFT, cardTop, leftColWidth, cardHeight, 8).strokeColor(BORDER).lineWidth(1).stroke();
  doc.fillColor(ratingColor).rect(MARGIN_LEFT, cardTop, 5, cardHeight).fill();

  doc.font(FONT_BODY).fontSize(10).fillColor(MUTED).text('RECOMMENDATION', MARGIN_LEFT + 14, cardTop + 12, { width: leftColWidth - 28 });

  // Rating badge
  const badgeText = rec.rating;
  doc.font(FONT_BOLD).fontSize(16);
  const badgeWidth = doc.widthOfString(badgeText) + 26;
  doc.fillColor(ratingColor).roundedRect(MARGIN_LEFT + 14, cardTop + 30, badgeWidth, 26, 4).fill();
  doc.fillColor('#ffffff').font(FONT_BOLD).fontSize(15).text(badgeText, MARGIN_LEFT + 14, cardTop + 35, { width: badgeWidth, align: 'center' });

  const priceRows: Array<[string, string, string]> = [
    ['Current Price:', rec.currentPrice, STRONG],
    ['Target Price:', rec.targetPrice, STRONG],
    ['Upside Potential:', rec.upsidePotential, '#10b981']
  ];
  let py = cardTop + 68;
  for (const [label, value, valueColor] of priceRows) {
    doc.font(FONT_BODY).fontSize(10.5).fillColor('#475569').text(label, MARGIN_LEFT + 14, py, { width: leftColWidth - 28 });
    doc.font(FONT_BOLD).fontSize(10.5).fillColor(valueColor).text(value, MARGIN_LEFT + 14, py, { width: leftColWidth - 14, align: 'right' });
    py += 19;
  }
  doc.restore();

  // Right: business overview
  doc.save();
  doc.roundedRect(rightColX, cardTop, CONTENT_WIDTH - leftColWidth - 16, cardHeight, 8).fillColor('#ffffff').fill();
  doc.roundedRect(rightColX, cardTop, CONTENT_WIDTH - leftColWidth - 16, cardHeight, 8).strokeColor(BORDER).lineWidth(1).stroke();

  doc.font(FONT_BODY).fontSize(10).fillColor(MUTED).text('BUSINESS OVERVIEW', rightColX + 14, cardTop + 12, { width: CONTENT_WIDTH - leftColWidth - 44 });
  const overview = report.narratives.businessOverview || 'No business overview available.';
  const overviewHeight = Math.min(
    doc.heightOfString(overview, { width: CONTENT_WIDTH - leftColWidth - 44 }),
    cardHeight - 34
  );
  doc.font(FONT_BODY).fontSize(10.5).fillColor(BODY_TEXT).text(overview, rightColX + 14, cardTop + 30, {
    width: CONTENT_WIDTH - leftColWidth - 44,
    height: overviewHeight,
    ellipsis: true,
    lineGap: 2
  });
  doc.restore();

  doc.y = cardTop + cardHeight + 16;
}

function renderFinancialTable(doc: PDFKit.PDFDocument, report: CompiledReport): void {
  const table = report.tables[0];
  if (!table || table.columns.length === 0) return;

  const colWidths = table.columns.map((col, i) =>
    i === 0 ? CONTENT_WIDTH * 0.34 : CONTENT_WIDTH * 0.66 / Math.max(table.columns.length - 1, 1)
  );
  const rowHeight = 26;
  const headerHeight = 30;

  const totalHeight = headerHeight + rowHeight * table.rows.length;
  ensureSpace(doc, Math.min(totalHeight, CONTENT_BOTTOM - doc.y) + 30);

  // Header row
  doc.save();
  doc.fillColor(PRIMARY).rect(MARGIN_LEFT, doc.y, CONTENT_WIDTH, headerHeight).fill();
  let hx = MARGIN_LEFT;
  doc.font(FONT_BOLD).fontSize(10.5).fillColor('#ffffff');
  table.columns.forEach((col, i) => {
    doc.text(col.header, hx + 10, doc.y + 9, { width: colWidths[i] - 10 });
    hx += colWidths[i];
  });
  doc.y += headerHeight;
  doc.restore();

  // Body rows
  doc.save();
  table.rows.forEach((row, ri) => {
    doc.fillColor(ri % 2 === 1 ? BG : '#ffffff').rect(MARGIN_LEFT, doc.y, CONTENT_WIDTH, rowHeight).fill();
    let rx = MARGIN_LEFT;
    table.columns.forEach((col, ci) => {
      const cellValue = col.key === 'metric' ? String(row[col.key] || '-') : String(row[col.key] ?? '-');
      doc.font(ci === 0 ? FONT_BOLD : FONT_BODY).fontSize(10).fillColor(ci === 0 ? PRIMARY : BODY_TEXT);
      if (ci === 0) {
        doc.text(cellValue, rx + 10, doc.y + 8, { width: colWidths[ci] - 10 });
      } else {
        doc.text(cellValue, rx + 6, doc.y + 8, { width: colWidths[ci] - 6, align: 'right' });
      }
      rx += colWidths[ci];
    });
    doc.moveDown(0);
    doc.y += rowHeight;
  });
  doc.strokeColor(BORDER).lineWidth(1).moveTo(MARGIN_LEFT, doc.y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, doc.y).stroke();
  doc.restore();
  doc.moveDown(1);
}

function renderCharts(doc: PDFKit.PDFDocument, report: CompiledReport): void {
  const chart = report.charts[0];
  if (!chart || chart.data.length === 0) {
    paragraph(doc, 'No financial chart data available.', 11, MUTED);
    return;
  }

  const periods = chart.data.map((d) => String(d.name));
  const seriesKeys = chart.series.map((s) => s.key);

  const seriesOf = (label: string): number[] =>
    chart.data.map((d) => {
      const key = seriesKeys.find((k) => k.toLowerCase() === label.toLowerCase()) || label;
      const v = d[key];
      return typeof v === 'number' ? v : parseNum(v);
    });

  const revenue = seriesOf('Revenue');
  const ebitda = seriesOf('EBITDA');
  const pat = seriesOf('PAT');
  const ebitdaMargin = revenue.map((r, i) => (r > 0 ? parseFloat(((ebitda[i] / r) * 100).toFixed(2)) : 0));

  let cagr = 0;
  if (revenue.length > 1 && revenue[0] > 0) {
    const years = revenue.length - 1;
    cagr = parseFloat((Math.pow(revenue[revenue.length - 1] / revenue[0], 1 / years) - 1).toFixed(2));
  }

  const chartGap = 16;
  const chartWidth = (CONTENT_WIDTH - chartGap) / 2;
  const chartHeight = 150;

  const renderChartBox = (x: number, title: string, draw: (layout: ChartLayout) => void): void => {
    ensureSpace(doc, chartHeight + 44);
    doc.save();
    doc.roundedRect(x, doc.y, chartWidth, chartHeight + 26, 6).fillColor('#ffffff').fill();
    doc.roundedRect(x, doc.y, chartWidth, chartHeight + 26, 6).strokeColor(BORDER).lineWidth(1).stroke();
    doc.font(FONT_BOLD).fontSize(9.5).fillColor(MUTED).text(title.toUpperCase(), x, doc.y + 6, { width: chartWidth, align: 'center' });
    draw({ x: x + 8, y: doc.y + 20, width: chartWidth - 16, height: chartHeight });
    doc.restore();
  };

  // Row 1: Revenue Trend + PAT Trend
  const rowY = doc.y;
  renderChartBox(MARGIN_LEFT, 'Revenue Trend', (layout) => drawBarChart(doc, layout, periods, revenue, '#0f172a'));
  renderChartBox(MARGIN_LEFT + chartWidth + chartGap, 'PAT Trend', (layout) => drawBarChart(doc, layout, periods, pat, '#3b82f6'));
  doc.y = rowY + chartHeight + 38;

  // Row 2: EBITDA Margin + Revenue CAGR
  renderChartBox(MARGIN_LEFT, 'EBITDA Margin Trend', (layout) => drawLineChart(doc, layout, periods, ebitdaMargin, '#10b981'));
  renderChartBox(MARGIN_LEFT + chartWidth + chartGap, 'Revenue CAGR', (layout) =>
    drawBarChart(doc, layout, ['Company CAGR', 'Industry Benchmark'], [cagr, 12.0], ['#10b981', '#cbd5e1'])
  );
  doc.y += chartHeight + 38;
  doc.moveDown(0.4);
}

// ---------------------------------------------------------------------------
// Public renderer
// ---------------------------------------------------------------------------

/**
 * Renders the compiled report into the provided PDFKit document.
 * Callers must register fonts, end the document and collect the buffer.
 */
export function renderReportPDF(doc: PDFKit.PDFDocument, report: CompiledReport): void {
  // Header block
  renderHeader(doc, report);

  // Recommendation + business overview
  renderRecommendationCard(doc, report);

  // Investment thesis
  sectionTitle(doc, 'Investment Thesis');
  paragraph(doc, report.narratives.investmentThesis);

  // Financial performance
  sectionTitle(doc, 'Financial Performance');
  renderFinancialTable(doc, report);

  // Charts (own page)
  doc.addPage();
  sectionTitle(doc, 'Performance Charts');
  renderCharts(doc, report);

  // Strengths & outlook
  sectionTitle(doc, 'Strengths & Outlook');
  doc.save();
  doc.font(FONT_BOLD).fontSize(11.5).fillColor(PRIMARY).text('KEY HIGHLIGHTS / STRENGTHS', MARGIN_LEFT, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.4);
  doc.restore();
  bulletList(doc, report.summary.executiveSummary ? [report.summary.executiveSummary] : ['No key highlights available.']);
  doc.save();
  doc.font(FONT_BOLD).fontSize(11.5).fillColor(PRIMARY).text('FUTURE OUTLOOK', MARGIN_LEFT, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.4);
  doc.restore();
  paragraph(doc, report.narratives.outlook);

  // Investment risks
  sectionTitle(doc, 'Investment Risks');
  if (report.risks.length > 0) {
    bulletList(doc, report.risks.map((r) => r.description));
  } else {
    paragraph(doc, 'No material investment risks identified.', 11, MUTED);
  }

  // Valuation
  sectionTitle(doc, 'Valuation & Pricing');
  paragraph(doc, report.narratives.valuationAnalysis);

  // Disclaimer
  ensureSpace(doc, 90);
  doc.save();
  doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(MARGIN_LEFT, doc.y).lineTo(PAGE_WIDTH - MARGIN_RIGHT, doc.y).stroke();
  doc.moveDown(0.6);
  doc.font(FONT_BODY).fontSize(9).fillColor(MUTED).text(
    'Disclaimer: This report is compiled by EquiGen Research Division for information purposes only. The information contained herein is extracted using AI modules from public and corporate documentation and is subject to verification. It does not constitute investment advice, solicitation, or recommendation to buy or sell securities. Investors are advised to perform independent due diligence before making investment decisions.',
    MARGIN_LEFT,
    doc.y,
    { width: CONTENT_WIDTH, lineGap: 2 }
  );
  doc.restore();
}

/**
 * Draws the running header/footer (brand, page numbers) on every page.
 * Must be called after `doc.end()` with `bufferPages: true`.
 */
export function renderRunningFrames(doc: PDFKit.PDFDocument, report: CompiledReport): void {
  const range = doc.bufferedPageRange();
  const total = range.count;
  const companyName = report.summary.companyName;

  for (let i = range.start; i < range.start + total; i++) {
    doc.switchToPage(i);
    doc.save();

    // Top running header
    doc.font(FONT_BODY).fontSize(8).fillColor(LIGHT).text(
      `${companyName} Equity Research Report — Ticker: ${report.summary.ticker}`,
      MARGIN_LEFT,
      28,
      { width: CONTENT_WIDTH, align: 'right' }
    );

    // Bottom footer
    doc.font(FONT_BODY).fontSize(8).fillColor(LIGHT).text('EQUIGEN RESEARCH DIVISION', MARGIN_LEFT, PAGE_HEIGHT - MARGIN_BOTTOM + 22, { width: CONTENT_WIDTH / 2 });
    doc.text(`Page ${i + 1} of ${total}`, MARGIN_LEFT, PAGE_HEIGHT - MARGIN_BOTTOM + 22, { width: CONTENT_WIDTH, align: 'right' });

    doc.restore();
  }
}

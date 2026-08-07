/**
 * Lightweight vector chart renderer for PDFKit.
 * Draws publication-grade bar and line charts directly into the PDF — no
 * native canvas or headless browser required (safe for serverless runtimes).
 */

export interface ChartLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

const AXIS_COLOR = '#cbd5e1';
const GRID_COLOR = '#eef2f7';
const LABEL_COLOR = '#64748b';
const VALUE_COLOR = '#475569';

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function formatAxisValue(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(1);
}

function drawGridAndAxis(doc: PDFKit.PDFDocument, plot: { x: number; y: number; w: number; h: number }) {
  doc.save();
  for (let i = 0; i <= 4; i++) {
    const gy = plot.y + plot.h - (plot.h * i) / 4;
    doc.strokeColor(i === 0 ? AXIS_COLOR : GRID_COLOR).lineWidth(1).moveTo(plot.x, gy).lineTo(plot.x + plot.w, gy).stroke();
  }
  doc.restore();
}

/**
 * Draws a grouped bar chart with value labels.
 * `barColors` may be a single color or one per data point.
 */
export function drawBarChart(
  doc: PDFKit.PDFDocument,
  layout: ChartLayout,
  labels: string[],
  values: number[],
  barColors: string | string[]
): void {
  const { x, y, width, height } = layout;
  const plot = { x: x + 4, y: y + 6, w: width - 8, h: height - 30 };
  const max = niceMax(Math.max(...values.map((v) => v || 0), 1));

  drawGridAndAxis(doc, plot);

  const slot = plot.w / Math.max(labels.length, 1);  const barWidth = Math.min(slot * 0.55, 44);

  doc.save();
  labels.forEach((label, i) => {
    const value = values[i] || 0;
    const barHeight = (value / max) * plot.h;
    const cx = plot.x + slot * i + slot / 2;
    const color = Array.isArray(barColors) ? barColors[i % barColors.length] : barColors;

    doc.fillColor(color).roundedRect(cx - barWidth / 2, plot.y + plot.h - barHeight, barWidth, Math.max(barHeight, 1), 2).fill();

    doc.font('Body').fontSize(8).fillColor(VALUE_COLOR).text(
      formatAxisValue(value),
      cx - slot / 2,
      plot.y + plot.h - barHeight - 12,
      { width: slot, align: 'center' }
    );

    doc.font('Body').fontSize(8.5).fillColor(LABEL_COLOR).text(
      String(label),
      cx - slot / 2,
      plot.y + plot.h + 6,
      { width: slot, align: 'center' }
    );
  });
  doc.restore();
}

/**
 * Draws a line chart with data points and value labels.
 */
export function drawLineChart(
  doc: PDFKit.PDFDocument,
  layout: ChartLayout,
  labels: string[],
  values: number[],
  color: string
): void {
  const { x, y, width, height } = layout;
  const plot = { x: x + 4, y: y + 6, w: width - 8, h: height - 30 };
  const max = niceMax(Math.max(...values.map((v) => v || 0), 1));

  drawGridAndAxis(doc, plot);

  const slot = plot.w / Math.max(labels.length - 1, 1);
  const points = values.map((value, i) => ({
    x: labels.length === 1 ? plot.x + plot.w / 2 : plot.x + slot * i,
    y: plot.y + plot.h - (value / max) * plot.h
  }));

  doc.save();
  doc.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    doc.lineTo(points[i].x, points[i].y);
  }
  doc.strokeColor(color).lineWidth(2.5).lineJoin('round').stroke();

  points.forEach((p, i) => {
    doc.fillColor('#ffffff').circle(p.x, p.y, 3.2).fill();
    doc.fillColor(color).circle(p.x, p.y, 2.2).fill();
    doc.font('Body').fontSize(8).fillColor(VALUE_COLOR).text(
      `${formatAxisValue(values[i] || 0)}%`,
      p.x - 30,
      p.y - 14,
      { width: 60, align: 'center' }
    );
    doc.font('Body').fontSize(8.5).fillColor(LABEL_COLOR).text(
      String(labels[i]),
      p.x - slot / 2,
      plot.y + plot.h + 6,
      { width: slot, align: 'center' }
    );
  });
  doc.restore();
}

import { EquityResearchData } from '@/types';

/**
 * AI-assisted HTML equity research report generator.
 *
 * Architecture:
 *  - SVG charts and HTML structure are code-generated (precise, reliable)
 *  - AI narratives from EquityResearchData fill the text sections
 *  - Puppeteer renders the final HTML → PDF
 *
 * This avoids Groq's strict per-request token limits while producing
 * a publication-grade layout.
 */

export interface HtmlReportOptions {
  status?: 'draft' | 'published';
  reviewerName?: string;
  sebiRegNo?: string;
  approvedAt?: Date;
}

// ── Number helpers ────────────────────────────────────────────────────────────

function parseNum(v: number | string): number {
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0;
}



function fmtK(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}${abs.toFixed(0)}`;
}

// ── SVG Chart Renderers ───────────────────────────────────────────────────────

function niceRange(values: number[]): { min: number; max: number; ticks: number[] } {
  const dataMin = Math.min(...values, 0);
  const dataMax = Math.max(...values, 0);
  const span = dataMax - dataMin || 1;
  const pad = span * 0.2;
  const rawMin = dataMin - (dataMin < 0 ? pad : 0);
  const rawMax = dataMax + pad;

  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(rawMax - rawMin) || 1)));
  const step = magnitude <= 0.1 ? 1 : magnitude;
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const tickCount = 5;
  const tickStep = (max - min) / tickCount;
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i++) ticks.push(parseFloat((min + tickStep * i).toFixed(2)));
  return { min, max, ticks };
}

/**
 * Renders a bar chart as an SVG string.
 * Handles negative values — bars go downward from zero line.
 */
function svgBarChart(
  labels: string[],
  values: number[],
  barColor: string | string[],
  negColor = '#ef4444'
): string {
  const W = 500, H = 260;
  const lpad = 54, rpad = 10, tpad = 24, bpad = 32;
  const pw = W - lpad - rpad;
  const ph = H - tpad - bpad;

  const { min, max, ticks } = niceRange(values);
  const range = max - min || 1;
  const zeroY = tpad + ((max - 0) / range) * ph;

  const slot = pw / Math.max(labels.length, 1);
  const bw = Math.min(slot * 0.55, 38);

  // Y axis ticks + grid lines
  const gridLines = ticks.map(t => {
    const gy = tpad + ((max - t) / range) * ph;
    const isZero = Math.abs(t) < range * 0.01;
    return `
      <line x1="${lpad}" y1="${gy.toFixed(1)}" x2="${W - rpad}" y2="${gy.toFixed(1)}"
            stroke="${isZero ? '#94a3b8' : '#e2e8f0'}" stroke-width="${isZero ? 1 : 0.5}"/>
      <text x="${lpad - 4}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end"
            font-size="8" fill="#94a3b8">${fmtK(t)}</text>`;
  }).join('');

  // Bars + labels
  const bars = labels.map((label, i) => {
    const v = values[i] ?? 0;
    const cx = lpad + slot * i + slot / 2;
    const barH = Math.abs(v / range) * ph;
    const isPos = v >= 0;
    const by = isPos ? zeroY - barH : zeroY;
    const color = Array.isArray(barColor)
      ? (barColor[i % barColor.length] ?? '#0B3C5D')
      : (v < 0 ? negColor : barColor);
    const labelY = isPos ? by - 4 : by + barH + 11;

    return `
      <rect x="${(cx - bw / 2).toFixed(1)}" y="${by.toFixed(1)}"
            width="${bw.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}"
            rx="3" fill="${color}"/>
      <text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"
            font-size="8.5" fill="#1e293b">${fmtK(v)}</text>
      <text x="${cx.toFixed(1)}" y="${(H - bpad + 14).toFixed(1)}" text-anchor="middle"
            font-size="8" fill="#64748b">${label}</text>`;
  }).join('');

  // Y axis line
  const axisLine = `<line x1="${lpad}" y1="${tpad}" x2="${lpad}" y2="${H - bpad}" stroke="#94a3b8" stroke-width="1"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
  <g font-family="Arial, sans-serif">${gridLines}${axisLine}${bars}</g>
</svg>`;
}

/**
 * Renders a line chart with a filled area below, handles negative values.
 */
function svgLineChart(
  labels: string[],
  values: number[],
  lineColor: string,
  fillColor: string
): string {
  const W = 500, H = 260;
  const lpad = 54, rpad = 10, tpad = 24, bpad = 32;
  const pw = W - lpad - rpad;
  const ph = H - tpad - bpad;

  const { min, max, ticks } = niceRange(values);
  const range = max - min || 1;
  const zeroY = tpad + ((max - 0) / range) * ph;
  const n = labels.length;
  const step = n > 1 ? pw / (n - 1) : pw;

  const pts = values.map((v, i) => ({
    x: lpad + (n === 1 ? pw / 2 : step * i),
    y: tpad + ((max - v) / range) * ph,
  }));

  // Grid
  const gridLines = ticks.map(t => {
    const gy = tpad + ((max - t) / range) * ph;
    const isZero = Math.abs(t) < range * 0.01;
    return `
      <line x1="${lpad}" y1="${gy.toFixed(1)}" x2="${W - rpad}" y2="${gy.toFixed(1)}"
            stroke="${isZero ? '#94a3b8' : '#e2e8f0'}" stroke-width="${isZero ? 1 : 0.5}"/>
      <text x="${lpad - 4}" y="${(gy + 3.5).toFixed(1)}" text-anchor="end"
            font-size="8" fill="#94a3b8">${t.toFixed(1)}</text>`;
  }).join('');

  // Filled area
  const fillPts = [
    `${pts[0].x.toFixed(1)},${Math.min(zeroY, H - bpad).toFixed(1)}`,
    ...pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `${pts[pts.length - 1].x.toFixed(1)},${Math.min(zeroY, H - bpad).toFixed(1)}`
  ].join(' ');

  const linePts = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Dots + value labels
  const dots = pts.map((p, i) => {
    const v = values[i] ?? 0;
    const labelY = v >= 0 ? p.y - 8 : p.y + 16;
    return `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="white" stroke="${lineColor}" stroke-width="2"/>
      <text x="${p.x.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"
            font-size="8.5" fill="#1e293b">${v.toFixed(1)}%</text>
      <text x="${p.x.toFixed(1)}" y="${(H - bpad + 14).toFixed(1)}" text-anchor="middle"
            font-size="8" fill="#64748b">${labels[i]}</text>`;
  }).join('');

  const axisLine = `<line x1="${lpad}" y1="${tpad}" x2="${lpad}" y2="${H - bpad}" stroke="#94a3b8" stroke-width="1"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
  <g font-family="Arial, sans-serif">
    ${gridLines}
    ${axisLine}
    <polygon points="${fillPts}" fill="${fillColor}" opacity="0.15"/>
    <polyline points="${linePts}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </g>
</svg>`;
}

// ── HTML Builder ──────────────────────────────────────────────────────────────

const RATING_COLOR: Record<string, string> = {
  BUY: '#10b981', ACCUMULATE: '#3b82f6', HOLD: '#f59e0b', REDUCE: '#ef4444', SELL: '#b91c1c',
};

function escape(s: string | undefined | null): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtml(data: EquityResearchData, options: HtmlReportOptions): string {
  const status = options.status ?? 'draft';
  const isDraft = status === 'draft';
  const rec = data.recommendation;
  const ratingColor = RATING_COLOR[rec.rating] ?? '#334155';
  
  // ── Financial data extraction for charts ──
  const inc = data.keyFinancials?.incomeStatement ?? [];
  const periods = [...new Set(inc.map(m => m.period))].sort();
  const getValues = (label: string) =>
    periods.map(p => {
      const m = inc.find(x => x.label === label && x.period === p);
      return m ? parseNum(m.value) : 0;
    });

  const revenue = getValues('Revenue');
  const ebitda  = getValues('EBITDA');
  const pat     = getValues('PAT');
  const ebitdaMargins = revenue.map((r, i) => r > 0 ? parseFloat(((ebitda[i] / r) * 100).toFixed(1)) : 0);
  let cagrPct = 0;
  if (revenue.length > 1 && revenue[0] > 0) {
    cagrPct = parseFloat(((Math.pow(revenue[revenue.length - 1] / revenue[0], 1 / (revenue.length - 1)) - 1) * 100).toFixed(1));
  }



  // ── SVG charts
  const revChart    = svgBarChart(periods, revenue, '#0B3C5D');
  const patChart    = svgBarChart(periods, pat, '#3b82f6', '#ef4444');
  const marginChart = svgLineChart(periods, ebitdaMargins, '#10b981', '#10b981');
  const cagrChart   = svgBarChart(
    ['Company', 'Industry'],
    [cagrPct, 12.0],
    ['#10b981', '#94a3b8']
  );

  // ── Geojit helpers
  const cd = data.companyData ?? {};
  const sh = data.shareholding ?? [];
  const pp = data.pricePerformance ?? [];
  const est = data.estimates ?? [];
  const qf = data.quarterlyFinancials ?? [];
  const df = data.detailedFinancials ?? {};
  const recSum = data.recommendationSummary ?? [];

  // Shareholding headers
  let shHeaders = '<th>Category</th>';
  let shRows = '';
  if (sh.length > 0) {
    const sharePeriods = sh[0]?.periods ?? [];
    shHeaders = `<th>Category</th>` + sharePeriods.map(p => `<th>${escape(p)}</th>`).join('');
    shRows = sh.map(row => {
      const vals = row.values ?? [];
      return `<tr>
        <td class="metric-label">${escape(row.category)}</td>
        ${vals.map(v => `<td>${v != null ? escape(String(v)) : '-'}</td>`).join('')}
      </tr>`;
    }).join('');
  }

  // Quarterly Financials rows
  const qfRows = qf.map(row => `
    <tr>
      <td class="metric-label">${escape(row.metric)}</td>
      <td>${row.q1fy26 != null ? escape(String(row.q1fy26)) : '-'}</td>
      <td>${row.q1fy25 != null ? escape(String(row.q1fy25)) : '-'}</td>
      <td>${row.yoyGrowth != null ? escape(String(row.yoyGrowth)) : '-'}</td>
      <td>${row.q4fy25 != null ? escape(String(row.q4fy25)) : '-'}</td>
      <td>${row.qoqGrowth != null ? escape(String(row.qoqGrowth)) : '-'}</td>
    </tr>
  `).join('');

  // Old vs New Estimates rows
  const estRows = est.map(row => `
    <tr>
      <td class="metric-label">${escape(row.metric)}</td>
      <td>${row.oldFY26 != null ? escape(String(row.oldFY26)) : '-'}</td>
      <td>${row.oldFY27 != null ? escape(String(row.oldFY27)) : '-'}</td>
      <td>${row.newFY26 != null ? escape(String(row.newFY26)) : '-'}</td>
      <td>${row.newFY27 != null ? escape(String(row.newFY27)) : '-'}</td>
      <td>${row.changeFY26 != null ? escape(String(row.changeFY26)) : '-'}</td>
      <td>${row.changeFY27 != null ? escape(String(row.changeFY27)) : '-'}</td>
    </tr>
  `).join('');

  // Helper for rendering detailed financials tables
  const renderDetailTable = (rows: Record<string, string | number | null>[] | null | undefined) => {
    if (!rows || rows.length === 0) return '<tr><td colspan="5">No detailed financials available.</td></tr>';
    const keys = Object.keys(rows[0]).filter(k => k !== 'metric' && k !== 'Metric');
    const headerHtml = `<tr><th>Metric</th>` + keys.map(k => `<th>${escape(k)}</th>`).join('') + `</tr>`;
    const rowsHtml = rows.map(r => {
      const metricVal = r.metric ?? r.Metric ?? '';
      return `<tr>
        <td class="metric-label">${escape(String(metricVal))}</td>
        ${keys.map(k => `<td>${r[k] != null ? escape(String(r[k])) : '-'}</td>`).join('')}
      </tr>`;
    }).join('');
    return `<table class="fin-table thin-border"><thead>${headerHtml}</thead><tbody>${rowsHtml}</tbody></table>`;
  };

  const draftBanner = isDraft ? `
  <div class="draft-banner">
    ⚠ AI-GENERATED DRAFT — NOT FOR DISTRIBUTION
    <div class="draft-sub">This report was generated by EquiGen AI and has not been reviewed by a SEBI-registered Research Analyst. It does not constitute investment advice.</div>
  </div>` : '';

  const watermark = isDraft ? `<div class="watermark">DRAFT</div>` : '';

  const publishedBlock = (!isDraft && options.reviewerName) ? `
  <div class="published-block">
    <strong>Reviewed & Approved by:</strong> ${escape(options.reviewerName)}<br>
    <strong>SEBI RA Reg No:</strong> ${escape(options.sebiRegNo ?? '')}<br>
    <strong>Approved On:</strong> ${options.approvedAt ? new Date(options.approvedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(data.company.name)} — Geojit Equity Research Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 8.5pt;
    color: #1e293b;
    background: #fff;
    line-height: 1.4;
  }
  .page { padding: 10mm; max-width: 210mm; margin: 0 auto; min-height: 297mm; position: relative; }
  .watermark {
    position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 100pt; font-weight: 700; color: #dc3545; opacity: 0.03;
    pointer-events: none; z-index: -1; white-space: nowrap;
  }
  .top-logo { font-size: 8pt; color: #64748b; margin-bottom: 2mm; display: flex; justify-content: space-between; }
  .top-logo a { color: #64748b; text-decoration: none; }

  /* Grid Layouts */
  .grid-two { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 4mm; margin-bottom: 4mm; }
  .grid-three { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3mm; margin-bottom: 4mm; }

  /* Right Header Box */
  .header-box { border: 1.5px solid #0B3C5D; border-radius: 6px; padding: 3mm; background: #fafafa; }
  .header-box-title { font-size: 9pt; font-weight: 700; color: #0B3C5D; border-bottom: 1px solid #0B3C5D; padding-bottom: 1mm; margin-bottom: 2mm; text-transform: uppercase; }
  .rating-large { font-size: 20pt; font-weight: 800; color: #fff; text-align: center; padding: 2px 0; border-radius: 4px; margin-bottom: 3mm; text-transform: uppercase; }

  /* Info / Data Sections */
  .company-title-block { margin-bottom: 3mm; }
  .company-title { font-size: 16pt; font-weight: 800; color: #0B3C5D; }
  .company-subtitle { font-size: 9pt; color: #64748b; font-weight: 500; }
  .meta-tagline { font-size: 8pt; color: #94a3b8; margin-top: 1mm; }

  /* Tables styling */
  .fin-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-bottom: 4mm; }
  .fin-table th { background: #0B3C5D; color: #fff; padding: 4px 6px; font-weight: 600; text-align: right; border: 0.5px solid #e2e8f0; }
  .fin-table th:first-child { text-align: left; }
  .fin-table td { padding: 4px 6px; text-align: right; border: 0.5px solid #e2e8f0; }
  .fin-table td.metric-label { text-align: left; font-weight: 600; color: #0B3C5D; }
  .fin-table tr:nth-child(even) td { background: #f8fafc; }
  .thin-border th, .thin-border td { border: 0.25px solid #cbd5e1; }

  /* SWOT */
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 4mm; }
  .swot-card { border: 1px solid #e2e8f0; border-radius: 4px; padding: 3mm; }
  .swot-card h4 { font-size: 8pt; font-weight: 700; text-transform: uppercase; margin-bottom: 1.5mm; }
  .swot-card ul { padding-left: 10px; font-size: 7.5pt; }
  .swot-card li { margin-bottom: 0.5mm; color: #334155; }

  /* Charts */
  .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 4mm; }
  .chart-box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 3mm; background: #fff; }
  .chart-title { font-size: 7.5pt; font-weight: 600; color: #64748b; text-align: center; text-transform: uppercase; margin-bottom: 2mm; }

  /* Typography / Sections */
  .section-header { font-size: 10pt; font-weight: 700; color: #0B3C5D; border-bottom: 1.5px solid #328CC1; padding-bottom: 1px; margin: 4mm 0 2mm; text-transform: uppercase; }
  .para { font-size: 8.5pt; color: #334155; text-align: justify; margin-bottom: 3mm; line-height: 1.45; }
  .bullet-list { padding-left: 12px; margin-bottom: 3mm; }
  .bullet-list li { font-size: 8pt; color: #334155; margin-bottom: 1mm; }

  .disclaimer { font-size: 6.5pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 2mm; margin-top: 6mm; line-height: 1.3; }
  .draft-banner { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 4px; padding: 6px 10px; margin-bottom: 3mm; font-size: 7.5pt; font-weight: 600; color: #7f1d1d; }
  .draft-sub { font-weight: 400; font-size: 7pt; color: #991b1b; }
  .published-block { background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; padding: 8px; font-size: 7.5pt; color: #14532d; margin-bottom: 4mm; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-before: always; }
    .no-break { page-break-inside: avoid; }
  }
</style>
</head>
<body>

${watermark}

<!-- ═══════════════════════════════════ PAGE 1 ═══════════════════════════════════ -->
<div class="page">
  <div class="top-logo">
    <span>Retail Equity Research</span>
    <a href="https://www.geojit.com">www.geojit.com</a>
  </div>
  ${draftBanner}

  <div class="grid-two">
    <div>
      <div class="company-title-block">
        <div class="company-title">${escape(data.company.name)}</div>
        <div class="company-subtitle">${escape(data.company.sector || 'General Corporate')} | NSE: ${escape(data.nseCode || '-')} | BSE: ${escape(data.bseCode || '-')}</div>
        <div class="meta-tagline">Date: ${escape(data.company.reportDate)} | Time Frame: ${escape(data.timeFrame || '12 Months')} | Stock Type: ${escape(data.stockType || 'Large Cap')}</div>
      </div>
      
      <div class="section-header">Company Overview</div>
      <div class="para">${escape(data.businessOverview || 'No company overview available.')}</div>

      <div class="section-header">Key Highlights</div>
      <ul class="bullet-list">
        ${data.recommendation.rationale.map(r => `<li>${escape(r)}</li>`).join('')}
      </ul>
    </div>

    <div>
      <div class="header-box">
        <div class="header-box-title">Research Rating</div>
        <div class="rating-large" style="background:${ratingColor}">${escape(rec.rating)}</div>
        <table style="width:100%; font-size:8pt; border-collapse:collapse;">
          <tr style="border-bottom:0.5px solid #ddd;"><td style="padding:4px 0; font-weight:600;">CMP (Rs.)</td><td style="text-align:right; font-weight:700;">${rec.currentPrice != null && rec.currentPrice > 0 ? `Rs. ${rec.currentPrice.toLocaleString('en-IN')}` : '-'}</td></tr>
          <tr style="border-bottom:0.5px solid #ddd;"><td style="padding:4px 0; font-weight:600;">Target Price (Rs.)</td><td style="text-align:right; font-weight:700; color:#0B3C5D;">${rec.targetPrice != null && rec.targetPrice > 0 ? `Rs. ${rec.targetPrice.toLocaleString('en-IN')}` : '-'}</td></tr>
          <tr style="border-bottom:0.5px solid #ddd;"><td style="padding:4px 0; font-weight:600;">Upside Potential</td><td style="text-align:right; font-weight:700; color:#10b981;">${rec.currentPrice != null && rec.currentPrice > 0 && rec.targetPrice != null && rec.targetPrice > 0 && rec.upsidePotential != null ? `${rec.upsidePotential >= 0 ? '+' : ''}${rec.upsidePotential.toFixed(2)}%` : '-'}</td></tr>
          <tr><td style="padding:4px 0; font-weight:600;">Bloomberg Code</td><td style="text-align:right;">${escape(data.bloombergCode || '-')}</td></tr>
        </table>
      </div>
    </div>
  </div>

  <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 2mm;">
    <div>
      <div class="section-header">Company Data</div>
      <table class="fin-table thin-border" style="margin-bottom:0;">
        <tr><td class="metric-label">Market Cap (Rs. cr)</td><td>${cd.marketCap != null ? escape(String(cd.marketCap)) : '-'}</td></tr>
        <tr><td class="metric-label">52 Week High - Low (Rs.)</td><td>${cd.highLow52W != null ? escape(String(cd.highLow52W)) : '-'}</td></tr>
        <tr><td class="metric-label">Enterprise Value (Rs. cr)</td><td>${cd.enterpriseValue != null ? escape(String(cd.enterpriseValue)) : '-'}</td></tr>
        <tr><td class="metric-label">Outstanding Shares (cr)</td><td>${cd.outstandingShares != null ? escape(String(cd.outstandingShares)) : '-'}</td></tr>
        <tr><td class="metric-label">Free Float (%)</td><td>${cd.freeFloat != null ? escape(String(cd.freeFloat)) : '-'}</td></tr>
        <tr><td class="metric-label">Dividend Yield (%)</td><td>${cd.dividendYield != null ? escape(String(cd.dividendYield)) : '-'}</td></tr>
        <tr><td class="metric-label">6m Avg Volume (cr)</td><td>${cd.avgVolume6m != null ? escape(String(cd.avgVolume6m)) : '-'}</td></tr>
        <tr><td class="metric-label">Beta</td><td>${cd.beta != null ? escape(String(cd.beta)) : '-'}</td></tr>
        <tr><td class="metric-label">Face Value (Rs.)</td><td>${cd.faceValue != null ? escape(String(cd.faceValue)) : '-'}</td></tr>
      </table>
    </div>

    <div>
      <div class="section-header">Shareholding (%)</div>
      ${shRows ? `
      <table class="fin-table thin-border">
        <thead><tr>${shHeaders}</tr></thead>
        <tbody>${shRows}</tbody>
      </table>` : '<p style="font-size:7.5pt; color:#64748b;">No shareholding data available.</p>'}
      
      <div style="font-size:7.5pt; font-weight:600; margin-bottom: 2mm;">Promoter Pledge: <span style="font-weight:400; color:#334155;">${escape(data.promoterPledge || 'Nil')}</span></div>

      <div class="section-header">Price Performance (%)</div>
      <table class="fin-table thin-border">
        <thead>
          <tr>
            <th>Benchmark</th>
            <th>3 Month</th>
            <th>6 Month</th>
            <th>1 Year</th>
          </tr>
        </thead>
        <tbody>
          ${pp.length > 0 ? pp.map(p => `
            <tr>
              <td class="metric-label">${escape(p.period)}</td>
              <td>${p.absoluteReturn || '-'}</td>
              <td>${p.absoluteSensex || '-'}</td>
              <td>${p.relativeReturn || '-'}</td>
            </tr>
          `).join('') : `
            <tr><td colspan="4">No price performance data available.</td></tr>
          `}
        </tbody>
      </table>
    </div>
  </div>

  <div class="section-header">Outlook &amp; Valuation</div>
  <div class="para">${escape(data.valuationAnalysis || 'No valuation outlook available.')}</div>

  <div class="section-header">Quarterly Financials Consolidated</div>
  ${qfRows ? `
  <table class="fin-table thin-border">
    <thead>
      <tr>
        <th>Rs. cr</th>
        <th>Q1FY26</th>
        <th>Q1FY25</th>
        <th>YoY (%)</th>
        <th>Q4FY25</th>
        <th>QoQ (%)</th>
      </tr>
    </thead>
    <tbody>${qfRows}</tbody>
  </table>` : '<p style="font-size:7.5pt; color:#64748b;">No quarterly financials available.</p>'}

</div>

<!-- ═══════════════════════════════════ PAGE 2 ═══════════════════════════════════ -->
<div class="page page-break">
  <div class="top-logo">
    <span>Retail Equity Research</span>
    <a href="https://www.geojit.com">www.geojit.com</a>
  </div>

  <div class="section-header">Old estimates vs New estimates</div>
  ${estRows ? `
  <table class="fin-table thin-border">
    <thead>
      <tr>
        <th rowspan="2">Year / Rs cr</th>
        <th colspan="2">Old Estimates</th>
        <th colspan="2">New Estimates</th>
        <th colspan="2">Change (%)</th>
      </tr>
      <tr>
        <th>FY26E</th>
        <th>FY27E</th>
        <th>FY26E</th>
        <th>FY27E</th>
        <th>FY26E</th>
        <th>FY27E</th>
      </tr>
    </thead>
    <tbody>${estRows}</tbody>
  </table>` : '<p style="font-size:7.5pt; color:#64748b;">No estimates change data available.</p>'}

  <div class="section-header">Key Highlights &amp; Insights</div>
  <div class="para">${escape(data.narrativeSummary || data.executiveSummary || 'No additional highlights available.')}</div>

  <div class="section-header">Performance Charts</div>
  <div class="chart-grid">
    <div class="chart-box">
      <div class="chart-title">Revenue Trend (₹ Cr)</div>
      ${revChart}
    </div>
    <div class="chart-box">
      <div class="chart-title">PAT Trend (₹ Cr)</div>
      ${patChart}
    </div>
  </div>
  <div class="chart-grid">
    <div class="chart-box">
      <div class="chart-title">EBITDA Margin Trend (%)</div>
      ${marginChart}
    </div>
    <div class="chart-box">
      <div class="chart-title">Revenue CAGR vs Industry (%)</div>
      ${cagrChart}
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════ PAGE 3 ═══════════════════════════════════ -->
<div class="page page-break">
  <div class="top-logo">
    <span>Consolidated Financials</span>
    <a href="https://www.geojit.com">www.geojit.com</a>
  </div>

  <div class="section-header">Profit &amp; Loss Statement</div>
  ${renderDetailTable(df.incomeStatement)}

  <div class="section-header">Balance Sheet</div>
  ${renderDetailTable(df.balanceSheet)}

  <div class="section-header">Cash Flow Statement</div>
  ${renderDetailTable(df.cashFlow)}

  <div class="section-header">Financial Ratios</div>
  ${renderDetailTable(df.ratios)}
</div>

<!-- ═══════════════════════════════════ PAGE 4 ═══════════════════════════════════ -->
<div class="page page-break">
  <div class="top-logo">
    <span>Recommendation &amp; Disclosures</span>
    <a href="https://www.geojit.com">www.geojit.com</a>
  </div>

  <div class="section-header">Recommendation History (Last 3 Years)</div>
  <table class="fin-table thin-border" style="width: 50%;">
    <thead>
      <tr>
        <th>Dates</th>
        <th>Rating</th>
        <th>Target (Rs.)</th>
      </tr>
    </thead>
    <tbody>
      ${recSum.length > 0 ? recSum.map(r => `
        <tr>
          <td class="metric-label">${escape(r.date)}</td>
          <td>${escape(r.rating)}</td>
          <td>${r.target != null ? escape(String(r.target)) : '-'}</td>
        </tr>
      `).join('') : `
        <tr><td colspan="3">No history available.</td></tr>
      `}
    </tbody>
  </table>

  <div class="section-header">Investment Rating Criteria</div>
  <table class="fin-table thin-border">
    <thead>
      <tr>
        <th>Ratings</th>
        <th>Large Caps</th>
        <th>Midcaps</th>
        <th>Small Caps</th>
      </tr>
    </thead>
    <tbody>
      <tr><td class="metric-label">Buy</td><td>Upside is above 10%</td><td>Upside is above 15%</td><td>Upside is above 20%</td></tr>
      <tr><td class="metric-label">Accumulate</td><td>Upside is between 10%-15%</td><td>Upside is between 10%-20%</td><td>Upside is between 10%-20%</td></tr>
      <tr><td class="metric-label">Hold</td><td>Upside is between 0% - 10%</td><td>Upside is between 0%-10%</td><td>Upside is between 0%-10%</td></tr>
      <tr><td class="metric-label">Reduce/Sell</td><td>Downside is more than 0%</td><td>Downside is more than 0%</td><td>Downside is more than 0%</td></tr>
    </tbody>
  </table>

  ${publishedBlock}

  <div class="disclaimer">
    <strong>DISCLAIMER &amp; DISCLOSURES</strong><br>
    Certification: The author of this Report hereby certifies that all the views expressed in this research report reflect personal views about any or all of the subject issuer or securities. This report has been prepared by the Research Team of Geojit Investments Limited (GIL).
    CRISIL has provided research support in preparation of this research report and the investment rationale contained herein along with financial forecast. The target price and recommendation provided in the report are strictly GIL's views and are NOT PROVIDED by CRISIL. Further, CRISIL expresses no opinion on valuation and the associated recommendations.
    <br><br>
    Regulatory Disclosures:
    Group companies/ Fellow subsidiaries of Geojit Investments Ltd (GIL) are Geojit Financial Services Limited (GFSL), Geojit Technologies Private Limited, Geojit Credits Private Limited, Geojit Fintech Private Ltd, Geojit IFSC Ltd. In compliance with SEBI Regulations, GIL affirms that it is a SEBI registered Research Entity (INH000019567) and issues research reports in the course of its stock brokerage and financial services business.
    Standard Warning: "Investment in securities market are subject to market risks. Read all the related documents carefully before investing."
  </div>
</div>

</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export class HtmlReportGenerator {
  /**
   * Generates a complete print-ready A4 HTML equity research report.
   * Charts are drawn as inline SVG; layout is driven by CSS.
   * No LLM call required — all data comes from the structured EquityResearchData.
   */
  static async generateHTML(
    data: EquityResearchData,
    options: HtmlReportOptions = {}
  ): Promise<string> {
    return buildHtml(data, options);
  }
}

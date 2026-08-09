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

function fmtCr(n: number): string {
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(1)}L Cr`;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return `${sign}₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(abs)} Cr`;
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
  const inc = data.keyFinancials?.incomeStatement ?? [];

  // ── Financial data
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

  // Latest metrics for KPI cards
  const latestRevenue = revenue[revenue.length - 1] ?? 0;
  const latestEbitda  = ebitda[revenue.length - 1] ?? 0;
  const latestPat     = pat[revenue.length - 1] ?? 0;
  const latestPeriod  = periods[periods.length - 1] ?? '';

  // ── Financial table
  const labels = [...new Set(inc.map(m => m.label))];
  const tableHeaderCells = [`<th>Metric</th>`, ...periods.map(p => `<th>${escape(p)}</th>`)].join('');
  const tableBodyRows = labels.map((label, ri) => {
    const cells = periods.map(p => {
      const m = inc.find(x => x.label === label && x.period === p);
      return `<td>${m ? escape(fmtCr(parseNum(m.value))) : '-'}</td>`;
    }).join('');
    return `<tr class="${ri % 2 === 0 ? 'even' : 'odd'}"><td class="metric-label">${escape(label)}</td>${cells}</tr>`;
  }).join('\n');

  // ── SVG charts
  const revChart    = svgBarChart(periods, revenue, '#0B3C5D');
  const patChart    = svgBarChart(periods, pat, '#3b82f6', '#ef4444');
  const marginChart = svgLineChart(periods, ebitdaMargins, '#10b981', '#10b981');
  const cagrChart   = svgBarChart(
    ['Company', 'Industry'],
    [cagrPct, 12.0],
    ['#10b981', '#94a3b8']
  );

  // ── Risks list
  const risks = (data.investmentRisks ?? []);
  const riskItems = risks.length > 0
    ? risks.map(r => `<li>${escape(r)}</li>`).join('\n')
    : '<li>No material investment risks identified.</li>';

  // ── Rationale bullets
  const rationale = (rec.rationale ?? []);
  const rationaleItems = rationale.slice(0, 3).map(r => `<li>${escape(r)}</li>`).join('\n');

  // ── SWOT
  const swot = data.swotAnalysis ?? { strengths: [], weaknesses: [], opportunities: [], threats: [] };
  const swotSection = [
    { label: 'Strengths', items: swot.strengths ?? [], color: '#10b981' },
    { label: 'Weaknesses', items: swot.weaknesses ?? [], color: '#ef4444' },
    { label: 'Opportunities', items: swot.opportunities ?? [], color: '#3b82f6' },
    { label: 'Threats', items: swot.threats ?? [], color: '#f59e0b' },
  ].filter(s => s.items.length > 0).map(s => `
    <div class="swot-card" style="border-top:3px solid ${s.color}">
      <h4 style="color:${s.color}">${s.label}</h4>
      <ul>${s.items.map(i => `<li>${escape(i)}</li>`).join('')}</ul>
    </div>`).join('');

  // ── Competitors
  const competitors = data.competitors ?? [];
  const competitorsSection = competitors.length > 0 ? `
    <div class="section-title"><div class="section-bar"></div>Competitor Analysis</div>
    <div class="no-break">
      <table class="fin-table">
        <thead><tr>
          <th>Company</th>
          <th>Industry</th>
          <th>Recommendation</th>
          <th>Current Price</th>
          <th>Target Price</th>
        </tr></thead>
        <tbody>${competitors.map((c, i) => `
          <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
            <td class="metric-label">${escape(c.name)}${c.ticker ? `<div class="comp-ticker">${escape(c.ticker)}</div>` : ''}</td>
            <td>${escape(c.industry ?? '-')}</td>
            <td>${escape(c.recommendation ?? '-')}</td>
            <td>${c.currentPrice != null ? `₹${parseNum(c.currentPrice).toLocaleString('en-IN')}` : '-'}</td>
            <td>${c.targetPrice != null ? `₹${parseNum(c.targetPrice).toLocaleString('en-IN')}` : '-'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  const draftBanner = isDraft ? `
  <div class="draft-banner">
    ⚠ AI-GENERATED DRAFT — NOT FOR DISTRIBUTION
    <div class="draft-sub">This report was generated by EquiGen AI and has not been reviewed by a SEBI-registered Research Analyst. It does not constitute investment advice.</div>
  </div>` : '';

  const watermark = isDraft
    ? `<div class="watermark">DRAFT</div>`
    : '';

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
<title>${escape(data.company.name)} — Equity Research Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10pt;
    color: #1e293b;
    background: #fff;
    line-height: 1.55;
  }

  .page { padding: 14mm 14mm 14mm 14mm; max-width: 210mm; margin: 0 auto; }
  .watermark {
    position: fixed; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 110pt; font-weight: 700; color: #b91c1c; opacity: 0.04;
    pointer-events: none; z-index: -1; white-space: nowrap;
  }

  /* ── Header ── */
  .brand { font-size: 22pt; font-weight: 700; color: #0B3C5D; letter-spacing: -0.5px; }
  .brand-sub { font-size: 9pt; color: #328CC1; font-weight: 600; margin-top: 1mm; }
  .header-rule { border: none; border-top: 2px solid #0B3C5D; margin: 3mm 0 1mm; }
  .header-rule-thin { border: none; border-top: 0.5px solid #0B3C5D; margin-bottom: 3mm; }
  .company-name { font-size: 19pt; font-weight: 700; color: #0f172a; margin-top: 4mm; }
  .company-sub { font-size: 10.5pt; color: #64748b; margin-top: 1mm; }
  .report-meta { font-size: 8.5pt; color: #94a3b8; text-align: right; }

  /* ── Draft Banner ── */
  .draft-banner {
    background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px;
    padding: 8px 12px; margin-bottom: 5mm; font-size: 8.5pt;
    font-weight: 600; color: #7f1d1d;
  }
  .draft-sub { font-weight: 400; margin-top: 3px; font-size: 7.5pt; color: #991b1b; }

  /* ── Cards ── */
  .card-row { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 5mm 0; }
  .card {
    border: 1px solid #e2e8f0; border-radius: 8px; padding: 5mm;
    background: #f8fafc; position: relative; overflow: hidden;
  }
  .card-white { background: #fff; }
  .card-label { font-size: 7.5pt; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3mm; }
  .rating-badge {
    display: inline-block; padding: 3px 14px; border-radius: 5px;
    font-size: 13pt; font-weight: 700; color: #fff; margin-bottom: 4mm;
  }
  .price-row { display: flex; justify-content: space-between; align-items: baseline; margin: 2mm 0; }
  .price-label { font-size: 9pt; color: #475569; }
  .price-value { font-size: 10pt; font-weight: 700; color: #0f172a; }
  .upside-value { font-size: 10pt; font-weight: 700; color: #10b981; }
  .rationale-title { font-size: 7.5pt; color: #94a3b8; margin: 3mm 0 1mm; }
  .rationale-list { padding-left: 12px; }
  .rationale-list li { font-size: 8pt; color: #334155; margin: 1mm 0; }
  .left-bar { position: absolute; top: 0; left: 0; width: 5px; height: 100%; border-radius: 8px 0 0 8px; }

  /* ── KPI grid ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 4mm 0; }
  .kpi-card {
    border: 1px solid #e2e8f0; border-radius: 6px; padding: 4mm;
    background: #f8fafc;
  }
  .kpi-label { font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
  .kpi-value { font-size: 14pt; font-weight: 700; color: #0B3C5D; margin: 2mm 0 1mm; }
  .kpi-period { font-size: 7.5pt; color: #94a3b8; }

  /* ── Section titles ── */
  .section-title {
    display: flex; align-items: center; gap: 7px;
    font-size: 11.5pt; font-weight: 700; color: #0B3C5D; text-transform: uppercase;
    letter-spacing: 0.3px; margin: 6mm 0 3mm;
  }
  .section-bar { width: 4px; height: 16px; background: #328CC1; border-radius: 2px; flex-shrink: 0; }
  .sub-title { font-size: 10pt; font-weight: 600; color: #0B3C5D; margin: 3mm 0 2mm; text-transform: uppercase; }

  /* ── Table ── */
  .fin-table { width: 100%; border-collapse: collapse; font-size: 9pt; margin: 2mm 0 4mm; }
  .fin-table thead tr { background: #0B3C5D; color: #fff; }
  .fin-table th { padding: 6px 8px; text-align: right; font-weight: 600; font-size: 8.5pt; }
  .fin-table th:first-child { text-align: left; }
  .fin-table td { padding: 5px 8px; text-align: right; }
  .fin-table tr.even td { background: #f8fafc; }
  .fin-table tr.odd td { background: #fff; }
  .comp-ticker { font-size: 7.5pt; color: #64748b; font-weight: 600; }
  .metric-label { text-align: left !important; font-weight: 600; color: #0B3C5D; }

  /* ── Charts ── */
  .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin: 3mm 0; }
  .chart-box {
    border: 1px solid #e2e8f0; border-radius: 8px; padding: 4mm;
    background: #fff;
  }
  .chart-title {
    font-size: 8pt; font-weight: 600; color: #64748b; text-align: center;
    text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 3mm;
  }

  /* ── Text sections ── */
  .para { font-size: 9.5pt; color: #334155; line-height: 1.65; margin: 2mm 0 3mm; }
  .risk-list { padding-left: 14px; margin: 2mm 0; }
  .risk-list li { font-size: 9pt; color: #334155; margin: 2mm 0; }
  .bullet-circle { color: #328CC1; }

  /* ── SWOT ── */
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin: 3mm 0; }
  .swot-card { border: 1px solid #e2e8f0; border-radius: 6px; padding: 4mm; }
  .swot-card h4 { font-size: 9pt; font-weight: 700; text-transform: uppercase; margin-bottom: 2mm; }
  .swot-card ul { padding-left: 12px; }
  .swot-card li { font-size: 8.5pt; color: #334155; margin: 1mm 0; }

  /* ── Published / Disclaimer ── */
  .published-block {
    background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px;
    padding: 4mm; font-size: 8.5pt; color: #14532d; margin: 4mm 0;
  }
  .disclaimer {
    border-top: 1px solid #e2e8f0; padding-top: 4mm; margin-top: 4mm;
    font-size: 7.5pt; color: #94a3b8; line-height: 1.5;
  }

  /* ── Print rules ── */
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-before: always; }
    .no-break { page-break-inside: avoid; }
    .watermark { position: fixed; }
  }
</style>
</head>
<body>

${watermark}

<div class="page">

  ${draftBanner}

  <!-- ═══════════════════════════════════ PAGE 1: HEADER + REC ═══════════════════════════════════ -->
  <div class="no-break">
    <div class="brand">EQUIGEN RESEARCH</div>
    <div class="brand-sub">EQUITY RESEARCH DIVISION</div>
    <hr class="header-rule">
    <hr class="header-rule-thin">
    <div class="report-meta">Published: ${escape(data.company.reportDate)} | Ticker: ${escape(data.company.ticker ?? '')}</div>
    <div class="company-name">${escape(data.company.name)}</div>
    <div class="company-sub">Comprehensive Valuation &amp; Quantitative Analysis · ${escape(data.company.sector)}</div>
  </div>

  <div class="card-row no-break">
    <!-- Recommendation card -->
    <div class="card">
      <div class="left-bar" style="background:${ratingColor}"></div>
      <div style="padding-left:8px">
        <div class="card-label">Recommendation</div>
        <div class="rating-badge" style="background:${ratingColor}">${escape(rec.rating)}</div>
        <div class="price-row"><span class="price-label">Current Price:</span><span class="price-value">₹${parseNum(rec.currentPrice).toLocaleString('en-IN')}</span></div>
        <div class="price-row"><span class="price-label">Target Price:</span><span class="price-value">₹${parseNum(rec.targetPrice).toLocaleString('en-IN')}</span></div>
        <div class="price-row"><span class="price-label">Upside / Downside:</span><span class="upside-value">${parseNum(rec.upsidePotential) >= 0 ? '+' : ''}${parseNum(rec.upsidePotential).toFixed(2)}%</span></div>
        ${rationale.length > 0 ? `<div class="rationale-title">Key Rationale</div><ul class="rationale-list">${rationaleItems}</ul>` : ''}
      </div>
    </div>
    <!-- Business overview card -->
    <div class="card card-white">
      <div class="card-label">Business Overview</div>
      <div class="para" style="font-size:9pt">${escape(data.businessOverview ?? 'No business overview available.')}</div>
    </div>
  </div>

  <!-- ═══════════════════════════════════ PAGE 2: METRICS + TABLE + THESIS ═══════════════════════ -->
  <div class="page-break"></div>

  <div class="section-title"><div class="section-bar"></div>Key Financial Metrics</div>
  <div class="kpi-grid no-break">
    <div class="kpi-card">
      <div class="kpi-label">Revenue</div>
      <div class="kpi-value">${fmtCr(latestRevenue)}</div>
      <div class="kpi-period">${latestPeriod}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">EBITDA</div>
      <div class="kpi-value">${fmtCr(latestEbitda)}</div>
      <div class="kpi-period">${latestPeriod}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">PAT</div>
      <div class="kpi-value">${fmtCr(latestPat)}</div>
      <div class="kpi-period">${latestPeriod}</div>
    </div>
  </div>

  <div class="section-title"><div class="section-bar"></div>Financial Performance</div>
  <div class="no-break">
    <table class="fin-table">
      <thead><tr>${tableHeaderCells}</tr></thead>
      <tbody>${tableBodyRows}</tbody>
    </table>
  </div>

  <div class="section-title"><div class="section-bar"></div>Investment Thesis</div>
  <div class="para no-break">${escape(data.executiveSummary)}</div>

  ${competitorsSection}

  <!-- ═══════════════════════════════════ PAGE 3: CHARTS ════════════════════════════════════════ -->
  <div class="page-break"></div>

  <div class="section-title"><div class="section-bar"></div>Performance Charts</div>
  <div class="chart-grid no-break">
    <div class="chart-box">
      <div class="chart-title">Revenue Trend (₹ Cr)</div>
      ${revChart}
    </div>
    <div class="chart-box">
      <div class="chart-title">PAT Trend (₹ Cr)</div>
      ${patChart}
    </div>
  </div>
  <div class="chart-grid no-break">
    <div class="chart-box">
      <div class="chart-title">EBITDA Margin Trend (%)</div>
      ${marginChart}
    </div>
    <div class="chart-box">
      <div class="chart-title">Revenue CAGR vs Industry (%)</div>
      ${cagrChart}
    </div>
  </div>

  <!-- ═══════════════════════════════════ PAGE 4: ANALYSIS ═════════════════════════════════════ -->
  <div class="page-break"></div>

  <div class="section-title"><div class="section-bar"></div>Industry Dynamics</div>
  <div class="para">${escape(data.industryOverview ?? 'N/A')}</div>

  <div class="section-title"><div class="section-bar"></div>Future Growth &amp; Outlook</div>
  <div class="para">${escape(data.futureGrowth ?? 'N/A')}</div>

  ${swotSection ? `<div class="section-title"><div class="section-bar"></div>SWOT Analysis</div>
  <div class="swot-grid no-break">${swotSection}</div>` : ''}

  <div class="section-title"><div class="section-bar"></div>Investment Risks</div>
  <ul class="risk-list">${riskItems}</ul>

  <div class="section-title"><div class="section-bar"></div>Valuation &amp; Pricing</div>
  <div class="para">${escape(data.valuationAnalysis ?? 'N/A')}</div>

  ${publishedBlock}

  <div class="disclaimer">
    <strong>Disclaimer:</strong> This report is compiled by EquiGen Research Division for information purposes only.
    The information contained herein is extracted using AI from public and corporate documentation and is subject to
    verification. It does not constitute investment advice, solicitation, or recommendation to buy or sell securities.
    Investors are advised to perform independent due diligence before making investment decisions.
    ${!isDraft && options.sebiRegNo ? `SEBI RA Reg No: ${escape(options.sebiRegNo)}` : ''}
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

import { EquityResearchData, DetailedFinancialsData } from '@/types';

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

// ── Custom formatting for large numbers ──────────────────────────────────────────

function fmtK(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}${(abs / 1_00_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
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
 * Combo Chart Renderer: Primary Bars (Left Axis) + Secondary Line (Right Axis for growth/margin)
 * Updated with larger, clearer labels for print readability.
 */
function svgComboChart(
  labels: string[],
  barValues: number[],
  lineValues: number[],
  barColor: string,
  lineColor: string,
  lineLabelSuffix = '%'
): string {
  const W = 1000, H = 500;
  const lpad = 90, rpad = 90, tpad = 60, bpad = 70;
  const pw = W - lpad - rpad;
  const ph = H - tpad - bpad;

  if (labels.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
      <text x="500" y="250" text-anchor="middle" font-size="28" fill="#94a3b8">No data available</text>
    </svg>`;
  }

  const leftRange = niceRange(barValues);
  const leftSpan = leftRange.max - leftRange.min || 1;
  const zeroYLeft = tpad + ((leftRange.max - 0) / leftSpan) * ph;

  const rightRange = niceRange(lineValues);
  const rightSpan = rightRange.max - rightRange.min || 1;

  const slot = pw / Math.max(labels.length, 1);
  const bw = Math.min(slot * 0.35, 52);

  const gridLines = leftRange.ticks.map(t => {
    const gy = tpad + ((leftRange.max - t) / leftSpan) * ph;
    return `<line x1="${lpad}" y1="${gy.toFixed(1)}" x2="${W - rpad}" y2="${gy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1.5"/>
            <text x="${lpad - 15}" y="${(gy + 6).toFixed(1)}" text-anchor="end" font-size="18" font-weight="700" fill="#475569">${fmtK(t)}</text>`;
  }).join('');

  const rightTicksHtml = rightRange.ticks.map(t => {
    const gy = tpad + ((rightRange.max - t) / rightSpan) * ph;
    return `<text x="${W - rpad + 15}" y="${(gy + 6).toFixed(1)}" text-anchor="start" font-size="18" font-weight="700" fill="#475569">${t.toFixed(0)}${lineLabelSuffix}</text>`;
  }).join('');

  const bars = labels.map((label, i) => {
    const v = barValues[i] ?? 0;
    const cx = lpad + slot * i + slot / 2;
    const barH = Math.abs(v / leftSpan) * ph;
    const isPos = v >= 0;
    const by = isPos ? zeroYLeft - barH : zeroYLeft;
    const labelY = by - 12;

    return `
      <rect x="${(cx - bw / 2).toFixed(1)}" y="${by.toFixed(1)}"
            width="${bw.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}"
            fill="${barColor}"/>
      <text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"
            font-size="18" font-weight="800" fill="#1e293b">${fmtK(v)}</text>
      <text x="${cx.toFixed(1)}" y="${(H - bpad + 34).toFixed(1)}" text-anchor="middle"
            font-size="18" font-weight="700" fill="#475569">${label}</text>`;
  }).join('');

  const linePts = labels.map((_, i) => {
    const lv = lineValues[i] ?? 0;
    const cx = lpad + slot * i + slot / 2;
    const ly = tpad + ((rightRange.max - lv) / rightSpan) * ph;
    return { x: cx, y: ly, val: lv };
  });

  let linePath = '';
  let areaPath = '';
  
  if (linePts.length > 1) {
    let d = `M ${linePts[0].x.toFixed(1)} ${linePts[0].y.toFixed(1)}`;
    let areaD = `M ${linePts[0].x.toFixed(1)} ${linePts[0].y.toFixed(1)}`;
    
    for (let i = 0; i < linePts.length - 1; i++) {
      const curr = linePts[i];
      const next = linePts[i + 1];
      const cpX1 = curr.x + slot * 0.35;
      const cpY1 = curr.y;
      const cpX2 = next.x - slot * 0.35;
      const cpY2 = next.y;
      
      d += ` C ${cpX1.toFixed(1)} ${cpY1.toFixed(1)}, ${cpX2.toFixed(1)} ${cpY2.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
      areaD += ` C ${cpX1.toFixed(1)} ${cpY1.toFixed(1)}, ${cpX2.toFixed(1)} ${cpY2.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
    }
    
    linePath = `<path d="${d}" fill="none" stroke="${lineColor}" stroke-width="4" stroke-linecap="round"/>`;
    
    areaD += ` L ${linePts[linePts.length - 1].x.toFixed(1)} ${(H - bpad).toFixed(1)} L ${linePts[0].x.toFixed(1)} ${(H - bpad).toFixed(1)} Z`;
    areaPath = `<path d="${areaD}" fill="${lineColor}" fill-opacity="0.08"/>`;
  }

  const lineDots = linePts.map(p => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="#fff" stroke="${lineColor}" stroke-width="3.5"/>
    <text x="${p.x.toFixed(1)}" y="${(p.y - 16).toFixed(1)}" text-anchor="middle"
          font-size="18" font-weight="800" fill="${lineColor}">${p.val.toFixed(1)}${lineLabelSuffix}</text>
  `).join('');

  const bottomAxis = `<line x1="${lpad}" y1="${H - bpad}" x2="${W - rpad}" y2="${H - bpad}" stroke="#cbd5e1" stroke-width="2"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
  <g font-family="Arial, sans-serif">
    ${gridLines}
    ${rightTicksHtml}
    ${bottomAxis}
    ${bars}
    ${areaPath}
    ${linePath}
    ${lineDots}
  </g>
</svg>`;
}

function svgBarChart(
  labels: string[],
  values: number[],
  barColor: string | string[],
  negColor = '#ef4444'
): string {
  const W = 1000, H = 500;
  const lpad = 90, rpad = 40, tpad = 60, bpad = 70;
  const pw = W - lpad - rpad;
  const ph = H - tpad - bpad;

  if (labels.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
      <text x="500" y="250" text-anchor="middle" font-size="28" fill="#94a3b8">No data available</text>
    </svg>`;
  }

  const { min, max, ticks } = niceRange(values);
  const range = max - min || 1;
  const zeroY = tpad + ((max - 0) / range) * ph;

  const slot = pw / Math.max(labels.length, 1);
  const bw = Math.min(slot * 0.4, 64);

  const gridLines = ticks.map(t => {
    const gy = tpad + ((max - t) / range) * ph;
    return `<line x1="${lpad}" y1="${gy.toFixed(1)}" x2="${W - rpad}" y2="${gy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1.5"/>
            <text x="${lpad - 12}" y="${(gy + 6).toFixed(1)}" text-anchor="end" font-size="18" font-weight="700" fill="#64748b">${fmtK(t)}</text>`;
  }).join('');

  const bars = labels.map((label, i) => {
    const v = values[i] ?? 0;
    const cx = lpad + slot * i + slot / 2;
    const barH = Math.abs(v / range) * ph;
    const isPos = v >= 0;
    const by = isPos ? zeroY - barH : zeroY;
    const color = Array.isArray(barColor)
      ? (barColor[i % barColor.length] ?? '#0B3C5D')
      : (v < 0 ? negColor : barColor);
    const labelY = by - 12;

    return `
      <rect x="${(cx - bw / 2).toFixed(1)}" y="${by.toFixed(1)}"
            width="${bw.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}"
            fill="${color}"/>
      <text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"
            font-size="18" font-weight="800" fill="#1e293b">${fmtK(v)}</text>
      <text x="${cx.toFixed(1)}" y="${(H - bpad + 34).toFixed(1)}" text-anchor="middle"
            font-size="18" font-weight="700" fill="#64748b">${label}</text>`;
  }).join('');

  const bottomAxis = `<line x1="${lpad}" y1="${H - bpad}" x2="${W - rpad}" y2="${H - bpad}" stroke="#cbd5e1" stroke-width="2"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
  <g font-family="Arial, sans-serif">${gridLines}${bottomAxis}${bars}</g>
</svg>`;
}

// ── Fixed Row templates for Financial statements ──────────────────────────────

const INCOME_STATEMENT_ROW_TEMPLATE = [
  'Sales',
  'Growth (%)',
  'EBITDA',
  'Growth (%)',
  'Depreciation',
  'EBIT',
  'Interest',
  'Other Income',
  'PBT',
  'Growth (%)',
  'Tax',
  'Tax Rate (%)',
  'Reported PAT',
  'PAT att. to common shareholders',
  'Adjusted PAT',
  'Growth (%)',
  'No. of shares (cr)',
  'Adjusted EPS',
  'Growth (%)',
  'DPS'
];

const BALANCE_SHEET_ROW_TEMPLATE = [
  'Current Assets',
  'Cash & Equivalents',
  'Receivables',
  'Inventories',
  'Other Current Assets',
  'Fixed Assets',
  'Intangible Assets',
  'Total Assets',
  'Current Liabilities',
  'Payables',
  'Short-term Debt',
  'Long-term Debt',
  'Total Liabilities',
  'Share Capital',
  'Reserves & Surplus',
  'Total Equity'
];

const CASH_FLOW_ROW_TEMPLATE = [
  'Operating Cash Flow',
  'Investing Cash Flow',
  'Financing Cash Flow',
  'Net Cash Flow'
];

const RATIOS_ROW_TEMPLATE = [
  'ROE (%)',
  'ROCE (%)',
  'Debt/Equity',
  'P/E',
  'P/B',
  'EV/EBITDA'
];

function mapToPredefinedRows(
  extractedRows: Record<string, string | number | null>[] | null | undefined,
  template: string[]
): Record<string, string | number | null>[] {
  const hasRows = extractedRows && extractedRows.length > 0;
  const periodKeys = hasRows
    ? Object.keys(extractedRows[0]).filter(k => k !== 'metric' && k !== 'Metric')
    : ['FY24', 'FY25']; // Default placeholder period columns if empty

  return template.map(metric => {
    const matchedRow = hasRows ? extractedRows.find(r => {
      const m = r.metric ?? r.Metric;
      return m && String(m).toLowerCase().trim() === metric.toLowerCase().trim();
    }) : undefined;

    const newRow: Record<string, string | number | null> = { metric };
    periodKeys.forEach(p => {
      newRow[p] = matchedRow ? (matchedRow[p] ?? '-') : '-';
    });
    return newRow;
  });
}

// ── HTML Builder ──────────────────────────────────────────────────────────────

const RATING_COLOR: Record<string, string> = {
  BUY: '#008358', ACCUMULATE: '#3b82f6', HOLD: '#f59e0b', REDUCE: '#ef4444', SELL: '#b91c1c',
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
  const periods = [...new Set(inc.map(m => m.period))].sort();
  const getValues = (label: string) =>
    periods.map(p => {
      const m = inc.find(x => x.label === label && x.period === p);
      return m ? parseNum(m.value) : 0;
    });

  const revenue = getValues('Revenue');
  const ebitda = getValues('EBITDA');
  const pat = getValues('PAT');
  const ebitdaMargins = revenue.map((r, i) => r > 0 ? parseFloat(((ebitda[i] / r) * 100).toFixed(1)) : 0);
  const patMargins = revenue.map((r, i) => r > 0 ? parseFloat(((pat[i] / r) * 100).toFixed(1)) : 0);
  
  let quarterLabel = 'Q1FY26';
  if (data.quarterlyFinancials && data.quarterlyFinancials.length > 0) {
    const qKeys = Object.keys(data.quarterlyFinancials[0]).filter(k => k.startsWith('q') && !k.includes('growth') && !k.includes('Growth'));
    if (qKeys.length > 0) {
      quarterLabel = qKeys[0].toUpperCase();
    }
  }

  // Geojit Style: Primary Bars are Teal/Green (#008358), Trend Line is Orange (#d97706)
  const revChart = svgComboChart(periods, revenue, ebitdaMargins, '#008358', '#d97706', '%');
  const ebitdaChart = svgComboChart(periods, ebitda, ebitdaMargins, '#008358', '#d97706', '%');
  const patChart = svgComboChart(periods, pat, patMargins, '#008358', '#d97706', '%');

  let sectorChart = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:9.5pt;color:#64748b;font-weight:600;">Not applicable for this sector</div>`;
  const isDeliverySector = ['delivery', 'logistics', 'e-commerce', 'retail', 'quick commerce'].some(sec =>
    data.company.sector?.toLowerCase().includes(sec) || data.company.industry?.toLowerCase().includes(sec)
  );
  if (isDeliverySector) {
    const govValues = getValues('Gross Order Value');
    if (govValues.length > 0 && govValues.some(v => v > 0)) {
      sectorChart = svgBarChart(periods, govValues, '#008358');
    }
  }

  const cd = data.companyData ?? {};
  const sh = data.shareholding ?? [];
  const pp = data.pricePerformance ?? [];
  const est = data.estimates ?? [];
  const qf = data.quarterlyFinancials ?? [];
  const dfRaw = data.detailedFinancials;
  const df: DetailedFinancialsData = Array.isArray(dfRaw) ? (dfRaw[0] ?? {}) : (dfRaw ?? {});
  const recSum = data.recommendationSummary ?? [];
  const fiveYear = data.fiveYearSummary ?? [];

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

  const renderDetailTable = (rows: Record<string, string | number | null>[] | null | undefined, template: string[]) => {
    const normalizedRows = mapToPredefinedRows(rows, template);
    const keys = Object.keys(normalizedRows[0]).filter(k => k !== 'metric');
    const headerHtml = `<tr><th>Metric</th>` + keys.map(k => `<th>${escape(k.toUpperCase())}</th>`).join('') + `</tr>`;
    const rowsHtml = normalizedRows.map(r => `
      <tr>
        <td class="metric-label">${escape(String(r.metric))}</td>
        ${keys.map(k => `<td>${r[k] != null ? escape(String(r[k])) : '-'}</td>`).join('')}
      </tr>
    `).join('');
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
<title>${escape(data.company.name)} — EquiGen Equity Research Report</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 8.5pt;
    color: #1e293b;
    background: #fff;
    line-height: 1.4;
  }
  .page {
    padding: 6mm 10mm;
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto;
    position: relative;
    page-break-after: always;
    border-top: 40px solid rgba(56, 189, 145, 1);
    border-bottom: 30px solid rgba(56, 189, 145, 1);
  }
  .watermark {
    position: fixed; top: 45%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg);
    font-size: 100pt; font-weight: 700; color: #dc3545; opacity: 0.03;
    pointer-events: none; z-index: -1; white-space: nowrap;
  }
  .top-logo { font-size: 8pt; color: #64748b; margin-bottom: 2mm; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 1mm; }
  .top-logo a { color: #64748b; text-decoration: none; font-weight: 600; }
  
  .vertical-ribbon {
    position: absolute;
    right: 0px;
    top: 35mm;
    background: #00704a;
    color: #fff;
    padding: 4px 12px;
    font-weight: 800;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    transform: rotate(90deg) translate(0, 100%);
    transform-origin: bottom right;
    border-radius: 0 0 4px 4px;
    z-index: 10;
  }

  .brand-header-block {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 3mm;
  }
  .brand-logo-area { display: flex; flex-direction: column; }
  .brand-logo-title {
    font-size: 22pt;
    font-weight: 900;
    color: #00704a;
    letter-spacing: -1px;
    line-height: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .brand-logo-title span { color: #0c3c60; }
  .brand-logo-tagline {
    font-size: 6pt;
    font-weight: 600;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 1.5px;
    margin-top: 0.5mm;
  }

  .page1-body { display: grid; grid-template-columns: 0.95fr 1.55fr; gap: 5mm; page-break-inside: avoid; }
  
  /* Page 2 Body now splits left column table and wide right column text, but we render
     the Performance Charts at full width below the grid columns to maximize their horizontal size */
  .page2-grid-body { display: grid; grid-template-columns: 0.95fr 1.55fr; gap: 5mm; page-break-inside: avoid; }
  .left-rail { display: flex; flex-direction: column; gap: 2.5mm; page-break-inside: avoid; }
  .right-rail { display: flex; flex-direction: column; gap: 2.5mm; page-break-inside: avoid; }

  .company-title-block { margin-bottom: 1mm; }
  .company-title { font-size: 18pt; font-weight: 900; color: #0c3c60; line-height: 1.1; }
  .company-headline { font-size: 10pt; font-weight: 700; color: #00704a; margin-top: 1mm; margin-bottom: 1mm; border-left: 2.5px solid #00704a; padding-left: 5px; line-height: 1.25; }

  .identifiers-bar {
    width: 100%;
    border-collapse: collapse;
    margin: 2mm 0 4mm;
    border: 1px solid #cbd5e1;
    font-size: 8pt;
  }
  .identifiers-bar th {
    background: #003366; /* Geojit dark blue header color */
    color: #fff;
    font-weight: 800;
    text-transform: uppercase;
    font-size: 7.5pt;
    padding: 7px 8px;
    text-align: center;
    border: 1px solid #cbd5e1;
    letter-spacing: 0.3px;
  }
  .identifiers-bar td {
    padding: 8px 8px;
    text-align: center;
    font-weight: 700;
    color: #334155;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
  }
  .identifiers-bar .val-accent { color: #008358; font-weight: 800; }

  .fin-table { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-bottom: 0; }
  .fin-table th { background: #0c3c60; color: #fff; padding: 3px 6px; font-weight: 700; text-align: right; border: 0.5px solid #cbd5e1; font-size: 7pt; text-transform: uppercase; }
  .fin-table th:first-child { text-align: left; }
  .fin-table td { padding: 3px 6px; text-align: right; border: 0.5px solid #e2e8f0; }
  .fin-table td.metric-label { text-align: left; font-weight: 700; color: #0c3c60; }
  .fin-table tr:nth-child(even) td { background: #f8fafc; }
  .thin-border th, .thin-border td { border: 0.25px solid #cbd5e1; }

  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 3mm; }
  .swot-card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 3mm; background: #fff; }
  .swot-card h4 { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; margin-bottom: 1.5mm; color: #0c3c60; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5mm; }
  .swot-card ul { padding-left: 10px; font-size: 7.5pt; }
  .swot-card li { margin-bottom: 0.5mm; color: #334155; }

  /* Modified chart structures for full-width layout */
  .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 4mm; width: 100%; }
  .chart-box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; background: #fff; display: flex; flex-direction: column; justify-content: space-between; min-height: 250px; }
  .chart-title { font-size: 8pt; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase; margin-bottom: 3mm; letter-spacing: 0.5px; }
  .chart-svg-wrap { flex: 1; min-height: 0; display: flex; align-items: stretch; justify-content: center; }
  .chart-svg-wrap svg { width: 100%; height: 100%; }

  .section-header { font-size: 9.5pt; font-weight: 800; color: #0c3c60; border-bottom: 1.5px solid #00704a; padding-bottom: 1px; margin: 2mm 0 1mm; text-transform: uppercase; letter-spacing: 0.5px; }
  .para { font-size: 8pt; color: #334155; text-align: justify; margin-bottom: 1.5mm; line-height: 1.4; }
  .bullet-list { padding-left: 12px; margin-bottom: 1.5mm; }
  .bullet-list li { font-size: 8pt; color: #334155; margin-bottom: 1mm; line-height: 1.35; }

  .disclaimer { font-size: 6.2pt; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 2mm; margin-top: 4mm; line-height: 1.3; text-align: justify; }
  .draft-banner { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 4px; padding: 4px 8px; margin-bottom: 2mm; font-size: 7pt; font-weight: 600; color: #7f1d1d; }
  .draft-sub { font-weight: 400; font-size: 6.5pt; color: #991b1b; }
  .published-block { background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; padding: 6px; font-size: 7pt; color: #14532d; margin-bottom: 2mm; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { page-break-after: always; min-height: 297mm; }
  }
</style>
</head>
<body>

${watermark}

<!-- ═══════════════════════════════════ PAGE 1 ═══════════════════════════════════ -->
<div class="page">
  <div class="vertical-ribbon">${escape(quarterLabel)} Result Update</div>
  <div class="top-logo">
    <span>Retail Equity Research</span>
    <span></span>
    <a href="https://www.EquiGen.com">www.EquiGen.com</a>
  </div>
  ${draftBanner}

  <div class="brand-header-block" style="align-items: flex-end; margin-bottom: 4mm;">
    <div style="display: flex; flex-direction: column;">
      <div style="font-size: 14pt; font-weight: 700; color: #24a177ff; text-transform: uppercase; letter-spacing: 0.5px;">Retail Equity Research</div>
      <div class="company-title" style="font-size: 24pt; margin-top: 0.6mm; margin-bottom: 0.3mm;">${escape(data.company.name)}</div>
    </div>
    
    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4mm;">
      <div class="brand-logo-area" style="align-items: flex-end;">
        <div class="brand-logo-title" style="font-size: 20pt; color: #24a177ff; letter-spacing: -0.5px;">EquiGen</div>
        <div class="brand-logo-tagline" style="font-size: 5.5pt; letter-spacing: 1px;">AI-Powered Equity Research</div>
      </div>
      
      <!-- Recommendation Box -->
      <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 16px; font-size: 16pt; font-weight: 900; color: ${ratingColor}; text-align: center; min-width: 120px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-transform: uppercase;">
        ${escape(rec.rating || 'HOLD')}
      </div>
    </div>
  </div>

  <!-- Full-width key changes / ratings / indicators table -->
  <table class="identifiers-bar">
    <thead>
      <tr>
        <th style="width:14%">Key Changes</th>
        <th style="width:14%">CMP (Rs.)</th>
        <th style="width:14%">Target Price</th>
        <th style="width:15%">Upside Potential</th>
        <th style="width:14%">Rating</th>
        <th style="width:14%">Bloomberg Code</th>
        <th style="width:15%">Sensex</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <span style="font-size: 8pt; font-weight: 700;">
            Target <span style="color: #64748b; font-size: 9pt;">●</span> |
            Rating <span style="color: #64748b; font-size: 9pt;">●</span> |
            Earnings <span style="color: #008358; font-size: 10pt;">▲</span>
          </span>
        </td>
        <td class="val-accent">${rec.currentPrice != null && rec.currentPrice > 0 ? `Rs. ${rec.currentPrice.toLocaleString('en-IN')}` : '-'}</td>
        <td class="val-accent">${rec.targetPrice != null && rec.targetPrice > 0 ? `Rs. ${rec.targetPrice.toLocaleString('en-IN')}` : '-'}</td>
        <td class="val-accent" style="color:${rec.upsidePotential != null && rec.upsidePotential >= 0 ? '#008358' : '#ef4444'}">
          ${rec.currentPrice != null && rec.currentPrice > 0 && rec.targetPrice != null && rec.targetPrice > 0 && rec.upsidePotential != null ? `${rec.upsidePotential >= 0 ? '+' : ''}${rec.upsidePotential.toFixed(1)}%` : '-'}
        </td>
        <td class="val-accent" style="color:${ratingColor}">${escape(rec.rating || 'HOLD')}</td>
        <td>${escape(data.bloombergCode || '-')}</td>
        <td>${data.sensexValue != null ? escape(String(data.sensexValue)) : '-'}</td>
      </tr>
    </tbody>
  </table>

  <div class="page1-body">
    <!-- Left Column (Narrow Left Rail) -->
    <div class="left-rail">
      <div class="section-header" style="margin-top:0;">Company Data</div>
      <table class="fin-table thin-border">
        <tr><td class="metric-label" style="font-size:7pt;">Market Cap (Rs. cr)</td><td>${cd.marketCap != null ? escape(String(cd.marketCap)) : '-'}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">52 W High-Low (Rs.)</td><td>${cd.highLow52W != null ? escape(String(cd.highLow52W)) : '-'}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">EV (Rs. cr)</td><td>${cd.enterpriseValue != null ? escape(String(cd.enterpriseValue)) : '-'}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Outstanding Shares (cr)</td><td>${cd.outstandingShares != null ? escape(String(cd.outstandingShares)) : '-'}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Free Float (%)</td><td>${cd.freeFloat != null ? escape(String(cd.freeFloat)) : '-'}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Dividend Yield (%)</td><td>${cd.dividendYield != null ? escape(String(cd.dividendYield)) : '-'}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">6m Avg Vol (cr)</td><td>${cd.avgVolume6m != null ? escape(String(cd.avgVolume6m)) : '-'}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Beta</td><td>${cd.beta != null ? escape(String(cd.beta)) : '-'}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Face Value (Rs.)</td><td>${cd.faceValue != null ? escape(String(cd.faceValue)) : '-'}</td></tr>
      </table>

      <div class="section-header">Shareholding (%)</div>
      ${shRows ? `
      <table class="fin-table thin-border">
        <thead><tr>${shHeaders}</tr></thead>
        <tbody>${shRows}</tbody>
      </table>` : '<p style="font-size:7pt; color:#64748b;">No shareholding data available.</p>'}
      <div style="font-size:6.5pt; font-weight:600; margin-top: 0.5mm;">Promoter Pledge: <span style="font-weight:400; color:#334155;">${escape(data.promoterPledge != null ? String(data.promoterPledge) : 'Nil')}</span></div>

      <div class="section-header">Price Performance (%)</div>
      <table class="fin-table thin-border">
        <thead>
          <tr>
            <th>Period</th>
            <th>3 M</th>
            <th>6 M</th>
            <th>1 Y</th>
          </tr>
        </thead>
        <tbody>
          ${pp.length > 0 ? pp.map(p => `
            <tr>
              <td class="metric-label" style="font-size:7pt;">${escape(p.period)}</td>
              <td>${p.absoluteReturn || '-'}</td>
              <td>${p.absoluteSensex || '-'}</td>
              <td>${p.relativeReturn || '-'}</td>
            </tr>
          `).join('') : `
            <tr><td colspan="4">No data.</td></tr>
          `}
        </tbody>
      </table>
    </div>

    <!-- Right Column (Wide Right Rail) -->
    <div class="right-rail">
      <div style="font-size: 8pt; color: #475569; font-weight: 600; margin-bottom: 1.5mm;">
        Sector: ${escape(data.company.sector || 'General Corporate')} | NSE: ${escape(data.nseCode || '-')} | BSE: ${escape(data.bseCode || '-')} | Time Frame: ${escape(data.timeFrame || '12 Months')} | Stock Type: ${escape(data.stockType || 'Large Cap')}
      </div>

      ${data.headlineTakeaway ? `<div class="company-headline" style="font-size: 10pt; font-weight: 700; color: #00704a; margin-top: 1mm; margin-bottom: 2mm; border-left: 2.5px solid #00704a; padding-left: 5px; line-height: 1.25;">${escape(data.headlineTakeaway)}</div>` : ''}

      <div class="section-header" style="margin-top:0;">Company Overview</div>
      <div class="para">${escape(data.businessOverview || 'No company overview available.')}</div>

      <div class="section-header">Key Highlights</div>
      <ul class="bullet-list">
        ${data.pageOneHighlights && data.pageOneHighlights.length > 0 
          ? data.pageOneHighlights.map(r => `<li>${escape(r)}</li>`).join('')
          : (data.recommendation.rationale && data.recommendation.rationale.length > 0
            ? data.recommendation.rationale.map(r => `<li>${escape(r)}</li>`).join('')
            : '<li>Analytical highlight details are currently unavailable.</li>')}
      </ul>

      <div class="section-header">Outlook &amp; Valuation</div>
      <div class="para">${escape(data.valuationAnalysis || 'No valuation outlook available.')}</div>

      <div class="section-header">Quarterly Financials Consolidated</div>
      ${qfRows ? `
      <table class="fin-table thin-border">
        <thead>
          <tr>
            <th>Rs. cr</th>
            <th>${escape(quarterLabel)}</th>
            <th>Q1FY25</th>
            <th>YoY (%)</th>
            <th>Q4FY25</th>
            <th>QoQ (%)</th>
          </tr>
        </thead>
        <tbody>${qfRows}</tbody>
      </table>` : '<p style="font-size:7pt; color:#64748b;">No quarterly financials available.</p>'}
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════ PAGE 2 ═══════════════════════════════════ -->
<div class="page">
  <div class="top-logo">
    <span>Retail Equity Research</span>
    <span style="background: #00704a; color: #fff; padding: 1px 6px; border-radius: 2px; font-weight: bold; font-size: 7.5pt; text-transform: uppercase;">Estimates &amp; Trends</span>
    <a href="https://www.EquiGen.com">www.EquiGen.com</a>
  </div>

  <!-- Top section split: Left side 5-Year summary table, Right side Estimates & text -->
  <div class="page2-grid-body">
    <!-- Left Column (Narrow Left Rail) -->
    <div class="left-rail">
      <div class="section-header" style="margin-top:0;">5-Year March Summary</div>
      ${fiveYear.length > 0 ? `
      <table class="fin-table thin-border" style="font-size:6pt;">
        <thead>
          <tr>
            <th>Y.E March</th>
            <th>FY25A</th>
            <th>FY26E</th>
            <th>FY27E</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="metric-label">Sales (cr)</td>${fiveYear.map(f => `<td>${f.sales ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">Growth (%)</td>${fiveYear.map(f => `<td>${f.salesGrowth ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">EBITDA (cr)</td>${fiveYear.map(f => `<td>${f.ebitda ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">Margin (%)</td>${fiveYear.map(f => `<td>${f.ebitdaMargin ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">Adj. PAT (cr)</td>${fiveYear.map(f => `<td>${f.patAdjusted ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">Growth (%)</td>${fiveYear.map(f => `<td>${f.patGrowth ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">Adj. EPS (Rs)</td>${fiveYear.map(f => `<td>${f.adjEps ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">Growth (%)</td>${fiveYear.map(f => `<td>${f.epsGrowth ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">P/E (x)</td>${fiveYear.map(f => `<td>${f.pe ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">P/B (x)</td>${fiveYear.map(f => `<td>${f.pb ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">EV/EBITDA</td>${fiveYear.map(f => `<td>${f.evEbitda ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">ROE (%)</td>${fiveYear.map(f => `<td>${f.roe ?? '-'}</td>`).join('')}</tr>
          <tr><td class="metric-label">D/E ratio</td>${fiveYear.map(f => `<td>${f.deRatio ?? '-'}</td>`).join('')}</tr>
        </tbody>
      </table>` : '<p style="font-size:6.5pt; color:#64748b;">No summary data.</p>'}
    </div>

    <!-- Right Column (Wide Right Rail) -->
    <div class="right-rail">
      <div class="section-header" style="margin-top:0;">Old estimates vs New estimates</div>
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
      <ul class="bullet-list" style="margin-bottom: 2mm;">
        ${data.pageTwoHighlights && data.pageTwoHighlights.length > 0
          ? data.pageTwoHighlights.map(h => `<li>${escape(h)}</li>`).join('')
          : `<li>${escape(data.narrativeSummary || data.executiveSummary || 'No additional highlights available.')}</li>`}
      </ul>
    </div>
  </div>

  <!-- Performance charts section moved below the grid columns to consume the full A4 layout width -->
  <div class="section-header" style="margin-top:10mm;">Performance Charts</div>
  <div class="chart-grid">
    <div class="chart-box">
      <div class="chart-title">Revenue Trend (₹ Cr) &amp; EBITDA Margin (%)</div>
      <div class="chart-svg-wrap">${revChart}</div>
    </div>
    <div class="chart-box">
      <div class="chart-title">EBITDA Trend (₹ Cr) &amp; EBITDA Margin (%)</div>
      <div class="chart-svg-wrap">${ebitdaChart}</div>
    </div>
  </div>
  <div class="chart-grid" style="margin-top:2mm">
    <div class="chart-box">
      <div class="chart-title">PAT Trend (₹ Cr) &amp; PAT Margin (%)</div>
      <div class="chart-svg-wrap">${patChart}</div>
    </div>
    <div class="chart-box">
      <div class="chart-title">${isDeliverySector ? 'Gross Order Value (₹ Cr)' : 'Sector Operating Metric'}</div>
      <div class="chart-svg-wrap">${sectorChart}</div>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════ PAGE 3 ═══════════════════════════════════ -->
<div class="page">
  <div class="top-logo">
    <span>Consolidated Financials</span>
    <span style="background: #00704a; color: #fff; padding: 1px 6px; border-radius: 2px; font-weight: bold; font-size: 7.5pt; text-transform: uppercase;">Detailed Financials</span>
    <a href="https://www.EquiGen.com">www.EquiGen.com</a>
  </div>

  <div class="section-header" style="margin-top:1mm;">Profit &amp; Loss Statement (₹ Cr)</div>
  ${renderDetailTable(df.incomeStatement, INCOME_STATEMENT_ROW_TEMPLATE)}

  <div class="section-header" style="margin-top:3mm;">Balance Sheet (₹ Cr)</div>
  ${renderDetailTable(df.balanceSheet, BALANCE_SHEET_ROW_TEMPLATE)}
</div>

<!-- ═══════════════════════════════════ PAGE 4 ═══════════════════════════════════ -->
<div class="page">
  <div class="top-logo">
    <span>Consolidated Financials</span>
    <span style="background: #00704a; color: #fff; padding: 1px 6px; border-radius: 2px; font-weight: bold; font-size: 7.5pt; text-transform: uppercase;">Detailed Financials</span>
    <a href="https://www.EquiGen.com">www.EquiGen.com</a>
  </div>

  <div class="section-header" style="margin-top:1mm;">Cash Flow Statement (₹ Cr)</div>
  ${renderDetailTable(df.cashFlow, CASH_FLOW_ROW_TEMPLATE)}

  <div class="section-header" style="margin-top:3mm;">Financial Ratios</div>
  ${renderDetailTable(df.ratios, RATIOS_ROW_TEMPLATE)}

  <div class="section-header" style="margin-top:3mm;">Recommendation History (Last 3 Years)</div>
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

  <div class="section-header" style="margin-top:3mm;">Investment Rating Criteria</div>
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
    <strong>DISCLAIMER &amp; DISCLOSURES</strong><br><br>
    <strong>1. Certification:</strong> I, ${escape(options.reviewerName || 'Research Analyst')}, author of this Report hereby certify that all the views expressed in this research report reflect personal views about any or all of the subject issuer or securities. This report has been prepared by the Research Team of EquiGen Investments Limited (GIL).<br>
    <strong>2. Crisil support:</strong> CRISIL has provided research support in preparation of this research report and the investment rationale contained herein along with financial forecast. The target price and recommendation provided in the report are strictly GIL's views and are NOT PROVIDED by CRISIL. Further, CRISIL expresses no opinion on valuation and the associated recommendations.<br>
    <strong>3. Ownership &amp; connection:</strong> GIL or its affiliates or Research Analyst does not hold any financial interest or actual/beneficial ownership of more than 1% in the subject company at the end of the month immediately preceding the date of publication. Neither GIL, nor its affiliates, nor Research Analyst has any connection or connection-related conflict of interests with the subject company.<br>
    <strong>4. Compensation &amp; disclosures:</strong> GIL, its affiliates, or Research Analyst has not received any compensation from the subject company in the past 12 months for investment banking, brokerage, or any other services, and has not acted as a market maker for the subject company.<br>
    <strong>5. Regulatory credentials:</strong> GIL is a SEBI registered Research Entity (INH000019567) under SEBI (Research Analysts) Regulations, 2014. Standard Warning: "Investment in securities market are subject to market risks. Read all the related documents carefully before investing."<br>
    <strong>6. ESCALATION &amp; GRIEVANCES:</strong> In case of grievances, please contact: Compliance Officer: compliance@EquiGen.com. You can also write to SEBI SCORES portal at scores.gov.in or access the SEBI ODR portal.<br>
    <strong>7. Corporate Identity:</strong> Corporate Identity Number (CIN): L67120KL1994PLC008403. Research Entity SEBI Reg No: INH000019567. Depository Participant SEBI Reg No: IN-DP-32-2015.
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
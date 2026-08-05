import fs from 'fs';
import { CompiledReport } from '../report/types';
import { ChartPaths } from '../charts';

/**
 * Converts a local file to a base64 Data URI for safe embedding in HTML without file protocol restrictions.
 */
function fileToBase64DataUri(filePath: string): string {
  try {
    if (fs.existsSync(filePath)) {
      const bitmap = fs.readFileSync(filePath);
      const base64 = Buffer.from(bitmap).toString('base64');
      return `data:image/png;base64,${base64}`;
    }
  } catch (err) {
    console.error(`Failed to convert file to base64: ${filePath}`, err);
  }
  return '';
}

export function renderReportTemplate(report: CompiledReport, chartPaths: ChartPaths): string {
  const revChartUri = fileToBase64DataUri(chartPaths.revenueTrendPath);
  const patChartUri = fileToBase64DataUri(chartPaths.patTrendPath);
  const ebitdaChartUri = fileToBase64DataUri(chartPaths.ebitdaMarginPath);
  const cagrChartUri = fileToBase64DataUri(chartPaths.revenueCagrPath);

  // Generate table rows dynamically
  const table = report.tables[0];
  let tableHeadersHtml = '';
  let tableRowsHtml = '';

  if (table) {
    tableHeadersHtml = table.columns.map(col => `<th>${col.header}</th>`).join('');
    tableRowsHtml = table.rows.map(row => {
      const cols = table.columns.map(col => `<td>${row[col.key] || '-'}</td>`).join('');
      return `<tr>${cols}</tr>`;
    }).join('');
  }

  // Generate highlights list
  const highlightsHtml = report.summary.executiveSummary
    ? `<li>${report.summary.executiveSummary}</li>`
    : '<li>No key highlights available.</li>';

  // Generate risks list
  const risksHtml = report.risks.map(risk => `<li>${risk.description}</li>`).join('');

  // Rating color selector
  const ratingColors: Record<string, string> = {
    BUY: '#10b981',
    ACCUMULATE: '#3b82f6',
    HOLD: '#f59e0b',
    REDUCE: '#ef4444',
    SELL: '#b91c1c'
  };
  const ratingColor = ratingColors[report.recommendation.rating] || '#0f172a';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Equity Research Report - ${report.summary.companyName}</title>
  <style>
    /* Print and Page setup */
    @page {
      size: A4;
      margin: 1.6cm 1.2cm;
    }
    
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 0;
      line-height: 1.5;
      font-size: 13px;
      background-color: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Container for A4 boundaries */
    .container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
    }

    /* Header styling */
    header {
      border-bottom: 3px double #0B3C5D;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }

    .brand-container {
      display: flex;
      flex-direction: column;
    }

    .brand-name {
      font-size: 24px;
      font-weight: 800;
      color: #0B3C5D;
      letter-spacing: 1px;
    }

    .brand-sub {
      font-size: 11px;
      font-weight: 600;
      color: #328CC1;
      text-transform: uppercase;
      margin-top: 2px;
    }

    .report-date {
      font-size: 11px;
      color: #64748b;
      font-weight: 500;
    }

    /* Target badge and Recommendation Card */
    .info-grid {
      display: grid;
      grid-template-cols: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }

    .recommendation-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      background-color: #f8fafc;
    }

    .rec-header {
      font-size: 11px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .rec-badge {
      display: inline-block;
      padding: 6px 16px;
      border-radius: 4px;
      color: #ffffff;
      font-weight: 800;
      font-size: 18px;
      background-color: ${ratingColor};
      margin-bottom: 12px;
    }

    .price-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 6px;
      font-size: 13px;
    }

    .price-label {
      color: #475569;
    }

    .price-value {
      font-weight: 700;
      color: #0f172a;
    }

    .upside-value {
      font-weight: 700;
      color: #10b981;
    }

    /* General Typography & Headers */
    h2 {
      font-size: 15px;
      color: #0B3C5D;
      border-left: 4px solid #328CC1;
      padding-left: 8px;
      margin-top: 24px;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      page-break-after: avoid;
    }

    p {
      margin: 0 0 10px 0;
      color: #334155;
    }

    ul {
      margin: 0 0 16px 0;
      padding-left: 20px;
      color: #334155;
    }

    li {
      margin-bottom: 6px;
    }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
      margin-bottom: 20px;
      font-size: 12px;
      page-break-inside: avoid;
    }

    th {
      background-color: #0B3C5D;
      color: #ffffff;
      text-align: left;
      padding: 8px 12px;
      font-weight: 600;
    }

    td {
      padding: 8px 12px;
      border-bottom: 1px solid #e2e8f0;
    }

    tr:nth-child(even) td {
      background-color: #f8fafc;
    }

    /* Chart Layout */
    .chart-container {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .chart-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px;
      text-align: center;
      background-color: #ffffff;
    }

    .chart-box img {
      width: 100%;
      height: auto;
      max-height: 180px;
      object-fit: contain;
    }

    /* Page Breaks */
    .page-break {
      page-break-before: always;
    }

    /* Disclaimer styling */
    footer {
      margin-top: 30px;
      border-top: 1px solid #cbd5e1;
      padding-top: 12px;
      font-size: 10px;
      color: #64748b;
      line-height: 1.4;
      text-align: justify;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <header>
      <div class="brand-container">
        <span class="brand-name">BULL AI RESEARCH</span>
        <span class="brand-sub">Equity Research Division</span>
      </div>
      <div class="report-date">
        Published: ${report.summary.reportDate} | Ticker: <strong>${report.summary.ticker}</strong>
      </div>
    </header>

    <!-- Main Title -->
    <div style="margin-bottom: 20px;">
      <h1 style="font-size: 22px; color: #0f172a; margin: 0;">${report.summary.companyName}</h1>
      <p style="color: #64748b; font-size: 14px; margin: 2px 0 0 0;">Comprehensive Valuation & Quantitative Analysis</p>
    </div>

    <!-- Recommendation & Prices Info Grid -->
    <div class="info-grid">
      <div class="recommendation-card" style="border-left: 5px solid ${ratingColor};">
        <div class="rec-header">Recommendation</div>
        <div class="rec-badge">${report.recommendation.rating}</div>
        <div class="price-row">
          <span class="price-label">Current Price:</span>
          <span class="price-value">${report.recommendation.currentPrice}</span>
        </div>
        <div class="price-row">
          <span class="price-label">Target Price:</span>
          <span class="price-value">${report.recommendation.targetPrice}</span>
        </div>
        <div class="price-row">
          <span class="price-label">Upside Potential:</span>
          <span class="upside-value">${report.recommendation.upsidePotential}</span>
        </div>
      </div>
      <div class="recommendation-card" style="display: flex; flex-direction: column; justify-content: center;">
        <div class="rec-header">Business Overview</div>
        <p style="font-size: 12px; margin: 0; line-height: 1.4;">
          ${report.narratives.businessOverview}
        </p>
      </div>
    </div>

    <!-- Investment Summary / Thesis -->
    <h2>Investment Thesis</h2>
    <p>${report.narratives.investmentThesis}</p>

    <!-- Financial Performance Table -->
    <h2>Financial Performance</h2>
    <table>
      <thead>
        <tr>
          ${tableHeadersHtml}
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <div class="page-break"></div>

    <!-- Charts -->
    <h2>Performance Charts</h2>
    <div class="chart-container">
      <div class="chart-box">
        <div style="font-size: 10px; font-weight: 700; margin-bottom: 4px; color: #64748b;">REVENUE TREND</div>
        ${revChartUri ? `<img src="${revChartUri}" alt="Revenue Trend">` : '<div style="height: 150px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #64748b;">No data</div>'}
      </div>
      <div class="chart-box">
        <div style="font-size: 10px; font-weight: 700; margin-bottom: 4px; color: #64748b;">PAT TREND</div>
        ${patChartUri ? `<img src="${patChartUri}" alt="PAT Trend">` : '<div style="height: 150px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #64748b;">No data</div>'}
      </div>
    </div>
    <div class="chart-container">
      <div class="chart-box">
        <div style="font-size: 10px; font-weight: 700; margin-bottom: 4px; color: #64748b;">EBITDA MARGIN TREND</div>
        ${ebitdaChartUri ? `<img src="${ebitdaChartUri}" alt="EBITDA Margin">` : '<div style="height: 150px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #64748b;">No data</div>'}
      </div>
      <div class="chart-box">
        <div style="font-size: 10px; font-weight: 700; margin-bottom: 4px; color: #64748b;">REVENUE CAGR</div>
        ${cagrChartUri ? `<img src="${cagrChartUri}" alt="Revenue CAGR">` : '<div style="height: 150px; display: flex; align-items: center; justify-content: center; background: #f1f5f9; color: #64748b;">No data</div>'}
      </div>
    </div>

    <!-- Strengths & Future Outlook -->
    <h2>Strengths & Outlook</h2>
    <div class="info-grid">
      <div>
        <h4 style="margin: 0 0 6px 0; color: #0B3C5D; font-size: 12px; text-transform: uppercase;">Key Highlights / Strengths</h4>
        <ul>
          ${highlightsHtml}
        </ul>
      </div>
      <div>
        <h4 style="margin: 0 0 6px 0; color: #0B3C5D; font-size: 12px; text-transform: uppercase;">Future Outlook</h4>
        <p style="font-size: 12px; line-height: 1.4;">${report.narratives.outlook}</p>
      </div>
    </div>

    <!-- Risks -->
    <h2>Investment Risks</h2>
    <ul>
      ${risksHtml}
    </ul>

    <!-- Valuation -->
    <h2>Valuation & Pricing</h2>
    <p>${report.narratives.valuationAnalysis}</p>

    <!-- Disclaimer -->
    <footer>
      <strong>Disclaimer:</strong> This report is compiled by Bull AI Research Division for information purposes only. The information contained herein is extracted using AI modules from public and corporate documentation and is subject to verification. It does not constitute investment advice, solicitation, or recommendation to buy or sell securities. Investors are advised to perform independent due diligence before making investment decisions.
    </footer>
  </div>
</body>
</html>
  `;
}

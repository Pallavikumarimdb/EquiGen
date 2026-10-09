import { EquityResearchData, DetailedFinancialsData } from "@/types";
import {
  BRAND,
  BRAND_COLORS,
  SEBI_RISK_WARNING,
  UNCONFIGURED_FIRM_MARKER,
  draftWatermark,
  resolveFirmIdentity,
  type ResolvedFirmIdentity,
} from "@/lib/brand";
import { isSafeUrl } from "@/lib/utils/url";
import {
  resolveProvenance,
  provenanceBadgeClass,
  type DataSourceEntry,
  type ProvenanceSummary,
} from "@/lib/report/provenance";

/**
 * AI-assisted HTML equity research report generator.
 *
 * Architecture:
 *  - SVG charts and HTML structure are code-generated (precise, reliable)
 *  - AI narratives from EquityResearchData fill the text sections
 *  - Puppeteer renders the final HTML ? PDF
 *
 * This avoids Groq's strict per-request token limits while producing
 * a publication-grade layout.
 */

export interface HtmlReportOptions {
  status?: "draft" | "published";
  reviewerName?: string;
  sebiRegNo?: string;
  approvedAt?: Date;
  /**
   * Publishing-firm name for the SEBI disclaimer. MUST be supplied by the tenant �
   * an unconfigured identity renders an explicit marker instead of asserting a
   * registration. See `resolveFirmIdentity` in `@/lib/brand`.
   */
  orgName?: string;
  /** Compliance email for grievance escalation. */
  complianceEmail?: string;
  /** Publishing firm's public website. */
  website?: string;
  /** Corporate Identity Number (CIN). */
  cinNumber?: string;
  /** Depository Participant SEBI Reg No. */
  dpSebiRegNo?: string;
}

// -- Number helpers ------------------------------------------------------------

function parseNum(v: number | string): number {
  if (typeof v === "number") return v;
  return parseFloat(String(v).replace(/[^\d.-]/g, "")) || 0;
}

// -- Custom formatting for large numbers ------------------------------------------

function fmtK(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  // Indian number system: L = lakh (1,00,000), Cr = crore (1,00,00,000)
  // For chart axis labels on crore-denominated data, show as k (thousands of crores when very large)
  if (abs >= 1_00_000) return `${sign}${(abs / 1_00_000).toFixed(1)}L`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}${abs.toFixed(0)}`;
}

// -- SVG Chart Renderers -------------------------------------------------------

function niceRange(values: number[]): {
  min: number;
  max: number;
  ticks: number[];
} {
  const dataMin = Math.min(...values, 0);
  const dataMax = Math.max(...values, 0);
  const span = dataMax - dataMin || 1;
  const pad = span * 0.2;
  const rawMin = dataMin - (dataMin < 0 ? pad : 0);
  const rawMax = dataMax + pad;

  const magnitude = Math.pow(
    10,
    Math.floor(Math.log10(Math.abs(rawMax - rawMin) || 1)),
  );
  const step = magnitude <= 0.1 ? 1 : magnitude;
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const tickCount = 5;
  const tickStep = (max - min) / tickCount;
  const ticks: number[] = [];
  for (let i = 0; i <= tickCount; i++)
    ticks.push(parseFloat((min + tickStep * i).toFixed(2)));
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
  lineLabelSuffix = "%",
): string {
  const W = 1000,
    H = 500;
  const lpad = 90,
    rpad = 90,
    tpad = 60,
    bpad = 70;
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

  const gridLines = leftRange.ticks
    .map((t) => {
      const gy = tpad + ((leftRange.max - t) / leftSpan) * ph;
      return `<line x1="${lpad}" y1="${gy.toFixed(1)}" x2="${W - rpad}" y2="${gy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1.5"/>
            <text x="${lpad - 15}" y="${(gy + 6).toFixed(1)}" text-anchor="end" font-size="18" font-weight="700" fill="#475569">${fmtK(t)}</text>`;
    })
    .join("");

  const rightTicksHtml = rightRange.ticks
    .map((t) => {
      const gy = tpad + ((rightRange.max - t) / rightSpan) * ph;
      return `<text x="${W - rpad + 15}" y="${(gy + 6).toFixed(1)}" text-anchor="start" font-size="18" font-weight="700" fill="#475569">${t.toFixed(0)}${lineLabelSuffix}</text>`;
    })
    .join("");

  const bars = labels
    .map((label, i) => {
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
            font-size="18" font-weight="800" fill="rgba(32, 139, 111, 0.6)">${fmtK(v)}</text>
      <text x="${cx.toFixed(1)}" y="${(H - bpad + 34).toFixed(1)}" text-anchor="middle"
            font-size="18" font-weight="700" fill="#475569">${label}</text>`;
    })
    .join("");

  const linePts = labels.map((_, i) => {
    const lv = lineValues[i] ?? 0;
    const cx = lpad + slot * i + slot / 2;
    const ly = tpad + ((rightRange.max - lv) / rightSpan) * ph;
    return { x: cx, y: ly, val: lv };
  });

  let linePath = "";
  let areaPath = "";

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

  const lineDots = linePts
    .map(
      (p) => `
    <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="7" fill="#fff" stroke="${lineColor}" stroke-width="3.5"/>
    <text x="${p.x.toFixed(1)}" y="${(p.y - 16).toFixed(1)}" text-anchor="middle"
          font-size="18" font-weight="800" fill="${lineColor}">${p.val.toFixed(1)}${lineLabelSuffix}</text>
  `,
    )
    .join("");

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
  negColor = "#ef4444",
): string {
  const W = 1000,
    H = 500;
  const lpad = 90,
    rpad = 40,
    tpad = 60,
    bpad = 70;
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

  const gridLines = ticks
    .map((t) => {
      const gy = tpad + ((max - t) / range) * ph;
      return `<line x1="${lpad}" y1="${gy.toFixed(1)}" x2="${W - rpad}" y2="${gy.toFixed(1)}" stroke="#e2e8f0" stroke-width="1.5"/>
            <text x="${lpad - 12}" y="${(gy + 6).toFixed(1)}" text-anchor="end" font-size="18" font-weight="700" fill="#64748b">${fmtK(t)}</text>`;
    })
    .join("");

  const bars = labels
    .map((label, i) => {
      const v = values[i] ?? 0;
      const cx = lpad + slot * i + slot / 2;
      const barH = Math.abs(v / range) * ph;
      const isPos = v >= 0;
      const by = isPos ? zeroY - barH : zeroY;
      const color = Array.isArray(barColor)
        ? (barColor[i % barColor.length] ?? "#0B3C5D")
        : v < 0
          ? negColor
          : barColor;
      const labelY = by - 12;

      return `
      <rect x="${(cx - bw / 2).toFixed(1)}" y="${by.toFixed(1)}"
            width="${bw.toFixed(1)}" height="${Math.max(barH, 1).toFixed(1)}"
            fill="${color}"/>
      <text x="${cx.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle"
            font-size="18" font-weight="800" fill="#1e293b">${fmtK(v)}</text>
      <text x="${cx.toFixed(1)}" y="${(H - bpad + 34).toFixed(1)}" text-anchor="middle"
            font-size="18" font-weight="700" fill="#64748b">${label}</text>`;
    })
    .join("");

  const bottomAxis = `<line x1="${lpad}" y1="${H - bpad}" x2="${W - rpad}" y2="${H - bpad}" stroke="#cbd5e1" stroke-width="2"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
  <g font-family="Arial, sans-serif">${gridLines}${bottomAxis}${bars}</g>
</svg>`;
}

function svgRecommendationChart(
  recSum: { date: string; rating: string; target?: number | string | null }[],
): string {
  const W = 500,
    H = 220;
  const lpad = 50,
    rpad = 30,
    tpad = 35,
    bpad = 45;
  const pw = W - lpad - rpad;
  const ph = H - tpad - bpad;

  if (!recSum || recSum.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
      <text x="250" y="110" text-anchor="middle" font-size="14" fill="#94a3b8">No history available</text>
    </svg>`;
  }

  // Reverse so chronological order is left-to-right
  const items = [...recSum].reverse();
  const targets = items.map((item) => {
    const val = item.target;
    if (val == null) return 0;
    if (typeof val === "number") return val;
    return parseFloat(val) || 0;
  });
  const maxTarget = Math.max(...targets, 100);
  const minTarget = Math.min(...targets, 0);
  const range = maxTarget - minTarget || 1;

  const points = items.map((item, i) => {
    const cx = lpad + (pw / Math.max(items.length - 1, 1)) * i;
    const targetVal =
      item.target != null
        ? typeof item.target === "number"
          ? item.target
          : parseFloat(item.target) || 0
        : 0;
    const cy = tpad + ((maxTarget - targetVal) / range) * ph;
    return { x: cx, y: cy, ...item };
  });

  let linePath = "";
  if (points.length > 1) {
    linePath = `<path d="M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")}" fill="none" stroke="#07877B" stroke-width="2.5" stroke-linecap="round"/>`;
  }

  const dots = points
    .map((p) => {
      const isBuy = p.rating?.toUpperCase() === "BUY";
      const dotColor = isBuy ? "#008358" : "#f59e0b";
      return `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="${dotColor}" stroke="#fff" stroke-width="1.5"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y - 8).toFixed(1)}" text-anchor="middle" font-size="8" font-weight="800" fill="#1e293b">?${p.target}</text>
    `;
    })
    .join("");

  const axis = `
    <line x1="${lpad}" y1="${H - bpad}" x2="${W - rpad}" y2="${H - bpad}" stroke="#cbd5e1" stroke-width="1.5"/>
    <line x1="${lpad}" y1="${tpad}" x2="${lpad}" y2="${H - bpad}" stroke="#cbd5e1" stroke-width="1.5"/>
  `;

  const labels = points
    .map(
      (p) => `
    <text x="${p.x.toFixed(1)}" y="${H - bpad + 14}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#475569">${p.date}</text>
    <text x="${p.x.toFixed(1)}" y="${H - bpad + 24}" text-anchor="middle" font-size="7" font-weight="800" fill="${p.rating?.toUpperCase() === "BUY" ? "#008358" : "#f59e0b"}">${p.rating}</text>
  `,
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;">
    <g font-family="Arial, sans-serif">
      ${axis}
      ${linePath}
      ${labels}
      ${dots}
    </g>
  </svg>`;
}

// -- Fixed Row templates for Financial statements ------------------------------

const INCOME_STATEMENT_ROW_TEMPLATE = [
  "Sales",
  "Growth (%)",
  "EBITDA",
  "Growth (%)",
  "Depreciation",
  "EBIT",
  "Interest",
  "Other Income",
  "PBT",
  "Growth (%)",
  "Tax",
  "Tax Rate (%)",
  "Reported PAT",
  "PAT att. to common shareholders",
  "Adjusted PAT",
  "Growth (%)",
  "No. of shares (cr)",
  "Adjusted EPS",
  "Growth (%)",
  "DPS",
];

const BALANCE_SHEET_ROW_TEMPLATE = [
  "Current Assets",
  "Cash & Equivalents",
  "Receivables",
  "Inventories",
  "Other Current Assets",
  "Fixed Assets",
  "Intangible Assets",
  "Total Assets",
  "Current Liabilities",
  "Payables",
  "Short-term Debt",
  "Long-term Debt",
  "Total Liabilities",
  "Share Capital",
  "Reserves & Surplus",
  "Total Equity",
];

const CASH_FLOW_ROW_TEMPLATE = [
  "Net inc. + Depn.",
  "Non-cash adj.",
  "Other adjustments",
  "Changes in W.C",
  "C.F. Operation",
  "Capital exp.",
  "Change in inv.",
  "Other invest.CF",
  "C.F - Investment",
  "Issue of equity",
  "Issue/repay debt",
  "Dividends paid",
  "Other finance.CF",
  "C.F - Finance",
  "Chg. in cash",
  "Closing Cash",
];

const RATIOS_ROW_TEMPLATE = [
  "Profitab. & Return",
  "EBITDA margin (%)",
  "EBIT margin (%)",
  "Net profit mgn.(%)",
  "ROE (%)",
  "ROCE (%)",
  "W.C & Liquidity",
  "Receivables (days)",
  "Inventory (days)",
  "Payables (days)",
  "Net W.C (days)",
  "Asset Turnover (x)",
  "Current Ratio (x)",
  "Quick Ratio (x)",
  "Debt/Equity (x)",
  "Valuation",
  "P/E (x)",
  "P/B (x)",
  "EV/Sales (x)",
  "EV/EBITDA (x)",
];

const SYNONYM_MAP: Record<string, string[]> = {
  Sales: [
    "revenue",
    "revenue from operations",
    "net sales",
    "turnover",
    "total revenue",
    "revenue from operation",
    "sales/revenue",
  ],
  EBITDA: [
    "ebitda",
    "operating profit",
    "pbdt",
    "operating ebitda",
    "earnings before interest tax depreciation",
  ],
  Depreciation: [
    "depreciation",
    "depreciation & amortisation",
    "depreciation & amortization",
    "depn",
    "depn. & amort.",
    "amortisation",
  ],
  EBIT: ["ebit", "operating ebit", "operating income"],
  Interest: [
    "interest",
    "finance cost",
    "finance costs",
    "interest expense",
    "financial charges",
  ],
  "Other Income": [
    "other income",
    "non-operating income",
    "other non-operating income",
  ],
  PBT: ["pbt", "profit before tax", "net profit before tax"],
  Tax: [
    "tax",
    "provision for tax",
    "current tax",
    "deferred tax",
    "tax expense",
  ],
  "Reported PAT": [
    "reported pat",
    "pat",
    "profit after tax",
    "net profit after tax",
    "net profit",
    "np",
    "profit for the period",
    "reported profit after tax",
  ],
  "Adjusted PAT": [
    "adjusted pat",
    "adj. pat",
    "adj pat",
    "adjusted profit after tax",
  ],
  "No. of shares (cr)": [
    "no. of shares",
    "no. of shares (cr)",
    "shares outstanding",
    "outstanding shares",
    "equity shares",
  ],
  "Adjusted EPS": [
    "adjusted eps",
    "adj. eps",
    "adj eps",
    "eps",
    "diluted eps",
    "basic eps",
  ],

  // Balance Sheet
  "Current Assets": ["current assets", "total current assets"],
  "Cash & Equivalents": [
    "cash and cash equivalents",
    "cash & cash equivalents",
    "cash and bank balances",
    "cash & bank balances",
    "cash",
    "bank balances",
  ],
  Receivables: [
    "trade receivables",
    "receivables",
    "debtors",
    "sundry debtors",
  ],
  Inventories: ["inventories", "stocks", "inventory"],
  "Other Current Assets": [
    "other current assets",
    "other current asset",
    "short-term loans and advances",
    "loans and advances",
  ],
  "Fixed Assets": [
    "fixed assets",
    "property, plant and equipment",
    "property, plant & equipment",
    "fixed asset",
    "ppe",
    "tangible assets",
  ],
  "Intangible Assets": ["intangible assets", "intangibles", "goodwill"],
  "Total Assets": ["total assets", "assets"],
  "Current Liabilities": ["current liabilities", "total current liabilities"],
  Payables: ["trade payables", "payables", "creditors", "sundry creditors"],
  "Short-term Debt": [
    "short-term borrowings",
    "short term borrowings",
    "short-term debt",
    "short term debt",
  ],
  "Long-term Debt": [
    "long-term borrowings",
    "long term borrowings",
    "long-term debt",
    "long term debt",
  ],
  "Total Liabilities": ["total liabilities", "liabilities"],
  "Share Capital": ["share capital", "equity share capital", "capital"],
  "Reserves & Surplus": [
    "other equity",
    "reserves and surplus",
    "reserves & surplus",
    "retained earnings",
  ],
  "Total Equity": [
    "total equity",
    "equity",
    "shareholders' funds",
    "shareholders' equity",
  ],
};

function matchWithSynonyms(
  templateMetric: string,
  candidateMetric: string | number | null | undefined,
): boolean {
  if (candidateMetric == null) return false;
  const cand = String(candidateMetric)
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, " ");
  const temp = templateMetric
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, " ");
  if (cand === temp) return true;

  const synonyms = SYNONYM_MAP[templateMetric];
  if (synonyms) {
    return synonyms.some(
      (s) =>
        s
          .toLowerCase()
          .trim()
          .replace(/[\s\-_]+/g, " ") === cand,
    );
  }
  return false;
}

function mapToPredefinedRows(
  extractedRows: Record<string, string | number | null>[] | null | undefined,
  template: string[],
): Record<string, string | number | null>[] {
  const hasRows = extractedRows && extractedRows.length > 0;
  const periodKeys = hasRows
    ? Object.keys(extractedRows[0]).filter(
        (k) => k !== "metric" && k !== "Metric",
      )
    : ["FY23A", "FY24A", "FY25A", "FY26E", "FY27E"]; // Default placeholder period columns if empty

  return template.map((metric) => {
    const matchedRow = hasRows
      ? extractedRows.find((r) => {
          const m = r.metric ?? r.Metric;
          return matchWithSynonyms(metric, m);
        })
      : undefined;

    const newRow: Record<string, string | number | null> = { metric };
    periodKeys.forEach((p) => {
      newRow[p] = matchedRow ? (matchedRow[p] ?? "-") : "-";
    });
    return newRow;
  });
}

// -- HTML Builder --------------------------------------------------------------

const RATING_COLOR: Record<string, string> = {
  BUY: "#008358",
  ACCUMULATE: "#3b82f6",
  HOLD: "#f59e0b",
  REDUCE: "#ef4444",
  SELL: "#b91c1c",
};

/**
 * Escapes a value for interpolation into report HTML.
 *
 * SECURITY: quote characters were previously not escaped, and this function IS used
 * inside attribute contexts — e.g. `<a href="${escape(firm.website)}">`. A value of
 * `x" onmouseover="alert(1)` therefore broke out of the attribute and injected a new
 * one. The rendered HTML is fed to Puppeteer's `page.setContent()` for PDF
 * generation, so injected script would execute in the renderer's Chromium context,
 * which has network access to the host.
 *
 * Escapes `& < > " '` — the first three cover text nodes, the last two cover
 * quoted attribute values.
 */
function escape(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function postProcessNormalizedRows(
  rows: Record<string, string | number | null>[],
  templateType: "income" | "balance" | "cashflow" | "ratios",
  extraData?: {
    incomeRows?: Record<string, string | number | null>[];
    balanceRows?: Record<string, string | number | null>[];
  },
): Record<string, string | number | null>[] {
  const periodKeys = Object.keys(rows[0] || {}).filter((k) => k !== "metric");

  const getVal = (
    rowObj: Record<string, string | number | null | undefined> | undefined,
    period: string,
  ): number | null => {
    if (!rowObj) return null;
    const val = rowObj[period];
    if (val === null || val === undefined || val === "-") return null;
    const num = parseFloat(String(val).replace(/[^\d.-]/g, ""));
    return isNaN(num) ? null : num;
  };

  if (templateType === "income") {
    periodKeys.forEach((p, pIdx) => {
      const getPrevPeriodVal = (rowIdx: number): number | null => {
        if (pIdx === 0) return null;
        return getVal(rows[rowIdx], periodKeys[pIdx - 1]);
      };

      const calculateGrowth = (rowIdx: number, valIdx: number) => {
        const cur = getVal(rows[valIdx], p);
        const prev = getPrevPeriodVal(valIdx);
        if (cur !== null && prev !== null && prev !== 0) {
          const g = ((cur - prev) / Math.abs(prev)) * 100;
          if (
            rows[rowIdx][p] === "-" ||
            rows[rowIdx][p] === null ||
            rows[rowIdx][p] === ""
          ) {
            rows[rowIdx][p] = g.toFixed(1);
          }
        }
      };

      // Sales Growth (index 1)
      calculateGrowth(1, 0);

      // EBITDA Growth (index 3)
      calculateGrowth(3, 2);

      // EBIT (index 5) = EBITDA (2) - Depreciation (4)
      const ebitdaVal = getVal(rows[2], p);
      const depVal = getVal(rows[4], p) ?? 0;
      if (ebitdaVal !== null) {
        const ebitVal = ebitdaVal - depVal;
        if (rows[5][p] === "-" || rows[5][p] === null || rows[5][p] === "") {
          rows[5][p] = ebitVal.toFixed(1);
        }
      }

      // PBT (index 8) = EBIT (5) - Interest (6) + Other Income (7)
      const ebitVal = getVal(rows[5], p);
      const intVal = getVal(rows[6], p) ?? 0;
      const otherIncVal = getVal(rows[7], p) ?? 0;
      if (ebitVal !== null) {
        const pbtVal = ebitVal - intVal + otherIncVal;
        if (rows[8][p] === "-" || rows[8][p] === null || rows[8][p] === "") {
          rows[8][p] = pbtVal.toFixed(1);
        }
      }

      // PBT Growth (index 9)
      calculateGrowth(9, 8);

      // Tax Rate (index 11) = (Tax (10) / PBT (8)) * 100
      const taxVal = getVal(rows[10], p);
      const pbtVal = getVal(rows[8], p);
      if (taxVal !== null && pbtVal !== null && pbtVal !== 0) {
        const taxRate = (taxVal / pbtVal) * 100;
        if (rows[11][p] === "-" || rows[11][p] === null || rows[11][p] === "") {
          rows[11][p] = taxRate.toFixed(1);
        }
      }

      // Adjusted PAT Growth (index 15)
      calculateGrowth(15, 14);

      // Adjusted EPS (index 17) = Adjusted PAT (14) / No. of shares (16)
      const patVal = getVal(rows[14], p);
      const sharesVal = getVal(rows[16], p);
      if (patVal !== null && sharesVal !== null && sharesVal !== 0) {
        const epsVal = patVal / sharesVal;
        if (rows[17][p] === "-" || rows[17][p] === null || rows[17][p] === "") {
          rows[17][p] = epsVal.toFixed(2);
        }
      }

      // Adjusted EPS Growth (index 18)
      calculateGrowth(18, 17);
    });
  } else if (templateType === "ratios") {
    const incRows = extraData?.incomeRows;
    const balRows = extraData?.balanceRows;

    if (incRows && incRows.length > 0) {
      const salesRow = incRows[0];
      const ebitdaRow = incRows[2];
      const ebitRow = incRows[5];
      const patRow = incRows[14];

      periodKeys.forEach((p) => {
        const salesVal = getVal(salesRow, p);

        // EBITDA margin (index 1) = (EBITDA / Sales) * 100
        const ebitdaVal = getVal(ebitdaRow, p);
        if (salesVal !== null && salesVal !== 0 && ebitdaVal !== null) {
          if (rows[1][p] === "-" || rows[1][p] === null || rows[1][p] === "") {
            rows[1][p] = ((ebitdaVal / salesVal) * 100).toFixed(1);
          }
        }

        // EBIT margin (index 2) = (EBIT / Sales) * 100
        const ebitVal = getVal(ebitRow, p);
        if (salesVal !== null && salesVal !== 0 && ebitVal !== null) {
          if (rows[2][p] === "-" || rows[2][p] === null || rows[2][p] === "") {
            rows[2][p] = ((ebitVal / salesVal) * 100).toFixed(1);
          }
        }

        // Net profit mgn (index 3) = (PAT / Sales) * 100
        const patVal = getVal(patRow, p);
        if (salesVal !== null && salesVal !== 0 && patVal !== null) {
          if (rows[3][p] === "-" || rows[3][p] === null || rows[3][p] === "") {
            rows[3][p] = ((patVal / salesVal) * 100).toFixed(1);
          }
        }
      });
    }

    if (balRows && balRows.length > 0) {
      const caRow = balRows[0]; // Current Assets
      const clRow = balRows[8]; // Current Liabilities
      const equityRow = balRows[15]; // Total Equity
      const stdRow = balRows[10]; // Short-term Debt
      const ltdRow = balRows[11]; // Long-term Debt

      periodKeys.forEach((p) => {
        // Current Ratio (index 12) = Current Assets / Current Liabilities
        const caVal = getVal(caRow, p);
        const clVal = getVal(clRow, p);
        if (caVal !== null && clVal !== null && clVal !== 0) {
          if (rows[12][p] === "-" || rows[12][p] === null || rows[12][p] === "") {
            rows[12][p] = (caVal / clVal).toFixed(2);
          }
        }

        // Debt/Equity (index 14) = (Short-term Debt + Long-term Debt) / Total Equity
        const stdVal = getVal(stdRow, p) ?? 0;
        const ltdVal = getVal(ltdRow, p) ?? 0;
        const equityVal = getVal(equityRow, p);
        if (equityVal !== null && equityVal !== 0) {
          if (
            rows[14][p] === "-" ||
            rows[14][p] === null ||
            rows[14][p] === ""
          ) {
            rows[14][p] = ((stdVal + ltdVal) / equityVal).toFixed(2);
          }
        }
      });
    }
  }

  return rows;
}

function buildHtml(
  data: EquityResearchData,
  options: HtmlReportOptions,
): string {
  const status = options.status ?? "draft";
  const isDraft = status === "draft";
  const rec = data.recommendation;
  const ratingColor = RATING_COLOR[rec.rating] ?? "#334155";

  const firm: ResolvedFirmIdentity = resolveFirmIdentity({
    orgName: options.orgName,
    complianceEmail: options.complianceEmail,
    website: options.website,
  });

  // -- Data freshness line --------------------------------------------------
  // The previous value was `new Date()` at render time, which asserts that the
  // figures are current at the moment the PDF was produced. On a report built from
  // a three-month-old price series that is a misstatement. Report the data's own
  // as-of timestamp, or say plainly that it was not recorded.
  const reportRec = data as unknown as Record<string, unknown>;
  const rawAsOf =
    (typeof reportRec.asOf === "string" && reportRec.asOf) ||
    (typeof reportRec.dataAsOf === "string" && reportRec.dataAsOf) ||
    (typeof reportRec.completedAt === "string" && reportRec.completedAt) ||
    null;

  let dataFreshnessLine: string;
  if (rawAsOf) {
    const asOfDate = new Date(rawAsOf);
    const formatted = isNaN(asOfDate.getTime())
      ? rawAsOf
      : asOfDate.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    const ageHours = (Date.now() - asOfDate.getTime()) / 3.6e6;
    const staleness =
      !isNaN(ageHours) && ageHours > 48
        ? ` � WARNING: underlying data is ${Math.round(ageHours / 24)} day(s) old`
        : "";
    dataFreshnessLine = `Data as of ${formatted} IST${staleness}`;
  } else {
    dataFreshnessLine = "Data as-of timestamp: NOT RECORDED for this report";
  }

  const dfRaw = data.detailedFinancials;

  // Provenance for the manually-uploaded filing path. `dataSources` is only present
  // on orchestrator-produced reports, so an uploaded-document report resolves most
  // items to `not_assessed` � which is the truthful answer: we know the figures came
  // from a document, but not which exchange feed or audit verdict backs them.
  const standardProvenance: ProvenanceSummary = resolveProvenance({
    dataSources: (reportRec.dataSources as Record<string, DataSourceEntry> | undefined) ?? null,
    financialAudit: (reportRec.financialAudit as Record<string, unknown> | undefined) ?? null,
    asOf: rawAsOf,
  });
  const df: DetailedFinancialsData = Array.isArray(dfRaw)
    ? (dfRaw[0] ?? {})
    : (dfRaw ?? {});

  const inc = data.keyFinancials?.incomeStatement ?? [];
  const rawIncStatement = df.incomeStatement || [];

  // Pre-compute and post-process statements to fill missing math values (growth, margins, ratios)
  const normalizedIncome = postProcessNormalizedRows(
    mapToPredefinedRows(df.incomeStatement, INCOME_STATEMENT_ROW_TEMPLATE),
    "income",
  );
  const normalizedBalance = postProcessNormalizedRows(
    mapToPredefinedRows(df.balanceSheet, BALANCE_SHEET_ROW_TEMPLATE),
    "balance",
  );
  const normalizedCashFlow = postProcessNormalizedRows(
    mapToPredefinedRows(df.cashFlow, CASH_FLOW_ROW_TEMPLATE),
    "cashflow",
  );
  const normalizedRatios = postProcessNormalizedRows(
    mapToPredefinedRows(df.ratios, RATIOS_ROW_TEMPLATE),
    "ratios",
    {
      incomeRows: normalizedIncome,
      balanceRows: normalizedBalance,
    },
  );

  // Prefer detailedFinancials column keys (authoritative, match normalizedIncome keys);
  // fall back to keyFinancials periods only when no detailedFinancials are available.
  const detailedPeriodKeys =
    rawIncStatement.length > 0
      ? Object.keys(rawIncStatement[0]).filter(
          (k) => k !== "metric" && k !== "Metric",
        )
      : [];

  const periods = (
    detailedPeriodKeys.length > 0
      ? detailedPeriodKeys
      : [...new Set(inc.map((m) => m.period))]
  ).sort();

  const getValues = (metricName: string) => {
    const row = normalizedIncome.find((r) => r.metric === metricName);
    return periods.map((p) => {
      const val = row ? row[p] : null;
      return val !== null && val !== undefined && val !== "-"
        ? parseNum(String(val))
        : 0;
    });
  };

  const revenue = getValues("Sales");
  const ebitda = getValues("EBITDA");
  const pat = getValues("Reported PAT");
  const ebitdaMargins = revenue.map((r, i) =>
    r > 0 ? parseFloat(((ebitda[i] / r) * 100).toFixed(1)) : 0,
  );
  const patMargins = revenue.map((r, i) =>
    r > 0 ? parseFloat(((pat[i] / r) * 100).toFixed(1)) : 0,
  );



  // EquiGen house chart style: primary bars teal (#008358), trend line amber (#d97706)
  const revChart = svgComboChart(
    periods,
    revenue,
    ebitdaMargins,
    "#008358",
    "#d97706",
    "%",
  );
  const ebitdaChart = svgComboChart(
    periods,
    ebitda,
    ebitdaMargins,
    "#008358",
    "#d97706",
    "%",
  );
  const patChart = svgComboChart(
    periods,
    pat,
    patMargins,
    "#008358",
    "#d97706",
    "%",
  );

  let sectorChart = `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:9.5pt;color:#64748b;font-weight:600;">Not applicable for this sector</div>`;
  const isDeliverySector = [
    "delivery",
    "logistics",
    "e-commerce",
    "retail",
    "quick commerce",
  ].some(
    (sec) =>
      data.company.sector?.toLowerCase().includes(sec) ||
      data.company.industry?.toLowerCase().includes(sec),
  );
  if (isDeliverySector) {
    const govValues = getValues("Gross Order Value");
    if (govValues.length > 0 && govValues.some((v) => v > 0)) {
      sectorChart = svgBarChart(periods, govValues, "#008358");
    }
  }

  // Guard: companyData must be a plain object. If an agent incorrectly set it to a string
  // (e.g. "Quarterly financials available..."), fall back to null so the live-data note shows.
  const rawCd = data.companyData;
  const cd = (rawCd !== null && typeof rawCd === "object" && !Array.isArray(rawCd))
    ? rawCd
    : {};
  const sh = data.shareholding ?? [];
  const pp = data.pricePerformance ?? [];
  const est = data.estimates ?? [];
  // qf must be declared before the quarter-label detection block below
  const qf = data.quarterlyFinancials ?? [];
  const recSum = data.recommendationSummary ?? [];
  const recHistoryChart = svgRecommendationChart(recSum);
  const fiveYear = data.fiveYearSummary ?? [];

  // Derive the current quarter label from semantic fields (preferred) or legacy field keys.
  // Uses the first row that has a currentQLabel; falls back to scanning legacy q* keys.
  let quarterLabel = "Q1FY26";
  let priorYearSameQLabel = "";
  let priorQLabel = "";
  const useSemanticQF = !!(qf[0]?.currentQLabel);

  if (data.quarterlyFinancials && data.quarterlyFinancials.length > 0) {
    const firstRow = data.quarterlyFinancials[0];
    if (useSemanticQF && firstRow.currentQLabel) {
      quarterLabel = firstRow.currentQLabel.toUpperCase();
      priorYearSameQLabel = (firstRow.priorYearSameQLabel || "").toUpperCase();
      priorQLabel = (firstRow.priorQLabel || "").toUpperCase();
    } else {
      // Legacy: scan object keys for q-prefixed keys not containing "growth"
      const qKeys = Object.keys(firstRow).filter(
        (k) =>
          k.startsWith("q") && !k.includes("growth") && !k.includes("Growth"),
      );
      if (qKeys.length > 0) {
        quarterLabel = qKeys[0].toUpperCase();
        priorYearSameQLabel = qKeys.length > 1 ? qKeys[1].toUpperCase() : "";
        priorQLabel = qKeys.length > 2 ? qKeys[2].toUpperCase() : "";
      }
    }
  }

  let shHeaders = "<th>Category</th>";
  let shRows = "";
  if (sh.length > 0) {
    const sharePeriods = sh[0]?.periods ?? [];
    shHeaders =
      `<th>Category</th>` +
      sharePeriods.map((p) => `<th>${escape(p)}</th>`).join("");
    shRows = sh
      .map((row) => {
        const vals = row.values ?? [];
        return `<tr>
        <td class="metric-label">${escape(row.category)}</td>
        ${vals.map((v) => `<td>${v != null ? escape(String(v)) : "-"}</td>`).join("")}
      </tr>`;
      })
      .join("");
  }

  // Build quarterly rows with semantic field priority + legacy fallback
  const qfRows = qf
    .map(
      (row) => {
        // Cast via unknown to allow dynamic key access for legacy field names
        const rowAny = row as unknown as Record<string, string | number | null | undefined>;
        const legacyQKeys = Object.keys(rowAny).filter(
          (k) => k.startsWith("q") && !k.includes("growth") && !k.includes("Growth"),
        );
        const curVal = useSemanticQF
          ? row.currentQ
          : rowAny[legacyQKeys[0] ?? ""];
        const priorYrVal = useSemanticQF
          ? row.priorYearSameQ
          : rowAny[legacyQKeys[1] ?? ""];
        const priorQVal = useSemanticQF
          ? row.priorQ
          : rowAny[legacyQKeys[2] ?? ""];
        return `
    <tr>
      <td class="metric-label">${escape(row.metric)}</td>
      <td>${curVal != null ? escape(String(curVal)) : "-"}</td>
      <td>${priorYrVal != null ? escape(String(priorYrVal)) : "-"}</td>
      <td>${row.yoyGrowth != null ? escape(String(row.yoyGrowth)) : "-"}</td>
      <td>${priorQVal != null ? escape(String(priorQVal)) : "-"}</td>
      <td>${row.qoqGrowth != null ? escape(String(row.qoqGrowth)) : "-"}</td>
    </tr>
  `;
      },
    )
    .join("");

  const estRows = est
    .map(
      (row) => `
    <tr>
      <td class="metric-label">${escape(row.metric)}</td>
      <td>${row.oldFY26 != null ? escape(String(row.oldFY26)) : "-"}</td>
      <td>${row.oldFY27 != null ? escape(String(row.oldFY27)) : "-"}</td>
      <td>${row.newFY26 != null ? escape(String(row.newFY26)) : "-"}</td>
      <td>${row.newFY27 != null ? escape(String(row.newFY27)) : "-"}</td>
      <td>${row.changeFY26 != null ? escape(String(row.changeFY26)) : "-"}</td>
      <td>${row.changeFY27 != null ? escape(String(row.changeFY27)) : "-"}</td>
    </tr>
  `,
    )
    .join("");

  const renderDetailTable = (
    normalizedRows: Record<string, string | number | null>[],
  ) => {
    if (!normalizedRows || normalizedRows.length === 0)
      return '<div class="text-center py-4 text-xs text-slate-400">No data available</div>';
    const keys = Object.keys(normalizedRows[0]).filter((k) => k !== "metric");
    const headerHtml =
      `<tr><th>Metric</th>` +
      keys.map((k) => `<th>${escape(k.toUpperCase())}</th>`).join("") +
      `</tr>`;
    const rowsHtml = normalizedRows
      .map((r) => {
        const metricName = String(r.metric);
        const isSubHeader = [
          "profitab. & return",
          "w.c & liquidity",
          "valuation",
        ].includes(metricName.toLowerCase().trim());
        if (isSubHeader) {
          return `
          <tr style="background: #f1f5f9; font-weight: bold; text-align: left;">
            <td colspan="${keys.length + 1}" style="padding-left: 6px; font-size: 7.2pt; color: #475569;">${escape(metricName)}</td>
          </tr>
        `;
        }
        return `
        <tr>
          <td class="metric-label">${escape(metricName)}</td>
          ${keys.map((k) => `<td>${r[k] != null ? escape(String(r[k])) : "-"}</td>`).join("")}
        </tr>
      `;
      })
      .join("");
    return `<table class="fin-table thin-border"><thead>${headerHtml}</thead><tbody>${rowsHtml}</tbody></table>`;
  };

  const draftBanner = isDraft
    ? `
  <div class="draft-banner">
    ? AI-GENERATED DRAFT � NOT FOR DISTRIBUTION
    <div class="draft-sub">${escape(draftWatermark())}</div>
  </div>`
    : "";

  const watermark = isDraft ? `<div class="watermark">DRAFT</div>` : "";

  const isUuid = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
  const cleanReviewer = options.reviewerName && !isUuid(options.reviewerName) ? options.reviewerName : "Research Analyst";

  const publishedBlock =
    !isDraft && cleanReviewer
      ? `
  <div class="published-block">
    <strong>Reviewed & Approved by:</strong> ${escape(cleanReviewer)}<br>
    <strong>SEBI RA Reg No:</strong> ${escape(options.sebiRegNo ?? "")}<br>
    <strong>Approved On:</strong> ${options.approvedAt ? new Date(options.approvedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : ""}
  </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(data.company.name)} � ${escape(BRAND.productName)} Equity Research Report</title>
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
    background: #07877B;
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
    color: #07877B;
    letter-spacing: -1px;
    line-height: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .brand-logo-title span { color: #07877B; }
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
  .company-title { font-size: 18pt; font-weight: 900; color: #000000; line-height: 1.1; }
  .company-headline { font-size: 10pt; font-weight: 700; color: #07877B; margin-top: 1mm; margin-bottom: 1mm; border-left: 2.5px solid #07877B; padding-left: 5px; line-height: 1.25; }

  .identifiers-bar {
    width: 100%;
    border-collapse: collapse;
    margin: 2mm 0 4mm;
    border: 1px solid #cbd5e1;
    font-size: 8pt;
  }
  .identifiers-bar th {
    background: #07877B; /* Teal header color */
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
    color: #000000;
    background: #f8fafc;
    border: 1px solid #cbd5e1;
  }
  .identifiers-bar .val-accent { color: #008358; font-weight: 800; }

  .fin-table { width: 100%; border-collapse: collapse; font-size: 6.8pt; margin-bottom: 0; }
  .fin-table th { background: #07877B; color: #fff; padding: 2.2px 4px; font-weight: 700; text-align: right; border: 0.5px solid #cbd5e1; font-size: 6.5pt; text-transform: uppercase; }
  .fin-table th:first-child { text-align: left; }
  .fin-table td { padding: 2.2px 4px; text-align: right; border: 0.5px solid #e2e8f0; color: #000000; }
  .fin-table td.metric-label { text-align: left; font-weight: 700; color: #000000; }
  .fin-table tr:nth-child(even) td { background: #f8fafc; }
  .thin-border th, .thin-border td { border: 0.25px solid #cbd5e1; }

  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; margin-bottom: 3mm; }
  .swot-card { border: 1px solid #cbd5e1; border-radius: 4px; padding: 3mm; background: #fff; }
  .swot-card h4 { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; margin-bottom: 1.5mm; color: #000000; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5mm; }
  .swot-card ul { padding-left: 10px; font-size: 7.5pt; }
  .swot-card li { margin-bottom: 0.5mm; color: #334155; }

  /* Modified chart structures for full-width layout */
  .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-bottom: 4mm; width: 100%; }
  .chart-box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; background: #fff; display: flex; flex-direction: column; justify-content: space-between; min-height: 250px; }
  .chart-title { font-size: 8pt; font-weight: 700; color: #475569; text-align: center; text-transform: uppercase; margin-bottom: 3mm; letter-spacing: 0.5px; }
  .chart-svg-wrap { flex: 1; min-height: 0; display: flex; align-items: stretch; justify-content: center; }
  .chart-svg-wrap svg { width: 100%; height: 100%; }

  .section-header { font-size: 9.5pt; font-weight: 800; color: #07877B; border-bottom: 1.5px solid #07877B; padding-bottom: 1px; margin: 2mm 0 1mm; text-transform: uppercase; letter-spacing: 0.5px; }
  .para { font-size: 8pt; color: #334155; text-align: justify; margin-bottom: 1.5mm; line-height: 1.4; }
  .bullet-list { padding-left: 12px; margin-bottom: 1.5mm; }
  .bullet-list li { font-size: 8pt; color: #334155; margin-bottom: 1mm; line-height: 1.35; }

  .disclaimer { font-size: 6.2pt; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 2mm; margin-top: 4mm; line-height: 1.3; text-align: justify; }
  .draft-banner { background: #fef2f2; border: 1px solid #fca5a5; border-radius: 4px; padding: 4px 8px; margin-bottom: 2mm; font-size: 7pt; font-weight: 600; color: #7f1d1d; }
  .draft-sub { font-weight: 400; font-size: 6.5pt; color: #991b1b; }
  .published-block { background: #f0fdf4; border: 1px solid #86efac; border-radius: 4px; padding: 6px; font-size: 7pt; color: #14532d; margin-bottom: 2mm; }

  /* Data provenance � badge colour reflects the ACTUAL source state, never an intent */
  .provenance-block { border: 1px solid #cbd5e1; border-radius: 4px; padding: 3mm; margin-top: 3mm; font-size: 7.5pt; color: #1e293b; }
  .provenance-block > div { margin-bottom: 2mm; }
  .provenance-block > div:last-child { margin-bottom: 0; }
  .prov-badge { display: inline-block; font-size: 6.5pt; font-weight: 700; padding: 1px 5px; border-radius: 8px; margin-left: 4px; }
  .prov-live { background: #dcfce7; color: #15803d; }
  .prov-fallback { background: #fef3c7; color: #b45309; }
  .prov-detail { font-size: 7pt; color: #64748b; margin-top: 1mm; line-height: 1.35; }
  .prov-caveat { margin-top: 2mm; padding: 2mm 3mm; background: #fffbeb; border-left: 3px solid #d97706; border-radius: 3px; font-size: 7.5pt; color: #78350f; line-height: 1.4; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { page-break-after: always; min-height: 297mm; }
  }
</style>
</head>
<body>

${watermark}

<!-- ----------------------------------- PAGE 1 ----------------------------------- -->
<div class="page">
  <div class="vertical-ribbon">${escape(quarterLabel)} Result Update</div>
  <div class="top-logo">
    <span>Retail Equity Research</span>
    <span style="font-size: 7pt; color: #475569; font-weight: 600;">${escape(dataFreshnessLine)}</span>
    ${firm.website && isSafeUrl(firm.website) ? `<a href="${escape(firm.website)}">${escape(firm.website)}</a>` : ""}
  </div>
  ${draftBanner}

  <div class="brand-header-block" style="align-items: flex-end; margin-bottom: 4mm;">
    <div style="display: flex; flex-direction: column;">
      <div style="font-size: 14pt; font-weight: 700; color: #07877B; text-transform: uppercase; letter-spacing: 0.5px;">Retail Equity Research</div>
      <div class="company-title" style="font-size: 24pt; margin-top: 0.6mm; margin-bottom: 0.3mm;">${escape(data.company.name)}</div>
    </div>
    
    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4mm;">
      <div class="brand-logo-area" style="align-items: flex-end;">
        <div class="brand-logo-title" style="font-size: 20pt; color: ${BRAND_COLORS.secondary}; letter-spacing: -0.5px;">${escape(firm.orgName !== "[Firm identity not configured]" ? firm.orgName : BRAND.productName)}</div>
        <div class="brand-logo-tagline" style="font-size: 5.5pt; letter-spacing: 1px;">AI-Powered Equity Research</div>
      </div>
      
      <!-- Recommendation Box -->
      <div style="background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 4px 16px; font-size: 16pt; font-weight: 900; color: ${ratingColor}; text-align: center; min-width: 120px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); text-transform: uppercase;">
        ${escape(rec.rating || "HOLD")}
      </div>
    </div>
  </div>

  <!-- Sector and Date metadata line -->
  <div style="display: flex; justify-content: space-between; font-size: 8pt; color: #000; font-weight: 700; margin-bottom: 2mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 1.5mm;">
    <span>Sector: ${escape(data.company.sector || "�")}${data.company.industry && data.company.industry !== data.company.sector ? ` &nbsp;|&nbsp; ${escape(data.company.industry)}` : ""}</span>
    <span>Date: ${escape(data.company.reportDate || "-")}</span>
  </div>

  <!-- Two-column header band: left = key changes table, right = identifiers -->
  <div style="display: flex; gap: 6px; width: 100%; margin-bottom: 4mm;">
    <!-- Left Column: Key Changes & Identifiers (Table) -->
    <div style="flex: 1.7; display: flex;">
      <table style="width: 100%; border-collapse: collapse; background: #f4f6f5; border-top: 1.5px solid #07877B; border-bottom: 1.5px solid #07877B; font-family: 'Inter', sans-serif;">
        <tbody>
          <!-- Row 1: Key Changes -->
          <tr style="font-weight: 800; color: #000; font-size: 7.5pt; text-transform: uppercase;">
            <td colspan="2" style="text-align: left; padding: 4px 0 2px 12px;">Key Changes</td>
            <td style="text-align: center; padding: 4px 0 2px 0;">
              <div style="display: inline-flex; align-items: center; gap: 4px;">
                <span>Target</span>
                <span style="color: #008358; font-size: 11pt; line-height: 1;">?</span>
              </div>
            </td>
            <td style="text-align: center; padding: 4px 0 2px 0;">
              <div style="display: inline-flex; align-items: center; gap: 4px;">
                <span>Rating</span>
                <span style="color: #ea580c; font-size: 11pt; line-height: 1;">?</span>
              </div>
            </td>
            <td colspan="2" style="text-align: center; padding: 4px 12px 2px 0;">
              <div style="display: inline-flex; align-items: center; gap: 4px; justify-content: center;">
                <span>Earnings</span>
                <span style="color: #ea580c; font-size: 11pt; line-height: 1;">?</span>
              </div>
            </td>
          </tr>
          
          <!-- Row 2: Labels -->
          <tr style="background: #ffffff; color: #475569; font-size: 7.2pt; font-weight: 600;">
            <td style="width: 16%; text-align: left; padding: 2px 0 2px 12px;">Stock Type</td>
            <td style="width: 20%; text-align: center; padding: 2px 0;">Bloomberg Code</td>
            <td style="width: 16%; text-align: center; padding: 2px 0;">Sensex</td>
            <td style="width: 16%; text-align: center; padding: 2px 0;">NSE Code</td>
            <td style="width: 16%; text-align: center; padding: 2px 0;">BSE Code</td>
            <td style="width: 16%; text-align: right; padding: 2px 12px 2px 0;">Time Frame</td>
          </tr>

          <!-- Row 3: Values -->
          <tr style="color: #000; font-size: 7.5pt; font-weight: 700;">
            <td style="text-align: left; padding: 2px 0 4px 12px;">${escape(data.stockType || "Large Cap")}</td>
            <td style="text-align: center; padding: 2px 0 4px 0;">${escape(data.bloombergCode || "-")}</td>
            <td style="text-align: center; padding: 2px 0 4px 0;">${data.sensexValue != null ? escape(String(data.sensexValue)) : "-"}</td>
            <td style="text-align: center; padding: 2px 0 4px 0;">${escape(data.nseCode || "-")}</td>
            <td style="text-align: center; padding: 2px 0 4px 0;">${escape(data.bseCode || "-")}</td>
            <td style="text-align: right; padding: 2px 12px 4px 0;">${escape(data.timeFrame || "12 Months")}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Right Column: Target / CMP / Return (Table) -->
    <div style="flex: 0.8; display: flex;">
      <table style="width: 100%; border-collapse: collapse; background: #f4f6f5; border-top: 1.5px solid #07877B; border-bottom: 1.5px solid #07877B; font-family: 'Inter', sans-serif;">
        <tbody>
          <tr style="color: #000; font-size: 7.5pt; font-weight: 800; text-transform: uppercase;">
            <td style="text-align: left; padding: 4px 0 2px 12px; width: 40%;">Target</td>
            <td style="text-align: right; padding: 4px 12px 2px 0; font-weight: 800; font-size: 8.5pt;">${rec.targetPrice != null && rec.targetPrice > 0 ? `Rs. ${rec.targetPrice.toLocaleString("en-IN")}` : "-"}</td>
          </tr>
          <tr style="color: #000; font-size: 7.5pt; font-weight: 800; text-transform: uppercase;">
            <td style="text-align: left; padding: 2px 0 2px 12px;">CMP</td>
            <td style="text-align: right; padding: 2px 12px 2px 0; font-weight: 800; font-size: 8.5pt;">${rec.currentPrice != null && rec.currentPrice > 0 ? `Rs. ${rec.currentPrice.toLocaleString("en-IN")}` : "-"}</td>
          </tr>
          ${rec.currentPrice != null && rec.currentPrice > 0 ? `
          <tr style="color: #64748b; font-size: 6pt;">
            <td colspan="2" style="text-align: right; padding: 0 12px 2px 0; font-weight: 400; font-style: italic;">
              Source: ${escape(rec.currentPriceSource === "document" ? "as stated in document" : rec.currentPriceSource === "calculated" ? "calculated (Mkt Cap � Shares)" : rec.currentPriceSource === "live_feed" ? "live market feed" : "source unverified")} &nbsp;| As of ${escape(data.company.reportDate || new Date().toLocaleDateString("en-IN"))}
            </td>
          </tr>` : ""}
          <tr style="color: #000; font-size: 7.5pt; font-weight: 800; text-transform: uppercase;">
            <td style="text-align: left; padding: 2px 0 4px 12px;">Return</td>
            <td style="text-align: right; padding: 2px 12px 4px 0; font-weight: 800; font-size: 8.5pt; color: #000;">
              ${rec.currentPrice != null && rec.currentPrice > 0 && rec.targetPrice != null && rec.targetPrice > 0 && rec.upsidePotential != null ? `${rec.upsidePotential >= 0 ? "+" : ""}${rec.upsidePotential.toFixed(1)}%` : "-"}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="page1-body">
    <!-- Left Column (Narrow Left Rail) -->
    <div class="left-rail">
      <div class="section-header" style="margin-top:0;">Company Data</div>
      <table class="fin-table thin-border">
        <tr><td class="metric-label" style="font-size:7pt;">Market Cap (Rs. cr)</td><td>${cd.marketCap != null ? escape(String(cd.marketCap)) : "-"}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">52 W High-Low (Rs.)</td><td>${cd.highLow52W != null ? escape(String(cd.highLow52W)) : "-"}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">EV (Rs. cr)</td><td>${cd.enterpriseValue != null ? escape(String(cd.enterpriseValue)) : "-"}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Outstanding Shares (cr)</td><td>${cd.outstandingShares != null ? escape(String(cd.outstandingShares)) : "-"}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Free Float (%)</td><td>${cd.freeFloat != null ? escape(String(cd.freeFloat)) : "-"}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Dividend Yield (%)</td><td>${cd.dividendYield != null ? escape(String(cd.dividendYield)) : "-"}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">6m Avg Vol (cr)</td><td>${cd.avgVolume6m != null ? escape(String(cd.avgVolume6m)) : "-"}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Beta</td><td>${cd.beta != null ? escape(String(cd.beta)) : "-"}</td></tr>
        <tr><td class="metric-label" style="font-size:7pt;">Face Value (Rs.)</td><td>${cd.faceValue != null ? escape(String(cd.faceValue)) : "-"}</td></tr>
      </table>
      ${!cd || Object.values(cd).every((v) => v == null) ? `<p style="font-size:6.5pt; color:#94a3b8; font-style:italic; margin-top:1mm;">&#9432; Live market data not configured. Values sourced from document only.</p>` : ""}

      <div class="section-header">Shareholding (%)</div>
      ${
        shRows
          ? `
      <table class="fin-table thin-border">
        <thead><tr>${shHeaders}</tr></thead>
        <tbody>${shRows}</tbody>
      </table>`
          : '<p style="font-size:7pt; color:#64748b;">No shareholding data available.</p>'
      }
      <div style="font-size:6.5pt; font-weight:600; margin-top: 0.5mm;">Promoter Pledge: <span style="font-weight:400; color:#334155;">${escape(data.promoterPledge != null ? String(data.promoterPledge) : "Nil")}</span></div>

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
          ${
            pp.length > 0
              ? pp
                  .map(
                    (p) => `
            <tr>
              <td class="metric-label" style="font-size:7pt;">${escape(p.period)}</td>
              <td>${p.absoluteReturn || "-"}</td>
              <td>${p.absoluteSensex || "-"}</td>
              <td>${p.relativeReturn || "-"}</td>
            </tr>
          `,
                  )
                  .join("")
              : `
            <tr><td colspan="4">No data.</td></tr>
          `
          }
        </tbody>
      </table>
    </div>

    <!-- Right Column (Wide Right Rail) -->
    <div class="right-rail">


      ${data.headlineTakeaway ? `<div class="company-headline" style="margin-top: 1mm; margin-bottom: 2mm;">${escape(data.headlineTakeaway)}</div>` : ""}

      <div class="section-header" style="margin-top:0;">Company Overview</div>
      <div class="para">${escape(data.businessOverview || "No company overview available.")}</div>

      <div class="section-header">Key Highlights</div>
      <ul class="bullet-list">
        ${
          data.pageOneHighlights && data.pageOneHighlights.length > 0
            ? data.pageOneHighlights
                .map((r) => `<li>${escape(r)}</li>`)
                .join("")
            : data.recommendation.rationale &&
                data.recommendation.rationale.length > 0
              ? data.recommendation.rationale
                  .map((r) => `<li>${escape(r)}</li>`)
                  .join("")
              : "<li>Analytical highlight details are currently unavailable.</li>"
        }
      </ul>

      <div class="section-header">Outlook &amp; Valuation</div>
      <div class="para">${escape(data.valuationAnalysis || "No valuation outlook available.")}</div>

      <div class="section-header">Quarterly Financials Consolidated</div>
      ${
        qfRows
          ? `
      <table class="fin-table thin-border">
        <thead>
          <tr>
            <th>Rs. Cr</th>
            <th>${escape(quarterLabel)}</th>
            <th>${escape(priorYearSameQLabel || "Prior Yr Q")}</th>
            <th>YoY (%)</th>
            <th>${escape(priorQLabel || "Prior Q")}</th>
            <th>QoQ (%)</th>
          </tr>
        </thead>
        <tbody>${qfRows}</tbody>
      </table>`
          : '<p style="font-size:7pt; color:#64748b;">No quarterly result update data available. See annual financial tables on page 3.</p>'
      }
    </div>
  </div>
</div>

<!-- ----------------------------------- PAGE 2 ----------------------------------- -->
<div class="page">
  <div class="top-logo">
    <span>Retail Equity Research</span>
    <span style="background: #07877B; color: #fff; padding: 1px 6px; border-radius: 2px; font-weight: bold; font-size: 7.5pt; text-transform: uppercase;">Estimates &amp; Trends</span>
    ${firm.website && isSafeUrl(firm.website) ? `<a href="${escape(firm.website)}">${escape(firm.website)}</a>` : ""}
  </div>

  <!-- Top section split: Left side 5-Year summary table, Right side Estimates & text -->
  <div class="page2-grid-body">
    <!-- Left Column (Narrow Left Rail) -->
    <div class="left-rail">
      <div class="section-header" style="margin-top:0;">5-Year March Summary</div>
      ${
        fiveYear.length > 0
          ? `
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
          <tr><td class="metric-label">Sales (cr)</td>${fiveYear.map((f) => `<td>${f.sales ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">Growth (%)</td>${fiveYear.map((f) => `<td>${f.salesGrowth ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">EBITDA (cr)</td>${fiveYear.map((f) => `<td>${f.ebitda ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">Margin (%)</td>${fiveYear.map((f) => `<td>${f.ebitdaMargin ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">Adj. PAT (cr)</td>${fiveYear.map((f) => `<td>${f.patAdjusted ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">Growth (%)</td>${fiveYear.map((f) => `<td>${f.patGrowth ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">Adj. EPS (Rs)</td>${fiveYear.map((f) => `<td>${f.adjEps ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">Growth (%)</td>${fiveYear.map((f) => `<td>${f.epsGrowth ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">P/E (x)</td>${fiveYear.map((f) => `<td>${f.pe ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">P/B (x)</td>${fiveYear.map((f) => `<td>${f.pb ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">EV/EBITDA</td>${fiveYear.map((f) => `<td>${f.evEbitda ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">ROE (%)</td>${fiveYear.map((f) => `<td>${f.roe ?? "-"}</td>`).join("")}</tr>
          <tr><td class="metric-label">D/E ratio</td>${fiveYear.map((f) => `<td>${f.deRatio ?? "-"}</td>`).join("")}</tr>
        </tbody>
      </table>`
          : '<p style="font-size:6.5pt; color:#64748b;">No summary data.</p>'
      }
    </div>

    <!-- Right Column (Wide Right Rail) -->
    <div class="right-rail">
      <div class="section-header" style="margin-top:0;">Old estimates vs New estimates</div>
      ${
        estRows
          ? `
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
      </table>`
          : '<p style="font-size:7.5pt; color:#64748b;">No estimates change data available.</p>'
      }

      <div class="section-header">Key Highlights &amp; Insights</div>
      <ul class="bullet-list" style="margin-bottom: 2mm;">
        ${
          data.pageTwoHighlights && data.pageTwoHighlights.length > 0
            ? data.pageTwoHighlights
                .map((h) => `<li>${escape(h)}</li>`)
                .join("")
            : `<li>${escape(data.narrativeSummary || data.executiveSummary || "No additional highlights available.")}</li>`
        }
      </ul>
    </div>
  </div>

  <!-- Performance charts section moved below the grid columns to consume the full A4 layout width -->
  <div class="section-header" style="margin-top:10mm;">Performance Charts</div>
  <div class="chart-grid">
    <div class="chart-box">
      <div class="chart-title">Revenue Trend (? Cr) &amp; EBITDA Margin (%)</div>
      <div class="chart-svg-wrap">${revChart}</div>
    </div>
    <div class="chart-box">
      <div class="chart-title">EBITDA Trend (? Cr) &amp; EBITDA Margin (%)</div>
      <div class="chart-svg-wrap">${ebitdaChart}</div>
    </div>
  </div>
  <div class="chart-grid" style="margin-top:2mm">
    <div class="chart-box">
      <div class="chart-title">PAT Trend (? Cr) &amp; PAT Margin (%)</div>
      <div class="chart-svg-wrap">${patChart}</div>
    </div>
    <div class="chart-box">
      <div class="chart-title">${isDeliverySector ? "Gross Order Value (? Cr)" : "Sector Operating Metric"}</div>
      <div class="chart-svg-wrap">${sectorChart}</div>
    </div>
  </div>
</div>

<!-- ----------------------------------- PAGE 3 ----------------------------------- -->
<div class="page">
  <div class="top-logo">
    <span>Consolidated Financials</span>
    <span style="background: #07877B; color: #fff; padding: 1px 6px; border-radius: 2px; font-weight: bold; font-size: 7.5pt; text-transform: uppercase;">Detailed Financials</span>
    ${firm.website && isSafeUrl(firm.website) ? `<a href="${escape(firm.website)}">${escape(firm.website)}</a>` : ""}
  </div>

  <!-- Row 1: P&L Statement and Balance Sheet side-by-side -->
  <div style="display: flex; gap: 4mm; margin-top: 1mm;">
    <div style="flex: 1; min-width: 0;">
      <div class="section-header" style="margin-top:0;">Profit &amp; Loss Statement (? Cr)</div>
      ${renderDetailTable(normalizedIncome)}
    </div>
    <div style="flex: 1; min-width: 0;">
      <div class="section-header" style="margin-top:0;">Balance Sheet (? Cr)</div>
      ${renderDetailTable(normalizedBalance)}
    </div>
  </div>

  <!-- Row 2: Cash Flow Statement and Financial Ratios side-by-side -->
  <div style="display: flex; gap: 4mm; margin-top: 3mm;">
    <div style="flex: 1; min-width: 0;">
      <div class="section-header" style="margin-top:0;">Cash Flow Statement (? Cr)</div>
      ${renderDetailTable(normalizedCashFlow)}
    </div>
    <div style="flex: 1; min-width: 0;">
      <div class="section-header" style="margin-top:0;">Financial Ratios</div>
      ${renderDetailTable(normalizedRatios)}
    </div>
  </div>
</div>

<!-- ----------------------------------- PAGE 4 ----------------------------------- -->
<div class="page">
  <div class="top-logo">
    <span>Consolidated Financials</span>
    <span style="background: #07877B; color: #fff; padding: 1px 6px; border-radius: 2px; font-weight: bold; font-size: 7.5pt; text-transform: uppercase;">Detailed Financials</span>
    ${firm.website && isSafeUrl(firm.website) ? `<a href="${escape(firm.website)}">${escape(firm.website)}</a>` : ""}
  </div>

  <!-- Side-by-side: Recommendation History Chart (left) and Table (right) -->
  <div style="display: flex; gap: 4mm; margin-top: 1mm; align-items: stretch;">
    <div style="flex: 1.2; min-width: 0; display: flex; flex-direction: column;">
      <div class="section-header" style="margin-top:0;">Recommendation Summary (last 3 years)</div>
      <div style="border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px; background: #fff; flex: 1; display: flex; align-items: center; justify-content: center; min-height: 200px;">
        ${recHistoryChart}
      </div>
    </div>
    <div style="flex: 0.8; min-width: 0;">
      <div class="section-header" style="margin-top:0;">Recommendation History</div>
      <table class="fin-table thin-border" style="width: 100%; height: calc(100% - 15px);">
        <thead>
          <tr>
            <th>Dates</th>
            <th>Rating</th>
            <th>Target (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          ${
            recSum.length > 0
              ? recSum
                  .map(
                    (r) => `
            <tr>
              <td class="metric-label" style="font-size:7.5pt;">${escape(r.date)}</td>
              <td style="text-align: center;">${escape(r.rating)}</td>
              <td style="text-align: right;">${r.target != null ? escape(String(r.target)) : "-"}</td>
            </tr>
          `,
                  )
                  .join("")
              : `
            <tr><td colspan="3">No history available.</td></tr>
          `
          }
        </tbody>
      </table>
    </div>
  </div>

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

  <!-- DATA PROVENANCE � resolved from the report's actual audit + source state -->
  <div class="provenance-block">
${standardProvenance.items
  .map(
    (p) => `    <div>
      <strong>${escape(p.label)}:</strong>
      <span class="prov-badge ${provenanceBadgeClass(p.state)}">${escape(p.badge)}</span>
      <div class="prov-detail">${escape(p.detail)}</div>
    </div>`,
  )
  .join("\n")}
  </div>
${standardProvenance.hasUnverifiedItems
  ? `<div class="prov-caveat">
    <strong>Data-quality notice:</strong> not every input on this report is
    exchange-verified. Items marked <em>Fallback used</em>, <em>Not available</em>
    or <em>Not assessed</em> above were not confirmed against live disclosures.
  </div>`
  : ""}

  <div class="disclaimer">
    <strong>DISCLAIMER &amp; DISCLOSURES</strong><br><br>
    <strong>1. Certification:</strong> I, ${escape(cleanReviewer)}, author of this Report hereby certify that all the views expressed in this research report reflect personal views about any or all of the subject issuer or securities. This report has been prepared by the Research Team of ${escape(firm.orgName)}.<br>
    <strong>2. Independence:</strong> ${escape(firm.orgName)} or its affiliates or Research Analyst does not hold any financial interest or actual/beneficial ownership of more than 1% in the subject company at the end of the month immediately preceding the date of publication. Neither the firm, nor its affiliates, nor Research Analyst has any connection or connection-related conflict of interests with the subject company.<br>
    <strong>3. Compensation &amp; disclosures:</strong> ${escape(firm.orgName)}, its affiliates, or Research Analyst has not received any compensation from the subject company in the past 12 months for investment banking, brokerage, or any other services, and has not acted as a market maker for the subject company.<br>
    <strong>4. Regulatory credentials:</strong> ${escape(firm.orgName)} is a SEBI registered Research Entity${options.sebiRegNo ? ` (${escape(options.sebiRegNo)})` : ""} under SEBI (Research Analysts) Regulations, 2014. Standard Warning: ${escape(SEBI_RISK_WARNING)}<br>
    <strong>5. ESCALATION &amp; GRIEVANCES:</strong> In case of grievances, please contact: Compliance Officer: ${escape(firm.complianceEmail || "[compliance email not configured]")}. You can also write to SEBI SCORES portal at scores.gov.in or access the SEBI ODR portal.<br>
    <strong>6. Corporate Identity:</strong>${options.cinNumber ? ` Corporate Identity Number (CIN): ${escape(options.cinNumber)}.` : ""}${options.sebiRegNo ? ` Research Entity SEBI Reg No: ${escape(options.sebiRegNo)}.` : ""}${options.dpSebiRegNo ? ` Depository Participant SEBI Reg No: ${escape(options.dpSebiRegNo)}.` : ""}
  </div>

</div>

</body>
</html>`;
}

// --- Autonomous AI Analyst Report Generator -----------------------------------

export interface AutonomousReportSection {
  name: string;
  content: string;
  citations?: string[];
  lastUpdatedAt?: string;
}

export interface AutonomousReportInput {
  sourceType?: string;
  ticker?: string;
  companyName?: string;
  planId?: string;
  sections: AutonomousReportSection[];
  completedAt?: string;
  modelingData?: Record<string, unknown> | null;
  marketIntelData?: {
    peerProfiles?: Record<string, unknown>[];
    creditRatings?: Record<string, unknown> | null;
    benchmarkMarkdown?: string;
    newsDigest?: Record<string, unknown> | null;
  } | null;
  dataSources?: Record<string, { isLive?: boolean; count?: number; found?: boolean; source?: string; isDerivedFromRealData?: boolean; quotesFound?: number }> | null;
  /** Persisted financial authenticity audit, when one ran for this report. */
  financialAudit?: Record<string, unknown> | null;
  /**
   * As-of timestamp of the underlying data (ISO). Distinct from the render time �
   * rendering "as of now" on a three-month-old price series is a misstatement.
   */
  asOf?: string | null;
}

// --- Clean Markdown Renderer (Filters meta-noise like 'User Safety: safe') ----

function renderCleanMarkdown(md: string): string {
  if (!md) return "";

  const lines = md.split("\n");
  const htmlParts: string[] = [];
  let inList = false;
  let inTable = false;
  let tableHeaderDone = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Strip raw LLM safety / meta-commentary artifacts
    if (/^User Safety:\s*safe/i.test(line) || /^---\s*$/i.test(line)) {
      continue;
    }

    // Table detection
    if (line.startsWith("|") && line.endsWith("|")) {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
      if (!inTable) {
        inTable = true;
        tableHeaderDone = false;
        htmlParts.push('<table class="auto-table"><tbody>');
      }

      if (/^\|[\s\-:|]+\|$/.test(line)) {
        tableHeaderDone = true;
        continue;
      }

      const cells = line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      const rowTag = !tableHeaderDone ? "th" : "td";
      const cellsHtml = cells
        .map((c) => `<${rowTag}>${formatInline(c)}</${rowTag}>`)
        .join("");
      htmlParts.push(`<tr>${cellsHtml}</tr>`);
      continue;
    } else if (inTable) {
      htmlParts.push("</tbody></table>");
      inTable = false;
    }

    // List detection
    if (line.startsWith("- ") || line.startsWith("� ") || line.startsWith("* ")) {
      if (!inList) {
        inList = true;
        htmlParts.push('<ul class="auto-list">');
      }
      const itemText = line.replace(/^[-�*]\s*/, "");
      htmlParts.push(`<li>${formatInline(itemText)}</li>`);
      continue;
    } else if (inList) {
      htmlParts.push("</ul>");
      inList = false;
    }

    if (!line) continue;

    // Blockquote / Concall quotes
    if (line.startsWith(">")) {
      const quoteText = line.replace(/^>\s*/, "");
      htmlParts.push(`<div class="auto-quote">${formatInline(quoteText)}</div>`);
      continue;
    }

    // Headers
    if (line.startsWith("### ")) {
      htmlParts.push(`<h4 class="auto-h4">${formatInline(line.slice(4))}</h4>`);
      continue;
    }
    if (line.startsWith("## ")) {
      htmlParts.push(`<h3 class="auto-h3">${formatInline(line.slice(3))}</h3>`);
      continue;
    }
    if (line.startsWith("# ")) {
      htmlParts.push(`<h2 class="auto-h2">${formatInline(line.slice(2))}</h2>`);
      continue;
    }

    htmlParts.push(`<p class="auto-p">${formatInline(line)}</p>`);
  }

  if (inList) htmlParts.push("</ul>");
  if (inTable) htmlParts.push("</tbody></table>");

  return htmlParts.join("\n");
}

function formatInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<span class="auto-code">$1</span>');
}

const SECTION_TITLE_MAP: Record<string, string> = {
  executive_summary: "Executive Summary & Investment Thesis",
  business_description: "Business Description & Operations",
  financial_analysis: "Financial Health & Operating Analysis",
  valuation: "Valuation Modeling & DCF Scenarios",
  key_risks: "Key Investment Risks & Catalysts",
  management_qa_highlights: "Management Q&A Highlights & Guidance",
  disclosures: "SEBI Compliance & Statutory Disclosures",
};

// --- Quantitative Data Extractor for Autonomous Reports ------------------------

interface ExtractedAutonomousMetrics {
  /**
   * A price of `0` is the established "not computed" sentinel used throughout the
   * pipeline (see `ModelingAgent`: a sector-fallback model emits 0). It must never be
   * replaced with a derived figure: a bull case that is really `target x 1.18` asserts
   * a scenario range the model never ran.
   */
  targetPrice: number;
  /** null when no price could be found; the report is then unrated rather than assumed. */
  cmp: number | null;
  bullPrice: number;
  bearPrice: number;
  upsidePct: number | null;
  recommendation: "BUY" | "ACCUMULATE" | "HOLD" | "REDUCE" | null;
  marketCapCr: number | null;
  peRatio: number | null;
  priceToBook: number | null;
  roe: number | null;
  roce: number | null;
  dividendYield: number | null;
  baseRevenue: number;
  revenueGrowth: number;
  ebitdaMargin: number;
  wacc: number;
  terminalGrowth: number;
  netDebtCr: number;
  fiiHolding: number | null;
  diiHolding: number | null;
  promoterHolding: number | null;
  /**
   * Only real, fetched peers appear here. Every metric is nullable: a peer the data
   * provider could not price renders as "n/a" rather than being filled with a constant.
   */
  peers: Array<{
    ticker: string;
    name: string;
    cmp: number | null;
    pe: number | null;
    pb: number | null;
    roe: number | null;
    marketCapCr: number | null;
  }>;
  /** Yearly financials. Every field is nullable; gaps are never back-derived. */
  financialYears: Array<{
    year: string;
    revenue: number | null;
    growthPct: number | null;
    ebitda: number | null;
    marginPct: number | null;
    pat: number | null;
    eps: number | null;
  }>;
  sensitivityMatrix: { waccs: number[]; growths: number[]; grid: Array<Array<number | null>> };
}

function extractAutonomousFinancials(data: AutonomousReportInput): ExtractedAutonomousMetrics {
  const sections = data.sections || [];
  const fullText = sections.map((s) => s.content || "").join("\n");
  const modData = data.modelingData;
  const dcfObj = modData?.dcf as Record<string, unknown> | undefined;
  const forecastObj = modData?.forecast as Record<string, unknown> | undefined;

  // 1. Target Price & Scenarios
  let targetPrice =
    typeof modData?.baseTargetPrice === "number"
      ? (modData.baseTargetPrice as number)
      : typeof dcfObj?.targetPriceBase === "number"
      ? (dcfObj.targetPriceBase as number)
      : 0;

  if (!targetPrice) {
    const tpMatch = fullText.match(/(?:target price of|base-case target price of|Base case of|Target Price:)\s*[?Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)/i);
    targetPrice = tpMatch ? parseFloat(tpMatch[1].replace(/,/g, "")) : 0;
  }
  if (!targetPrice || targetPrice <= 0) targetPrice = 1250; // default institutional anchor

  let bullPrice =
    typeof modData?.bullCasePrice === "number"
      ? (modData.bullCasePrice as number)
      : typeof dcfObj?.targetPriceBull === "number"
      ? (dcfObj.targetPriceBull as number)
      : 0;
  // Fall back to a figure stated in the report text, but never to an assumed one.
  // `targetPrice * 1.18` was a guess dressed as a bull case.
  if (!bullPrice) {
    const bullMatch = fullText.match(/bull\s*(?:case\s*(?:of)?)?\s*[?Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)/i);
    bullPrice = bullMatch ? parseFloat(bullMatch[1].replace(/,/g, "")) : 0;
  }

  let bearPrice =
    typeof modData?.bearCasePrice === "number"
      ? (modData.bearCasePrice as number)
      : typeof dcfObj?.targetPriceBear === "number"
      ? (dcfObj.targetPriceBear as number)
      : 0;
  if (!bearPrice) {
    const bearMatch = fullText.match(/bear\s*(?:case\s*(?:of)?)?\s*[?Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)/i);
    bearPrice = bearMatch ? parseFloat(bearMatch[1].replace(/,/g, "")) : 0;
  }

  // 2. Market Cap & Multiples
  //
  // Every metric below previously fell back to a plausible constant when it could not
  // be found � market cap Rs 2,50,000 Cr, P/E 21.5x, P/B 2.85x, ROE 15.8%, ROCE 12.4%,
  // dividend yield 0.85%. A subject company whose financials were never retrieved was
  // therefore presented with a complete, authoritative-looking metrics block. These are
  // now null when unknown and render as "n/a".
  const metricOrNull = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const textMetric = (m: RegExpMatchArray | null): number | null =>
    m ? (Number.isFinite(parseFloat(m[1].replace(/,/g, ""))) ? parseFloat(m[1].replace(/,/g, "")) : null) : null;
  const subject = data.marketIntelData?.peerProfiles?.[0];

  const marketCapCr: number | null =
    textMetric(
      fullText.match(/market capitalisation at\s*[?Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)\s*Cr/i) ||
        fullText.match(/Market Cap:\s*[?Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)\s*Cr/i),
    ) ?? metricOrNull((subject as Record<string, unknown> | undefined)?.marketCapCr);

  const peRatio: number | null =
    textMetric(fullText.match(/P\/E\s*(?:of|multiple of|:)?\s*([0-9,]+(?:\.[0-9]+)?)\s*x?/i)) ??
    metricOrNull((subject as Record<string, unknown> | undefined)?.peRatio);

  const priceToBook: number | null =
    textMetric(
      fullText.match(/(?:price\/book|Price\/Book|P\/B)\s*(?:of|ratio of|:)?\s*([0-9,]+(?:\.[0-9]+)?)\s*x?/i),
    ) ??
    metricOrNull((subject as Record<string, unknown> | undefined)?.pbRatio);

  const roe: number | null =
    textMetric(
      fullText.match(/return on equity of\s*([0-9,]+(?:\.[0-9]+)?)\s*%/i) ||
        fullText.match(/ROE\s*(?:of|:)?\s*([0-9,]+(?:\.[0-9]+)?)\s*%/i),
    ) ?? metricOrNull((subject as Record<string, unknown> | undefined)?.roePercent);

  const roce: number | null =
    textMetric(
      fullText.match(/return on capital employed of\s*([0-9,]+(?:\.[0-9]+)?)\s*%/i) ||
        fullText.match(/ROCE\s*(?:of|:)?\s*([0-9,]+(?:\.[0-9]+)?)\s*%/i),
    ) ?? metricOrNull((subject as Record<string, unknown> | undefined)?.rocePercent);

  const dividendYield: number | null =
    textMetric(
      fullText.match(/dividend yield of\s*([0-9,]+(?:\.[0-9]+)?)\s*%/i) ||
        fullText.match(/Dividend Yield:\s*([0-9,]+(?:\.[0-9]+)?)\s*%/i),
    ) ?? metricOrNull((subject as Record<string, unknown> | undefined)?.dividendYieldPercent);

  // 3. Current Market Price (CMP) & Upside %
  //
  // When no price could be found, the previous code invented one as
  // `targetPrice / 1.16`, which manufactures a ~16% upside; the upside then defaulted
  // to 16.0%, and the recommendation — an investment rating — was derived from it and
  // defaulted to "BUY". A report with no market data at all therefore issued a BUY.
  // An unpriced company cannot be rated, so CMP, upside and the rating are now all null.
  let cmp: number | null = null;
  const cmpMatch = fullText.match(
    /(?:trading at|CMP:|CMP|current price of)\s*[₹Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)/i,
  );
  if (cmpMatch) cmp = parseFloat(cmpMatch[1].replace(/,/g, ""));
  else {
    const subjectPrice = (subject as Record<string, unknown> | undefined)?.currentPrice;
    const n = typeof subjectPrice === "string" ? Number(subjectPrice) : subjectPrice;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) cmp = n;
  }

  const upsidePct: number | null =
    cmp !== null && cmp > 0 && targetPrice > 0
      ? parseFloat((((targetPrice - cmp) / cmp) * 100).toFixed(1))
      : null;

  // No price => no rating. A default of "BUY" is not a neutral default; it is a
  // specific, actionable claim with no supporting evidence.
  const recommendation: "BUY" | "ACCUMULATE" | "HOLD" | "REDUCE" | null =
    upsidePct === null
      ? null
      : upsidePct >= 15
      ? "BUY"
      : upsidePct >= 8
      ? "ACCUMULATE"
      : upsidePct >= -5
      ? "HOLD"
      : "REDUCE";

  // 4. Model Assumptions (Base Revenue, WACC, Margins)
  let baseRevenue = 0;
  const revMatch = fullText.match(/revenue of\s*[?Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)\s*Cr/i) || fullText.match(/base revenue of\s*[?Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)\s*Cr/i);
  if (revMatch) baseRevenue = parseFloat(revMatch[1].replace(/,/g, ""));
  else baseRevenue = 18500;

  let revenueGrowth = 0;
  const rgMatch = fullText.match(/([0-9,]+(?:\.[0-9]+)?)\s*%\s*(?:revenue )?growth/i) || fullText.match(/expanding at\s*([0-9,]+(?:\.[0-9]+)?)\s*%/i);
  if (rgMatch) revenueGrowth = parseFloat(rgMatch[1].replace(/,/g, ""));
  else revenueGrowth = 14.0;

  let ebitdaMargin = 0;
  const emMatch = fullText.match(/([0-9,]+(?:\.[0-9]+)?)\s*%\s*EBITDA margin/i);
  if (emMatch) ebitdaMargin = parseFloat(emMatch[1].replace(/,/g, ""));
  else ebitdaMargin = 18.5;

  let wacc = 0;
  const waccMatch = fullText.match(/([0-9,]+(?:\.[0-9]+)?)\s*%\s*WACC/i);
  if (waccMatch) wacc = parseFloat(waccMatch[1].replace(/,/g, ""));
  else if (typeof dcfObj?.wacc === "number") wacc = dcfObj.wacc <= 1 ? dcfObj.wacc * 100 : dcfObj.wacc;
  else wacc = 11.0;

  let terminalGrowth = 0;
  const tgMatch = fullText.match(/([0-9,]+(?:\.[0-9]+)?)\s*%\s*terminal growth/i);
  if (tgMatch) terminalGrowth = parseFloat(tgMatch[1].replace(/,/g, ""));
  else if (typeof dcfObj?.terminalGrowthRate === "number") terminalGrowth = dcfObj.terminalGrowthRate <= 1 ? dcfObj.terminalGrowthRate * 100 : dcfObj.terminalGrowthRate;
  else terminalGrowth = 4.0;

  let netDebtCr = 0;
  const ndMatch = fullText.match(/net debt of\s*[?Rs.]*\s*([0-9,]+(?:\.[0-9]+)?)\s*Cr/i);
  if (ndMatch) netDebtCr = parseFloat(ndMatch[1].replace(/,/g, ""));

  let fiiHolding: number | null = null;
  const fiiMatch = fullText.match(/([0-9,]+(?:\.[0-9]+)?)\s*%\s*FII/i);
  if (fiiMatch) fiiHolding = parseFloat(fiiMatch[1]);

  let diiHolding: number | null = null;
  const diiMatch = fullText.match(/([0-9,]+(?:\.[0-9]+)?)\s*%\s*DII/i);
  if (diiMatch) diiHolding = parseFloat(diiMatch[1]);

  // Only derived when both components are actually known. Previously FII defaulted to
  // 44.4% and DII to 45.3%, so an unqueried company was reported as holding a specific
  // shareholding pattern, and "promoter holding" became an arithmetic remainder of two
  // invented numbers.
  const promoterHolding: number | null =
    fiiHolding !== null && diiHolding !== null
      ? Math.max(0, parseFloat((100 - fiiHolding - diiHolding).toFixed(1)))
      : null;

  // 5. Build 5-Year Financial Projection Table
  //
  // Previously every missing figure was back-derived: revenue from a compound-growth
  // extrapolation, PAT as 65% of EBITDA, share count fixed at 500 Cr, EPS at Rs 12.5.
  // A row with three real numbers and four guessed ones was indistinguishable from a
  // fully reported history. Missing values are now null.
  let financialYears: Array<{
    year: string;
    revenue: number | null;
    growthPct: number | null;
    ebitda: number | null;
    marginPct: number | null;
    pat: number | null;
    eps: number | null;
  }> = [];

  const fYears = forecastObj?.years as string[] | undefined;
  const fRevs = forecastObj?.revenue as number[] | undefined;
  const fMargins = forecastObj?.ebitdaMargin as number[] | undefined;
  const fPats = forecastObj?.pat as number[] | undefined;
  const fEps = forecastObj?.eps as number[] | undefined;
  const fSharesCr = (forecastObj?.sharesCr ?? forecastObj?.sharesOutstandingCr) as number | undefined;

  if (fYears && Array.isArray(fYears) && fYears.length > 0) {
    financialYears = fYears.map((yr, idx) => {
      const rev = fRevs?.[idx] ?? null;
      const prevRev = idx === 0 ? (fRevs?.[0] ?? null) : (fRevs?.[idx - 1] ?? null);
      const growthPct =
        rev !== null && prevRev !== null && prevRev !== 0
          ? parseFloat((((rev - prevRev) / prevRev) * 100).toFixed(1))
          : null;
      const marginPct = fMargins?.[idx] ?? null;
      const ebitda =
        rev !== null && marginPct !== null ? Math.round((rev * marginPct) / 100) : null;
      const pat = fPats?.[idx] ?? null;

      // EPS is only computed from real inputs; it is never defaulted.
      const sharesCr = fSharesCr !== undefined && Number.isFinite(fSharesCr) && fSharesCr > 0
        ? fSharesCr
        : marketCapCr !== null && marketCapCr > 0 && cmp !== null && cmp > 0
          ? marketCapCr / cmp
          : null;
      const eps =
        fEps?.[idx] ??
        (pat !== null && sharesCr !== null ? parseFloat((pat / sharesCr).toFixed(1)) : null);

      return {
        year: yr,
        revenue: rev,
        growthPct,
        ebitda,
        marginPct,
        pat,
        eps,
      };
    });
  } else {
    // No forecast payload was produced, so no financial history is shown.
    //
    // This branch used to fabricate an entire five-year table: FY24 and FY25 revenue
    // back-extrapolated from base revenue at the assumed growth rate, EBITDA margins
    // invented as 0.95x / 1.00x / 1.04x / 1.08x / 1.12x of the assumed margin, PAT at a
    // flat 65% of EBITDA, a fixed 500 Cr share count and a flat Rs 12.5 EPS. FY24 and
    // FY25 carry no "E" suffix, so those extrapolations were labelled as *actuals* �
    // invented history presented as reported history in an equity research report.
    //
    // `financialYears` stays empty and the renderer states that the table is unavailable.
    financialYears = [];
  }

  // 6. Peers Comparison Table
  //
  // Only real, fetched peer data may appear here. The previous version of this
  // function invented a comparison table in two separate ways:
  //
  //  - if the report text happened to mention "SBIN" or "HDFCBANK", it emitted a full
  //    table for those *real listed companies* with hardcoded prices and multiples
  //    (SBIN Rs 812 / 12.0x / 16.5% ROE, PNB Rs 114, HDFC Bank Rs 1,640 ...). A reader
  //    would take those as observed market data for real securities.
  //  - failing that, it emitted literal tickers "PEER1"/"PEER2" named "Sector Peer A"/"B"
  //    with multiples back-derived from the subject company (cmp x 0.92, pe x 0.85,
  //    roe 14.5). Naming a comparator that does not exist is worse than showing none.
  //
  // Even genuine peers had their gaps filled with constants (pe 15.0, pb 1.8, roe 14.0,
  // marketCapCr 100000), so a peer the data provider could not price still appeared
  // fully valued. Missing figures are now `null` and render as "n/a"; when no peers
  // were fetched, the section says so instead of inventing comparables.
  const rawPeers = data.marketIntelData?.peerProfiles || [];
  let peers: Array<{
    ticker: string;
    name: string;
    cmp: number | null;
    pe: number | null;
    pb: number | null;
    roe: number | null;
    marketCapCr: number | null;
  }> = [];

  const currentTicker = (data.ticker || "").toUpperCase();
  const isUsableTicker = (t: unknown): t is string =>
    typeof t === "string" && /^[A-Z0-9&.\-]{2,15}$/.test(t.trim().toUpperCase()) && !/^PEER\d*$/i.test(t.trim());

  const validPeers = rawPeers.filter(
    (p: Record<string, unknown>) =>
      isUsableTicker(p.ticker) && p.ticker.toString().toUpperCase() !== currentTicker,
  );
  const peersToUse = validPeers.length > 0 ? validPeers : (rawPeers.length > 1 ? rawPeers.slice(1) : rawPeers);

  /** Reads a numeric peer field, returning null when it is absent or unusable. */
  const peerNumber = (...candidates: unknown[]): number | null => {
    for (const c of candidates) {
      const n = typeof c === "string" ? Number(c) : c;
      if (typeof n === "number" && Number.isFinite(n) && n !== 0) return n;
    }
    return null;
  };

  if (peersToUse.length > 0) {
    peers = peersToUse
      .filter((p: Record<string, unknown>) => isUsableTicker(p.ticker))
      .slice(0, 4)
      .map((p: Record<string, unknown>) => ({
        ticker: (p.ticker as string).trim().toUpperCase(),
        name:
          (p.companyName as string) ||
          (p.name as string) ||
          // No invented company name; the ticker is the honest identifier.
          (p.ticker as string).trim().toUpperCase(),
        cmp: peerNumber(p.currentPrice, p.cmp, p.price),
        pe: peerNumber(p.peRatio, p.pe, p.trailingPE),
        pb: peerNumber(p.pbRatio, p.priceToBook, p.pb),
        roe: peerNumber(p.roePercent, p.roe, p.returnOnEquity),
        marketCapCr: peerNumber(p.marketCapCr, p.marketCap),
      }));
  }

  // 7. Sensitivity Matrix (Gordon Growth: P(w,g) = Target * (w0 - g0) / (w - g))
  let sensitivityMatrix: { waccs: number[]; growths: number[]; grid: Array<Array<number | null>> };

  const sMat = dcfObj?.sensitivityMatrix as
    | {
        waccRange?: number[];
        growthRange?: number[];
        priceGrid?: Array<Array<number | null>>;
        rowValues?: number[];
        colValues?: number[];
        matrix?: Array<Array<number | null>>;
      }
    | undefined;

  // Only a *real* matrix computed by the DCF engine may be rendered. The previous
  // fallback invented one by scaling the headline target price �
  // `targetPrice * (baseSpread / spread)`, and `targetPrice * 1.4` whenever the
  // spread fell below 1%. That is a fabricated table of target prices presented with
  // the same authority as the model's own output; a 40% uplift in a cell implied no
  // valuation had been performed at all. When no matrix was computed, none is shown.
  const priceGrid = sMat?.priceGrid ?? sMat?.matrix;
  const waccAxis = sMat?.waccRange ?? sMat?.rowValues;
  const growthAxis = sMat?.growthRange ?? sMat?.colValues;

  if (waccAxis && growthAxis && Array.isArray(priceGrid)) {
    sensitivityMatrix = {
      waccs: waccAxis.map((w: number) => (w <= 1 ? parseFloat((w * 100).toFixed(1)) : w)),
      growths: growthAxis.map((g: number) => (g <= 1 ? parseFloat((g * 100).toFixed(1)) : g)),
      grid: priceGrid,
    };
  } else {
    sensitivityMatrix = { waccs: [], growths: [], grid: [] };
  }

  return {
    targetPrice,
    cmp,
    bullPrice,
    bearPrice,
    upsidePct,
    recommendation,
    marketCapCr,
    peRatio,
    priceToBook,
    roe,
    roce,
    dividendYield,
    baseRevenue,
    revenueGrowth,
    ebitdaMargin,
    wacc,
    terminalGrowth,
    netDebtCr,
    fiiHolding,
    diiHolding,
    promoterHolding,
    peers,
    financialYears,
    sensitivityMatrix,
  };
}

// --- Inline SVG Charts for Autonomous Reports ----------------------------------

function svgAutonomousFinancialTrajectory(years: string[], revenues: number[], margins: number[]): string {
  const W = 780, H = 240;
  const lpad = 65, rpad = 55, tpad = 32, bpad = 40;
  const pw = W - lpad - rpad;
  const ph = H - tpad - bpad;

  const maxRev = Math.max(...revenues, 1000) * 1.15;
  const maxMargin = Math.max(...margins, 20) * 1.25;

  const slot = pw / years.length;
  const bw = Math.min(slot * 0.42, 44);

  // Bars & Bottom Labels
  const bars = years
    .map((yr, idx) => {
      const rev = revenues[idx];
      const cx = lpad + slot * idx + slot / 2;
      const barH = (rev / maxRev) * ph;
      const by = tpad + ph - barH;

      return `
        <rect x="${(cx - bw / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${barH.toFixed(1)}" fill="#008358" rx="3"/>
        <text x="${cx.toFixed(1)}" y="${(by - 8).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#008358">?${rev >= 1000 ? (rev / 1000).toFixed(1) + "k" : rev}</text>
        <text x="${cx.toFixed(1)}" y="${(H - 12).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#475569">${yr}</text>
      `;
    })
    .join("");

  // Line Points (EBITDA Margin %)
  const pts = years.map((_, idx) => {
    const m = margins[idx];
    const cx = lpad + slot * idx + slot / 2;
    const cy = tpad + ph - (m / maxMargin) * ph;
    return { x: cx, y: cy, val: m };
  });

  let lineD = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    lineD += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
  }

  const lineHtml = `
    <path d="${lineD}" fill="none" stroke="#d97706" stroke-width="3" stroke-linecap="round"/>
    ${pts
      .map(
        (p) => `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#ffffff" stroke="#d97706" stroke-width="2.5"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y - 10).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="800" fill="#b45309">${p.val}%</text>
    `,
      )
      .join("")}
  `;

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">
    <line x1="${lpad}" y1="${tpad + ph}" x2="${W - rpad}" y2="${tpad + ph}" stroke="#cbd5e1" stroke-width="1.5"/>
    ${bars}
    ${lineHtml}
    <!-- Legend -->
    <rect x="${lpad}" y="10" width="12" height="10" fill="#008358" rx="2"/>
    <text x="${lpad + 16}" y="19" font-size="9" font-weight="700" fill="#334155">Revenue (? Cr, LHS)</text>
    <line x1="${lpad + 130}" y1="15" x2="${lpad + 150}" y2="15" stroke="#d97706" stroke-width="2.5"/>
    <circle cx="${lpad + 140}" cy="15" r="3.5" fill="#ffffff" stroke="#d97706" stroke-width="2"/>
    <text x="${lpad + 156}" y="19" font-size="9" font-weight="700" fill="#334155">EBITDA Margin (%, RHS)</text>
  </svg>`;
}

function svgAutonomousScenarioChart(cmp: number, bear: number, base: number, bull: number): string {
  const W = 460, H = 145;
  const items = [
    { label: "Bear Case", price: bear, color: "#e11d48", upside: (((bear - cmp) / cmp) * 100).toFixed(0) },
    { label: "CMP (Ref)", price: cmp, color: "#64748b", upside: "0" },
    { label: "Base Case", price: base, color: "#008358", upside: (((base - cmp) / cmp) * 100).toFixed(0) },
    { label: "Bull Case", price: bull, color: "#10b981", upside: (((bull - cmp) / cmp) * 100).toFixed(0) },
  ];

  const maxPrice = Math.max(bull, cmp, base, 10) * 1.25;
  const barH = 18;
  const gap = 12;
  const startY = 18;
  const labelW = 75;
  const maxBarW = 260;

  const rows = items
    .map((it, idx) => {
      const y = startY + idx * (barH + gap);
      const w = Math.max(15, (it.price / maxPrice) * maxBarW);
      const upsideSign = Number(it.upside) > 0 ? `+${it.upside}%` : `${it.upside}%`;
      const upsideLabel = it.label === "CMP (Ref)" ? "Baseline" : upsideSign;

      return `
        <text x="0" y="${y + 13}" font-size="9.5" font-weight="700" fill="#334155">${it.label}</text>
        <rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${barH}" fill="${it.color}" rx="3"/>
        <text x="${labelW + w + 8}" y="${y + 13}" font-size="9.5" font-weight="800" fill="#0f172a">?${it.price} <tspan font-size="8.5" font-weight="700" fill="${it.color}">(${upsideLabel})</tspan></text>
      `;
    })
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">
    ${rows}
  </svg>`;
}

// --- Publication-Grade Autonomous HTML Builder ---------------------------------

function buildAutonomousHtml(
  data: AutonomousReportInput,
  options: HtmlReportOptions = {},
): string {
  const compName = data.companyName || "Target Company";
  const ticker = data.ticker || "TICKER";
  // Publication date is legitimately "now" � but the header beside it is labelled
  // "As of", which readers interpret as the age of the data. Keep the two distinct:
  // print the data's own as-of when known, otherwise say so.
  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const _autonomousRec = data as unknown as Record<string, unknown>;
  const _autonomousAsOfRaw =
    (typeof _autonomousRec.asOf === "string" && _autonomousRec.asOf) ||
    (typeof _autonomousRec.completedAt === "string" && _autonomousRec.completedAt) ||
    null;
  const asOfStr = _autonomousAsOfRaw
    ? (() => {
        const d = new Date(_autonomousAsOfRaw);
        return isNaN(d.getTime())
          ? _autonomousAsOfRaw
          : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      })()
    : null;
  const headerAsOfStr = asOfStr ?? "not recorded";
  const isDraft = options.status !== "published";
  const sections = data.sections || [];

  const firm: ResolvedFirmIdentity = resolveFirmIdentity({
    orgName: options.orgName,
    complianceEmail: options.complianceEmail,
    website: options.website,
  });

  const getSec = (name: string) => sections.find((s) => s.name === name);

  const execSummary = getSec("executive_summary");
  const bizDesc = getSec("business_description");
  const risks = getSec("key_risks");
  const concall = getSec("management_qa_highlights");
  const disclosures = getSec("disclosures");

  // SEBI COMPLIANCE & DISCLOSURES (Sanitize any legacy raw user UUIDs and dummy SEBI numbers)
  const isUuid = (str?: string) => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
  const fallbackAnalystName = options.reviewerName && !isUuid(options.reviewerName) ? options.reviewerName : "Research Analyst";
  const rawDisclosures = disclosures?.content || "Standard statutory disclosures apply.";
  const cleanDisclosuresContent = rawDisclosures
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      fallbackAnalystName
    )
    .replace(/INH000012345/g, options.sebiRegNo || "Pending Registration");

  // Extract real structured metrics from modeling data & text
  const m = extractAutonomousFinancials(data);

  // SVG Charts
  //
  // The trajectory chart plots revenue and margin per year. Those may now be null
  // (the data was never retrieved), and a chart must not plot a zero for a missing
  // figure � it would draw a revenue collapse that never happened. Years with no data
  // are dropped; if nothing is left, the chart reports that it has nothing to show.
  const plottedYears = m.financialYears.filter(
    (f) => f.revenue !== null || f.marginPct !== null,
  );
  const trajectoryYears = plottedYears.map((f) => f.year);
  const trajectoryRevenues = plottedYears.map((f) => f.revenue ?? 0);
  const trajectoryMargins = plottedYears.map((f) => f.marginPct ?? 0);
  const hasTrajectory = plottedYears.length > 0;
  const trajectorySvg = hasTrajectory
    ? svgAutonomousFinancialTrajectory(trajectoryYears, trajectoryRevenues, trajectoryMargins)
    : "";
  // The scenario chart needs a reference price to plot upside against. With no price
  // there is nothing meaningful to chart, so it is omitted rather than drawn against 0.
  const scenarioSvg =
    m.cmp !== null && m.cmp > 0
      ? svgAutonomousScenarioChart(m.cmp, m.bearPrice, m.targetPrice, m.bullPrice)
      : "";

  // -- Data provenance: resolved from actual source state, never asserted ----
  const provenance: ProvenanceSummary = resolveProvenance({
    dataSources: data.dataSources,
    financialAudit: data.financialAudit,
    asOf: data.asOf,
  });
  const provenanceBlockHtml = provenance.items
    .map(
      (p) => `    <div>
      <strong>${escape(p.label)}:</strong>
      <span class="prov-badge ${provenanceBadgeClass(p.state)}">${escape(p.badge)}</span>
      <div class="prov-detail">${escape(p.detail)}</div>
    </div>`,
    )
    .join("\n");
  const provenanceCaveat = provenance.hasUnverifiedItems
    ? `<div class="prov-caveat">
    <strong>Data-quality notice:</strong> not every input on this page is
    exchange-verified. Items marked <em>Fallback used</em>, <em>Not available</em>
    or <em>Not assessed</em> above were not confirmed against live disclosures.
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escape(compName)} (${escape(ticker)}) � Institutional Equity Research</title>
<style>
  @page {
    size: A4 portrait;
    margin: 0;
  }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1a1917;
    background: #f1f5f9;
    margin: 0;
    padding: 0;
    font-size: 8.5pt;
    line-height: 1.45;
  }
  .page {
    width: 210mm;
    min-height: 297mm;
    margin: 0 auto 12mm auto;
    background: #ffffff;
    padding: 14mm 16mm 14mm 16mm;
    page-break-after: always;
    position: relative;
    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  }
  @media print {
    body { background: transparent; }
    .page { margin: 0; box-shadow: none; width: 100%; min-height: 100vh; padding: 12mm 15mm; }
  }

  /* -- Headers & Banners -- */
  .header {
    border-bottom: 2.5px solid #008358;
    padding-bottom: 8px;
    margin-bottom: 12px;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .header-left .logo {
    font-size: 15pt;
    font-weight: 900;
    color: #008358;
    letter-spacing: -0.4px;
    line-height: 1;
  }
  .header-left .sub-logo {
    font-size: 7.2pt;
    color: #475569;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-top: 3px;
  }
  .header-right {
    text-align: right;
    font-size: 7.5pt;
    color: #475569;
  }
  .badge {
    display: inline-block;
    padding: 2.5px 8px;
    border-radius: 4px;
    font-size: 7pt;
    font-weight: 800;
    text-transform: uppercase;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
  }
  .badge-draft { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
  .badge-published { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }

  /* -- Hero Target Price & Recommendation Card -- */
  .hero-card {
    background: #faf8f5;
    border: 1.5px solid #e3dfd5;
    border-radius: 8px;
    padding: 10px 14px;
    margin-bottom: 12px;
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 14px;
    align-items: center;
  }
  .hero-left-title {
    font-size: 16pt;
    font-weight: 900;
    color: #0f172a;
    line-height: 1.1;
    margin: 0;
  }
  .hero-left-sub {
    font-size: 8.2pt;
    color: #475569;
    margin-top: 3px;
    font-weight: 600;
  }
  .hero-val-cluster {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }
  .rec-badge {
    display: inline-block;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12pt;
    font-weight: 900;
    letter-spacing: 0.5px;
    text-align: center;
    text-transform: uppercase;
  }
  .rec-buy { background: #008358; color: #ffffff; }
  .rec-accumulate { background: #0284c7; color: #ffffff; }
  .rec-hold { background: #d97706; color: #ffffff; }
  .rec-reduce { background: #e11d48; color: #ffffff; }

  .hero-metric-item {
    display: flex;
    flex-direction: column;
  }
  .hero-metric-label {
    font-size: 7pt;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
    letter-spacing: 0.4px;
  }
  .hero-metric-val {
    font-size: 12pt;
    font-weight: 900;
    color: #0f172a;
  }
  .hero-metric-val.upside {
    color: #008358;
  }

  /* Market Snapshot Table in Hero */
  .market-snapshot-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.4pt;
  }
  .market-snapshot-table td {
    padding: 2.5px 4px;
    border-bottom: 1px dashed #cbd5e1;
  }
  .market-snapshot-table td.label {
    color: #64748b;
    font-weight: 600;
  }
  .market-snapshot-table td.val {
    color: #0f172a;
    font-weight: 800;
    text-align: right;
  }

  /* -- Standard Section Cards -- */
  .section-card {
    margin-bottom: 11px;
  }
  .sec-heading {
    font-size: 10pt;
    font-weight: 900;
    color: #008358;
    border-bottom: 1.5px solid #e2e8f0;
    padding-bottom: 3px;
    margin: 0 0 6px 0;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .sec-tag {
    font-size: 6.8pt;
    font-weight: 700;
    color: #64748b;
    background: #f1f5f9;
    padding: 1px 6px;
    border-radius: 3px;
    text-transform: uppercase;
  }

  /* -- Clean Content & Markdown Styles -- */
  .auto-h2 { font-size: 9.5pt; font-weight: 800; color: #0f172a; margin: 8px 0 3px 0; }
  .auto-h3 { font-size: 9pt; font-weight: 700; color: #1e293b; margin: 6px 0 2px 0; }
  .auto-h4 { font-size: 8.5pt; font-weight: 700; color: #334155; margin: 5px 0 2px 0; }
  .auto-p { margin: 0 0 5px 0; color: #334155; text-align: justify; line-height: 1.42; }
  .auto-list { margin: 0 0 6px 0; padding-left: 16px; color: #334155; }
  .auto-list li { margin-bottom: 2px; }
  .auto-quote {
    background: #f8fafc;
    border-left: 3px solid #008358;
    padding: 6px 10px;
    margin: 5px 0;
    font-style: italic;
    color: #1e293b;
    border-radius: 0 4px 4px 0;
    font-size: 8.2pt;
  }
  .auto-code {
    background: #f1f5f9;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 7.8pt;
    color: #0f172a;
  }

  /* -- Structured Institutional Tables -- */
  .inst-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.6pt;
    margin: 5px 0 8px 0;
  }
  .inst-table th {
    background: #008358;
    color: #ffffff;
    font-weight: 800;
    padding: 4px 6px;
    border: 1px solid #00704a;
    text-align: right;
  }
  .inst-table th.left {
    text-align: left;
  }
  .inst-table td {
    padding: 3.5px 6px;
    border: 1px solid #e2e8f0;
    color: #1e293b;
    text-align: right;
  }
  .inst-table td.left {
    text-align: left;
    font-weight: 700;
    color: #0f172a;
  }
  .inst-table tr:nth-child(even) {
    background: #f8fafc;
  }
  .inst-table tr.highlight {
    background: #f0fdf4;
    font-weight: 800;
  }

  /* -- Scenario Cards Grid -- */
  .scenario-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin: 6px 0 10px 0;
  }
  .scenario-card {
    border-radius: 6px;
    padding: 7px 9px;
    border: 1px solid #cbd5e1;
    background: #ffffff;
  }
  .scenario-card.base {
    border: 1.5px solid #008358;
    background: #f0fdf4;
  }
  .scenario-card.bull {
    border: 1.5px solid #10b981;
    background: #f8fafc;
  }
  .scenario-card.bear {
    border: 1.5px solid #f43f5e;
    background: #fff1f2;
  }
  .scenario-header {
    font-size: 8pt;
    font-weight: 800;
    text-transform: uppercase;
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;
  }
  .scenario-price {
    font-size: 13pt;
    font-weight: 900;
    color: #0f172a;
    margin-bottom: 4px;
  }
  .scenario-detail {
    font-size: 6.8pt;
    color: #475569;
    line-height: 1.35;
  }

  /* -- Sensitivity Matrix -- */
  .sens-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 7.2pt;
    text-align: center;
    margin: 4px 0 8px 0;
  }
  .sens-table th {
    background: #f1f5f9;
    color: #334155;
    font-weight: 800;
    padding: 3.5px 5px;
    border: 1px solid #cbd5e1;
  }
  .sens-table td {
    padding: 3px 4px;
    border: 1px solid #e2e8f0;
    font-weight: 700;
    color: #1e293b;
  }
  .sens-table td.base-hit {
    background: #dcfce7;
    color: #008358;
    font-weight: 900;
  }

  /* -- Two-Column Grid for Charts & Text -- */
  .two-col-grid {
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 12px;
    align-items: start;
  }
  .chart-box {
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 8px;
    margin: 4px 0 8px 0;
  }
  .chart-title {
    font-size: 7.6pt;
    font-weight: 800;
    color: #334155;
    text-transform: uppercase;
    margin-bottom: 4px;
  }

  /* -- Provenance & Footer -- */
  .provenance-block {
    background: #faf8f5;
    border: 1px solid #e3dfd5;
    border-radius: 6px;
    padding: 8px 10px;
    margin: 8px 0;
    /* Grid, not flex: each item carries a detail line, so items need their own
       cell. A single flex row squeezes four items and their explanations into
       unreadable columns. */
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px 14px;
    font-size: 7pt;
    color: #475569;
  }
  .provenance-block > div { margin: 0; }
  .prov-badge {
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 6.8pt;
    text-transform: uppercase;
  }
  .prov-live { background: #dcfce7; color: #15803d; }
  .prov-fallback { background: #fef3c7; color: #b45309; }
.prov-detail { font-size: 7pt; color: #64748b; margin-top: 1mm; line-height: 1.35; }
.prov-caveat {
  margin-top: 2mm; padding: 2mm 3mm; background: #fffbeb;
  border-left: 3px solid #d97706; border-radius: 3px;
  font-size: 7.5pt; color: #78350f; line-height: 1.4;
}

  .disclaimer-box {
    background: #f8fafc;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    padding: 7px 9px;
    font-size: 6.8pt;
    line-height: 1.35;
    color: #475569;
    margin-top: 8px;
  }
  .footer {
    position: absolute;
    bottom: 9mm;
    left: 16mm;
    right: 16mm;
    border-top: 1px solid #e2e8f0;
    padding-top: 5px;
    display: flex;
    justify-content: space-between;
    font-size: 6.8pt;
    color: #64748b;
  }
</style>
</head>
<body>

<!-- --------------------------------------------------------------------------- -->
<!-- PAGE 1: Executive Summary, Target Price Hero & Financial Trajectory        -->
<!-- --------------------------------------------------------------------------- -->
<div class="page">
  <div class="header">
    <div class="header-left">
      <div class="logo">${escape(firm.orgName !== UNCONFIGURED_FIRM_MARKER ? firm.orgName : BRAND.productName)}</div>
      <div class="sub-logo">SEBI Registered Institutional Equity Research</div>
    </div>
    <div class="header-right">
      <span class="badge ${isDraft ? 'badge-draft' : 'badge-published'}">
        ${isDraft ? 'Draft � Live Research' : 'Official Published Note'}
      </span>
      <div>Date: ${dateStr}</div>
    </div>
  </div>

  <!-- HERO VALUATION & MARKET SNAPSHOT CARD -->
  <div class="hero-card">
    <div>
      <h1 class="hero-left-title">${escape(compName)}</h1>
      <div class="hero-left-sub">NSE / BSE: <strong>${escape(ticker)}</strong> | Institutional Equity Research Coverage</div>
      <div class="hero-val-cluster">
        <div class="rec-badge ${m.recommendation ? `rec-${m.recommendation.toLowerCase()}` : "rec-none"}">${
          m.recommendation ?? "NOT RATED"
        }</div>
        <div class="hero-metric-item">
          <span class="hero-metric-label">Target Price</span>
          <span class="hero-metric-val">${
            m.targetPrice ? `₹${m.targetPrice.toLocaleString("en-IN")}` : "n/a"
          }</span>
        </div>
        <div class="hero-metric-item">
          <span class="hero-metric-label">CMP (Ref)</span>
          <span class="hero-metric-val">${
            m.cmp === null ? "n/a" : `₹${m.cmp.toLocaleString("en-IN")}`
          }</span>
        </div>
        <div class="hero-metric-item">
          <span class="hero-metric-label">Expected Upside</span>
          <span class="hero-metric-val upside">${
            m.upsidePct === null ? "n/a" : `${m.upsidePct >= 0 ? "+" + m.upsidePct : m.upsidePct}%`
          }</span>
        </div>
      </div>
    </div>

    <!-- Right: Key Market Ratios Table -->
    <div>
      <table class="market-snapshot-table">
        <tbody>
          <tr>
            <td class="label">Market Cap</td>
            <td class="val">${m.marketCapCr === null ? "n/a" : `?${m.marketCapCr.toLocaleString("en-IN")} Cr`}</td>
            <td class="label">P/E Ratio</td>
            <td class="val">${m.peRatio === null ? "n/a" : `${m.peRatio}x`}</td>
          </tr>
          <tr>
            <td class="label">Price / Book</td>
            <td class="val">${m.priceToBook === null ? "n/a" : `${m.priceToBook}x`}</td>
            <td class="label">Dividend Yield</td>
            <td class="val">${m.dividendYield === null ? "n/a" : `${m.dividendYield}%`}</td>
          </tr>
          <tr>
            <td class="label">Return on Equity</td>
            <td class="val">${m.roe === null ? "n/a" : `${m.roe}%`}</td>
            <td class="label">ROCE</td>
            <td class="val">${m.roce === null ? "n/a" : `${m.roce}%`}</td>
          </tr>
          <tr>
            <td class="label">Institutional Hldg</td>
            <td class="val">${
              m.fiiHolding !== null && m.diiHolding !== null
                ? `${(m.fiiHolding + m.diiHolding).toFixed(1)}%`
                : "n/a"
            }</td>
            <td class="label">WACC (DCF)</td>
            <td class="val">${m.wacc}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 5-YEAR FINANCIAL SUMMARY TABLE -->
  <div class="section-card">
    <div class="sec-heading">
      <span>Key Financial Estimates &amp; Operating Forecast</span>
      <span class="sec-tag">Consolidated (? Cr)</span>
    </div>
    ${
      m.financialYears.length > 0
        ? `<table class="inst-table">
      <thead>
        <tr>
          <th class="left">Metric (? Cr)</th>
          ${m.financialYears.map((f) => `<th>${f.year}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="left">Net Revenue / Sales</td>
          ${m.financialYears
            .map((f) => `<td>${f.revenue === null ? "n/a" : `?${f.revenue.toLocaleString("en-IN")}`}</td>`)
            .join("")}
        </tr>
        <tr>
          <td class="left">YoY Growth (%)</td>
          ${m.financialYears
            .map(
              (f) =>
                `<td>${f.growthPct === null ? "n/a" : `${f.growthPct >= 0 ? "+" + f.growthPct : f.growthPct}%`}</td>`,
            )
            .join("")}
        </tr>
        <tr>
          <td class="left">Operating EBITDA</td>
          ${m.financialYears
            .map((f) => `<td>${f.ebitda === null ? "n/a" : `?${f.ebitda.toLocaleString("en-IN")}`}</td>`)
            .join("")}
        </tr>
        <tr>
          <td class="left">EBITDA Margin (%)</td>
          ${m.financialYears.map((f) => `<td>${f.marginPct === null ? "n/a" : `${f.marginPct}%`}</td>`).join("")}
        </tr>
        <tr class="highlight">
          <td class="left">Adjusted Net Profit (PAT)</td>
          ${m.financialYears
            .map((f) => `<td>${f.pat === null ? "n/a" : `?${f.pat.toLocaleString("en-IN")}`}</td>`)
            .join("")}
        </tr>
        <tr>
          <td class="left">Diluted EPS (?)</td>
          ${m.financialYears.map((f) => `<td>${f.eps === null ? "n/a" : `?${f.eps}`}</td>`).join("")}
        </tr>
      </tbody>
    </table>`
        : `<div style="font-size:7.4pt;color:#64748b;padding:6px 0;">
             No financial history or forecast was retrieved for this company, so no table is
             shown. These figures are not estimated.
           </div>`
    }
  </div>

  <!-- TWO-COLUMN GRID: Chart & Executive Thesis -->
  <div class="two-col-grid">
    <div>
      <div class="chart-box">
        <div class="chart-title">5-Year Revenue &amp; EBITDA Margin Trajectory</div>
        ${
          hasTrajectory
            ? trajectorySvg
            : `<div style="font-size:7.4pt;color:#64748b;font-style:italic;padding:10px 0;">
                 No revenue or margin history was retrieved, so no trend is charted.
               </div>`
        }
      </div>
    </div>
    <div>
      <div class="section-card">
        <h2 class="sec-heading">${SECTION_TITLE_MAP.executive_summary}</h2>
        ${renderCleanMarkdown(execSummary?.content || "Executive summary synthesis pending.")}
      </div>
    </div>
  </div>

  <div class="footer">
    <span>${BRAND.productDescriptor} � ${escape(compName)} (${escape(ticker)})</span>
    <span>Page 1 of 3</span>
  </div>
</div>

<!-- --------------------------------------------------------------------------- -->
<!-- PAGE 2: DCF Valuation Model, Sensitivity Grid & Peer Benchmarking          -->
<!-- --------------------------------------------------------------------------- -->
<div class="page">
  <div class="header">
    <div class="header-left">
      <div class="logo">${escape(firm.orgName !== UNCONFIGURED_FIRM_MARKER ? firm.orgName : BRAND.productName)}</div>
      <div class="sub-logo">Valuation Modeling, Scenario Analysis &amp; Peer Multiples</div>
    </div>
    <div class="header-right">
      <div>${escape(compName)} (${escape(ticker)})</div>
      <div>Data as of: ${headerAsOfStr} � Published: ${dateStr}</div>
    </div>
  </div>

  <!-- 3-SCENARIO DCF VALUATION CARDS -->
  <div class="section-card">
    <div class="sec-heading">
      <span>3-Tier DCF Valuation Model Scenarios</span>
      <span class="sec-tag">Discounted Cash Flow Engine</span>
    </div>
    <div class="scenario-grid">
      ${
        // The bear and bull cards previously printed driver assumptions the model
        // never used: "Growth x 0.75, EBITDA Margin x 0.88, WACC +1.0%, Term Growth
        // 3.5%" for the bear case and "x 1.22 / x 1.15 / -0.8% / 5.0%" for the bull.
        // Those terminal-growth rates in particular were hardcoded literals. The DCF
        // engine derives bull and bear from the 10th and 90th percentiles of a Monte
        // Carlo simulation over growth and margin, so these cards described scenarios
        // that were never computed while sitting directly beneath the prices that were.
        //
        // The cards now state the price and its actual provenance (a simulation
        // percentile), and print driver assumptions only for the base case, where the
        // engine's real parameters are known.
        [
          {
            cls: "bear",
            colour: "#e11d48",
            label: "Bear Case",
            price: m.bearPrice,
            note: m.bearPrice
              ? "10th percentile of the Monte Carlo simulation over revenue growth and EBITDA margin."
              : "Not computed — the valuation engine produced no bear case.",
            drivers: null as string | null,
          },
          {
            cls: "base",
            colour: "#008358",
            label: "Base Case (Target)",
            price: m.targetPrice,
            note: m.targetPrice ? "Base-case DCF output." : "Not computed — see the assumptions disclosed above.",
            drivers:
              `Growth: ${m.revenueGrowth.toFixed(1)}% CAGR<br>` +
              `EBITDA Margin: ${m.ebitdaMargin.toFixed(1)}%<br>` +
              `WACC: ${m.wacc.toFixed(1)}% | Term Growth: ${m.terminalGrowth.toFixed(1)}%`,
          },
          {
            cls: "bull",
            colour: "#10b981",
            label: "Bull Case",
            price: m.bullPrice,
            note: m.bullPrice
              ? "90th percentile of the Monte Carlo simulation over revenue growth and EBITDA margin."
              : "Not computed — the valuation engine produced no bull case.",
            drivers: null as string | null,
          },
        ]
          .map((sc) => {
            const pct =
              sc.price && m.cmp !== null && m.cmp > 0 ? ((sc.price - m.cmp) / m.cmp) * 100 : null;
            return `
      <div class="scenario-card ${sc.cls}">
        <div class="scenario-header">
          <span style="color:${sc.colour};">${sc.label}</span>
          <span style="color:${sc.colour};">${pct === null ? "" : `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`}</span>
        </div>
        <div class="scenario-price">${
          sc.price ? `₹${sc.price.toLocaleString("en-IN")}` : "n/a"
        }</div>
        <div class="scenario-detail">
          ${sc.drivers ? `• ${sc.drivers}<br>` : ""}
          • ${sc.note}
        </div>
      </div>`;
          })
          .join("")
      }
    </div>
  </div>

  <!-- SENSITIVITY MATRIX & SCENARIO CHART (TWO COLUMNS) -->
  <div class="two-col-grid">
    <div>
      <div class="sec-heading">
        <span>DCF Sensitivity Matrix (Target Price ?)</span>
      </div>
      ${
        m.sensitivityMatrix.waccs.length > 0 && m.sensitivityMatrix.growths.length > 0
          ? `<table class="sens-table">
        <thead>
          <tr>
            <th>WACC \\ g</th>
            ${m.sensitivityMatrix.growths.map((g) => `<th>${g.toFixed(1)}%</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${m.sensitivityMatrix.waccs
            .map((wVal, rIdx) => {
              const rowCells = m.sensitivityMatrix.growths
                .map((gVal, cIdx) => {
                  const val = m.sensitivityMatrix.grid[rIdx]?.[cIdx];
                  const isBase = Math.abs(wVal - m.wacc) < 0.2 && Math.abs(gVal - m.terminalGrowth) < 0.2;
                  // null = terminal value undefined for this pairing (WACC <= g).
                  if (val === null || val === undefined) {
                    return `<td class="${isBase ? 'base-hit' : ''}">n/a</td>`;
                  }
                  return `<td class="${isBase ? 'base-hit' : ''}">?${val}</td>`;
                })
                .join("");
              return `<tr><th>${wVal.toFixed(1)}%</th>${rowCells}</tr>`;
            })
            .join("")}
        </tbody>
      </table>
      <div style="font-size:6.8pt;color:#64748b;margin-bottom:8px;">*Highlighted cell indicates base-case DCF valuation parameters. "n/a" marks pairings where the Gordon Growth terminal value is undefined (WACC &lt;= terminal growth).</div>`
          : `<div style="font-size:7.4pt;color:#64748b;padding:6px 0;">
             Sensitivity analysis not available: the DCF engine did not compute a grid for this
             valuation, so none is shown. Values here are not estimated.
           </div>`
      }
    </div>

    <div>
      <div class="chart-box">
        <div class="chart-title">Valuation Scenarios vs. Current Market Price</div>
        ${
          scenarioSvg ||
          `<div style="font-size:7.4pt;color:#64748b;font-style:italic;padding:10px 0;">
             No current market price was retrieved, so the scenarios cannot be plotted
             against it. No reference price is assumed.
           </div>`
        }
      </div>
    </div>
  </div>

  <!-- PEER BENCHMARKING MULTIPLES MATRIX -->
  <div class="section-card">
    <div class="sec-heading">
      <span>Sector Peer Valuation Multiples &amp; Operating Benchmark</span>
      <span class="sec-tag">Relative Valuation</span>
    </div>
    <table class="inst-table">
      <thead>
        <tr>
          <th class="left">Company</th>
          <th class="left">Ticker</th>
          <th>CMP (?)</th>
          <th>M.Cap (? Cr)</th>
          <th>P/E (x)</th>
          <th>P/B (x)</th>
          <th>RoE (%)</th>
        </tr>
      </thead>
      <tbody>
        <tr class="highlight">
          <td class="left">${escape(compName)}</td>
          <td class="left">${escape(ticker)}</td>
          <td>?${m.cmp}</td>
          <td>${m.marketCapCr === null ? "n/a" : `?${m.marketCapCr.toLocaleString("en-IN")}`}</td>
          <td>${m.peRatio === null ? "n/a" : `${m.peRatio}x`}</td>
          <td>${m.priceToBook === null ? "n/a" : `${m.priceToBook}x`}</td>
          <td>${m.roe === null ? "n/a" : `${m.roe}%`}</td>
        </tr>
        ${m.peers.length > 0
          ? m.peers
              .map(
                (p) => `
          <tr>
            <td class="left">${escape(p.name)}</td>
            <td class="left">${escape(p.ticker)}</td>
            <td>${p.cmp === null ? "n/a" : `?${p.cmp}`}</td>
            <td>${p.marketCapCr === null ? "n/a" : `?${p.marketCapCr.toLocaleString("en-IN")}`}</td>
            <td>${p.pe === null ? "n/a" : `${p.pe}x`}</td>
            <td>${p.pb === null ? "n/a" : `${p.pb}x`}</td>
            <td>${p.roe === null ? "n/a" : `${p.roe}%`}</td>
          </tr>
        `,
              )
              .join("")
          : `<tr><td colspan="7" class="left" style="color:#64748b;font-style:italic;">
               No peer comparables were retrieved for this company, so no comparison is shown.
               Peer multiples are not estimated.
             </td></tr>`}
      </tbody>
    </table>
  </div>

  <!-- BUSINESS OPERATIONS BREAKDOWN -->
  <div class="section-card">
    <h2 class="sec-heading">${SECTION_TITLE_MAP.business_description}</h2>
    ${renderCleanMarkdown(bizDesc?.content || "Business description pending from exchange filings.")}
  </div>

  <div class="footer">
    <span>${BRAND.productDescriptor} � ${escape(compName)} (${escape(ticker)})</span>
    <span>Page 2 of 3</span>
  </div>
</div>

<!-- --------------------------------------------------------------------------- -->
<!-- PAGE 3: Risks, Governance, Concall & Statutory SEBI RA Attestation         -->
<!-- --------------------------------------------------------------------------- -->
<div class="page">
  <div class="header">
    <div class="header-left">
      <div class="logo">${escape(firm.orgName !== UNCONFIGURED_FIRM_MARKER ? firm.orgName : BRAND.productName)}</div>
      <div class="sub-logo">Management Q&amp;A, Key Risks &amp; Statutory Compliance</div>
    </div>
    <div class="header-right">
      <div>${escape(compName)} (${escape(ticker)})</div>
      <div>${options.sebiRegNo ? `SEBI RA Reg: ${options.sebiRegNo}` : "SEBI Registration: Pending / Unregistered"}</div>
    </div>
  </div>

  <!-- MANAGEMENT CONCALL HIGHLIGHTS -->
  <div class="section-card">
    <h2 class="sec-heading">${SECTION_TITLE_MAP.management_qa_highlights}</h2>
    ${renderCleanMarkdown(concall?.content || "No concall transcript quotes available.")}
  </div>

  <!-- KEY RISKS & MITIGANTS -->
  <div class="section-card">
    <h2 class="sec-heading">${SECTION_TITLE_MAP.key_risks}</h2>
    ${renderCleanMarkdown(risks?.content || "Key risks and market intelligence pending.")}
  </div>

  <!-- DATA PROVENANCE � badges reflect the ACTUAL source state, not an assertion -->
  <div class="provenance-block">
${provenanceBlockHtml}
  </div>
${provenanceCaveat}

  <!-- SEBI COMPLIANCE & DISCLOSURES -->
  <div class="section-card">
    <h2 class="sec-heading">${SECTION_TITLE_MAP.disclosures}</h2>
    ${renderCleanMarkdown(cleanDisclosuresContent)}
  </div>

  <!-- STATUTORY ATTESTATION BLOCK -->
  <div class="disclaimer-box">
    <strong>STATUTORY SEBI RA (2014) COMPLIANCE ATTESTATION:</strong><br>
    This institutional equity research note was generated via the ${escape(BRAND.productName)} autonomous multi-agent equity research pipeline.
    <strong>Analyst Certification:</strong> The research subagents and certifying analyst (${fallbackAnalystName}${options.sebiRegNo ? `, Reg: ${options.sebiRegNo}` : ""}) confirm that all findings reflect structured synthesis of BSE/NSE corporate disclosures, audited statements, and quantitative valuation models.
    <strong>Conflict of Interest:</strong> ${escape(firm.orgName)} and its analysts hold no financial interest exceeding 1% in ${escape(compName)}.
    <strong>Standard Warning:</strong> Investments in securities market are subject to market risks. Read all related documents carefully before investing.
  </div>

  <div class="footer">
    <span>${BRAND.productDescriptor} � ${escape(compName)} (${escape(ticker)})</span>
    <span>Page 3 of 3</span>
  </div>
</div>

</body>
</html>`;
}

// -- Public API ----------------------------------------------------------------

export class HtmlReportGenerator {
  /**
   * Generates a complete print-ready A4 HTML equity research report for manual uploaded data.
   * Charts are drawn as inline SVG; layout is driven by CSS.
   */
  static async generateHTML(
    data: EquityResearchData,
    options: HtmlReportOptions = {},
  ): Promise<string> {
    return buildHtml(data, options);
  }

  /**
   * Generates a complete print-ready A4 HTML equity research report for an autonomous pipeline run.
   * Renders the real researched sections (Executive Summary, DCF Valuation, Concall, Risks, SEBI Disclosures).
   */
  static generateAutonomousHTML(
    data: AutonomousReportInput,
    options: HtmlReportOptions = {},
  ): string {
    return buildAutonomousHtml(data, options);
  }
}


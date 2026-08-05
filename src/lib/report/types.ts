export interface ReportSummary {
  companyName: string;
  ticker: string;
  reportDate: string;
  executiveSummary: string;
}

export interface ReportMetric {
  label: string;
  value: string; // pre-formatted currency/percentage string, e.g. "₹4,250.00 Cr"
  period: string;
  rawNumericValue: number;
}

export interface ReportTableColumn {
  header: string;
  key: string;
}

export interface ReportTable {
  title: string;
  columns: ReportTableColumn[];
  rows: Record<string, string | number>[];
}

export interface ChartDataPoint {
  name: string; // e.g. "FY24"
  [key: string]: number | string;
}

export interface ReportChart {
  title: string;
  type: 'bar' | 'line';
  xAxisKey: string;
  data: ChartDataPoint[];
  series: {
    key: string;
    color: string;
    label: string;
  }[];
}

export interface ReportNarratives {
  investmentThesis: string;
  industryOverview: string;
  businessOverview: string;
  futureGrowth: string;
  valuationAnalysis: string;
  outlook: string;
}

export interface ReportRisk {
  description: string;
  bulletIndex: number;
}

export interface ReportRecommendation {
  rating: 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL';
  currentPrice: string; // pre-formatted e.g. "₹1,420.00"
  targetPrice: string;  // pre-formatted e.g. "₹1,780.00"
  upsidePotential: string; // pre-formatted e.g. "+25.35%"
  rationale: string[];
}

export interface CompiledReport {
  summary: ReportSummary;
  recommendation: ReportRecommendation;
  metrics: ReportMetric[];
  tables: ReportTable[];
  charts: ReportChart[];
  narratives: ReportNarratives;
  risks: ReportRisk[];
}

export interface CompanyMetadata {
  name: string;
  ticker?: string;
  sector?: string;
  industry?: string;
  reportDate: string;
}

export interface FinancialMetric {
  label: string;
  value: string | number;
  period: string; // e.g., "FY24", "Q3 FY25"
  unit?: string; // e.g., "Cr", "%", "USD"
}

export interface FinancialStatements {
  incomeStatement: FinancialMetric[];
  balanceSheet: FinancialMetric[];
  cashFlow: FinancialMetric[];
}

export interface AnalystRecommendation {
  rating: "BUY" | "ACCUMULATE" | "HOLD" | "REDUCE" | "SELL";
  currentPrice: number | null;
  targetPrice: number | null;
  upsidePotential: number | null;
  rationale: string[];
  /** Indicates how the CMP was sourced for transparency in the report */
  currentPriceSource?: "document" | "calculated" | "live_feed" | null;
}

export interface CompetitorInfo {
  name: string;
  ticker?: string;
  industry?: string;
  recommendation?: string;
  currentPrice?: number;
  targetPrice?: number;
}

export interface CompanyData {
  marketCap?: string | number | null;
  highLow52W?: string | null;
  enterpriseValue?: string | number | null;
  ev?: string | number | null;
  outstandingShares?: string | number | null;
  freeFloat?: string | number | null;
  dividendYield?: string | number | null;
  avgVolume6m?: string | number | null;
  avgVolume?: string | number | null;
  beta?: string | number | null;
  faceValue?: string | number | null;
  pe?: string | number | null;
  evEbitda?: string | number | null;
  roe?: string | number | null;
  deRatio?: string | number | null;
  currentPrice?: string | number | null;
}

export interface ShareholdingData {
  category: string;
  periods?: string[];
  values?: (string | number)[];
}

export interface PricePerformanceData {
  period: string;
  absoluteReturn?: string | number | null;
  absoluteSensex?: string | number | null;
  relativeReturn?: string | number | null;
}

export interface EstimatesData {
  metric: string;
  oldFY26?: string | number | null;
  oldFY27?: string | number | null;
  newFY26?: string | number | null;
  newFY27?: string | number | null;
  changeFY26?: string | number | null;
  changeFY27?: string | number | null;
}

export interface FiveYearSummaryData {
  period: string;
  sales?: string | number | null;
  salesGrowth?: string | number | null;
  ebitda?: string | number | null;
  ebitdaMargin?: string | number | null;
  patAdjusted?: string | number | null;
  patGrowth?: string | number | null;
  adjEps?: string | number | null;
  epsGrowth?: string | number | null;
  pe?: string | number | null;
  pb?: string | number | null;
  evEbitda?: string | number | null;
  roe?: string | number | null;
  deRatio?: string | number | null;
}

export interface QuarterlyFinancialData {
  metric: string;
  // Semantic fields (preferred, used for new reports)
  currentQ?: string | number | null;
  priorYearSameQ?: string | number | null;
  priorQ?: string | number | null;
  yoyGrowth?: string | number | null;
  qoqGrowth?: string | number | null;
  currentQLabel?: string | null;
  priorYearSameQLabel?: string | null;
  priorQLabel?: string | null;
  // Legacy fields (backward compat with stored reports)
  q1fy26?: string | number | null;
  q1fy25?: string | number | null;
  q4fy25?: string | number | null;
}

export interface DetailedFinancialsData {
  incomeStatement?: Record<string, string | number | null>[] | null;
  balanceSheet?: Record<string, string | number | null>[] | null;
  cashFlow?: Record<string, string | number | null>[] | null;
  ratios?: Record<string, string | number | null>[] | null;
}

export interface RecommendationSummaryData {
  date: string;
  rating: string;
  target: string | number;
}

export interface EquityResearchData {
  company: CompanyMetadata;
  recommendation: AnalystRecommendation;
  executiveSummary: string;
  keyFinancials: FinancialStatements;
  valuationAnalysis: string;
  investmentRisks: string[];
  swotAnalysis: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  competitors?: CompetitorInfo[] | null;
  narrativeSummary?: string | null;
  industryOverview?: string | null;
  businessOverview?: string | null;
  futureGrowth?: string | null;

  // Geojit-specific fields
  nseCode?: string | null;
  bseCode?: string | null;
  bloombergCode?: string | null;
  timeFrame?: string | null;
  stockType?: string | null;
  companyData?: CompanyData | null;
  shareholding?: ShareholdingData[] | null;
  promoterPledge?: string | number | null;
  pricePerformance?: PricePerformanceData[] | null;
  estimates?: EstimatesData[] | null;
  quarterlyFinancials?: QuarterlyFinancialData[] | null;
  detailedFinancials?: DetailedFinancialsData[] | DetailedFinancialsData | null;
  recommendationSummary?: RecommendationSummaryData[] | null;
  pageOneHighlights?: string[] | null;
  pageTwoHighlights?: string[] | null;
  sensexValue?: string | number | null;
  fiveYearSummary?: FiveYearSummaryData[] | null;
  headlineTakeaway?: string | null;
  modelUsedForFinancials?: string | null;
  forensicAnalysis?: ForensicQualityData | null;
}

export interface ForensicRedFlag {
  title: string;
  severity: "info" | "warning" | "danger";
  detail: string;
}

export interface ForensicQualityData {
  overallHealthScore: number; // 0-100 score
  riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  cfoToPatRatio: {
    ratio: number | null;
    status: "safe" | "caution" | "alert";
    interpretation: string;
    cfoCr?: number | null;
    patCr?: number | null;
  };
  altmanZScore: {
    score: number | null;
    zone: "Safe" | "Grey" | "Distress";
    status: "safe" | "caution" | "alert";
    interpretation: string;
  };
  beneishMScore: {
    score: number | null;
    status: "safe" | "alert" | "neutral";
    interpretation: string;
  };
  workingCapitalStress: {
    receivablesGrowthVsSales?: string | null;
    workingCapitalCycleDays?: number | null;
    status: "safe" | "caution" | "alert";
    interpretation: string;
  };
  governanceFlags: {
    promoterPledgePct: number | null;
    promoterHoldingPct: number | null;
    institutionalHoldingPct: number | null;
    auditorQuality: "Clean" | "Qualified" | "Adverse" | "Standard";
    flags: ForensicRedFlag[];
  };
  summaryAssessment: string;
  auditedAt?: string;
}

export interface ParseResult {
  rawText: string;
  metadata?: Record<string, unknown>;
  fileName: string;
  fileType: "pdf" | "csv" | "txt";
}

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
  unit?: string;  // e.g., "Cr", "%", "USD"
}

export interface FinancialStatements {
  incomeStatement: FinancialMetric[];
  balanceSheet: FinancialMetric[];
  cashFlow: FinancialMetric[];
}

export interface AnalystRecommendation {
  rating: 'BUY' | 'ACCUMULATE' | 'HOLD' | 'REDUCE' | 'SELL';
  targetPrice: number;
  currentPrice: number;
  upsidePotential: number;
  rationale: string[];
}

export interface CompetitorInfo {
  name: string;
  ticker?: string;
  industry?: string;
  recommendation?: string;
  currentPrice?: number;
  targetPrice?: number;
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
  /** Which model actually performed the financials extraction. 'llama-3.1-8b-instant' means
   *  the lighter fallback model was used (request was too large for the 70B quota).
   *  Undefined = 70B was used (standard path). */
  modelUsedForFinancials?: string | null;
}

export interface ParseResult {
  rawText: string;
  metadata?: Record<string, unknown>;
  fileName: string;
  fileType: 'pdf' | 'csv' | 'txt';
}

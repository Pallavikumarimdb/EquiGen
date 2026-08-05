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
}

export interface ParseResult {
  rawText: string;
  metadata?: Record<string, any>;
  fileName: string;
  fileType: 'pdf' | 'csv' | 'txt';
}

import { z } from 'zod';

export const AIRecommendationSchema = z.enum(['BUY', 'ACCUMULATE', 'HOLD', 'REDUCE', 'SELL']);

export const AIFinancialMetricSchema = z.object({
  period: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional()
});

export const AIRatiosSchema = z.record(z.union([z.string(), z.number(), z.null()]));

export const AICompanyDataSchema = z.object({
  marketCap: z.union([z.string(), z.number()]).nullable().optional(),
  highLow52W: z.string().nullable().optional(),
  enterpriseValue: z.union([z.string(), z.number()]).nullable().optional(),
  ev: z.union([z.string(), z.number()]).nullable().optional(),
  outstandingShares: z.union([z.string(), z.number()]).nullable().optional(),
  freeFloat: z.union([z.string(), z.number()]).nullable().optional(),
  dividendYield: z.string().nullable().optional(),
  avgVolume6m: z.union([z.string(), z.number()]).nullable().optional(),
  avgVolume: z.union([z.string(), z.number()]).nullable().optional(),
  beta: z.union([z.string(), z.number()]).nullable().optional(),
  faceValue: z.union([z.string(), z.number()]).nullable().optional(),
});

export const AIShareholdingSchema = z.object({
  category: z.string(),
  periods: z.array(z.string()).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional()
});

export const AIPricePerformanceSchema = z.object({
  period: z.string(), // "3 Month", "6 Month", "1 Year"
  absoluteReturn: z.string().nullable().optional(),
  absoluteSensex: z.string().nullable().optional(),
  relativeReturn: z.string().nullable().optional()
});

export const AIEstimatesSchema = z.object({
  metric: z.string(), // "Revenue", "EBITDA", "Margins (%)", etc.
  oldFY26: z.union([z.string(), z.number()]).nullable().optional(),
  oldFY27: z.union([z.string(), z.number()]).nullable().optional(),
  newFY26: z.union([z.string(), z.number()]).nullable().optional(),
  newFY27: z.union([z.string(), z.number()]).nullable().optional(),
  changeFY26: z.string().nullable().optional(),
  changeFY27: z.string().nullable().optional()
});

export const AIQuarterlyFinancialSchema = z.object({
  metric: z.string(),
  q1fy26: z.union([z.string(), z.number()]).nullable().optional(),
  q1fy25: z.union([z.string(), z.number()]).nullable().optional(),
  yoyGrowth: z.string().nullable().optional(),
  q4fy25: z.union([z.string(), z.number()]).nullable().optional(),
  qoqGrowth: z.string().nullable().optional()
});

export const AIDetailedFinancialsSchema = z.object({
  incomeStatement: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).nullable().optional(),
  balanceSheet: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).nullable().optional(),
  cashFlow: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).nullable().optional(),
  ratios: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).nullable().optional()
});

export const AIRecommendationSummarySchema = z.object({
  date: z.string(),
  rating: z.string(),
  target: z.union([z.string(), z.number()])
});

export const AIExtractionSchema = z.object({
  companyName: z.string(),
  ticker: z.string().nullable().optional(),
  recommendation: AIRecommendationSchema,
  currentPrice: z.number().nullable(),
  targetPrice: z.number().nullable(),
  revenue: z.array(AIFinancialMetricSchema).nullable(),
  ebitda: z.array(AIFinancialMetricSchema).nullable(),
  pat: z.array(AIFinancialMetricSchema).nullable(),
  ratios: AIRatiosSchema.nullable(),
  highlights: z.array(z.string()),
  risks: z.array(z.string()),
  outlook: z.string().nullable(),
  investmentThesis: z.string().nullable(),
  futureGrowth: z.string().nullable(),
  narrativeSummary: z.string().nullable(),
  industryOverview: z.string().nullable(),
  businessOverview: z.string().nullable(),
  
  // Geojit Specific Fields
  nseCode: z.string().nullable().optional(),
  bseCode: z.string().nullable().optional(),
  bloombergCode: z.string().nullable().optional(),
  timeFrame: z.string().nullable().optional(),
  stockType: z.string().nullable().optional(),
  companyData: AICompanyDataSchema.nullable().optional(),
  shareholding: z.array(AIShareholdingSchema).nullable().optional(),
  promoterPledge: z.string().nullable().optional(),
  pricePerformance: z.array(AIPricePerformanceSchema).nullable().optional(),
  estimates: z.array(AIEstimatesSchema).nullable().optional(),
  quarterlyFinancials: z.array(AIQuarterlyFinancialSchema).nullable().optional(),
  detailedFinancials: AIDetailedFinancialsSchema.nullable().optional(),
  recommendationSummary: z.array(AIRecommendationSummarySchema).nullable().optional(),
  
  /** Which model extracted the financials. 'llama-3.1-8b-instant' = fallback used. */
  modelUsedForFinancials: z.string().nullable().optional()
});

export type AIExtractionResult = z.infer<typeof AIExtractionSchema>;


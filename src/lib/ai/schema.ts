import { z } from "zod";

export const AIRecommendationSchema = z.enum([
  "BUY",
  "ACCUMULATE",
  "HOLD",
  "REDUCE",
  "SELL",
]);

export const AIFinancialMetricSchema = z.object({
  period: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional(),
});

export const AIRatiosSchema = z.record(
  z.union([z.string(), z.number(), z.null()]),
);

export const AICompanyDataSchema = z.object({
  marketCap: z.union([z.string(), z.number()]).nullable().optional(),
  highLow52W: z.string().nullable().optional(),
  enterpriseValue: z.union([z.string(), z.number()]).nullable().optional(),
  ev: z.union([z.string(), z.number()]).nullable().optional(),
  outstandingShares: z.union([z.string(), z.number()]).nullable().optional(),
  freeFloat: z.union([z.string(), z.number()]).nullable().optional(),
  dividendYield: z.union([z.string(), z.number()]).nullable().optional(),
  avgVolume6m: z.union([z.string(), z.number()]).nullable().optional(),
  avgVolume: z.union([z.string(), z.number()]).nullable().optional(),
  beta: z.union([z.string(), z.number()]).nullable().optional(),
  faceValue: z.union([z.string(), z.number()]).nullable().optional(),
});

export const AIShareholdingSchema = z.object({
  category: z.string(),
  periods: z.array(z.string()),
  values: z.array(z.union([z.string(), z.number()])),
});

export const AIPricePerformanceSchema = z.object({
  period: z.string(), // "3 Month", "6 Month", "1 Year"
  absoluteReturn: z.union([z.string(), z.number()]).nullable().optional(),
  absoluteSensex: z.union([z.string(), z.number()]).nullable().optional(),
  relativeReturn: z.union([z.string(), z.number()]).nullable().optional(),
});

export const AIEstimatesSchema = z.object({
  metric: z.string(), // "Revenue", "EBITDA", "Margins (%)", etc.
  oldFY26: z.union([z.string(), z.number()]).nullable().optional(),
  oldFY27: z.union([z.string(), z.number()]).nullable().optional(),
  newFY26: z.union([z.string(), z.number()]).nullable().optional(),
  newFY27: z.union([z.string(), z.number()]).nullable().optional(),
  changeFY26: z.union([z.string(), z.number()]).nullable().optional(),
  changeFY27: z.union([z.string(), z.number()]).nullable().optional(),
});

export const AIFiveYearSummarySchema = z.object({
  period: z.string(),
  sales: z.union([z.string(), z.number()]).nullable().optional(),
  salesGrowth: z.union([z.string(), z.number()]).nullable().optional(),
  ebitda: z.union([z.string(), z.number()]).nullable().optional(),
  ebitdaMargin: z.union([z.string(), z.number()]).nullable().optional(),
  patAdjusted: z.union([z.string(), z.number()]).nullable().optional(),
  patGrowth: z.union([z.string(), z.number()]).nullable().optional(),
  adjEps: z.union([z.string(), z.number()]).nullable().optional(),
  epsGrowth: z.union([z.string(), z.number()]).nullable().optional(),
  pe: z.union([z.string(), z.number()]).nullable().optional(),
  pb: z.union([z.string(), z.number()]).nullable().optional(),
  evEbitda: z.union([z.string(), z.number()]).nullable().optional(),
  roe: z.union([z.string(), z.number()]).nullable().optional(),
  deRatio: z.union([z.string(), z.number()]).nullable().optional(),
});

export const AIQuarterlyFinancialSchema = z.object({
  metric: z.string(),
  // Semantic names (preferred) — LLM fills these with the actual quarter data
  currentQ: z.union([z.string(), z.number()]).nullable().optional(),
  priorYearSameQ: z.union([z.string(), z.number()]).nullable().optional(),
  priorQ: z.union([z.string(), z.number()]).nullable().optional(),
  yoyGrowth: z.union([z.string(), z.number()]).nullable().optional(),
  qoqGrowth: z.union([z.string(), z.number()]).nullable().optional(),
  // Labels for the columns (e.g. "Q2FY26", "Q2FY25", "Q1FY26")
  currentQLabel: z.string().nullable().optional(),
  priorYearSameQLabel: z.string().nullable().optional(),
  priorQLabel: z.string().nullable().optional(),
  // Legacy fallback fields — kept for backward compat with stored reports
  q1fy26: z.union([z.string(), z.number()]).nullable().optional(),
  q1fy25: z.union([z.string(), z.number()]).nullable().optional(),
  q4fy25: z.union([z.string(), z.number()]).nullable().optional(),
});

export const AIDetailedFinancialRowSchema = z
  .object({
    metric: z
      .string()
      .describe(
        "Financial line item or metric name (e.g. Sales, EBITDA, Net Profit, Current Assets, Total Debt)",
      ),
    fy20: z.union([z.string(), z.number()]).nullable().optional(),
    fy21: z.union([z.string(), z.number()]).nullable().optional(),
    fy22: z.union([z.string(), z.number()]).nullable().optional(),
    fy23: z.union([z.string(), z.number()]).nullable().optional(),
    fy24: z.union([z.string(), z.number()]).nullable().optional(),
    fy25: z.union([z.string(), z.number()]).nullable().optional(),
    fy26: z.union([z.string(), z.number()]).nullable().optional(),
    fy27: z.union([z.string(), z.number()]).nullable().optional(),
    fy28: z.union([z.string(), z.number()]).nullable().optional(),
    fy24a: z.union([z.string(), z.number()]).nullable().optional(),
    fy25a: z.union([z.string(), z.number()]).nullable().optional(),
    fy25e: z.union([z.string(), z.number()]).nullable().optional(),
    fy26e: z.union([z.string(), z.number()]).nullable().optional(),
    fy27e: z.union([z.string(), z.number()]).nullable().optional(),
    fy28e: z.union([z.string(), z.number()]).nullable().optional(),
    q1fy25: z.union([z.string(), z.number()]).nullable().optional(),
    q2fy25: z.union([z.string(), z.number()]).nullable().optional(),
    q3fy25: z.union([z.string(), z.number()]).nullable().optional(),
    q4fy25: z.union([z.string(), z.number()]).nullable().optional(),
    q1fy26: z.union([z.string(), z.number()]).nullable().optional(),
    q2fy26: z.union([z.string(), z.number()]).nullable().optional(),
    q3fy26: z.union([z.string(), z.number()]).nullable().optional(),
    q4fy26: z.union([z.string(), z.number()]).nullable().optional(),
    col1: z.union([z.string(), z.number()]).nullable().optional(),
    col2: z.union([z.string(), z.number()]).nullable().optional(),
    col3: z.union([z.string(), z.number()]).nullable().optional(),
    col4: z.union([z.string(), z.number()]).nullable().optional(),
    col5: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .describe("A financial statement row with line-item metric and period columns");

export const AIDetailedFinancialsSchema = z.object({
  incomeStatement: z
    .array(AIDetailedFinancialRowSchema)
    .nullable()
    .optional(),
  balanceSheet: z
    .array(AIDetailedFinancialRowSchema)
    .nullable()
    .optional(),
  cashFlow: z
    .array(AIDetailedFinancialRowSchema)
    .nullable()
    .optional(),
  ratios: z
    .array(AIDetailedFinancialRowSchema)
    .nullable()
    .optional(),
});

export const AIRecommendationSummarySchema = z.object({
  date: z
    .string()
    .describe(
      "The date or period of the recommendation, e.g. '12-May-24', 'Q1FY25' or 'September 2023'",
    ),
  rating: z
    .string()
    .describe(
      "The recommendation rating, e.g. 'BUY', 'HOLD', 'ACCUMULATE', 'REDUCE', 'SELL'",
    ),
  target: z
    .union([z.string(), z.number()])
    .describe("The target price on that date"),
});

export const AIExtractionSchema = z.object({
  companyName: z.string(),
  ticker: z.string().nullable().optional(),
  /** Classified sector, e.g. "Pharmaceuticals", "Banking & NBFC", "IT Services", "Auto", "FMCG" */
  sector: z.string().nullable().optional(),
  /** Sub-industry within the sector, e.g. "Specialty Chemicals" */
  industry: z.string().nullable().optional(),
  recommendation: AIRecommendationSchema,
  currentPrice: z.number().nullable(),
  targetPrice: z.number().nullable(),
  /** How the CMP was sourced: from the document, calculated, or a live feed */
  currentPriceSource: z.enum(["document", "calculated", "live_feed"]).nullable().optional(),
  revenue: z.array(AIFinancialMetricSchema).nullable(),
  ebitda: z.array(AIFinancialMetricSchema).nullable(),
  pat: z.array(AIFinancialMetricSchema).nullable(),
  ratios: AIRatiosSchema.nullable(),
  pageOneHighlights: z.array(z.string()),
  pageTwoHighlights: z.array(z.string()),
  risks: z.array(z.string()),
  outlook: z.string().nullable(),
  investmentThesis: z.string().nullable(),
  futureGrowth: z.string().nullable(),
  narrativeSummary: z.string().nullable(),
  industryOverview: z.string().nullable(),
  businessOverview: z.string().nullable(),
  headlineTakeaway: z.string().nullable().optional(),

  // Exchange identifiers & listing metadata
  nseCode: z.string().nullable().optional(),
  bseCode: z.string().nullable().optional(),
  bloombergCode: z.string().nullable().optional(),
  timeFrame: z.string().nullable().optional(),
  stockType: z.string().nullable().optional(),
  // Root level fallbacks for companyData fields (prevents 400 validation errors on Groq if LLM outputs them flat)
  marketCap: z.union([z.string(), z.number()]).nullable().optional(),
  highLow52W: z.string().nullable().optional(),
  enterpriseValue: z.union([z.string(), z.number()]).nullable().optional(),
  ev: z.union([z.string(), z.number()]).nullable().optional(),
  outstandingShares: z.union([z.string(), z.number()]).nullable().optional(),
  freeFloat: z.union([z.string(), z.number()]).nullable().optional(),
  dividendYield: z.union([z.string(), z.number()]).nullable().optional(),
  avgVolume6m: z.union([z.string(), z.number()]).nullable().optional(),
  avgVolume: z.union([z.string(), z.number()]).nullable().optional(),
  beta: z.union([z.string(), z.number()]).nullable().optional(),
  faceValue: z.union([z.string(), z.number()]).nullable().optional(),
  companyData: AICompanyDataSchema.nullable().optional(),
  shareholding: z.array(AIShareholdingSchema).nullable().optional(),
  promoterPledge: z.union([z.string(), z.number()]).nullable().optional(),
  pricePerformance: z.array(AIPricePerformanceSchema).nullable().optional(),
  estimates: z.array(AIEstimatesSchema).nullable().optional(),
  quarterlyFinancials: z
    .array(AIQuarterlyFinancialSchema)
    .nullable()
    .optional(),
  detailedFinancials: AIDetailedFinancialsSchema.nullable().optional(),
  recommendationSummary: z
    .array(AIRecommendationSummarySchema)
    .nullable()
    .optional()
    .describe(
      "Recommendation history/summary over the last 3 years (often found under 'Recommendation Summary (last 3 years)' or 'Recommendation History'), consisting of past dates, ratings/recommendations, and target prices.",
    ),
  sensexValue: z.union([z.string(), z.number()]).nullable().optional(),
  fiveYearSummary: z.array(AIFiveYearSummarySchema).nullable().optional(),

  /** Which model extracted the financials. 'openai/gpt-oss-20b' = fallback used. */
  modelUsedForFinancials: z.string().nullable().optional(),
});

export type AIExtractionResult = z.infer<typeof AIExtractionSchema>;

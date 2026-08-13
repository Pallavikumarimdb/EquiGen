import { z } from "zod";

export const CompanyMetadataSchema = z.object({
  name: z.string().min(1, "Company name is required"),
  ticker: z.string().optional(),
  sector: z.string().optional(),
  industry: z.string().optional(),
  reportDate: z.string(),
});

export const FinancialMetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  period: z.string(),
  unit: z.string().optional(),
});

export const FinancialStatementsSchema = z.object({
  incomeStatement: z.array(FinancialMetricSchema),
  balanceSheet: z.array(FinancialMetricSchema),
  cashFlow: z.array(FinancialMetricSchema),
});

export const AnalystRecommendationSchema = z.object({
  rating: z.enum(["BUY", "ACCUMULATE", "HOLD", "REDUCE", "SELL"]),
  targetPrice: z.number().nonnegative(),
  currentPrice: z.number().nonnegative(),
  upsidePotential: z.number(),
  rationale: z.array(z.string()),
});

export const CompetitorInfoSchema = z.object({
  name: z.string().min(1, "Competitor name is required"),
  ticker: z.string().optional(),
  industry: z.string().optional(),
  recommendation: z.string().optional(),
  currentPrice: z.number().optional(),
  targetPrice: z.number().optional(),
});

export const CompanyDataSchema = z
  .object({
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
  })
  .nullable()
  .optional();

export const ShareholdingDataSchema = z.object({
  category: z.string(),
  periods: z.array(z.string()).optional(),
  values: z.array(z.union([z.string(), z.number()])).optional(),
});

export const PricePerformanceDataSchema = z.object({
  period: z.string(),
  absoluteReturn: z.string().nullable().optional(),
  absoluteSensex: z.string().nullable().optional(),
  relativeReturn: z.string().nullable().optional(),
});

export const EstimatesDataSchema = z.object({
  metric: z.string(),
  oldFY26: z.union([z.string(), z.number()]).nullable().optional(),
  oldFY27: z.union([z.string(), z.number()]).nullable().optional(),
  newFY26: z.union([z.string(), z.number()]).nullable().optional(),
  newFY27: z.union([z.string(), z.number()]).nullable().optional(),
  changeFY26: z.string().nullable().optional(),
  changeFY27: z.string().nullable().optional(),
});

export const QuarterlyFinancialDataSchema = z.object({
  metric: z.string(),
  q1fy26: z.union([z.string(), z.number()]).nullable().optional(),
  q1fy25: z.union([z.string(), z.number()]).nullable().optional(),
  yoyGrowth: z.string().nullable().optional(),
  q4fy25: z.union([z.string(), z.number()]).nullable().optional(),
  qoqGrowth: z.string().nullable().optional(),
});

export const DetailedFinancialsDataSchema = z
  .object({
    incomeStatement: z
      .array(z.record(z.union([z.string(), z.number(), z.null()])))
      .nullable()
      .optional(),
    balanceSheet: z
      .array(z.record(z.union([z.string(), z.number(), z.null()])))
      .nullable()
      .optional(),
    cashFlow: z
      .array(z.record(z.union([z.string(), z.number(), z.null()])))
      .nullable()
      .optional(),
    ratios: z
      .array(z.record(z.union([z.string(), z.number(), z.null()])))
      .nullable()
      .optional(),
  })
  .nullable()
  .optional();

export const RecommendationSummaryDataSchema = z.object({
  date: z.string(),
  rating: z.string(),
  target: z.union([z.string(), z.number()]),
});

export const EquityResearchDataSchema = z.object({
  company: CompanyMetadataSchema,
  recommendation: AnalystRecommendationSchema,
  executiveSummary: z.string(),
  keyFinancials: FinancialStatementsSchema,
  valuationAnalysis: z.string(),
  investmentRisks: z.array(z.string()),
  swotAnalysis: z.object({
    strengths: z.array(z.string()),
    weaknesses: z.array(z.string()),
    opportunities: z.array(z.string()),
    threats: z.array(z.string()),
  }),
  competitors: z.array(CompetitorInfoSchema).nullable().optional(),
  narrativeSummary: z.string().nullable().optional(),
  industryOverview: z.string().nullable().optional(),
  businessOverview: z.string().nullable().optional(),
  futureGrowth: z.string().nullable().optional(),

  // Geojit-specific fields
  nseCode: z.string().nullable().optional(),
  bseCode: z.string().nullable().optional(),
  bloombergCode: z.string().nullable().optional(),
  timeFrame: z.string().nullable().optional(),
  stockType: z.string().nullable().optional(),
  companyData: CompanyDataSchema,
  shareholding: z.array(ShareholdingDataSchema).nullable().optional(),
  promoterPledge: z.string().nullable().optional(),
  pricePerformance: z.array(PricePerformanceDataSchema).nullable().optional(),
  estimates: z.array(EstimatesDataSchema).nullable().optional(),
  quarterlyFinancials: z
    .array(QuarterlyFinancialDataSchema)
    .nullable()
    .optional(),
  detailedFinancials: DetailedFinancialsDataSchema,
  recommendationSummary: z
    .array(RecommendationSummaryDataSchema)
    .nullable()
    .optional(),
});

export const ReportUploadInputSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  file: z.any(), // File reference validated at Route handler level
});

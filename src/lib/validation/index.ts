import { z } from 'zod';

export const CompanyMetadataSchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  ticker: z.string().optional(),
  sector: z.string().optional(),
  industry: z.string().optional(),
  reportDate: z.string()
});

export const FinancialMetricSchema = z.object({
  label: z.string(),
  value: z.union([z.string(), z.number()]),
  period: z.string(),
  unit: z.string().optional()
});

export const FinancialStatementsSchema = z.object({
  incomeStatement: z.array(FinancialMetricSchema),
  balanceSheet: z.array(FinancialMetricSchema),
  cashFlow: z.array(FinancialMetricSchema)
});

export const AnalystRecommendationSchema = z.object({
  rating: z.enum(['BUY', 'ACCUMULATE', 'HOLD', 'REDUCE', 'SELL']),
  targetPrice: z.number().nonnegative(),
  currentPrice: z.number().nonnegative(),
  upsidePotential: z.number(),
  rationale: z.array(z.string())
});

export const CompetitorInfoSchema = z.object({
  name: z.string().min(1, 'Competitor name is required'),
  ticker: z.string().optional(),
  industry: z.string().optional(),
  recommendation: z.string().optional(),
  currentPrice: z.number().optional(),
  targetPrice: z.number().optional()
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
    threats: z.array(z.string())
  }),
  competitors: z.array(CompetitorInfoSchema).nullable().optional(),
  narrativeSummary: z.string().nullable().optional(),
  industryOverview: z.string().nullable().optional(),
  businessOverview: z.string().nullable().optional(),
  futureGrowth: z.string().nullable().optional()
});

export const ReportUploadInputSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  file: z.any() // File reference validated at Route handler level
});

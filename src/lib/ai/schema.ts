import { z } from 'zod';

export const AIRecommendationSchema = z.enum(['BUY', 'ACCUMULATE', 'HOLD', 'REDUCE', 'SELL']);

export const AIFinancialMetricSchema = z.object({
  period: z.string(),
  value: z.union([z.string(), z.number()]),
  unit: z.string().optional()
});

export const AIRatiosSchema = z.record(z.union([z.string(), z.number(), z.null()]));

export const AIExtractionSchema = z.object({
  companyName: z.string(),
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
  futureGrowth: z.string().nullable()
});

export type AIExtractionResult = z.infer<typeof AIExtractionSchema>;

import { EquityResearchData } from '@/types';

export * from './types';
export * from './mapper';

/**
 * Report Orchestrator Service.
 */
export class ReportService {
  /**
   * Generates analytical recommendations, summaries and gathers chart metadata.
   */
  public generateReportData(extractedData: EquityResearchData): EquityResearchData {
    // Perform any post-processing, valuation calculations, or ratio computations here.
    return {
      ...extractedData,
      recommendation: {
        ...extractedData.recommendation,
        upsidePotential: this.calculateUpside(
          extractedData.recommendation.currentPrice,
          extractedData.recommendation.targetPrice
        )
      }
    };
  }

  private calculateUpside(current: number | null, target: number | null): number | null {
    if (current === null || target === null || !current) return null;
    return parseFloat((((target - current) / current) * 100).toFixed(2));
  }
}

export const reportService = new ReportService();

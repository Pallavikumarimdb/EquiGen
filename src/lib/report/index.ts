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

  private calculateUpside(current: number, target: number): number {
    if (!current || !target) return 0;
    return parseFloat((((target - current) / current) * 100).toFixed(2));
  }
}

export const reportService = new ReportService();

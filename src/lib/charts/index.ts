import { FinancialMetric } from '@/types';

/**
 * Chart Data formatter and generation service.
 */
export class ChartService {
  /**
   * Formats financial statements data for recharts consumption.
   */
  public formatForRecharts(metrics: FinancialMetric[]): Array<{ name: string; value: number }> {
    return metrics.map(metric => ({
      name: `${metric.label} (${metric.period})`,
      value: typeof metric.value === 'number' ? metric.value : parseFloat(metric.value as string) || 0
    }));
  }

  /**
   * Generates a chart image URL (e.g. using QuickChart API or node-canvas) for PDF embedding.
   */
  public generateChartImageUrl(metrics: FinancialMetric[], title: string): string {
    const labels = metrics.map(m => m.period);
    const data = metrics.map(m => typeof m.value === 'number' ? m.value : parseFloat(m.value as string) || 0);

    const chartConfig = {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: title,
          data,
          backgroundColor: 'rgba(0, 102, 204, 0.6)',
          borderColor: 'rgba(0, 102, 204, 1)',
          borderWidth: 1
        }]
      }
    };

    return `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}`;
  }
}

export const chartService = new ChartService();

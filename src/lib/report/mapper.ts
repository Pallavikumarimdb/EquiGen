import { EquityResearchData, FinancialMetric } from '@/types';
import {
  CompiledReport,
  ReportSummary,
  ReportRecommendation,
  ReportMetric,
  ReportTable,
  ReportChart,
  ReportNarratives,
  ReportRisk,
  ChartDataPoint
} from './types';

/**
 * Reusable formatting utilities.
 */
export function formatCurrency(value: number | string, unit?: string): string {
  const numeric = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
  if (isNaN(numeric)) return String(value);

  const formatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });

  const formattedNum = formatter.format(numeric);
  return unit ? `₹${formattedNum} ${unit}` : `₹${formattedNum}`;
}

export function formatPercent(value: number | string): string {
  const numeric = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numeric)) return String(value);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric.toFixed(2)}%`;
}

/**
 * Converts raw EquityResearchData into fully formatted, presentational CompiledReport objects.
 * Keeps UI purely presentation-focused and handles all formatting and dataset transformations.
 */
export class ReportMapper {
  public static mapToCompiledReport(data: EquityResearchData): CompiledReport {
    // 1. Summary mapping
    const summary: ReportSummary = {
      companyName: data.company.name,
      ticker: data.company.ticker || data.company.name.substring(0, 4).toUpperCase(),
      reportDate: data.company.reportDate,
      executiveSummary: data.executiveSummary
    };

    // 2. Recommendation mapping
    const rec = data.recommendation;
    const recommendation: ReportRecommendation = {
      rating: rec.rating,
      currentPrice: formatCurrency(rec.currentPrice),
      targetPrice: formatCurrency(rec.targetPrice),
      upsidePotential: formatPercent(rec.upsidePotential),
      rationale: rec.rationale
    };

    // 3. Metrics mapping
    const metrics: ReportMetric[] = [];
    // Extract key metrics from incomeStatement (usually Revenue, EBITDA, PAT)
    const incomeMetrics = data.keyFinancials?.incomeStatement || [];
    
    // Find the latest metrics to display as highlights
    const groupedByLabel: Record<string, FinancialMetric[]> = {};
    for (const metric of incomeMetrics) {
      if (!groupedByLabel[metric.label]) {
        groupedByLabel[metric.label] = [];
      }
      groupedByLabel[metric.label].push(metric);
    }

    for (const [label, items] of Object.entries(groupedByLabel)) {
      // Sort to find the latest period (e.g. FY25 > FY24)
      const sorted = [...items].sort((a, b) => b.period.localeCompare(a.period));
      const latest = sorted[0];
      if (latest) {
        const rawNumeric = typeof latest.value === 'string' ? parseFloat(latest.value.replace(/,/g, '')) : latest.value;
        metrics.push({
          label: latest.label,
          value: formatCurrency(latest.value, latest.unit),
          period: latest.period,
          rawNumericValue: isNaN(rawNumeric) ? 0 : rawNumeric
        });
      }
    }

    // 4. Tables mapping
    const tables: ReportTable[] = [];
    if (incomeMetrics.length > 0) {
      // Generate standard Income Statement summary table
      // Columns: Metric, and then each unique period found
      const periods = Array.from(new Set(incomeMetrics.map(m => m.period))).sort();
      const labels = Array.from(new Set(incomeMetrics.map(m => m.label)));

      const columns = [
        { header: 'Financial Metric', key: 'metric' },
        ...periods.map(p => ({ header: p, key: p }))
      ];

      const rows = labels.map(label => {
        const row: Record<string, string | number> = { metric: label };
        for (const period of periods) {
          const match = incomeMetrics.find(m => m.label === label && m.period === period);
          row[period] = match ? formatCurrency(match.value, match.unit) : '-';
        }
        return row;
      });

      tables.push({
        title: 'Income Statement Summary',
        columns,
        rows
      });
    }

    // 5. Charts mapping
    const charts: ReportChart[] = [];
    if (incomeMetrics.length > 0) {
      // Group values by period for chart data points
      const chartDataMap: Record<string, ChartDataPoint> = {};
      const periods = Array.from(new Set(incomeMetrics.map(m => m.period))).sort();

      for (const m of incomeMetrics) {
        if (!chartDataMap[m.period]) {
          chartDataMap[m.period] = { name: m.period };
        }
        const numericVal = typeof m.value === 'string' ? parseFloat(m.value.replace(/,/g, '')) : m.value;
        chartDataMap[m.period][m.label] = isNaN(numericVal) ? 0 : numericVal;
      }

      const chartData = periods.map(p => chartDataMap[p]);
      const uniqueLabels = Array.from(new Set(incomeMetrics.map(m => m.label)));

      // Primary financial growth chart
      charts.push({
        title: 'Financial Performance Trend',
        type: 'bar',
        xAxisKey: 'name',
        data: chartData,
        series: uniqueLabels.map((label, idx) => {
          const colors = ['#0f172a', '#3b82f6', '#10b981', '#f59e0b'];
          return {
            key: label,
            label,
            color: colors[idx % colors.length]
          };
        })
      });
    }

    // 6. Narratives mapping
    const narratives: ReportNarratives = {
      investmentThesis: data.executiveSummary,
      industryOverview: data.industryOverview || 'Industry dynamics remain stable with tailwinds in digital adoption.',
      businessOverview: data.businessOverview || 'The company operates in diversified technology and consultancy segments.',
      futureGrowth: data.futureGrowth || 'Future growth is anchored on enterprise workflow integrations and cloud expansions.',
      valuationAnalysis: data.valuationAnalysis,
      outlook: data.valuationAnalysis
    };

    // 7. Risks mapping
    const risks: ReportRisk[] = (data.investmentRisks || []).map((risk, index) => ({
      description: risk,
      bulletIndex: index + 1
    }));

    return {
      summary,
      recommendation,
      metrics,
      tables,
      charts,
      narratives,
      risks
    };
  }
}

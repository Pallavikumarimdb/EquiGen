import fs from 'fs';
import path from 'path';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { ChartConfiguration } from 'chart.js';
import { EquityResearchData } from '@/types';

// PDF-friendly dimensions (high DPI scale)
const WIDTH = 800;
const HEIGHT = 400;
const BG_COLOR = '#ffffff';

export interface ChartPaths {
  revenueTrendPath: string;
  patTrendPath: string;
  ebitdaMarginPath: string;
  revenueCagrPath: string;
}

export class ChartGenerationService {
  private chartCanvas: ChartJSNodeCanvas;
  private tempDir: string;

  constructor() {
    this.chartCanvas = new ChartJSNodeCanvas({
      width: WIDTH,
      height: HEIGHT,
      backgroundColour: BG_COLOR
    });

    // Save temporary charts in public/temp/charts
    this.tempDir = path.join(process.cwd(), 'public', 'temp', 'charts');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Helper to parse numeric values from metrics.
   */
  private parseVal(val: string | number): number {
    if (typeof val === 'number') return val;
    return parseFloat(val.replace(/,/g, '')) || 0;
  }

  /**
   * Generates all charts for the PDF report.
   */
  public async generateChartsForReport(data: EquityResearchData): Promise<ChartPaths> {
    const incomeStatement = data.keyFinancials?.incomeStatement || [];

    // Group metrics by period (e.g. FY23, FY24, FY25)
    const periods = Array.from(new Set(incomeStatement.map(m => m.period))).sort();
    
    const revenueData = periods.map(p => {
      const match = incomeStatement.find(m => m.label.toLowerCase() === 'revenue' && m.period === p);
      return match ? this.parseVal(match.value) : 0;
    });

    const ebitdaData = periods.map(p => {
      const match = incomeStatement.find(m => m.label.toLowerCase() === 'ebitda' && m.period === p);
      return match ? this.parseVal(match.value) : 0;
    });

    const patData = periods.map(p => {
      const match = incomeStatement.find(m => m.label.toLowerCase() === 'pat' && m.period === p);
      return match ? this.parseVal(match.value) : 0;
    });

    // Calculate EBITDA Margin % = (EBITDA / Revenue) * 100
    const ebitdaMarginData = periods.map((p, i) => {
      const rev = revenueData[i];
      const ebit = ebitdaData[i];
      if (rev <= 0) return 0;
      return parseFloat(((ebit / rev) * 100).toFixed(2));
    });

    // Calculate CAGR (latest vs earliest)
    let cagr = 0;
    if (periods.length > 1 && revenueData[0] > 0) {
      const firstRev = revenueData[0];
      const lastRev = revenueData[revenueData.length - 1];
      const years = periods.length - 1;
      cagr = parseFloat(((Math.pow(lastRev / firstRev, 1 / years) - 1) * 100).toFixed(2));
    }

    const companySlug = data.company.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // 1. Revenue Trend Chart Configuration
    const revConfig: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: periods,
        datasets: [{
          label: 'Revenue (Cr)',
          data: revenueData,
          backgroundColor: '#0f172a', // primary deep navy
          borderColor: '#1e293b',
          borderWidth: 1,
          barThickness: 40
        }]
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: `${data.company.name} - Revenue Growth Trend`, font: { size: 16 } }
        }
      }
    };

    // 2. PAT Trend Chart Configuration
    const patConfig: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: periods,
        datasets: [{
          label: 'Profit After Tax (Cr)',
          data: patData,
          backgroundColor: '#3b82f6', // Geojit blue
          borderColor: '#2563eb',
          borderWidth: 1,
          barThickness: 40
        }]
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: `${data.company.name} - Profit After Tax (PAT) Trend`, font: { size: 16 } }
        }
      }
    };

    // 3. EBITDA Margin Chart Configuration
    const ebitdaConfig: ChartConfiguration = {
      type: 'line',
      data: {
        labels: periods,
        datasets: [{
          label: 'EBITDA Margin (%)',
          data: ebitdaMarginData,
          borderColor: '#10b981', // green accent
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.3,
          borderWidth: 3,
          pointRadius: 6
        }]
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: `${data.company.name} - EBITDA Margin (%) Trend`, font: { size: 16 } }
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => `${value}%`
            }
          }
        }
      }
    };

    // 4. Revenue CAGR Comparison Chart Configuration
    const cagrConfig: ChartConfiguration = {
      type: 'bar',
      data: {
        labels: ['Company CAGR', 'Industry Benchmark (Avg)'],
        datasets: [{
          label: 'Revenue CAGR (%)',
          data: [cagr, 12.0], // Mock industry benchmark at 12%
          backgroundColor: ['#10b981', '#cbd5e1'],
          borderWidth: 1,
          barThickness: 60
        }]
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: `${data.company.name} - Revenue CAGR vs Industry Benchmark`, font: { size: 16 } }
        },
        scales: {
          y: {
            ticks: {
              callback: (value) => `${value}%`
            }
          }
        }
      }
    };

    // Render & write to filesystem
    const revenueTrendPath = path.join(this.tempDir, `${companySlug}_revenue_trend.png`);
    const patTrendPath = path.join(this.tempDir, `${companySlug}_pat_trend.png`);
    const ebitdaMarginPath = path.join(this.tempDir, `${companySlug}_ebitda_margin.png`);
    const revenueCagrPath = path.join(this.tempDir, `${companySlug}_revenue_cagr.png`);

    await fs.promises.writeFile(revenueTrendPath, await this.chartCanvas.renderToBuffer(revConfig));
    await fs.promises.writeFile(patTrendPath, await this.chartCanvas.renderToBuffer(patConfig));
    await fs.promises.writeFile(ebitdaMarginPath, await this.chartCanvas.renderToBuffer(ebitdaConfig));
    await fs.promises.writeFile(revenueCagrPath, await this.chartCanvas.renderToBuffer(cagrConfig));

    return {
      revenueTrendPath,
      patTrendPath,
      ebitdaMarginPath,
      revenueCagrPath
    };
  }
}

export const chartGenerationService = new ChartGenerationService();
export type { ChartConfiguration };

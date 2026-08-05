import { chromium } from 'playwright';
import { EquityResearchData } from '@/types';
import { ReportMapper } from '@/lib/report/mapper';
import { chartGenerationService } from '@/lib/charts';
import { renderReportTemplate } from '@/lib/templates';

/**
 * PDF Generation Engine using Playwright for high fidelity print rendering.
 */
export class PDFGenerationService {
  /**
   * Generates a stylized A4 PDF document as a Buffer from Equity Research Data.
   */
  public async generateReportPDF(data: EquityResearchData): Promise<Buffer> {
    // 1. Map raw/AI data to report structure
    const compiledReport = ReportMapper.mapToCompiledReport(data);

    // 2. Generate trend charts
    const chartPaths = await chartGenerationService.generateChartsForReport(data);

    // 3. Compile A4 HTML layout
    const htmlContent = renderReportTemplate(compiledReport, chartPaths);

    // 4. Launch headless browser to print to PDF
    const browser = await chromium.launch({
      headless: true
    });

    try {
      const page = await browser.newPage();
      
      // Load the HTML content directly
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle'
      });

      // Render PDF with professional A4 print styling and dynamic header/footer templates
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '1.8cm',
          bottom: '1.8cm',
          left: '1.2cm',
          right: '1.2cm'
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="font-size: 8px; width: 100%; text-align: right; padding-right: 36px; color: #94a3b8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 500;">
            ${compiledReport.summary.companyName} Equity Research Report &mdash; Ticker: ${compiledReport.summary.ticker}
          </div>
        `,
        footerTemplate: `
          <div style="font-size: 8px; width: 100%; display: flex; justify-content: space-between; padding-left: 36px; padding-right: 36px; color: #94a3b8; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-weight: 500;">
            <span>BULL AI RESEARCH DIVISION</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>
        `
      });

      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}

export const pdfGenerationService = new PDFGenerationService();

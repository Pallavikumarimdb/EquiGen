import puppeteer from 'puppeteer';
import { EquityResearchData } from '@/types';
import { HtmlReportGenerator } from '@/lib/ai/html-report-generator';
import fs from 'fs';
import path from 'path';

/**
 * PDF Generation Service — AI HTML → Puppeteer → PDF
 *
 * The LLM generates a complete, print-ready A4 HTML document (with inline SVG
 * charts, proper tables, CSS print rules). Puppeteer renders it to a PDF buffer.
 *
 * This replaces the manual PDFKit coordinate-math approach, which was fragile
 * and produced blank pages, text overlaps, and broken chart layouts.
 */

export class PDFGenerationService {
  public async generateReportPDF(
    data: EquityResearchData,
    status = 'draft',
    metadata?: { reviewerName: string; sebiRegNo: string; approvedAt: Date }
  ): Promise<Buffer> {
    // 1. Ask the AI to generate the full HTML report
    console.log('[PDF] Generating AI HTML report...');
    const html = await HtmlReportGenerator.generateHTML(data, {
      status: status as 'draft' | 'published',
      reviewerName: metadata?.reviewerName,
      sebiRegNo: metadata?.sebiRegNo,
      approvedAt: metadata?.approvedAt,
    });

    // Optional: cache the HTML alongside the PDF for debugging
    try {
      const ticker = data.company.ticker ?? data.company.name.substring(0, 4).toUpperCase();
      const htmlPath = path.join(process.cwd(), 'public', 'temp', 'reports', `${ticker.toUpperCase()}.html`);
      await fs.promises.writeFile(htmlPath, html, 'utf-8');
    } catch { /* non-fatal */ }

    // 2. Render HTML → PDF with Puppeteer
    console.log('[PDF] Launching Puppeteer...');
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--font-render-hinting=none',
      ],
    });

    try {
      const page = await browser.newPage();

      // Set A4 viewport
      await page.setViewport({ width: 794, height: 1123 });

      // Load the HTML content
      await page.setContent(html, {
        waitUntil: 'load',
        timeout: 30000,
      });

      // Wait for Google Fonts to load (if included)
      await page.evaluateHandle('document.fonts.ready');

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '15mm',
          bottom: '15mm',
          left: '15mm',
          right: '15mm',
        },
        displayHeaderFooter: false,
      });

      console.log(`[PDF] Generated PDF: ${pdfBuffer.length} bytes`);
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}

export const pdfGenerationService = new PDFGenerationService();

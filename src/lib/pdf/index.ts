import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { EquityResearchData } from '@/types';
import { ReportMapper } from '@/lib/report/mapper';
import { renderReportPDF, renderRunningFrames } from '@/lib/templates';

/**
 * DejaVu Sans is committed under src/lib/pdf/fonts and included in the server
 * function output via `outputFileTracingIncludes` in next.config.ts, so the
 * files are present in every deployment (local, Docker, Vercel lambda).
 */
const FONTS_DIR = path.join(process.cwd(), 'src', 'lib', 'pdf', 'fonts');
const REGULAR_FONT = path.join(FONTS_DIR, 'DejaVuSans.ttf');
const BOLD_FONT = path.join(FONTS_DIR, 'DejaVuSans-Bold.ttf');

/**
 * PDF Generation Engine using PDFKit — pure JavaScript rendering, no headless
 * browser or native canvas, so it runs on any Node runtime (incl. serverless).
 * Fonts are embedded as base64 constants to avoid filesystem dependencies.
 */
export class PDFGenerationService {
  /**
   * Generates a stylized A4 PDF document as a Buffer from Equity Research Data.
   */
  public async generateReportPDF(
    data: EquityResearchData, 
    status = 'draft',
    metadata?: { reviewerName: string; sebiRegNo: string; approvedAt: Date }
  ): Promise<Buffer> {
    // 1. Map raw/AI data to report structure
    const compiledReport = ReportMapper.mapToCompiledReport(data);

    // 2. Compile A4 PDF layout
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: 51.02,
        bottom: 51.02,
        left: 34.02,
        right: 34.02
      },
      info: {
        Title: `${compiledReport.summary.companyName} Equity Research Report`,
        Author: 'EquiGen Research Division',
        Subject: 'Equity Research',
        Creator: 'EquiGen'
      },
      bufferPages: true
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // 3. Register embedded fonts (DejaVu Sans covers the ₹ glyph)
    if (!fs.existsSync(REGULAR_FONT) || !fs.existsSync(BOLD_FONT)) {
      throw new Error('PDF fonts not found. Expected DejaVuSans.ttf and DejaVuSans-Bold.ttf in src/lib/pdf/fonts.');
    }
    doc.registerFont('Body', REGULAR_FONT);
    doc.registerFont('BodyBold', BOLD_FONT);

    // 4. Render content
    renderReportPDF(doc, compiledReport, status, metadata);

    // 5. Apply running headers/footers + page numbers on every page
    renderRunningFrames(doc, compiledReport, status);

    // 6. Finalize and collect the buffer
    doc.end();
    const pdfBuffer = await done;

    return pdfBuffer;
  }
}

export const pdfGenerationService = new PDFGenerationService();

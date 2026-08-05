import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { EquityResearchDataSchema } from '@/lib/validation';
import { pdfGenerationService } from '@/lib/pdf';

/**
 * POST /api/report
 * Compiles a research report into Geojit PDF styling and generates required dynamic trend charts.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsedData = EquityResearchDataSchema.safeParse(body);

    if (!parsedData.success) {
      return NextResponse.json(
        { message: 'Invalid equity research data schema.', errors: parsedData.error.flatten() },
        { status: 400 }
      );
    }

    const reportData = parsedData.data;
    const ticker = reportData.company.ticker || reportData.company.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

    // Generate the PDF buffer (handles mapping, charting and playwright HTML rendering internally)
    const reportBuffer = await pdfGenerationService.generateReportPDF(reportData);

    // Save the PDF file to public/temp/reports
    const reportsDir = path.join(process.cwd(), 'public', 'temp', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const pdfPath = path.join(reportsDir, `${ticker.toUpperCase()}.pdf`);
    const jsonPath = path.join(reportsDir, `${ticker.toUpperCase()}.json`);

    await fs.promises.writeFile(pdfPath, reportBuffer);
    await fs.promises.writeFile(jsonPath, JSON.stringify(reportData, null, 2));

    return NextResponse.json({
      success: true,
      reportId: ticker.toUpperCase(),
      message: 'Report and charts generated successfully.'
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('API Error: /api/report failed:', error);
    const errMsg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      { message: errMsg },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient time for Chromium rendering

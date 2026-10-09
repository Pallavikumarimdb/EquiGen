import { HtmlReportGenerator, type HtmlReportOptions } from "@/lib/ai/html-report-generator";
import fs from "fs";
import path from "path";

/**
 * PDF Generation Service — AI HTML → Puppeteer → PDF
 *
 * The LLM generates a complete, print-ready A4 HTML document (with inline SVG
 * charts, proper tables, CSS print rules). Puppeteer renders it to a PDF buffer.
 *
 * This replaces the manual PDFKit coordinate-math approach, which was fragile
 * and produced blank pages, text overlaps, and broken chart layouts.
 */

/** Reviewer + publishing-firm metadata stamped onto the report. */
export type ReportPDFMetadata = Pick<
  HtmlReportOptions,
  "reviewerName" | "sebiRegNo" | "approvedAt" | "orgName" | "complianceEmail" | "website"
> & {
  /**
   * Owning organisation. Used ONLY to namespace the out-of-band debug HTML copy so
   * two tenants researching the same ticker cannot collide on one file. Never rendered.
   */
  orgId?: string | null;
};

export class PDFGenerationService {
  public async generateReportPDF(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any,
    status = "draft",
    metadata?: ReportPDFMetadata,
  ): Promise<Buffer> {
    const isAutonomous = data?.sourceType === "autonomous" || Array.isArray(data?.sections);

    // 1. Generate the full HTML report
    console.log(`[PDF] Generating ${isAutonomous ? "Autonomous" : "Standard"} HTML report...`);
    const htmlOptions: HtmlReportOptions = {
      status: status as "draft" | "published",
      reviewerName: metadata?.reviewerName,
      sebiRegNo: metadata?.sebiRegNo,
      approvedAt: metadata?.approvedAt,
      orgName: metadata?.orgName,
      complianceEmail: metadata?.complianceEmail,
      website: metadata?.website,
    };
    const html = isAutonomous
      ? HtmlReportGenerator.generateAutonomousHTML(data, htmlOptions)
      : await HtmlReportGenerator.generateHTML(data, htmlOptions);

    // Optional: cache the HTML alongside the PDF for debugging.
    //
    // SECURITY: this wrote to `public/temp/reports/`. Next.js serves `public/**` as
    // static assets, so every tenant's full report HTML — containing LLM-produced
    // text — was retrievable by any other authenticated user at a predictable URL, and
    // the path was keyed only by ticker, so two tenants researching the same company
    // collided on one file and either could overwrite the other's artifact. That is
    // the same bug already fixed in /api/report, which had been applied in one place
    // and not the other.
    //
    // The debug copy now goes OUTSIDE `public/`, so it is never web-reachable, and is
    // namespaced by organisation. It is a debugging aid, not a distribution path;
    // /api/download serves the PDF from the database.
    try {
      const rawTicker =
        data?.ticker ??
        data?.company?.ticker ??
        data?.companyName?.substring(0, 4)?.toUpperCase() ??
        data?.company?.name?.substring(0, 4)?.toUpperCase() ??
        "REPORT";
      const safeTicker = String(rawTicker).replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase();
      const orgSegment = String(metadata?.orgId ?? "unscoped")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 64);
      const debugDir = path.join(
        process.cwd(),
        ".report-debug",
        orgSegment,
      );
      await fs.promises.mkdir(debugDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(debugDir, `${safeTicker}.html`),
        html,
        "utf-8",
      );
    } catch (debugErr) {
      console.warn("[PDF] HTML debug copy skipped:", debugErr);
    }

    // 2. Render HTML → PDF with Puppeteer
    console.log("[PDF] Launching browser...");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let browser: any;
    const isVercel =
      process.env.VERCEL === "1" || process.env.AWS_EXECUTION_ENV;

    if (isVercel) {
      console.log(
        "[PDF] Running on Vercel/Serverless. Using sparticuz-chromium...",
      );
      const puppeteerCore = await import("puppeteer-core");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chromium = (await import("@sparticuz/chromium")).default as any;
      browser = await puppeteerCore.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless === "shell" ? true : chromium.headless,
      });
    } else {
      console.log("[PDF] Running locally. Using standard puppeteer...");
      const puppeteer = await import("puppeteer");
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--font-render-hinting=none",
        ],
      });
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const page = (await browser.newPage()) as any;

      // Set A4 viewport
      await page.setViewport({ width: 794, height: 1123 });

      // Load the HTML content
      await page.setContent(html, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for Google Fonts to load (if included) — with a hard timeout so a
      // slow font CDN can never hang the compile on serverless runtimes.
      await page.evaluate(() =>
        Promise.race([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (document as any).fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 8000)),
        ]),
      );
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "0",
          bottom: "0",
          left: "0",
          right: "0",
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

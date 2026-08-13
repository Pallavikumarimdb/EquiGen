import { EquityResearchData } from "@/types";
import { HtmlReportGenerator } from "@/lib/ai/html-report-generator";
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

export class PDFGenerationService {
  public async generateReportPDF(
    data: EquityResearchData,
    status = "draft",
    metadata?: { reviewerName: string; sebiRegNo: string; approvedAt: Date },
  ): Promise<Buffer> {
    // 1. Ask the AI to generate the full HTML report
    console.log("[PDF] Generating AI HTML report...");
    const html = await HtmlReportGenerator.generateHTML(data, {
      status: status as "draft" | "published",
      reviewerName: metadata?.reviewerName,
      sebiRegNo: metadata?.sebiRegNo,
      approvedAt: metadata?.approvedAt,
    });

    // Optional: cache the HTML alongside the PDF for debugging
    try {
      const ticker =
        data.company.ticker ?? data.company.name.substring(0, 4).toUpperCase();
      const htmlPath = path.join(
        process.cwd(),
        "public",
        "temp",
        "reports",
        `${ticker.toUpperCase()}.html`,
      );
      await fs.promises.writeFile(htmlPath, html, "utf-8");
    } catch {
      /* non-fatal */
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

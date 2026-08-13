import "./math-sumprecise-polyfill"; // MUST precede unpdf: bundled pdf.js calls Math.sumPrecise unguarded (absent in Node)
import { extractText, getMeta, renderPageAsImage, extractImages } from "unpdf";
import { DocumentExtractor, ExtractedDocument } from "./types";
import { createWorker } from "tesseract.js";
import Groq from "groq-sdk";
import { estimateTableDensity } from "./section-detector";
import { resolveTesseractWorkerPath } from "./tesseract-paths";

/** Per-page record from the fast native-text pass — the input to targeting and the chunker. */
export interface PdfPageRecord {
  pageNo: number;
  nativeText: string;
  ocrText: string | null;
  isScanned: boolean;
  hasTables: boolean;
  tableDensity: number;
}

export class PDFExtractor implements DocumentExtractor {
  // Configurable native character threshold
  public threshold = 100;

  public async extract(
    buffer: Buffer,
    fileName: string,
  ): Promise<ExtractedDocument> {
    try {
      const cleanArrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
      const uint8Array = new Uint8Array(cleanArrayBuffer);

      // unpdf/pdf.js TRANSFERS (detaches) the input ArrayBuffer to its worker on first use —
      // extractText below would leave `uint8Array` unusable. Keep a pristine copy for every
      // later consumer (fallback pages, metadata).
      const pristineBytes = new Uint8Array(cleanArrayBuffer.slice(0));

      // Serverless runtimes (Vercel) have no reliable Tesseract worker in the traced bundle and
      // no headroom for per-page canvas rendering — the upload budget must stay bounded. Scanned
      // pages are handled downstream at extraction time via the ocr_recheck targeting verdict.
      const isServerless =
        process.env.VERCEL === "1" || !!process.env.AWS_EXECUTION_ENV;

      // Extract page-by-page text content natively using unpdf
      const { pagesText, totalPages } =
        await this.extractNativePagesText(uint8Array);

      const finalPagesText: string[] = [];

      for (let i = 0; i < totalPages; i++) {
        const pageNumber = i + 1;
        const nativeText = pagesText[i] || "";

        // If native text is long enough, use it directly (fast, free)
        if (nativeText.trim().length >= this.threshold) {
          finalPagesText.push(nativeText);
          continue;
        }

        console.log(
          `[PDF Extractor] Low native text length (${nativeText.trim().length}) on page ${pageNumber}. Triggering fallback...`,
        );

        if (isServerless) {
          console.log(
            `[PDF Extractor] Serverless runtime — skipping OCR/vision fallback on page ${pageNumber} (handled downstream via ocr_recheck).`,
          );
          finalPagesText.push(nativeText);
          continue;
        }

        try {
          // Per-page hard cap: must never blow the upload budget, even for huge scanned filings.
          const pageResult = await Promise.race([
            this.extractPageWithFallback(pristineBytes, pageNumber),
            new Promise<string>((resolve) =>
              setTimeout(() => resolve(nativeText), 45000),
            ),
          ]);
          finalPagesText.push(pageResult);
        } catch (fallbackError) {
          console.error(
            `[PDF Extractor] Fallback failed for page ${pageNumber}:`,
            fallbackError,
          );
          // Fallback to whatever native text we had (even if short/empty)
          finalPagesText.push(nativeText);
        }
      }

      // Extract PDF metadata/info
      let info: Record<string, unknown> = {};
      try {
        const meta = await getMeta(pristineBytes);
        info = (meta?.info || {}) as Record<string, unknown>;
      } catch (metaError) {
        console.warn("PDF metadata extraction skipped:", metaError);
      }

      return {
        text: finalPagesText.join("\n\n--- PAGE BREAK ---\n\n"),
        tables: [],
        metadata: {
          fileName,
          totalPages: totalPages || 1,
          info,
        },
      };
    } catch (error) {
      console.error("PDF parsing error:", error);
      throw new Error(`Failed to parse PDF document: ${fileName}`);
    }
  }

  // --- Overridable/Mockable helper methods for testing ---

  /**
   * Per-page OCR/vision fallback for scanned or low-text pages. Only runs outside
   * serverless runtimes (see `extract`); the upload route races this against a
   * 45s cap so a stuck Tesseract download can never stall the pipeline.
   */
  public async extractPageWithFallback(
    pristineBytes: Uint8Array,
    pageNumber: number,
  ): Promise<string> {
    // unpdf DETACHES the input ArrayBuffer on first use (pdf.js worker transfer), so every
    // consumer after the first would get a detached buffer. Fresh copy per fallback page —
    // only scanned/low-text pages take this branch, so the copy cost stays negligible.
    const freshBytes = new Uint8Array(pristineBytes);

    // Prefer the page's own embedded image: lossless (no re-render), and it is the only
    // reliable rasterization on Node 24 (the pdf.js canvas render path produces black
    // output — see spike findings). Real scans are single full-page JPEGs.
    const pageImageDataUrl = await this.extractPageImageAsDataUrl(
      freshBytes,
      pageNumber,
    );

    if (pageImageDataUrl) {
      console.log(
        `[PDF Extractor] Page ${pageNumber} is scanned (embedded image). Running Tesseract OCR...`,
      );
      return this.runOcrFallback(pageImageDataUrl);
    }

    // No embedded image (e.g. vector-only page) — best-effort render path. Known issue:
    // broken on Node 24 (black renders); kept for older runtimes and chart pages.
    const imgDataUrl = await this.renderPageToImage(freshBytes, pageNumber);

    const hasChartsOrGraphics = await this.checkGraphics(
      freshBytes,
      pageNumber,
    );

    const groqApiKey = process.env.GROQ_API_KEY;
    if (hasChartsOrGraphics && groqApiKey) {
      console.log(
        `[PDF Extractor] Page ${pageNumber} has graphics/charts. Triggering Groq Llama 3.2 Vision...`,
      );
      return this.runVisionFallback(imgDataUrl, groqApiKey);
    }

    console.log(
      `[PDF Extractor] Running Tesseract OCR on page ${pageNumber}...`,
    );
    return this.runOcrFallback(imgDataUrl);
  }

  /**
   * Fast, free, per-page native-text pass — the foundation of the document pipeline.
   * Flags scanned pages and table-dense pages so targeting can spend AI tokens only where
   * they matter. OCR is intentionally NOT run here (it's the ocr_recheck fallback step).
   */
  public async extractPages(uint8Array: Uint8Array): Promise<PdfPageRecord[]> {
    const { pagesText, totalPages } =
      await this.extractNativePagesText(uint8Array);
    const records: PdfPageRecord[] = [];
    for (let i = 0; i < totalPages; i++) {
      const pageNo = i + 1;
      const nativeText = pagesText[i] || "";
      const density = estimateTableDensity(nativeText);
      records.push({
        pageNo,
        nativeText,
        ocrText: null,
        isScanned: nativeText.trim().length < this.threshold,
        hasTables: density >= 0.15,
        tableDensity: density,
      });
    }
    return records;
  }

  public async extractNativePagesText(
    uint8Array: Uint8Array,
  ): Promise<{ pagesText: string[]; totalPages: number }> {
    const { text, totalPages } = await extractText(uint8Array, {
      mergePages: false,
    });
    const pagesText = Array.isArray(text) ? text : [text || ""];
    return { pagesText, totalPages: totalPages || pagesText.length };
  }

  public async renderPageToImage(
    uint8Array: Uint8Array,
    pageNumber: number,
    scale = 2,
  ): Promise<string> {
    return await renderPageAsImage(uint8Array, pageNumber, {
      toDataURL: true,
      scale,
      canvasImport: () => import("@napi-rs/canvas"),
    });
  }

  /** Extract the page's own embedded image (lossless) and encode it as a PNG data URL. Returns null when the page has no embedded image. */
  public async extractPageImageAsDataUrl(
    uint8Array: Uint8Array,
    pageNumber: number,
  ): Promise<string | null> {
    const pageImages = await this.extractPageImages(uint8Array, pageNumber);
    const largest = pageImages.reduce(
      (best, img) =>
        img.width * img.height > (best?.width ?? 0) * (best?.height ?? 0)
          ? img
          : best,
      null as {
        width: number;
        height: number;
        channels: number;
        data: Uint8Array;
      } | null,
    );
    if (!largest) return null;
    return await this.rgbToPngDataUrl(largest);
  }

  /** unpdf 1.8 returns extracted images keyed by zero-based page index (its types claim an array — trust runtime). Normalizes to an array. */
  public async extractPageImages(
    uint8Array: Uint8Array,
    pageNumber: number,
  ): Promise<
    { width: number; height: number; channels: number; data: Uint8Array }[]
  > {
    const result = await extractImages(uint8Array, pageNumber);
    if (!result) return [];
    const record = result as unknown as Record<string, unknown>;
    const pageKey = String(pageNumber - 1);
    const pageEntry = (record[pageKey] ?? Object.values(record)[0]) as
      | {
          width?: number;
          height?: number;
          channels?: number;
          data?: Uint8Array;
        }
      | undefined;
    if (!pageEntry?.data) return [];
    return Array.isArray(pageEntry)
      ? (pageEntry as unknown as {
          width: number;
          height: number;
          channels: number;
          data: Uint8Array;
        }[])
      : [
          pageEntry as {
            width: number;
            height: number;
            channels: number;
            data: Uint8Array;
          },
        ];
  }

  /** Encode raw RGB(A) pixel data as an opaque PNG data URL. Alpha MUST be 255 — unpdf returns 3-channel data, and leaving alpha 0 yields a fully transparent image that OCR cannot read. */
  public async rgbToPngDataUrl(image: {
    width: number;
    height: number;
    channels: number;
    data: Uint8Array;
  }): Promise<string> {
    const { createCanvas } = await import("@napi-rs/canvas");
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(image.width, image.height);
    const rgba = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0; i < image.width * image.height; i++) {
      rgba[i * 4] = image.data[i * image.channels];
      rgba[i * 4 + 1] = image.data[i * image.channels + 1];
      rgba[i * 4 + 2] = image.data[i * image.channels + 2];
      rgba[i * 4 + 3] = 255;
    }
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  public async checkGraphics(
    uint8Array: Uint8Array,
    pageNumber: number,
  ): Promise<boolean> {
    try {
      const images = await this.extractPageImages(uint8Array, pageNumber);
      return images.some((img) => img.width > 120 && img.height > 120);
    } catch (err) {
      console.warn(
        `[PDF Extractor] Failed to check graphics on page ${pageNumber}:`,
        err,
      );
    }
    return false;
  }

  public async runVisionFallback(
    imgDataUrl: string,
    apiKey: string,
  ): Promise<string> {
    const visionModel =
      process.env.GROQ_VISION_MODEL || "llama-3.2-11b-vision-preview";
    const groq = new Groq({ apiKey });
    const response = await groq.chat.completions.create({
      model: visionModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all financial data, transcribe all text and tables, and describe any charts/graphs including specific metrics and trends on this page.",
            },
            { type: "image_url", image_url: { url: imgDataUrl } },
          ],
        },
      ],
    });
    return response.choices[0]?.message?.content || "";
  }

  public async runOcrFallback(imgDataUrl: string): Promise<string> {
    try {
      const worker = await createWorker("eng", undefined, {
        workerPath: resolveTesseractWorkerPath(),
      });
      try {
        const {
          data: { text },
        } = await worker.recognize(imgDataUrl);
        return text;
      } finally {
        await worker.terminate().catch(() => {});
      }
    } catch (err) {
      console.error("[PDF Extractor] Tesseract OCR failed:", err);
      return "";
    }
  }
}

export const pdfExtractor = new PDFExtractor();

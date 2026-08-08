import { extractText, getMeta, renderPageAsImage, extractImages } from 'unpdf';
import { DocumentExtractor, ExtractedDocument } from './types';
import { createWorker } from 'tesseract.js';
import Groq from 'groq-sdk';

export class PDFExtractor implements DocumentExtractor {
  // Configurable native character threshold
  public threshold = 100;

  public async extract(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    try {
      const cleanArrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      const uint8Array = new Uint8Array(cleanArrayBuffer);

      // Extract page-by-page text content natively using unpdf
      const { pagesText, totalPages } = await this.extractNativePagesText(uint8Array);

      const finalPagesText: string[] = [];

      for (let i = 0; i < totalPages; i++) {
        const pageNumber = i + 1;
        const nativeText = pagesText[i] || '';
        
        // If native text is long enough, use it directly (fast, free)
        if (nativeText.trim().length >= this.threshold) {
          finalPagesText.push(nativeText);
          continue;
        }

        console.log(`[PDF Extractor] Low native text length (${nativeText.trim().length}) on page ${pageNumber}. Triggering fallback...`);

        try {
          // Render page to base64 data URL
          const imgDataUrl = await this.renderPageToImage(uint8Array, pageNumber);

          // Check if the page has non-trivial graphics
          const hasChartsOrGraphics = await this.checkGraphics(uint8Array, pageNumber);

          const groqApiKey = process.env.GROQ_API_KEY;
          if (hasChartsOrGraphics && groqApiKey) {
            console.log(`[PDF Extractor] Page ${pageNumber} has graphics/charts. Triggering Groq Llama 3.2 Vision...`);
            const visionText = await this.runVisionFallback(imgDataUrl, groqApiKey);
            finalPagesText.push(visionText);
          } else {
            console.log(`[PDF Extractor] Running Tesseract OCR on page ${pageNumber}...`);
            const ocrText = await this.runOcrFallback(imgDataUrl);
            finalPagesText.push(ocrText);
          }
        } catch (fallbackError) {
          console.error(`[PDF Extractor] Fallback failed for page ${pageNumber}:`, fallbackError);
          // Fallback to whatever native text we had (even if short/empty)
          finalPagesText.push(nativeText);
        }
      }

      // Extract PDF metadata/info
      let info: Record<string, unknown> = {};
      try {
        const meta = await getMeta(uint8Array);
        info = (meta?.info || {}) as Record<string, unknown>;
      } catch (metaError) {
        console.warn('PDF metadata extraction skipped:', metaError);
      }

      return {
        text: finalPagesText.join('\n\n--- PAGE BREAK ---\n\n'),
        tables: [], 
        metadata: {
          fileName,
          totalPages: totalPages || 1,
          info,
        },
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error(`Failed to parse PDF document: ${fileName}`);
    }
  }

  // --- Overridable/Mockable helper methods for testing ---

  public async extractNativePagesText(uint8Array: Uint8Array): Promise<{ pagesText: string[], totalPages: number }> {
    const { text, totalPages } = await extractText(uint8Array, { mergePages: false });
    const pagesText = Array.isArray(text) ? text : [text || ''];
    return { pagesText, totalPages: totalPages || pagesText.length };
  }

  public async renderPageToImage(uint8Array: Uint8Array, pageNumber: number): Promise<string> {
    return await renderPageAsImage(uint8Array, pageNumber, {
      toDataURL: true,
      canvasImport: () => import('@napi-rs/canvas')
    });
  }

  public async checkGraphics(uint8Array: Uint8Array, pageNumber: number): Promise<boolean> {
    try {
      const images = await extractImages(uint8Array, pageNumber);
      if (images && images.length > 0) {
        return images.some(img => img.width > 120 && img.height > 120);
      }
    } catch (err) {
      console.warn(`[PDF Extractor] Failed to check graphics on page ${pageNumber}:`, err);
    }
    return false;
  }

  public async runVisionFallback(imgDataUrl: string, apiKey: string): Promise<string> {
    const groq = new Groq({ apiKey });
    const response = await groq.chat.completions.create({
      model: 'llama-3.2-11b-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all financial data, transcribe all text and tables, and describe any charts/graphs including specific metrics and trends on this page.' },
            { type: 'image_url', image_url: { url: imgDataUrl } }
          ]
        }
      ]
    });
    return response.choices[0]?.message?.content || '';
  }

  public async runOcrFallback(imgDataUrl: string): Promise<string> {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(imgDataUrl);
    await worker.terminate();
    return text;
  }
}

export const pdfExtractor = new PDFExtractor();

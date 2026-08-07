import { extractText, getMeta } from 'unpdf';
import { DocumentExtractor, ExtractedDocument } from './types';

export class PDFExtractor implements DocumentExtractor {
  public async extract(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    try {
      const uint8Array = new Uint8Array(buffer);

      // Extract text content using unpdf (pure JS, works in serverless environments)
      const { text, totalPages } = await extractText(uint8Array, { mergePages: true });

      // Extract PDF metadata/info
      let info: Record<string, unknown> = {};
      try {
        const meta = await getMeta(uint8Array);
        info = (meta?.info || {}) as Record<string, unknown>;
      } catch (metaError) {
        console.warn('PDF metadata extraction skipped:', metaError);
      }

      return {
        text: Array.isArray(text) ? text.join('\n') : (text || ''),
        tables: [], // unpdf does not extract tables; AI parses structured figures from the plain text
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
}

export const pdfExtractor = new PDFExtractor();

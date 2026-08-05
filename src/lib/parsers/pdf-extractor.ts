import { DocumentExtractor, ExtractedDocument } from './types';

export class PDFExtractor implements DocumentExtractor {
  public async extract(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    try {
      // Use dynamic require to bypass module default export resolution issues in ESM/Webpack
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdf = require('pdf-parse');
      const data = await pdf(buffer);
      
      return {
        text: data.text || '',
        tables: [], // pdf-parse does not natively extract tabular matrices, AI will extract figures
        metadata: {
          fileName,
          totalPages: data.numpages || 1,
          info: (data.info || {}) as Record<string, unknown>
        }
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error(`Failed to parse PDF document: ${fileName}`);
    }
  }
}

export const pdfExtractor = new PDFExtractor();

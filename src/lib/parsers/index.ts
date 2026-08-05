import { pdfExtractor } from './pdf-extractor';
import { csvExtractor } from './csv-extractor';
import { txtExtractor } from './txt-extractor';
import { ExtractedDocument } from './types';

/**
 * File Parsers Coordinator.
 * Automatically chooses the appropriate extractor by MIME type/extension
 * and returns a unified structure: { text, tables, metadata }.
 */
export class ParserService {
  /**
   * Dispatches parsing based on file type/extension.
   */
  public async parseFile(buffer: Buffer, fileName: string, mimeType: string): Promise<ExtractedDocument> {
    const lowerName = fileName.toLowerCase();
    
    if (lowerName.endsWith('.pdf') || mimeType === 'application/pdf') {
      return pdfExtractor.extract(buffer, fileName);
    } else if (lowerName.endsWith('.csv') || mimeType === 'text/csv' || mimeType === 'application/vnd.ms-excel') {
      return csvExtractor.extract(buffer, fileName);
    } else {
      return txtExtractor.extract(buffer, fileName);
    }
  }
}

export const parserService = new ParserService();
export * from './types';

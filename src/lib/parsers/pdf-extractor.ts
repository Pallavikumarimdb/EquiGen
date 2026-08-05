import { PDFParse } from 'pdf-parse';
import { DocumentExtractor, ExtractedDocument } from './types';

export class PDFExtractor implements DocumentExtractor {
  public async extract(buffer: Buffer, fileName: string): Promise<ExtractedDocument> {
    let pdfInstance: InstanceType<typeof PDFParse> | null = null;
    try {
      pdfInstance = new PDFParse({ data: new Uint8Array(buffer) });

      // Extract text content
      const textResult = await pdfInstance.getText();
      const text = textResult.text || '';

      // Extract tables (optional — fall back to empty on failure)
      const tables: string[][][] = [];
      try {
        const tableResult = await pdfInstance.getTable();
        if (tableResult?.pages) {
          for (const page of tableResult.pages) {
            if (page?.tables) {
              for (const table of page.tables) {
                if (Array.isArray(table)) {
                  tables.push(table);
                }
              }
            }
          }
        }
      } catch (tableError) {
        console.warn('Table extraction skipped:', tableError);
      }

      // Extract PDF metadata/info
      let info: Record<string, unknown> = {};
      try {
        const infoResult = await pdfInstance.getInfo();
        info = (infoResult?.info || {}) as Record<string, unknown>;
      } catch (infoError) {
        console.warn('Info extraction skipped:', infoError);
      }

      return {
        text,
        tables,
        metadata: {
          fileName,
          totalPages: textResult.total || 1,
          info,
        },
      };
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error(`Failed to parse PDF document: ${fileName}`);
    } finally {
      if (pdfInstance) {
        try {
          await pdfInstance.destroy();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }
}

export const pdfExtractor = new PDFExtractor();

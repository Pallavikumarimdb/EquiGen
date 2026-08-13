import { pdfExtractor } from "./pdf-extractor";
import { csvExtractor } from "./csv-extractor";
import { txtExtractor } from "./txt-extractor";
import { ExtractedDocument } from "./types";

/**
 * File Parsers Coordinator.
 * Automatically chooses the appropriate extractor by MIME type/extension
 * and returns a unified structure: { text, tables, metadata }.
 */
export class ParserService {
  /**
   * Dispatches parsing based on file type/extension.
   */
  public async parseFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<ExtractedDocument> {
    const lowerName = fileName.toLowerCase();
    let result: ExtractedDocument;

    if (lowerName.endsWith(".pdf") || mimeType === "application/pdf") {
      result = await pdfExtractor.extract(buffer, fileName);
    } else if (
      lowerName.endsWith(".csv") ||
      mimeType === "text/csv" ||
      mimeType === "application/vnd.ms-excel"
    ) {
      result = await csvExtractor.extract(buffer, fileName);
    } else if (lowerName.endsWith(".txt") || mimeType === "text/plain") {
      result = await txtExtractor.extract(buffer, fileName);
    } else {
      throw new Error(
        `Unsupported file type: ${fileName}. Please upload a PDF, CSV, or TXT document.`,
      );
    }

    if (!result || !result.text || result.text.trim().length === 0) {
      throw new Error(
        `The uploaded file "${fileName}" appears to be empty or contains no readable text.`,
      );
    }

    return result;
  }
}

export const parserService = new ParserService();
export * from "./types";

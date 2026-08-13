import { DocumentExtractor, ExtractedDocument } from "./types";

export class TXTExtractor implements DocumentExtractor {
  public async extract(
    buffer: Buffer,
    fileName: string,
  ): Promise<ExtractedDocument> {
    try {
      const text = buffer.toString("utf-8");
      const lines = text.split(/\r?\n/);

      return {
        text,
        tables: [],
        metadata: {
          fileName,
          totalLines: lines.length,
          sizeBytes: buffer.length,
        },
      };
    } catch (error) {
      console.error("TXT parsing error:", error);
      throw new Error(`Failed to parse TXT document: ${fileName}`);
    }
  }
}

export const txtExtractor = new TXTExtractor();

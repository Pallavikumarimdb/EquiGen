import Papa from "papaparse";
import { DocumentExtractor, ExtractedDocument } from "./types";

export class CSVExtractor implements DocumentExtractor {
  public async extract(
    buffer: Buffer,
    fileName: string,
  ): Promise<ExtractedDocument> {
    try {
      const csvString = buffer.toString("utf-8");

      const parseResult = Papa.parse<string[]>(csvString, {
        skipEmptyLines: true,
        header: false,
      });

      const rows = parseResult.data;

      // Format tabular structure
      const tables: string[][][] = [rows];

      // Convert rows back to readable text format for LLM processing
      const text = rows.map((row) => row.join(" | ")).join("\n");

      return {
        text,
        tables,
        metadata: {
          fileName,
          totalRows: rows.length,
          columnsCount: rows[0]?.length || 0,
          errors: parseResult.errors,
        },
      };
    } catch (error) {
      console.error("CSV parsing error:", error);
      throw new Error(`Failed to parse CSV document: ${fileName}`);
    }
  }
}

export const csvExtractor = new CSVExtractor();

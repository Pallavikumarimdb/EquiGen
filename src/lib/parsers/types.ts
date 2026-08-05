export interface ExtractedDocument {
  text: string;
  tables: string[][][]; // Array of tables, where each table is string[][] (rows and columns)
  metadata: Record<string, any>;
}

export interface DocumentExtractor {
  extract(buffer: Buffer, fileName: string): Promise<ExtractedDocument>;
}

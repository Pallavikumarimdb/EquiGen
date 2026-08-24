import { EquityResearchData } from "@/types";
import { aiService } from "../ai";
import { ExtractedDocument } from "../parsers/types";

/**
 * Extractor Service orchestrating parser output and Groq AI service.
 */
export class ExtractorService {
  /**
   * Orchestrates the parsing and extraction process.
   */
  public async extract(
    companyName: string,
    parsedData: ExtractedDocument,
  ): Promise<EquityResearchData> {
    try {
      // Validate inputs
      if (!companyName) {
        throw new Error("Company name is required for extraction.");
      }

      // Perform AI extraction using Groq GPT OSS 120B / Qwen 3.6
      const result = await aiService.extractFinancialData(
        companyName,
        parsedData.text,
      );
      return result;
    } catch (error) {
      console.error("Extraction failed:", error);
      throw error;
    }
  }
}

export const extractorService = new ExtractorService();

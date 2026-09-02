/**
 * Consistency Checker Tool
 * Scans generated report section text against structured financial modeling outputs
 * and extracted filings to detect numerical contradictions, target price mismatches,
 * or margin inconsistencies.
 */

import { ModelingOutput } from "@/types/plan4";

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  score: number; // 0.0 to 1.0 (1.0 = perfect consistency)
  contradictions: ContradictionItem[];
  warnings: string[];
}

export interface ContradictionItem {
  sectionName: string;
  field: string;
  expectedValue: string | number;
  foundValue: string | number;
  description: string;
  severity: "high" | "medium" | "low";
}

export class ConsistencyCheckerTool {
  /**
   * Scans a text snippet or section against model outputs and financial data
   */
  public static checkSectionConsistency(
    sectionName: string,
    sectionText: string,
    modelOutput?: ModelingOutput,
    extractedFinancials?: Record<string, unknown>
  ): ConsistencyCheckResult {
    const contradictions: ContradictionItem[] = [];
    const warnings: string[] = [];

    if (!sectionText || sectionText.trim().length === 0) {
      return { isConsistent: true, score: 1.0, contradictions: [], warnings: ["Section text is empty."] };
    }

    // 1. Target Price Consistency Check
    if (modelOutput?.baseTargetPrice) {
      const expectedTarget = Math.round(modelOutput.baseTargetPrice);
      // Search for ₹XXX or Rs. XXX or target price of XXX in text
      const tpMatches = sectionText.match(/(?:target price|tp|fair value)(?:\s+of)?\s*(?:₹|rs\.?|inr)?\s*(\d+(?:,\d+)*(?:\.\d+)?)/i);

      if (tpMatches && tpMatches[1]) {
        const foundTarget = parseFloat(tpMatches[1].replace(/,/g, ""));
        const diffPercent = Math.abs(foundTarget - expectedTarget) / expectedTarget;

        if (diffPercent > 0.05) { // >5% mismatch
          contradictions.push({
            sectionName,
            field: "target_price",
            expectedValue: `₹${expectedTarget}`,
            foundValue: `₹${foundTarget}`,
            description: `Target price in section text (₹${foundTarget}) mismatches model output (₹${expectedTarget}) by ${(diffPercent * 100).toFixed(1)}%.`,
            severity: "high",
          });
        }
      }
    }

    // 2. Rating Mismatch Check (DCF upside vs Rating)
    if (modelOutput?.baseTargetPrice && extractedFinancials?.currentPrice) {
      const currentPrice = Number(extractedFinancials.currentPrice);
      const upsidePercent = ((modelOutput.baseTargetPrice - currentPrice) / currentPrice) * 100;

      if (upsidePercent > 15 && /SELL|REDUCE|UNDERPERFORM/i.test(sectionText)) {
        contradictions.push({
          sectionName,
          field: "recommendation_rating",
          expectedValue: "BUY / ACCUMULATE",
          foundValue: "SELL / REDUCE",
          description: `Report recommends SELL despite a ${upsidePercent.toFixed(1)}% DCF upside.`,
          severity: "high",
        });
      }
    }

    // 3. WACC / Discount Rate Consistency Check
    if (modelOutput?.assumptions?.wacc) {
      const expectedWacc = modelOutput.assumptions.wacc;
      const waccMatches = sectionText.match(/wacc(?:\s+of|\s*[:=])?\s*(\d+(?:\.\d+)?)\s*%/i);

      if (waccMatches && waccMatches[1]) {
        const foundWacc = `${waccMatches[1]}%`;
        if (foundWacc !== expectedWacc) {
          warnings.push(
            `WACC in text (${foundWacc}) differs from DCF assumption (${expectedWacc}).`
          );
        }
      }
    }

    const highSeverityCount = contradictions.filter((c) => c.severity === "high").length;
    const score = Math.max(0, 1.0 - highSeverityCount * 0.3 - contradictions.length * 0.1);

    return {
      isConsistent: contradictions.length === 0,
      score: parseFloat(score.toFixed(2)),
      contradictions,
      warnings,
    };
  }
}

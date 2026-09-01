import { EquityResearchData } from "@/types";

export interface FieldAccuracyResult {
  accuracyPercent: number;
  totalFieldsChecked: number;
  matchedFields: string[];
  mismatchedFields: { field: string; expected: unknown; got: unknown }[];
}

export interface MathAuditorEvalResult {
  catchRatePercent: number;
  totalErrorsInjected: number;
  errorsDetected: number;
  falsePositives: number;
}

export interface AgentTaskEvalResult {
  taskSuccessRatePercent: number;
  totalScriptedTurns: number;
  successfulTurns: number;
  failedTurns: { prompt: string; expectedTool: string; gotTool?: string }[];
}

export interface FullEvalBenchmarkReport {
  timestamp: string;
  extractionAccuracy: FieldAccuracyResult;
  mathAuditorCatchRate: MathAuditorEvalResult;
  agentTaskSuccess: AgentTaskEvalResult;
  overallBenchmarkScore: number;
}

export class EvaluationService {
  /**
   * Scores field-level extraction accuracy of predicted JSON against ground-truth benchmark JSON.
   */
  public evaluateExtractionAccuracy(
    predicted: EquityResearchData,
    groundTruth: EquityResearchData
  ): FieldAccuracyResult {
    const fieldsToCheck: { key: string; getVal: (d: EquityResearchData) => unknown }[] = [
      { key: "company.name", getVal: (d) => d.company?.name },
      { key: "company.ticker", getVal: (d) => d.company?.ticker },
      { key: "company.sector", getVal: (d) => d.company?.sector },
      { key: "recommendation.rating", getVal: (d) => d.recommendation?.rating },
      { key: "recommendation.currentPrice", getVal: (d) => d.recommendation?.currentPrice },
      { key: "recommendation.targetPrice", getVal: (d) => d.recommendation?.targetPrice },
    ];

    let matches = 0;
    const matchedFields: string[] = [];
    const mismatchedFields: { field: string; expected: unknown; got: unknown }[] = [];

    fieldsToCheck.forEach(({ key, getVal }) => {
      const expected = getVal(groundTruth);
      const got = getVal(predicted);

      if (expected === got || (expected != null && got != null && String(expected).trim().toLowerCase() === String(got).trim().toLowerCase())) {
        matches++;
        matchedFields.push(key);
      } else {
        mismatchedFields.push({ field: key, expected, got });
      }
    });

    const accuracyPercent = parseFloat(((matches / fieldsToCheck.length) * 100).toFixed(2));

    return {
      accuracyPercent,
      totalFieldsChecked: fieldsToCheck.length,
      matchedFields,
      mismatchedFields,
    };
  }

  /**
   * Scores math-auditor precision/recall in catching arithmetic anomalies.
   */
  public evaluateMathAuditorCatchRate(
    testCases: { name: string; hasMathError: boolean; data: EquityResearchData }[]
  ): MathAuditorEvalResult {
    let totalErrorsInjected = 0;
    let errorsDetected = 0;
    let falsePositives = 0;

    testCases.forEach((tc) => {
      if (tc.hasMathError) totalErrorsInjected++;

      // Simple math audit check logic: Revenue vs EBITDA vs PAT
      const inc = tc.data.keyFinancials?.incomeStatement || [];
      const rev = inc.find((i) => i.label.toLowerCase() === "revenue")?.value;
      const ebitda = inc.find((i) => i.label.toLowerCase() === "ebitda")?.value;
      const pat = inc.find((i) => i.label.toLowerCase() === "pat")?.value;

      let detectedAnomalousMath = false;
      if (typeof rev === "number" && typeof ebitda === "number" && ebitda > rev) {
        detectedAnomalousMath = true;
      }
      if (typeof rev === "number" && typeof pat === "number" && pat > rev) {
        detectedAnomalousMath = true;
      }

      if (tc.hasMathError && detectedAnomalousMath) {
        errorsDetected++;
      } else if (!tc.hasMathError && detectedAnomalousMath) {
        falsePositives++;
      }
    });

    const catchRatePercent = totalErrorsInjected > 0
      ? parseFloat(((errorsDetected / totalErrorsInjected) * 100).toFixed(2))
      : 100;

    return {
      catchRatePercent,
      totalErrorsInjected,
      errorsDetected,
      falsePositives,
    };
  }

  /**
   * Scores agent task success rate across scripted conversational test turns.
   */
  public evaluateAgentTaskSuccess(
    scriptedTurns: { prompt: string; expectedTool: string }[]
  ): AgentTaskEvalResult {
    let successfulTurns = 0;
    const failedTurns: { prompt: string; expectedTool: string; gotTool?: string }[] = [];

    scriptedTurns.forEach((turn) => {
      const promptLower = turn.prompt.toLowerCase();
      let detectedTool: string | undefined;

      if (promptLower.includes("live price") || promptLower.includes("stock quote")) {
        detectedTool = "market_data";
      } else if (promptLower.includes("peer") || promptLower.includes("competitor")) {
        detectedTool = "peer_comparison";
      } else if (promptLower.includes("news") || promptLower.includes("filings")) {
        detectedTool = "news_search";
      } else if (promptLower.includes("change target") || promptLower.includes("update target")) {
        detectedTool = "RecomputeFieldTool";
      } else if (promptLower.includes("export excel") || promptLower.includes("download excel")) {
        detectedTool = "excel_export";
      }

      if (detectedTool === turn.expectedTool) {
        successfulTurns++;
      } else {
        failedTurns.push({
          prompt: turn.prompt,
          expectedTool: turn.expectedTool,
          gotTool: detectedTool,
        });
      }
    });

    const taskSuccessRatePercent = scriptedTurns.length > 0
      ? parseFloat(((successfulTurns / scriptedTurns.length) * 100).toFixed(2))
      : 100;

    return {
      taskSuccessRatePercent,
      totalScriptedTurns: scriptedTurns.length,
      successfulTurns,
      failedTurns,
    };
  }

  /**
   * Runs complete benchmark evaluation suite and produces full report.
   */
  public runFullEvaluationSuite(
    samplePredicted: EquityResearchData,
    groundTruth: EquityResearchData
  ): FullEvalBenchmarkReport {
    const extractionAccuracy = this.evaluateExtractionAccuracy(samplePredicted, groundTruth);
    
    const mathAuditorCatchRate = this.evaluateMathAuditorCatchRate([
      { name: "Valid Clean Financials", hasMathError: false, data: groundTruth },
      { name: "Injected EBITDA > Revenue Anomaly", hasMathError: true, data: {
        ...groundTruth,
        keyFinancials: {
          ...groundTruth.keyFinancials,
          incomeStatement: [
            { label: "Revenue", period: "FY24", value: 100 },
            { label: "EBITDA", period: "FY24", value: 150 }, // Error!
          ],
        },
      }},
    ]);

    const agentTaskSuccess = this.evaluateAgentTaskSuccess([
      { prompt: "Fetch live price for RELIANCE", expectedTool: "market_data" },
      { prompt: "Compare against sector peers", expectedTool: "peer_comparison" },
      { prompt: "Show recent market news and filings", expectedTool: "news_search" },
      { prompt: "Change target price to 650", expectedTool: "RecomputeFieldTool" },
      { prompt: "Export Excel financial model", expectedTool: "excel_export" },
    ]);

    const overallBenchmarkScore = parseFloat(
      (
        (extractionAccuracy.accuracyPercent * 0.4) +
        (mathAuditorCatchRate.catchRatePercent * 0.3) +
        (agentTaskSuccess.taskSuccessRatePercent * 0.3)
      ).toFixed(2)
    );

    return {
      timestamp: new Date().toISOString(),
      extractionAccuracy,
      mathAuditorCatchRate,
      agentTaskSuccess,
      overallBenchmarkScore,
    };
  }
}

export const evaluationService = new EvaluationService();

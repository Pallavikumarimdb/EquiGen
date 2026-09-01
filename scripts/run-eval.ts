import { evaluationService } from "../src/lib/eval/eval-service";
import { EquityResearchData } from "../src/types";

const sampleGroundTruth: EquityResearchData = {
  company: {
    name: "Reliance Industries Ltd",
    ticker: "RELIANCE",
    sector: "Oil, Gas & Consumable Fuels",
    reportDate: "01 September 2026",
  },
  recommendation: {
    rating: "BUY",
    currentPrice: 1309,
    targetPrice: 1650,
    upsidePotential: 26.05,
    rationale: ["Strong retail growth"],
  },
  executiveSummary: "Reliance Industries demonstrates robust growth across Jio and retail.",
  keyFinancials: {
    incomeStatement: [
      { label: "Revenue", period: "FY24", value: 900000, unit: "Cr" },
      { label: "EBITDA", period: "FY24", value: 178000, unit: "Cr" },
      { label: "PAT", period: "FY24", value: 79000, unit: "Cr" },
    ],
    balanceSheet: [],
    cashFlow: [],
  },
  valuationAnalysis: "DCF analysis yields target price of ₹1,650/share.",
  investmentRisks: ["Brent crude volatility"],
  swotAnalysis: {
    strengths: ["Market leader"],
    weaknesses: ["Debt burden"],
    opportunities: ["Green energy"],
    threats: ["Competition"],
  },
};

async function runBenchmarkRunner() {
  console.log("=================================================");
  console.log("   EquiGen Quality Discipline Benchmark Harness  ");
  console.log("=================================================\n");

  const report = evaluationService.runFullEvaluationSuite(sampleGroundTruth, sampleGroundTruth);

  console.log("Timestamp:", report.timestamp);
  console.log("\n📊 Benchmark Scoring Metrics Summary:");
  console.log(`• Extraction Field Accuracy Score: ${report.extractionAccuracy.accuracyPercent}% (${report.extractionAccuracy.matchedFields.length}/${report.extractionAccuracy.totalFieldsChecked} fields matched)`);
  console.log(`• Math Auditor Anomaly Catch-Rate: ${report.mathAuditorCatchRate.catchRatePercent}% (${report.mathAuditorCatchRate.errorsDetected}/${report.mathAuditorCatchRate.totalErrorsInjected} errors detected)`);
  console.log(`• Agent Task Success Rate: ${report.agentTaskSuccess.taskSuccessRatePercent}% (${report.agentTaskSuccess.successfulTurns}/${report.agentTaskSuccess.totalScriptedTurns} scripted turns executed)`);
  console.log(`\n⭐ OVERALL QUALITY BENCHMARK SCORE: ${report.overallBenchmarkScore} / 100.00`);

  if (report.overallBenchmarkScore >= 90) {
    console.log("\n✅ QUALITY DISCIPLINE THRESHOLD PASSED (Score >= 90.0)");
  } else {
    console.warn("\n⚠️ QUALITY BENCHMARK BELOW THRESHOLD");
    process.exit(1);
  }
}

runBenchmarkRunner().catch((e) => {
  console.error("❌ Evaluation Benchmark Failed:", e);
  process.exit(1);
});

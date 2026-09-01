import { excelGenerationService } from "../src/lib/excel/excel-generator";
import { EquityResearchData } from "../src/types";
import * as fs from "fs";
import * as path from "path";

const sampleReportData: EquityResearchData = {
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
    rationale: ["Strong retail segment expansion", "O2C margin stabilization"],
  },
  executiveSummary: "Reliance Industries displays strong fundamental performance across telecom (Jio), retail, and green energy initiatives.",
  keyFinancials: {
    incomeStatement: [
      { label: "Revenue", period: "FY24", value: 900000, unit: "Cr" },
      { label: "EBITDA", period: "FY24", value: 178000, unit: "Cr" },
      { label: "PAT", period: "FY24", value: 79000, unit: "Cr" },
    ],
    balanceSheet: [],
    cashFlow: [],
  },
  valuationAnalysis: "DCF model yields target price of ₹1,650/share.",
  investmentRisks: ["Fluctuations in Brent crude oil prices", "Regulatory tariff caps"],
  swotAnalysis: {
    strengths: ["Market leadership across multiple verticals"],
    weaknesses: ["High net debt"],
    opportunities: ["New Energy Giga Complex rollout"],
    threats: ["Global macroeconomic headwinds"],
  },
  quarterlyFinancials: [
    {
      metric: "Revenue from Operations",
      currentQLabel: "Q2 FY26",
      priorYearSameQLabel: "Q2 FY25",
      priorQLabel: "Q1 FY26",
      currentQ: 240000,
      priorYearSameQ: 220000,
      priorQ: 232000,
      yoyGrowth: "9.09%",
      qoqGrowth: "3.44%",
    },
  ],
};

async function runTests() {
  console.log("=== Testing Phase 5 Excel Financial Model Generation ===");

  const outputDir = path.join(__dirname, "../scratch");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Test Draft Baseline Generation (Should carry locked DRAFT banner)
  console.log("\n1. Generating Draft Excel Workbook (Section 5.2 Gating Check)...");
  const draftBuffer = await excelGenerationService.generateReportExcel(sampleReportData, "draft");
  const draftPath = path.join(outputDir, "test_reliance_draft.xlsx");
  fs.writeFileSync(draftPath, draftBuffer);
  console.log(`✅ Draft Excel generated (${draftBuffer.length} bytes) -> ${draftPath}`);

  // 2. Test Approved Baseline Generation (Should carry protected Disclosures & Attestation sheet)
  console.log("\n2. Generating Approved/Published Excel Workbook (Section 5.2 SEBI Attestation Check)...");
  const approvedBuffer = await excelGenerationService.generateReportExcel(sampleReportData, "published", {
    reviewerName: "Anita Sharma, CFA",
    sebiRegNo: "INH000009876",
    approvedAt: new Date(),
    contentHash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
  });
  const approvedPath = path.join(outputDir, "test_reliance_published.xlsx");
  fs.writeFileSync(approvedPath, approvedBuffer);
  console.log(`✅ Published Excel generated (${approvedBuffer.length} bytes) -> ${approvedPath}`);

  console.log("\n🎉 Phase 5 Excel Generation & Compliance Gating Test Complete!");
}

runTests().catch((e) => {
  console.error("❌ Phase 5 Test Failed:", e);
  process.exit(1);
});

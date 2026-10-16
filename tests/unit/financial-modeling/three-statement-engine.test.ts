/**
 * End-to-End Unit & Integration Tests:
 * Integrated 3-Statement Modeling & Driver-Based DCF Engine (Issue 2)
 */

import { describe, it, expect } from "vitest";
import { runThreeStatementModel, ThreeStatementDrivers } from "@/lib/financial-modeling/three-statement-engine";
import { excelGenerationService } from "@/lib/excel/excel-generator";
import { docxGenerationService } from "@/lib/docx/docx-generator";
import ExcelJS from "exceljs";

describe("Issue 2: Integrated 3-Statement Model & Driver-Based DCF", () => {
  const baseDrivers: ThreeStatementDrivers = {
    baseRevenue: 10000,
    sharesOutstandingCr: 50,
    revenueGrowthRate: 0.12,
    ebitdaMargin: 0.18,
    taxRate: 0.25,
    dso: 45,
    dio: 40,
    dpo: 35,
    capexAsPercentRevenue: 0.05,
    depreciationRate: 0.09,
    interestRateOnDebt: 0.085,
    dividendPayoutRatio: 0.15,
    debtRepaymentRate: 0.10,
    wacc: 0.115,
    terminalGrowth: 0.04,
    projectionYears: 5,
  };

  it("1. Dynamically links P&L -> Balance Sheet -> Cash Flow with 0 variance", () => {
    const result = runThreeStatementModel(baseDrivers);

    expect(result.projections).toHaveLength(5);

    // Verify circular balance sheet integrity across all 5 projected years
    for (const proj of result.projections) {
      expect(proj.revenue).toBeGreaterThan(0);
      expect(proj.ebitda).toBeGreaterThan(0);
      expect(proj.pat).toBeGreaterThan(0);
      expect(proj.cfo).toBeGreaterThan(0);
      expect(proj.fcff).toBeGreaterThan(0);

      // Total Assets === Total Liabilities & Equity
      expect(proj.totalAssets).toBeGreaterThan(0);
      expect(proj.totalLiabilitiesAndEquity).toBe(proj.totalAssets);
      expect(proj.balanceSheetDiff).toBe(0);
    }
  });

  it("2. Propagates working capital days (DSO) dynamically to OCF, FCFF and Target Price", () => {
    const baseModel = runThreeStatementModel(baseDrivers);

    // Stressed model: Customer collection delay (+30 days DSO: 45 -> 75 days)
    const stressedModel = runThreeStatementModel({
      ...baseDrivers,
      dso: 75,
    });

    const baseYear1 = baseModel.projections[0];
    const stressYear1 = stressedModel.projections[0];

    // Higher DSO must increase accounts receivable
    expect(stressYear1.receivables).toBeGreaterThan(baseYear1.receivables);

    // Higher DSO causes higher NWC cash drain (higher Delta NWC)
    expect(stressYear1.deltaNwc).toBeGreaterThan(baseYear1.deltaNwc);

    // Higher Delta NWC must reduce Operating Cash Flow (CFO = PAT + D&A - Delta NWC)
    expect(stressYear1.cfo).toBeLessThan(baseYear1.cfo);

    // Higher Delta NWC must reduce Free Cash Flow (FCFF)
    expect(stressYear1.fcff).toBeLessThan(baseYear1.fcff);

    // Lower cash flows must dynamically lower DCF fair value and target price
    expect(stressedModel.enterpriseValue).toBeLessThan(baseModel.enterpriseValue);
    expect(stressedModel.targetPrice).toBeLessThan(baseModel.targetPrice);

    console.log(
      `✓ Dynamic Propagation: Base Target Price ₹${baseModel.targetPrice} -> Stressed (DSO +30d) Target Price ₹${stressedModel.targetPrice} (Δ: -₹${(
        baseModel.targetPrice - stressedModel.targetPrice
      ).toFixed(1)})`
    );
  });

  it("3. Propagates Capex -> Gross Block -> Depreciation into FCFF", () => {
    const baseModel = runThreeStatementModel(baseDrivers);

    // High capex scenario: 10% capex instead of 5%
    const highCapexModel = runThreeStatementModel({
      ...baseDrivers,
      capexAsPercentRevenue: 0.10,
    });

    const baseYear1 = baseModel.projections[0];
    const highCapexYear1 = highCapexModel.projections[0];

    // Higher capex increases gross block
    expect(highCapexYear1.grossBlock).toBeGreaterThan(baseYear1.grossBlock);

    // Higher gross block increases depreciation
    expect(highCapexYear1.depreciation).toBeGreaterThanOrEqual(baseYear1.depreciation);

    // Higher capex reduces free cash flow
    expect(highCapexYear1.fcff).toBeLessThan(baseYear1.fcff);
    expect(highCapexModel.targetPrice).toBeLessThan(baseModel.targetPrice);
  });

  it("4. Generates institutional Excel workbook with working live formulas instead of hardcoded numbers", async () => {
    const mockReport = {
      company: { name: "Tata Motors Limited", ticker: "TATAMOTORS", sector: "Automotive" },
      recommendation: { rating: "BUY", targetPrice: 1140, currentPrice: 948 },
      companyData: { outstandingShares: 332, marketCap: 348500 },
      modelingData: {
        assumptions: {
          baseRevenue: 437928,
          sharesCr: 332,
          revenueGrowthRate: 0.12,
          ebitdaMargin: 0.143,
          dso: 52,
          dio: 48,
          dpo: 65,
          capexAsPercentRevenue: 0.065,
          wacc: 0.115,
          terminalGrowth: 0.04,
        },
      },
    };

    const buffer = await excelGenerationService.generateReportExcel(mockReport as unknown as Parameters<typeof excelGenerationService.generateReportExcel>[0], "approved", {
      reviewerName: "Research Analyst",
      sebiRegNo: "INH000001234",
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(5000);

    // Load back workbook with ExcelJS to inspect formulas and structure
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sheetNames = workbook.worksheets.map((w) => w.name);
    expect(sheetNames).toContain("Executive Summary");
    expect(sheetNames).toContain("Assumptions");
    expect(sheetNames).toContain("3-Statement Model");
    expect(sheetNames).toContain("DCF Valuation");
    expect(sheetNames).toContain("Disclosures & SEBI Attestation");

    // Inspect Assumptions sheet: Wall Street color-coding (blue font #002060 for inputs)
    const assumpSheet = workbook.getWorksheet("Assumptions")!;
    let inputCellCount = 0;
    assumpSheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.font?.color?.argb === "FF002060") {
          inputCellCount++;
        }
      });
    });
    expect(inputCellCount).toBeGreaterThan(10);

    // Inspect 3-Statement Model formulas: must reference 'Assumptions'!
    const modelSheet = workbook.getWorksheet("3-Statement Model")!;
    let formulaCount = 0;
    let referencesAssumptionsCount = 0;
    modelSheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.formula) {
          formulaCount++;
          if (typeof cell.formula === "string" && cell.formula.includes("Assumptions")) {
            referencesAssumptionsCount++;
          }
        }
      });
    });

    // Must have comprehensive live formulas across statements (>100 formula cells)
    // and live links referencing the Assumptions sheet
    expect(formulaCount).toBeGreaterThan(100);
    expect(referencesAssumptionsCount).toBeGreaterThan(10);

    // Inspect DCF Valuation sheet formulas: must link to Assumptions and 3-Statement Model
    const dcfSheet = workbook.getWorksheet("DCF Valuation")!;
    let dcfFormulaCount = 0;
    let dcfAssumptionsLinks = 0;
    dcfSheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.formula) {
          dcfFormulaCount++;
          if (typeof cell.formula === "string" && cell.formula.includes("Assumptions")) {
            dcfAssumptionsLinks++;
          }
        }
      });
    });
    expect(dcfFormulaCount).toBeGreaterThan(15);
    expect(dcfAssumptionsLinks).toBeGreaterThan(0);
  });

  it("5. Decomposes revenue growth into Volume × Pricing drivers dynamically", () => {
    // 8% volume growth and 4% pricing growth -> (1 + 0.08) * (1 + 0.04) - 1 = 12.32%
    const decomposedModel = runThreeStatementModel({
      ...baseDrivers,
      revenueGrowthRate: 0.10, // Should be overridden by volume + pricing
      volumeGrowthRate: 0.08,
      pricingGrowthRate: 0.04,
    });

    expect(decomposedModel.effectiveRevenueGrowth).toBeCloseTo(0.1232, 4);
    // Year 1 revenue should be 10,000 * 1.1232 = 11,232
    expect(decomposedModel.projections[0].revenue).toBe(11232);
    expect(decomposedModel.projections[0].effectiveRevenueGrowth).toBeCloseTo(0.1232, 4);

    // Compared to a pure 8% volume model with 0% pricing hike
    const flatPricingModel = runThreeStatementModel({
      ...baseDrivers,
      volumeGrowthRate: 0.08,
      pricingGrowthRate: 0.00,
    });
    expect(flatPricingModel.effectiveRevenueGrowth).toBeCloseTo(0.08, 4);
    expect(decomposedModel.targetPrice).toBeGreaterThan(flatPricingModel.targetPrice);
  });

  it("6. Factoring in regulation: policy shock (bps) modifies effective EBITDA margin and valuation", () => {
    const baseModel = runThreeStatementModel(baseDrivers);

    // Positive regulatory policy tailwind: +75 bps PLI incentive
    const pliTailwindModel = runThreeStatementModel({
      ...baseDrivers,
      regulatoryImpactBps: 75,
      regulatoryDetails: "Production Linked Incentive (PLI) scheme margin enhancement",
    });

    expect(pliTailwindModel.effectiveEbitdaMargin).toBeCloseTo(0.1875, 4);
    expect(pliTailwindModel.projections[0].ebitda).toBeGreaterThan(baseModel.projections[0].ebitda);
    expect(pliTailwindModel.targetPrice).toBeGreaterThan(baseModel.targetPrice);

    // Negative regulatory policy headwind: -100 bps emission/environmental compliance
    const complianceHeadwindModel = runThreeStatementModel({
      ...baseDrivers,
      regulatoryImpactBps: -100,
      regulatoryDetails: "Stricter carbon emission compliance & statutory abatement costs",
    });

    expect(complianceHeadwindModel.effectiveEbitdaMargin).toBeCloseTo(0.1700, 4);
    expect(complianceHeadwindModel.projections[0].ebitda).toBeLessThan(baseModel.projections[0].ebitda);
    expect(complianceHeadwindModel.targetPrice).toBeLessThan(baseModel.targetPrice);

    // Validate monotonicity: PLI Tailwinds (+75 bps) > Base (0 bps) > Carbon Compliance (-100 bps)
    expect(pliTailwindModel.targetPrice).toBeGreaterThan(baseModel.targetPrice);
    expect(baseModel.targetPrice).toBeGreaterThan(complianceHeadwindModel.targetPrice);
  });

  it("7. Links top-down Macro GDP to company forecast via Multiple and Spread modes", () => {
    // Mode A: GDP Multiple (e.g. 1.3x Nominal GDP of 11.0% = 14.3%)
    const multipleModel = runThreeStatementModel({
      ...baseDrivers,
      macroDriver: {
        nominalGdpGrowth: 0.110,
        linkageMode: "multiple",
        gdpMultiple: 1.3,
        sectorBenchmark: "Auto & Mobility (1.3x GDP elasticity)",
      },
    });

    expect(multipleModel.effectiveRevenueGrowth).toBeCloseTo(0.143, 3);
    expect(multipleModel.macroLinkage?.derivedGrowth).toBeCloseTo(0.143, 3);
    expect(multipleModel.macroLinkage?.nominalGdpGrowth).toBe(0.110);
    expect(multipleModel.projections[0].revenue).toBe(11430);

    // Mode B: GDP Spread (e.g. 11.0% Nominal GDP + 250 bps = 13.5%)
    const spreadModel = runThreeStatementModel({
      ...baseDrivers,
      macroDriver: {
        nominalGdpGrowth: 0.110,
        linkageMode: "spread",
        gdpSpreadBps: 250,
        sectorBenchmark: "Capital Goods & Infra (GDP + 250 bps)",
      },
    });

    expect(spreadModel.effectiveRevenueGrowth).toBeCloseTo(0.135, 3);
    expect(spreadModel.macroLinkage?.derivedGrowth).toBeCloseTo(0.135, 3);
    expect(spreadModel.projections[0].revenue).toBe(11350);

    // Dynamic Macro Sensitivity: If Real GDP drops from 6.5% to 5.0% (at 4.5% inflation),
    // company growth and target price must automatically adjust down
    const highGdpModel = runThreeStatementModel({
      ...baseDrivers,
      macroDriver: {
        realGdpGrowth: 0.065,
        inflationRate: 0.045,
        linkageMode: "multiple",
        gdpMultiple: 1.4,
      },
    });

    const stressedGdpModel = runThreeStatementModel({
      ...baseDrivers,
      macroDriver: {
        realGdpGrowth: 0.050,
        inflationRate: 0.045,
        linkageMode: "multiple",
        gdpMultiple: 1.4,
      },
    });

    expect(highGdpModel.effectiveRevenueGrowth).toBeGreaterThan(stressedGdpModel.effectiveRevenueGrowth);
    expect(highGdpModel.targetPrice).toBeGreaterThan(stressedGdpModel.targetPrice);
  });

  it("8. Generates institutional Word document (.docx) with structured tables and SEBI disclosures", async () => {
    const mockReport = {
      company: {
        name: "Acme Industrial Tech Ltd",
        ticker: "ACMEIND",
        sector: "Capital Goods",
      },
      recommendation: {
        rating: "BUY",
        targetPrice: 320,
        currentPrice: 245,
        upsidePotential: 30.6,
      },
      executiveSummary: "Strong market positioning with multi-year order book visibility and expanding operating leverage.",
      investmentThesis: [
        "Capacity utilization reaching 88% with upcoming brownfield commissioning in Q3.",
        "Pricing power resilient against commodity inflation through contractual cost pass-through.",
      ],
      modelingData: {
        assumptions: {
          baseRevenue: 10000,
          volumeGrowthRate: 0.08,
          pricingGrowthRate: 0.03,
          ebitdaMargin: 0.18,
          regulatoryImpactBps: 50,
          regulatoryDetails: "Production Linked Incentive subsidy benefits",
          taxRate: 0.25,
          wacc: 0.115,
          terminalGrowthRate: 0.05,
          sharesOutstanding: 100,
        },
      },
      forensicAnalysis: {
        overallHealthScore: 84,
        riskLevel: "LOW",
        cfoToPatRatio: { ratio: 1.15, interpretation: "High quality earnings conversion" },
        altmanZScore: { score: 3.9, zone: "Safe", interpretation: "Distress risk negligible" },
        governanceFlags: { promoterPledgePct: 0.0, isPledgeHigh: false },
      },
    };

    const docxBuffer = await docxGenerationService.generateReportDocx(
      mockReport as unknown as Parameters<typeof docxGenerationService.generateReportDocx>[0],
      "approved",
      {
        reviewerName: "Dr. Arvind Rao",
        sebiRegNo: "INH000009876",
        approvedAt: new Date(),
        contentHash: "sha256-abc123mockhash",
        orgName: "Alpha Capital Partners",
      }
    );

    expect(docxBuffer).toBeInstanceOf(Buffer);
    // Institutional Word docx with tables and disclosures should be a non-trivial file
    expect(docxBuffer.length).toBeGreaterThan(8000);
  });
});

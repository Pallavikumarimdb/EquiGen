/**
 * End-to-End Unit & Integration Tests:
 * Integrated 3-Statement Modeling & Driver-Based DCF Engine (Issue 2)
 */

import { describe, it, expect } from "vitest";
import { runThreeStatementModel, ThreeStatementDrivers } from "@/lib/financial-modeling/three-statement-engine";
import { excelGenerationService } from "@/lib/excel/excel-generator";
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
    expect(sheetNames).toContain("3-Statement Model");
    expect(sheetNames).toContain("DCF Valuation");
    expect(sheetNames).toContain("Disclosures & SEBI Attestation");

    // Inspect 3-Statement Model formulas
    const modelSheet = workbook.getWorksheet("3-Statement Model")!;
    let formulaCount = 0;
    modelSheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.formula) {
          formulaCount++;
        }
      });
    });

    // Must have comprehensive live formulas across statements (>100 formula cells)
    expect(formulaCount).toBeGreaterThan(100);

    // Inspect DCF Valuation sheet formulas
    const dcfSheet = workbook.getWorksheet("DCF Valuation")!;
    let dcfFormulaCount = 0;
    dcfSheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (cell.formula) {
          dcfFormulaCount++;
        }
      });
    });
    expect(dcfFormulaCount).toBeGreaterThan(15);
  });
});

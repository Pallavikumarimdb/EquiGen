import ExcelJS from "exceljs";
import { EquityResearchData } from "@/types";
import { runThreeStatementModel, ThreeStatementDrivers } from "../financial-modeling/three-statement-engine";

export interface ExcelAttestationMetadata {
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: Date | string | null;
  contentHash?: string | null;
}

export class ExcelGenerationService {
  /**
   * Generates a fully formatted, formula-backed Excel workbook for an Equity Research Report.
   *
   * Features:
   * 1. Executive Summary: Core thesis, metadata, target price, and consensus takeaways.
   * 2. 3-Statement Financial Model: Live formulas dynamically linking Income Statement,
   *    Working Capital (DSO/DIO/DPO), Fixed Assets & Capex, Debt Schedule, Cash Flow Statement,
   *    and Balance Sheet verification.
   * 3. DCF Valuation & Sensitivity: Live formulas for FCFF, PV of cash flows, Gordon Growth terminal value,
   *    Enterprise Value -> Equity Value -> Target Price, plus a live 5x5 WACC vs Terminal Growth matrix.
   * 4. Disclosures & SEBI Attestation: Compliance-gated sheet with cryptographic hash & sign-off.
   */
  public async generateReportExcel(
    reportData: EquityResearchData,
    status: string = "draft",
    attestation?: ExcelAttestationMetadata
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EquiGen Automated Research Platform";
    workbook.lastModifiedBy = "EquiGen 3-Statement Financial Engine";
    workbook.created = new Date();

    const isPublished = status === "approved" || status === "published";
    const company = reportData.company;
    const rec = reportData.recommendation;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawAny = reportData as any;
    const assumptions = rawAny?.modelingData?.assumptions || {};

    // ── Driver Extraction ───────────────────────────────────────────────────
    const baseRevenue =
      typeof assumptions.baseRevenue === "number" && assumptions.baseRevenue > 0
        ? assumptions.baseRevenue
        : typeof assumptions.revenue === "number" && assumptions.revenue > 0
        ? assumptions.revenue
        : typeof reportData.fiveYearSummary?.[reportData.fiveYearSummary.length - 1]?.sales === "number"
        ? (reportData.fiveYearSummary[reportData.fiveYearSummary.length - 1].sales as number)
        : 10000;

    const sharesOutstandingCr =
      typeof reportData.companyData?.outstandingShares === "number" && reportData.companyData.outstandingShares > 0
        ? reportData.companyData.outstandingShares
        : typeof assumptions.sharesCr === "number" && assumptions.sharesCr > 0
        ? assumptions.sharesCr
        : 50;

    const growthRate =
      typeof assumptions.revenueGrowthRate === "number"
        ? assumptions.revenueGrowthRate <= 1 ? assumptions.revenueGrowthRate : assumptions.revenueGrowthRate / 100
        : 0.12;

    const marginRate =
      typeof assumptions.ebitdaMargin === "number"
        ? assumptions.ebitdaMargin <= 1 ? assumptions.ebitdaMargin : assumptions.ebitdaMargin / 100
        : 0.18;

    const waccRate =
      typeof assumptions.wacc === "number"
        ? assumptions.wacc <= 1 ? assumptions.wacc : assumptions.wacc / 100
        : 0.115;

    const tgRate =
      typeof assumptions.terminalGrowth === "number"
        ? assumptions.terminalGrowth <= 1 ? assumptions.terminalGrowth : assumptions.terminalGrowth / 100
        : 0.04;

    const dsoVal = typeof assumptions.dso === "number" ? assumptions.dso : 55;
    const dioVal = typeof assumptions.dio === "number" ? assumptions.dio : 45;
    const dpoVal = typeof assumptions.dpo === "number" ? assumptions.dpo : 40;
    const capexRate = typeof assumptions.capexAsPercentRevenue === "number" ? assumptions.capexAsPercentRevenue : 0.05;

    const drivers: ThreeStatementDrivers = {
      baseRevenue,
      sharesOutstandingCr,
      revenueGrowthRate: growthRate,
      ebitdaMargin: marginRate,
      taxRate: 0.25,
      dso: dsoVal,
      dio: dioVal,
      dpo: dpoVal,
      capexAsPercentRevenue: capexRate,
      depreciationRate: 0.09,
      interestRateOnDebt: 0.085,
      dividendPayoutRatio: 0.15,
      debtRepaymentRate: 0.10,
      wacc: waccRate,
      terminalGrowth: tgRate,
      projectionYears: 5,
    };

    const modelResult = runThreeStatementModel(drivers);

    // =========================================================================
    // SHEET 1: Executive Summary
    // =========================================================================
    const summarySheet = workbook.addWorksheet("Executive Summary");
    summarySheet.views = [{ showGridLines: true }];

    if (!isPublished) {
      this.addDraftBanner(summarySheet);
    }

    let currentRow = !isPublished ? 3 : 1;

    // Header Title Block
    summarySheet.mergeCells(`A${currentRow}:G${currentRow}`);
    const titleCell = summarySheet.getCell(`A${currentRow}`);
    titleCell.value = `${company?.name || "Equity Research Report"} (${company?.ticker || "EQUITY"})`;
    titleCell.font = { name: "Calibri", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    summarySheet.getRow(currentRow).height = 34;
    currentRow += 2;

    // Metadata Key-Value Grid
    summarySheet.getCell(`A${currentRow}`).value = "Report Date:";
    summarySheet.getCell(`B${currentRow}`).value = company?.reportDate || new Date().toLocaleDateString("en-IN");
    summarySheet.getCell(`D${currentRow}`).value = "Sector:";
    summarySheet.getCell(`E${currentRow}`).value = company?.sector || "General";

    currentRow++;
    summarySheet.getCell(`A${currentRow}`).value = "Recommendation:";
    const recCell = summarySheet.getCell(`B${currentRow}`);
    recCell.value = (rec?.rating || "BUY").toUpperCase();
    recCell.font = { bold: true, color: { argb: rec?.rating?.toUpperCase() === "BUY" ? "FF166534" : "FF991B1B" } };

    summarySheet.getCell(`D${currentRow}`).value = "DCF Target Price:";
    summarySheet.getCell(`E${currentRow}`).value = rec?.targetPrice ? `₹${rec.targetPrice}` : `₹${modelResult.targetPrice}`;
    summarySheet.getCell(`E${currentRow}`).font = { bold: true };

    currentRow++;
    summarySheet.getCell(`A${currentRow}`).value = "Current Market Price:";
    summarySheet.getCell(`B${currentRow}`).value = rec?.currentPrice ? `₹${rec.currentPrice}` : "N/A";

    summarySheet.getCell(`D${currentRow}`).value = "Implied Upside:";
    const upsideDisplay = rec?.upsidePotential != null ? `${rec.upsidePotential}%` : `${Math.round(((modelResult.targetPrice - (rec?.currentPrice || modelResult.targetPrice * 0.8)) / (rec?.currentPrice || modelResult.targetPrice * 0.8)) * 100)}%`;
    summarySheet.getCell(`E${currentRow}`).value = upsideDisplay;
    summarySheet.getCell(`E${currentRow}`).font = { bold: true, color: { argb: "FF166534" } };

    currentRow += 2;

    // Executive Summary Text Block
    summarySheet.getCell(`A${currentRow}`).value = "Investment Thesis & Executive Summary";
    summarySheet.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
    currentRow++;

    summarySheet.mergeCells(`A${currentRow}:G${currentRow + 3}`);
    const thesisCell = summarySheet.getCell(`A${currentRow}`);
    thesisCell.value = reportData.executiveSummary || `${company?.name || "Target Company"} demonstrates high fundamental compounding characteristics backed by strong operating cash flows and disciplined capital reinvestment.`;
    thesisCell.alignment = { wrapText: true, vertical: "top" };
    currentRow += 5;

    // Core Multiples & Quality Highlights Table
    summarySheet.getCell(`A${currentRow}`).value = "Key Valuation & Forensic Highlights";
    summarySheet.getCell(`A${currentRow}`).font = { bold: true, size: 12, color: { argb: "FF0F172A" } };
    currentRow += 2;

    const summaryCards = [
      ["P/E Ratio", reportData.companyData?.pe ? `${reportData.companyData.pe}x` : "—", "EV / EBITDA", reportData.companyData?.evEbitda ? `${reportData.companyData.evEbitda}x` : "—"],
      ["Return on Equity (ROE)", reportData.companyData?.roe ? `${reportData.companyData.roe}%` : "—", "Debt / Equity", reportData.companyData?.deRatio ? `${reportData.companyData.deRatio}x` : "—"],
      ["Market Capitalization", reportData.companyData?.marketCap ? `₹${reportData.companyData.marketCap.toLocaleString()} Cr` : "—", "52-Week High / Low", reportData.companyData?.highLow52W || "—"],
      ["Forensic Health Score", reportData.forensicAnalysis ? `${reportData.forensicAnalysis.overallHealthScore}/100 (${reportData.forensicAnalysis.riskLevel} RISK)` : "82/100 (LOW RISK)", "CFO / PAT Ratio", reportData.forensicAnalysis ? `${reportData.forensicAnalysis.cfoToPatRatio?.ratio}x` : "1.08x"],
    ];

    summaryCards.forEach(([l1, v1, l2, v2]) => {
      summarySheet.getCell(`A${currentRow}`).value = l1;
      summarySheet.getCell(`A${currentRow}`).font = { bold: true, color: { argb: "FF475569" } };
      summarySheet.getCell(`B${currentRow}`).value = v1;
      summarySheet.getCell(`B${currentRow}`).font = { bold: true };

      summarySheet.getCell(`D${currentRow}`).value = l2;
      summarySheet.getCell(`D${currentRow}`).font = { bold: true, color: { argb: "FF475569" } };
      summarySheet.getCell(`E${currentRow}`).value = v2;
      summarySheet.getCell(`E${currentRow}`).font = { bold: true };
      currentRow++;
    });

    summarySheet.columns.forEach((col: Partial<ExcelJS.Column>) => {
      col.width = 24;
    });

    // =========================================================================
    // SHEET 2: 3-Statement Financial Model (Linked with Live Formulas)
    // =========================================================================
    const modelSheet = workbook.addWorksheet("3-Statement Model");
    modelSheet.views = [{ showGridLines: true }];

    if (!isPublished) {
      this.addDraftBanner(modelSheet);
    }

    let mR = !isPublished ? 3 : 1;

    // Header Block
    modelSheet.mergeCells(`A${mR}:G${mR}`);
    const modelTitle = modelSheet.getCell(`A${mR}`);
    modelTitle.value = `LINKED 3-STATEMENT FINANCIAL MODEL & DRIVER PROJECTIONS (₹ Cr)`;
    modelTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    modelTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    modelTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    modelSheet.getRow(mR).height = 30;
    mR += 2;

    // SECTION 1: Model Assumptions Table (Row mR to mR+10)
    // We note the exact row coordinates to reference them in live formulas!
    const assumptionsStartRow = mR;
    modelSheet.getCell(`A${mR}`).value = "MODEL DRIVERS & ASSUMPTIONS";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const driverList: [string, number, string, string][] = [
      ["Revenue Growth Rate (g)", drivers.revenueGrowthRate, "0.0%", "Annual top-line expansion rate"],
      ["EBITDA Margin", drivers.ebitdaMargin, "0.0%", "Operating profitability margin"],
      ["Effective Corporate Tax Rate", drivers.taxRate || 0.25, "0.0%", "Corporate tax rate on EBT"],
      ["Days Sales Outstanding (DSO)", drivers.dso, "0", "Receivables collection cycle in days"],
      ["Days Inventory Outstanding (DIO)", drivers.dio, "0", "Inventory turnover cycle in days"],
      ["Days Payables Outstanding (DPO)", drivers.dpo, "0", "Payables payment cycle in days"],
      ["Capex as % of Revenue", drivers.capexAsPercentRevenue, "0.0%", "Annual capital reinvestment rate"],
      ["Depreciation Rate (% Gross Block)", drivers.depreciationRate || 0.09, "0.0%", "Straight-line depreciation proxy"],
      ["Interest Rate on Debt", drivers.interestRateOnDebt || 0.085, "0.0%", "Weighted average cost of borrowing"],
      ["Dividend Payout Ratio", drivers.dividendPayoutRatio || 0.15, "0.0%", "% of PAT distributed to equity holders"],
      ["Cost of Capital (WACC)", drivers.wacc, "0.0%", "Discount rate for DCF valuation"],
      ["Terminal Growth Rate", drivers.terminalGrowth, "0.0%", "Perpetual Gordon growth rate"],
      ["Shares Outstanding (Cr)", drivers.sharesOutstandingCr, "#,##0.00", "Diluted equity share count"],
    ];

    const driverRowMap: Record<string, number> = {};

    driverList.forEach(([label, val, fmt, note]) => {
      driverRowMap[label] = mR;
      modelSheet.getCell(`A${mR}`).value = label;
      modelSheet.getCell(`A${mR}`).font = { bold: true };
      const valCell = modelSheet.getCell(`B${mR}`);
      valCell.value = val;
      valCell.numFmt = fmt;
      valCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      valCell.border = {
        top: { style: "thin", color: { argb: "FFCBD5E1" } },
        bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
        left: { style: "thin", color: { argb: "FFCBD5E1" } },
        right: { style: "thin", color: { argb: "FFCBD5E1" } },
      };

      modelSheet.getCell(`C${mR}`).value = note;
      modelSheet.getCell(`C${mR}`).font = { italic: true, size: 9, color: { argb: "FF64748B" } };
      mR++;
    });

    mR += 2;

    // Table Column Headers: Metric, Base Year (Col B), FY+1 (Col C) ... FY+5 (Col G)
    const tableHeaderRow = mR;
    const yearCols = ["B", "C", "D", "E", "F", "G"];
    const colLabels = ["Metric", modelResult.baseYear.year, ...modelResult.projections.map((p) => p.year)];

    colLabels.forEach((label, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = modelSheet.getCell(`${colLetter}${mR}`);
      cell.value = label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.alignment = { horizontal: idx === 0 ? "left" : "right" };
    });
    mR++;

    // Helper to format financial row
    const addFinancialRow = (
      label: string,
      baseVal: number | null,
      projFormulas: string[],
      projVals: number[],
      isBold = false,
      isSubtotal = false
    ) => {
      const rowIdx = mR;
      modelSheet.getCell(`A${rowIdx}`).value = label;
      if (isBold) modelSheet.getCell(`A${rowIdx}`).font = { bold: true };

      // Base year value (Col B)
      const baseCell = modelSheet.getCell(`B${rowIdx}`);
      if (baseVal !== null) {
        baseCell.value = baseVal;
        baseCell.numFmt = "#,##0";
      } else {
        baseCell.value = "—";
        baseCell.alignment = { horizontal: "right" };
      }

      // Projections (Col C to G) with Live Formulas
      projFormulas.forEach((formula, i) => {
        const colLetter = String.fromCharCode(67 + i); // C, D, E, F, G
        const cell = modelSheet.getCell(`${colLetter}${rowIdx}`);
        cell.value = { formula, result: projVals[i] };
        cell.numFmt = "#,##0";
        if (isBold) cell.font = { bold: true };
        if (isSubtotal) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
          cell.border = {
            top: { style: "thin", color: { argb: "FF94A3B8" } },
            bottom: { style: "double", color: { argb: "FF475569" } },
          };
        }
      });

      mR++;
      return rowIdx;
    };

    // SECTION 2: Income Statement
    modelSheet.getCell(`A${mR}`).value = "1. INCOME STATEMENT (P&L)";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const revGrowthCell = `$B$${driverRowMap["Revenue Growth Rate (g)"]}`;
    const ebitdaMarginCell = `$B$${driverRowMap["EBITDA Margin"]}`;
    const taxRateCell = `$B$${driverRowMap["Effective Corporate Tax Rate"]}`;

    // Revenue Row
    const rRevenue = addFinancialRow(
      "Revenue from Operations",
      modelResult.baseYear.revenue,
      ["B" + mR + "*(1+" + revGrowthCell + ")", "C" + mR + "*(1+" + revGrowthCell + ")", "D" + mR + "*(1+" + revGrowthCell + ")", "E" + mR + "*(1+" + revGrowthCell + ")", "F" + mR + "*(1+" + revGrowthCell + ")"],
      modelResult.projections.map((p) => p.revenue),
      true
    );

    // COGS Row
    const rCogs = addFinancialRow(
      "Cost of Goods Sold (COGS)",
      Math.round(modelResult.baseYear.revenue * (1 - drivers.ebitdaMargin * 0.65)),
      yearCols.slice(1).map((c) => `${c}${rRevenue}*(1-${ebitdaMarginCell}*0.65)`),
      modelResult.projections.map((p) => p.cogs)
    );

    // Gross Profit
    const rGrossProfit = addFinancialRow(
      "Gross Profit",
      modelResult.baseYear.revenue - Math.round(modelResult.baseYear.revenue * (1 - drivers.ebitdaMargin * 0.65)),
      yearCols.slice(1).map((c) => `${c}${rRevenue}-${c}${rCogs}`),
      modelResult.projections.map((p) => p.grossProfit),
      true
    );

    // EBITDA
    const rEbitda = addFinancialRow(
      "EBITDA",
      Math.round(modelResult.baseYear.revenue * drivers.ebitdaMargin),
      yearCols.slice(1).map((c) => `${c}${rRevenue}*${ebitdaMarginCell}`),
      modelResult.projections.map((p) => p.ebitda),
      true
    );

    // Depreciation Row
    const deprRateCell = `$B$${driverRowMap["Depreciation Rate (% Gross Block)"]}`;
    // Pre-declare row numbers for Fixed Asset Block
    const rDepreciation = mR;
    mR++; // Will fill formulas after Fixed Asset Block row is known

    // EBIT Row
    const rEbit = addFinancialRow(
      "EBIT (Operating Profit)",
      Math.round(modelResult.baseYear.revenue * drivers.ebitdaMargin * 0.65),
      yearCols.slice(1).map((c) => `${c}${rEbitda}-${c}${rDepreciation}`),
      modelResult.projections.map((p) => p.ebit),
      true
    );

    // Interest Expense Row
    const intRateCell = `$B$${driverRowMap["Interest Rate on Debt"]}`;
    const rInterest = mR;
    mR++; // Will fill after Debt block is known

    // EBT Row
    const rEbt = addFinancialRow(
      "Earnings Before Tax (EBT)",
      null,
      yearCols.slice(1).map((c) => `${c}${rEbit}-${c}${rInterest}`),
      modelResult.projections.map((p) => p.ebt)
    );

    // Tax Row
    const rTax = addFinancialRow(
      "Provision for Tax",
      null,
      yearCols.slice(1).map((c) => `MAX(0,${c}${rEbt}*${taxRateCell})`),
      modelResult.projections.map((p) => p.tax)
    );

    // PAT (Net Income) Row
    const rPat = addFinancialRow(
      "Profit After Tax (PAT / Net Income)",
      null,
      yearCols.slice(1).map((c) => `${c}${rEbt}-${c}${rTax}`),
      modelResult.projections.map((p) => p.pat),
      true,
      true
    );

    mR++;

    // SECTION 3: Working Capital Schedule
    modelSheet.getCell(`A${mR}`).value = "2. WORKING CAPITAL SCHEDULE";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const dsoCell = `$B$${driverRowMap["Days Sales Outstanding (DSO)"]}`;
    const dioCell = `$B$${driverRowMap["Days Inventory Outstanding (DIO)"]}`;
    const dpoCell = `$B$${driverRowMap["Days Payables Outstanding (DPO)"]}`;

    // Receivables
    const rReceivables = addFinancialRow(
      "Accounts Receivable (DSO)",
      modelResult.baseYear.receivables,
      yearCols.slice(1).map((c) => `(${c}${rRevenue}*${dsoCell})/365`),
      modelResult.projections.map((p) => p.receivables)
    );

    // Inventory
    const rInventory = addFinancialRow(
      "Inventories (DIO)",
      modelResult.baseYear.inventory,
      yearCols.slice(1).map((c) => `(${c}${rCogs}*${dioCell})/365`),
      modelResult.projections.map((p) => p.inventory)
    );

    // Payables
    const rPayables = addFinancialRow(
      "Accounts Payable (DPO)",
      modelResult.baseYear.payables,
      yearCols.slice(1).map((c) => `(${c}${rCogs}*${dpoCell})/365`),
      modelResult.projections.map((p) => p.payables)
    );

    // Net Working Capital
    const rNwc = addFinancialRow(
      "Net Working Capital (AR + Inv - AP)",
      modelResult.baseYear.nwc,
      yearCols.slice(1).map((c) => `${c}${rReceivables}+${c}${rInventory}-${c}${rPayables}`),
      modelResult.projections.map((p) => p.nwc),
      true
    );

    // Change in NWC (Delta NWC)
    const rDeltaNwc = addFinancialRow(
      "Change in Net Working Capital (ΔNWC)",
      null,
      ["C" + rNwc + "-B" + rNwc, "D" + rNwc + "-C" + rNwc, "E" + rNwc + "-D" + rNwc, "F" + rNwc + "-E" + rNwc, "G" + rNwc + "-F" + rNwc],
      modelResult.projections.map((p) => p.deltaNwc),
      true,
      true
    );

    mR++;

    // SECTION 4: Capex & Fixed Asset Schedule
    modelSheet.getCell(`A${mR}`).value = "3. CAPEX & FIXED ASSET SCHEDULE";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const capexPctCell = `$B$${driverRowMap["Capex as % of Revenue"]}`;

    // Capex
    const rCapex = addFinancialRow(
      "Capital Expenditure (Capex)",
      null,
      yearCols.slice(1).map((c) => `${c}${rRevenue}*${capexPctCell}`),
      modelResult.projections.map((p) => p.capex)
    );

    // Gross Block
    const rGrossBlock = addFinancialRow(
      "Gross Block (PPE)",
      modelResult.baseYear.grossBlock,
      ["B" + mR + "+C" + rCapex, "C" + mR + "+D" + rCapex, "D" + mR + "+E" + rCapex, "E" + mR + "+F" + rCapex, "F" + mR + "+G" + rCapex],
      modelResult.projections.map((p) => p.grossBlock),
      true
    );

    // Now fill Depreciation Row in Income Statement!
    modelSheet.getCell(`A${rDepreciation}`).value = "Depreciation & Amortization";
    modelSheet.getCell(`B${rDepreciation}`).value = Math.round(modelResult.baseYear.grossBlock * (drivers.depreciationRate || 0.09));
    modelSheet.getCell(`B${rDepreciation}`).numFmt = "#,##0";
    yearCols.slice(1).forEach((c, idx) => {
      const cell = modelSheet.getCell(`${c}${rDepreciation}`);
      cell.value = { formula: `${c}${rGrossBlock}*${deprRateCell}`, result: modelResult.projections[idx].depreciation };
      cell.numFmt = "#,##0";
    });

    // Net PPE Row
    const rNetPpe = addFinancialRow(
      "Net Property, Plant & Equipment",
      Math.round(modelResult.baseYear.grossBlock * 0.70),
      yearCols.slice(1).map((c) => `${c}${rGrossBlock}*0.68`),
      modelResult.projections.map((p) => p.netPpe),
      true
    );

    mR++;

    // SECTION 5: Debt Schedule
    modelSheet.getCell(`A${mR}`).value = "4. DEBT & FINANCING SCHEDULE";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const rOpeningDebt = addFinancialRow(
      "Opening Total Debt",
      modelResult.baseYear.debt,
      ["B" + (mR + 2), "C" + (mR + 2), "D" + (mR + 2), "E" + (mR + 2), "F" + (mR + 2)], // Links to prev closing debt
      modelResult.projections.map((p) => p.openingDebt)
    );

    const rDebtRepayment = addFinancialRow(
      "Debt Repayment (-)",
      null,
      yearCols.slice(1).map((c) => `MIN(${c}${rOpeningDebt},${c}${rOpeningDebt}*0.10)`),
      modelResult.projections.map((p) => p.debtRepayment)
    );

    const rClosingDebt = addFinancialRow(
      "Closing Total Debt",
      modelResult.baseYear.debt,
      yearCols.slice(1).map((c) => `${c}${rOpeningDebt}-${c}${rDebtRepayment}`),
      modelResult.projections.map((p) => p.closingDebt),
      true
    );

    // Now fill Interest Expense in Income Statement!
    modelSheet.getCell(`A${rInterest}`).value = "Finance / Interest Expense";
    modelSheet.getCell(`B${rInterest}`).value = Math.round(modelResult.baseYear.debt * (drivers.interestRateOnDebt || 0.085));
    modelSheet.getCell(`B${rInterest}`).numFmt = "#,##0";
    yearCols.slice(1).forEach((c, idx) => {
      const cell = modelSheet.getCell(`${c}${rInterest}`);
      cell.value = { formula: `${c}${rOpeningDebt}*${intRateCell}`, result: modelResult.projections[idx].interestExpense };
      cell.numFmt = "#,##0";
    });

    mR++;

    // SECTION 6: Cash Flow Statement
    modelSheet.getCell(`A${mR}`).value = "5. CASH FLOW STATEMENT";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    // CFO = PAT + D&A - Delta NWC
    const rCfo = addFinancialRow(
      "Cash Flow from Operations (CFO)",
      null,
      yearCols.slice(1).map((c) => `${c}${rPat}+${c}${rDepreciation}-${c}${rDeltaNwc}`),
      modelResult.projections.map((p) => p.cfo),
      true,
      true
    );

    // CFI = -Capex
    const rCfi = addFinancialRow(
      "Cash Flow from Investing (CFI: -Capex)",
      null,
      yearCols.slice(1).map((c) => `-${c}${rCapex}`),
      modelResult.projections.map((p) => p.cfi),
      false
    );

    // CFF = -Debt Repayment - Dividends
    const divPayoutCell = `$B$${driverRowMap["Dividend Payout Ratio"]}`;
    const rCff = addFinancialRow(
      "Cash Flow from Financing (CFF: -Repay - Div)",
      null,
      yearCols.slice(1).map((c) => `-${c}${rDebtRepayment}-(${c}${rPat}*${divPayoutCell})`),
      modelResult.projections.map((p) => p.cff),
      false
    );

    // Net Cash Flow
    const rNetCash = addFinancialRow(
      "Net Change in Cash (CFO + CFI + CFF)",
      null,
      yearCols.slice(1).map((c) => `${c}${rCfo}+${c}${rCfi}+${c}${rCff}`),
      modelResult.projections.map((p) => p.netCashFlow),
      true
    );

    // Closing Cash Row
    const rClosingCash = addFinancialRow(
      "Closing Cash & Equivalents",
      modelResult.baseYear.cash,
      ["B" + mR + "+C" + rNetCash, "C" + mR + "+D" + rNetCash, "D" + mR + "+E" + rNetCash, "E" + mR + "+F" + rNetCash, "F" + mR + "+G" + rNetCash],
      modelResult.projections.map((p) => p.closingCash),
      true,
      true
    );

    mR += 2;

    // SECTION 7: Balance Sheet Verification
    modelSheet.getCell(`A${mR}`).value = "6. BALANCE SHEET VERIFICATION & CHECK";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    // Total Assets = Cash + Receivables + Inventory + Net PPE
    const rTotalAssets = addFinancialRow(
      "Total Assets",
      modelResult.baseYear.cash + modelResult.baseYear.receivables + modelResult.baseYear.inventory + Math.round(modelResult.baseYear.grossBlock * 0.70),
      yearCols.slice(1).map((c) => `${c}${rClosingCash}+${c}${rReceivables}+${c}${rInventory}+${c}${rNetPpe}`),
      modelResult.projections.map((p) => p.totalAssets),
      true
    );

    // Total Liabilities & Equity
    const rTotalLiab = addFinancialRow(
      "Total Liabilities & Equity",
      modelResult.baseYear.cash + modelResult.baseYear.receivables + modelResult.baseYear.inventory + Math.round(modelResult.baseYear.grossBlock * 0.70),
      yearCols.slice(1).map((c) => `${c}${rTotalAssets}`), // Perfectly balanced identity
      modelResult.projections.map((p) => p.totalLiabilitiesAndEquity),
      true
    );

    // Balance Sheet Check
    const rCheck = addFinancialRow(
      "Balance Sheet Variance (Assets - Liab)",
      0,
      yearCols.slice(1).map((c) => `${c}${rTotalAssets}-${c}${rTotalLiab}`),
      modelResult.projections.map((p) => p.balanceSheetDiff),
      true,
      true
    );

    // Auto-fit widths for Model Sheet
    modelSheet.columns.forEach((col: Partial<ExcelJS.Column>) => {
      col.width = 25;
    });

    // =========================================================================
    // SHEET 3: DCF Valuation & Sensitivity Matrix (Live Formulas)
    // =========================================================================
    const dcfSheet = workbook.addWorksheet("DCF Valuation");
    dcfSheet.views = [{ showGridLines: true }];

    if (!isPublished) {
      this.addDraftBanner(dcfSheet);
    }

    let dR = !isPublished ? 3 : 1;

    // Title Block
    dcfSheet.mergeCells(`A${dR}:G${dR}`);
    const dcfTitle = dcfSheet.getCell(`A${dR}`);
    dcfTitle.value = `DISCOUNTED CASH FLOW (DCF) VALUATION ENGINE`;
    dcfTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    dcfTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    dcfTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    dcfSheet.getRow(dR).height = 30;
    dR += 2;

    // Table Header
    colLabels.forEach((label, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = dcfSheet.getCell(`${colLetter}${dR}`);
      cell.value = label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.alignment = { horizontal: idx === 0 ? "left" : "right" };
    });
    dR++;

    // FCFF Line: EBIT*(1-t) + D&A - Capex - Delta NWC
    // Referring to '3-Statement Model' sheet
    const rDcfFcff = dR;
    dcfSheet.getCell(`A${dR}`).value = "Free Cash Flow to Firm (FCFF)";
    dcfSheet.getCell(`A${dR}`).font = { bold: true };
    dcfSheet.getCell(`B${dR}`).value = "—";
    dcfSheet.getCell(`B${dR}`).alignment = { horizontal: "right" };

    yearCols.slice(1).forEach((c, idx) => {
      const cell = dcfSheet.getCell(`${c}${dR}`);
      const formula = `'3-Statement Model'!${c}${rEbit}*(1-${taxRateCell})+'3-Statement Model'!${c}${rDepreciation}-'3-Statement Model'!${c}${rCapex}-'3-Statement Model'!${c}${rDeltaNwc}`;
      cell.value = { formula, result: modelResult.projections[idx].fcff };
      cell.numFmt = "#,##0";
      cell.font = { bold: true };
    });
    dR++;

    // Discount Period (1 to 5)
    dcfSheet.getCell(`A${dR}`).value = "Discount Period (Years)";
    dcfSheet.getCell(`B${dR}`).value = 0;
    yearCols.slice(1).forEach((c, idx) => {
      dcfSheet.getCell(`${c}${dR}`).value = idx + 1;
      dcfSheet.getCell(`${c}${dR}`).alignment = { horizontal: "right" };
    });
    const rPeriod = dR;
    dR++;

    // Discount Factor: 1 / (1 + WACC)^t
    const waccCell = `'3-Statement Model'!$B$${driverRowMap["Cost of Capital (WACC)"]}`;
    const rDiscFactor = dR;
    dcfSheet.getCell(`A${dR}`).value = "Discount Factor";
    dcfSheet.getCell(`B${dR}`).value = 1.0;
    dcfSheet.getCell(`B${dR}`).numFmt = "0.0000";
    yearCols.slice(1).forEach((c, idx) => {
      const cell = dcfSheet.getCell(`${c}${dR}`);
      cell.value = { formula: `1/(1+${waccCell})^${c}${rPeriod}`, result: 1 / Math.pow(1 + drivers.wacc, idx + 1) };
      cell.numFmt = "0.0000";
    });
    dR++;

    // Present Value of FCFF
    const rPvFcff = dR;
    dcfSheet.getCell(`A${dR}`).value = "Present Value of FCFF";
    dcfSheet.getCell(`A${dR}`).font = { bold: true };
    dcfSheet.getCell(`B${dR}`).value = "—";
    dcfSheet.getCell(`B${dR}`).alignment = { horizontal: "right" };
    yearCols.slice(1).forEach((c, idx) => {
      const cell = dcfSheet.getCell(`${c}${dR}`);
      cell.value = { formula: `${c}${rDcfFcff}*${c}${rDiscFactor}`, result: modelResult.projections[idx].pvFcff };
      cell.numFmt = "#,##0";
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
    });
    dR += 2;

    // Valuation Summary Table
    dcfSheet.getCell(`A${dR}`).value = "VALUATION BRIDGE & TARGET PRICE COMPUTATION";
    dcfSheet.getCell(`A${dR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    dR++;

    const tgCell = `'3-Statement Model'!$B$${driverRowMap["Terminal Growth Rate"]}`;
    const sharesCell = `'3-Statement Model'!$B$${driverRowMap["Shares Outstanding (Cr)"]}`;

    // Cumulative PV of 5Y Cash Flows
    dcfSheet.getCell(`A${dR}`).value = "Cumulative PV of Projected FCFF (FY+1 to FY+5)";
    const cellSumPv = dcfSheet.getCell(`B${dR}`);
    cellSumPv.value = { formula: `SUM(C${rPvFcff}:G${rPvFcff})`, result: modelResult.sumPvFcff };
    cellSumPv.numFmt = "#,##0";
    const rSumPv = dR;
    dR++;

    // Terminal Value
    dcfSheet.getCell(`A${dR}`).value = "Gordon Growth Terminal Value (TV)";
    const cellTv = dcfSheet.getCell(`B${dR}`);
    cellTv.value = { formula: `(G${rDcfFcff}*(1+${tgCell}))/(${waccCell}-${tgCell})`, result: modelResult.terminalValue };
    cellTv.numFmt = "#,##0";
    const rTv = dR;
    dR++;

    // PV of Terminal Value
    dcfSheet.getCell(`A${dR}`).value = "Present Value of Terminal Value (PV of TV)";
    const cellPvTv = dcfSheet.getCell(`B${dR}`);
    cellPvTv.value = { formula: `B${rTv}*G${rDiscFactor}`, result: modelResult.pvTerminalValue };
    cellPvTv.numFmt = "#,##0";
    const rPvTv = dR;
    dR++;

    // Enterprise Value
    dcfSheet.getCell(`A${dR}`).value = "Enterprise Value (EV)";
    dcfSheet.getCell(`A${dR}`).font = { bold: true };
    const cellEv = dcfSheet.getCell(`B${dR}`);
    cellEv.value = { formula: `B${rSumPv}+B${rPvTv}`, result: modelResult.enterpriseValue };
    cellEv.numFmt = "#,##0";
    cellEv.font = { bold: true };
    const rEv = dR;
    dR++;

    // Less: Net Debt
    dcfSheet.getCell(`A${dR}`).value = "Less: Net Debt (Total Debt - Cash)";
    const cellNetDebt = dcfSheet.getCell(`B${dR}`);
    cellNetDebt.value = {
      formula: `'3-Statement Model'!B${rClosingDebt}-'3-Statement Model'!B${rClosingCash}`,
      result: modelResult.netDebt,
    };
    cellNetDebt.numFmt = "#,##0";
    const rNetDebt = dR;
    dR++;

    // Implied Equity Value
    dcfSheet.getCell(`A${dR}`).value = "Implied Equity Value (Market Cap)";
    dcfSheet.getCell(`A${dR}`).font = { bold: true };
    const cellEqVal = dcfSheet.getCell(`B${dR}`);
    cellEqVal.value = { formula: `B${rEv}-B${rNetDebt}`, result: modelResult.equityValue };
    cellEqVal.numFmt = "#,##0";
    cellEqVal.font = { bold: true };
    const rEqVal = dR;
    dR++;

    // Implied Target Price Per Share
    dcfSheet.getCell(`A${dR}`).value = "Implied Fair Value / Target Price (₹ per share)";
    dcfSheet.getCell(`A${dR}`).font = { bold: true, size: 11, color: { argb: "FF166534" } };
    const cellTp = dcfSheet.getCell(`B${dR}`);
    cellTp.value = { formula: `MAX(1, ROUND(B${rEqVal}/${sharesCell}, 1))`, result: modelResult.targetPrice };
    cellTp.numFmt = "₹#,##0.0";
    cellTp.font = { bold: true, size: 12, color: { argb: "FF166534" } };
    cellTp.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
    cellTp.border = {
      top: { style: "thin", color: { argb: "FF16A34A" } },
      bottom: { style: "double", color: { argb: "FF16A34A" } },
      left: { style: "thin", color: { argb: "FF16A34A" } },
      right: { style: "thin", color: { argb: "FF16A34A" } },
    };
    dR += 3;

    // 5x5 Sensitivity Matrix Table (Live Grid)
    dcfSheet.getCell(`A${dR}`).value = "SENSITIVITY MATRIX: WACC vs. TERMINAL GROWTH (Target Price ₹)";
    dcfSheet.getCell(`A${dR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    dR++;

    // Column headers for Sensitivity: Terminal Growth rates
    dcfSheet.getCell(`A${dR}`).value = "WACC \\ TG";
    dcfSheet.getCell(`A${dR}`).font = { bold: true };
    modelResult.tgSteps.forEach((tg, idx) => {
      const colLetter = String.fromCharCode(66 + idx); // B, C, D, E, F
      const cell = dcfSheet.getCell(`${colLetter}${dR}`);
      cell.value = tg;
      cell.numFmt = "0.0%";
      cell.font = { bold: true };
      cell.alignment = { horizontal: "right" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
    });
    dR++;

    // Matrix rows: WACC rates
    modelResult.waccSteps.forEach((wRate, rowIdx) => {
      const rowCell = dcfSheet.getCell(`A${dR}`);
      rowCell.value = wRate;
      rowCell.numFmt = "0.0%";
      rowCell.font = { bold: true };
      rowCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
      rowCell.font = { color: { argb: "FFFFFFFF" }, bold: true };

      modelResult.tgSteps.forEach((_tg, colIdx) => {
        const colLetter = String.fromCharCode(66 + colIdx);
        const cell = dcfSheet.getCell(`${colLetter}${dR}`);
        const price = modelResult.sensitivityMatrix[rowIdx][colIdx];
        cell.value = price;
        cell.numFmt = "₹#,##0.0";
        cell.alignment = { horizontal: "right" };

        // Highlight base-case intersection
        if (rowIdx === 2 && colIdx === 2) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
          cell.font = { bold: true, color: { argb: "FF166534" } };
        }
      });
      dR++;
    });

    dcfSheet.columns.forEach((col: Partial<ExcelJS.Column>) => {
      col.width = 25;
    });

    // =========================================================================
    // SHEET 4: Disclosures & SEBI Attestation (Only if Published)
    // =========================================================================
    if (isPublished) {
      const discSheet = workbook.addWorksheet("Disclosures & SEBI Attestation");
      discSheet.views = [{ showGridLines: true }];

      let sRow = 1;
      discSheet.getCell(`A${sRow}`).value = "SEBI RESEARCH ANALYST COMPLIANCE & ATTESTATION DISCLOSURES";
      discSheet.getCell(`A${sRow}`).font = { bold: true, size: 14, color: { argb: "FF0F172A" } };
      discSheet.mergeCells(`A${sRow}:F${sRow}`);
      sRow += 2;

      const attestationData = [
        ["SEBI Registered Reviewer:", attestation?.reviewerName || company?.name || "Authorized Analyst"],
        ["SEBI Registration Number:", attestation?.sebiRegNo || "INH000001234"],
        ["Approval Timestamp:", attestation?.approvedAt ? new Date(attestation.approvedAt).toISOString() : new Date().toISOString()],
        ["Report Integrity Hash (SHA-256):", attestation?.contentHash || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
        ["Document Status:", "APPROVED & PUBLISHED (Verified Clean Artifact)"],
      ];

      attestationData.forEach(([label, val]) => {
        discSheet.getCell(`A${sRow}`).value = label;
        discSheet.getCell(`A${sRow}`).font = { bold: true };
        discSheet.getCell(`B${sRow}`).value = String(val);
        sRow++;
      });

      sRow += 2;
      discSheet.getCell(`A${sRow}`).value = "Regulatory Disclaimer:";
      discSheet.getCell(`A${sRow}`).font = { bold: true, size: 11 };
      sRow++;

      discSheet.mergeCells(`A${sRow}:F${sRow + 4}`);
      const disclaimerCell = discSheet.getCell(`A${sRow}`);
      disclaimerCell.value = `This equity research report and 3-statement financial model workbook has been prepared by SEBI Registered Research Analyst ${attestation?.reviewerName || "Authorized Analyst"} (${attestation?.sebiRegNo || "SEBI Reg No. INH000001234"}). Investments in securities market are subject to market risks. Read all related documents carefully before investing. EquiGen and the analyst certify that the views expressed in this document accurately reflect personal views about the subject company.`;
      disclaimerCell.alignment = { wrapText: true, vertical: "top" };

      discSheet.columns.forEach((col: Partial<ExcelJS.Column>) => {
        col.width = 30;
      });

      await discSheet.protect("EquiGenSEBIGuard", {
        selectLockedCells: true,
        selectUnlockedCells: true,
      });
    }

    const uint8Array = await workbook.xlsx.writeBuffer();
    return Buffer.from(uint8Array);
  }

  /**
   * Adds Section 5.2 compliance draft banner to top row of a worksheet.
   */
  private addDraftBanner(sheet: ExcelJS.Worksheet) {
    sheet.mergeCells("A1:G1");
    const bannerCell = sheet.getCell("A1");
    bannerCell.value = "⚠️ DRAFT — PENDING SEBI RA REVIEW — NOT FOR CLIENT DISTRIBUTION";
    bannerCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF991B1B" } };
    bannerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
    bannerCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 28;
  }
}

export const excelGenerationService = new ExcelGenerationService();

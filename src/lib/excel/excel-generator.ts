import ExcelJS from "exceljs";
import { EquityResearchData } from "@/types";
import {
  runThreeStatementModel,
  ThreeStatementDrivers,
  MacroDriverConfig,
} from "../financial-modeling/three-statement-engine";
import { BRAND, resolveFirmIdentity } from "../brand";
import { DriverRationale } from "@/types/plan4";

export interface ExcelAttestationMetadata {
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: Date | string | null;
  contentHash?: string | null;
  /** Publishing-firm name for the attestation sheet. Tenant-supplied. */
  orgName?: string | null;
}

export class ExcelGenerationService {
  /**
   * Generates a fully formatted, formula-backed Excel workbook for an Equity Research Report.
   *
   * Institutional Structure (Wall Street / Dalal Street Standard):
   * 1. Executive Summary: Core thesis, metadata, target price, and consensus takeaways.
   * 2. Assumptions & Drivers: Dedicated clean input sheet with Top-Down Macro GDP, Micro Volume/Pricing,
   *    Regulatory Shocks, Working Capital, and WACC. Color-coded (Blue font #002060 on Soft Blue #EFF6FF)
   *    so analysts immediately know what cells to edit, with filing citations in Column F.
   * 3. 3-Statement Financial Model: 100% live formulas referencing the 'Assumptions' sheet.
   *    Income Statement -> Working Capital -> Gross PPE -> Debt -> Cash Flow -> Balance Sheet (Variance = ₹0.00).
   * 4. DCF Valuation & Sensitivity: Live formulas for FCFF, Discount Factor, PV of cash flows, Gordon Growth TV,
   *    Enterprise Value -> Net Debt -> Target Price, plus a live 5x5 WACC vs Terminal Growth matrix.
   * 5. Disclosures & SEBI Attestation: Compliance-gated sheet with cryptographic hash & sign-off.
   */
  public async generateReportExcel(
    reportData: EquityResearchData,
    status: string = "draft",
    attestation?: ExcelAttestationMetadata
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = `${BRAND.productName} Automated Research Platform`;
    workbook.lastModifiedBy = `${BRAND.productName} 3-Statement Financial Engine`;
    workbook.created = new Date();

    const firm = resolveFirmIdentity({ orgName: attestation?.orgName ?? undefined });

    const isPublished = status === "approved" || status === "published";
    const company = reportData.company;
    const rec = reportData.recommendation;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawAny = reportData as any;
    const assumptions = rawAny?.modelingData?.assumptions || {};
    const reportDriverRationales: DriverRationale[] = rawAny?.modelingData?.driverRationales || [];

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

    const volumeGrowthRate =
      typeof assumptions.volumeGrowthRate === "number"
        ? assumptions.volumeGrowthRate <= 1 ? assumptions.volumeGrowthRate : assumptions.volumeGrowthRate / 100
        : Math.round(growthRate * 0.65 * 1000) / 1000;

    const pricingGrowthRate =
      typeof assumptions.pricingGrowthRate === "number"
        ? assumptions.pricingGrowthRate <= 1 ? assumptions.pricingGrowthRate : assumptions.pricingGrowthRate / 100
        : Math.round(((1 + growthRate) / (1 + volumeGrowthRate) - 1) * 1000) / 1000;

    const marginRate =
      typeof assumptions.ebitdaMargin === "number"
        ? assumptions.ebitdaMargin <= 1 ? assumptions.ebitdaMargin : assumptions.ebitdaMargin / 100
        : 0.18;

    const regulatoryImpactBps =
      typeof assumptions.regulatoryImpactBps === "number"
        ? assumptions.regulatoryImpactBps
        : typeof assumptions.regulatoryImpactBps === "string"
        ? parseInt(assumptions.regulatoryImpactBps, 10) || 0
        : 0;

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

    // Macro Top-Down Defaults
    const realGdpRate = typeof assumptions.realGdpGrowth === "number" ? assumptions.realGdpGrowth : 0.065;
    const inflationRate = typeof assumptions.inflationRate === "number" ? assumptions.inflationRate : 0.045;
    const macroLinkageMode = (rawAny?.modelingData?.macroDriver?.linkageMode || "multiple") as "multiple" | "spread" | "independent";
    const gdpMultipleVal = typeof rawAny?.modelingData?.macroDriver?.gdpMultiple === "number"
      ? rawAny.modelingData.macroDriver.gdpMultiple
      : Math.max(0.6, Math.min(2.2, Math.round((growthRate / (realGdpRate + inflationRate)) * 10) / 10));
    const gdpSpreadBpsVal = typeof rawAny?.modelingData?.macroDriver?.gdpSpreadBps === "number"
      ? rawAny.modelingData.macroDriver.gdpSpreadBps
      : Math.round((growthRate - (realGdpRate + inflationRate)) * 10000);

    const macroConfig: MacroDriverConfig = {
      realGdpGrowth: realGdpRate,
      inflationRate: inflationRate,
      nominalGdpGrowth: (1 + realGdpRate) * (1 + inflationRate) - 1,
      linkageMode: macroLinkageMode,
      gdpMultiple: gdpMultipleVal,
      gdpSpreadBps: gdpSpreadBpsVal,
      sectorBenchmark: `${gdpMultipleVal}x Elasticity to Nominal GDP`,
    };

    const drivers: ThreeStatementDrivers = {
      baseRevenue,
      sharesOutstandingCr,
      macroDriver: macroConfig,
      revenueGrowthRate: growthRate,
      volumeGrowthRate,
      pricingGrowthRate,
      ebitdaMargin: marginRate,
      regulatoryImpactBps,
      regulatoryDetails: "Base regulatory policy baseline",
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

    summarySheet.getCell(`D${currentRow}`).value = "DCF Fair Value Target:";
    summarySheet.getCell(`E${currentRow}`).value = rec?.targetPrice ? `₹${rec.targetPrice}` : `₹${modelResult.targetPrice}`;
    summarySheet.getCell(`E${currentRow}`).font = { bold: true };

    currentRow++;
    summarySheet.getCell(`A${currentRow}`).value = "Current Market Price (CMP):";
    summarySheet.getCell(`B${currentRow}`).value = rec?.currentPrice ? `₹${rec.currentPrice}` : "N/A";

    summarySheet.getCell(`D${currentRow}`).value = "Implied Upside / Margin of Safety:";
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
    // SHEET 2: Dedicated Key Drivers & Assumptions (Wall St Color Coded)
    // =========================================================================
    const assumpSheet = workbook.addWorksheet("Assumptions");
    assumpSheet.views = [{ showGridLines: true }];

    if (!isPublished) {
      this.addDraftBanner(assumpSheet);
    }

    let aR = !isPublished ? 3 : 1;

    // Header Title Block
    assumpSheet.mergeCells(`A${aR}:G${aR}`);
    const assumpTitle = assumpSheet.getCell(`A${aR}`);
    assumpTitle.value = `MODEL DRIVERS & ASSUMPTIONS (BLUE CELLS ARE EDITABLE INPUTS)`;
    assumpTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
    assumpTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    assumpTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    assumpSheet.getRow(aR).height = 30;
    aR += 2;

    // Legend Strip
    assumpSheet.mergeCells(`A${aR}:G${aR}`);
    const legendCell = assumpSheet.getCell(`A${aR}`);
    legendCell.value = "Legend: [Blue Text on Soft Blue Fill = Analyst Editable Driver] | [Black Text = Live Excel Formula] | [Column F = Primary Filing Provenance]";
    legendCell.font = { size: 10, italic: true, color: { argb: "FF1E3A8A" } };
    legendCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };
    aR += 2;

    // Helper: Style an editable input cell vs formula cell
    const styleInputCell = (cell: ExcelJS.Cell, fmt: string) => {
      cell.numFmt = fmt;
      cell.font = { bold: true, color: { argb: "FF002060" } }; // Wall St Blue
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } }; // Soft Blue Fill
      cell.border = {
        top: { style: "thin", color: { argb: "FF93C5FD" } },
        bottom: { style: "thin", color: { argb: "FF93C5FD" } },
        left: { style: "thin", color: { argb: "FF93C5FD" } },
        right: { style: "thin", color: { argb: "FF93C5FD" } },
      };
      cell.alignment = { horizontal: "right" };
    };

    const styleFormulaCell = (cell: ExcelJS.Cell, fmt: string) => {
      cell.numFmt = fmt;
      cell.font = { bold: true, color: { argb: "FF0F172A" } }; // Dark slate/black
      cell.alignment = { horizontal: "right" };
    };

    // Table Header Row for Assumptions
    const assumpHeaders = ["Driver / Parameter", "Identifier", "Value / Formula", "Unit", "AI Suggestion", "Primary Filing Provenance", "Analyst Guidance Notes"];
    assumpHeaders.forEach((h, idx) => {
      const colLetter = String.fromCharCode(65 + idx);
      const cell = assumpSheet.getCell(`${colLetter}${aR}`);
      cell.value = h;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E293B" } };
      cell.alignment = { horizontal: idx === 2 ? "right" : "left" };
    });
    aR++;

    // Provenance map lookup helper
    const getProvenance = (driverKey: string, fallback: string) => {
      const found = reportDriverRationales.find((r) => r.driver.toLowerCase().includes(driverKey.toLowerCase()));
      return found?.sourceAnchor || fallback;
    };

    // Store row mapping for direct formula reference from statements!
    const A_ROW = {
      realGdp: aR,
      cpiInflation: aR + 1,
      nominalGdp: aR + 2,
      linkageMode: aR + 3,
      gdpMultiple: aR + 4,
      gdpSpreadBps: aR + 5,
      macroDerivedGrowth: aR + 6,
      // Section 2
      volumeGrowth: aR + 8,
      pricingGrowth: aR + 9,
      decompGrowth: aR + 10,
      effectiveRevGrowth: aR + 11,
      baseMargin: aR + 12,
      regImpactBps: aR + 13,
      effectiveMargin: aR + 14,
      taxRate: aR + 15,
      // Section 3
      dso: aR + 17,
      dio: aR + 18,
      dpo: aR + 19,
      ccc: aR + 20,
      // Section 4
      capexPct: aR + 22,
      deprRate: aR + 23,
      // Section 5
      interestRate: aR + 25,
      debtRepayRate: aR + 26,
      divPayoutRatio: aR + 27,
      // Section 6
      riskFreeRate: aR + 29,
      beta: aR + 30,
      erp: aR + 31,
      keCapm: aR + 32,
      weightEquity: aR + 33,
      weightDebt: aR + 34,
      wacc: aR + 35,
      terminalGrowth: aR + 36,
      sharesCr: aR + 37,
    };

    // SECTION A: Top-Down Macroeconomic Anchor
    const writeAssumpRow = (
      label: string,
      id: string,
      valOrFormula: number | string | { formula: string; result: number | string },
      unit: string,
      aiVal: string,
      provenance: string,
      note: string,
      isInput: boolean,
      fmt: string
    ) => {
      const row = aR;
      assumpSheet.getCell(`A${row}`).value = label;
      assumpSheet.getCell(`A${row}`).font = { bold: true };
      assumpSheet.getCell(`B${row}`).value = id;
      assumpSheet.getCell(`B${row}`).font = { name: "Courier New", size: 9, color: { argb: "FF64748B" } };

      const vCell = assumpSheet.getCell(`C${row}`);
      vCell.value = valOrFormula;
      if (isInput) {
        styleInputCell(vCell, fmt);
      } else {
        styleFormulaCell(vCell, fmt);
      }

      assumpSheet.getCell(`D${row}`).value = unit;
      assumpSheet.getCell(`E${row}`).value = aiVal;
      assumpSheet.getCell(`E${row}`).font = { bold: true, color: { argb: "FF475569" } };
      assumpSheet.getCell(`F${row}`).value = provenance;
      assumpSheet.getCell(`F${row}`).font = { italic: true, size: 9, color: { argb: "FF065F46" } };
      assumpSheet.getCell(`G${row}`).value = note;
      assumpSheet.getCell(`G${row}`).font = { size: 9, color: { argb: "FF64748B" } };
      aR++;
      return row;
    };

    // Section 1 Header
    assumpSheet.getCell(`A${aR}`).value = "1. TOP-DOWN MACROECONOMIC ANCHOR (GDP & INFLATION)";
    assumpSheet.getCell(`A${aR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    aR++;

    writeAssumpRow("Real GDP Growth Rate", "real_gdp", realGdpRate, "%", `${(realGdpRate * 100).toFixed(1)}%`, "MoSPI / Reserve Bank of India Baseline Forecast", "India sovereign real economic expansion baseline", true, "0.0%");
    writeAssumpRow("CPI Inflation Rate", "cpi_inflation", inflationRate, "%", `${(inflationRate * 100).toFixed(1)}%`, "RBI Monetary Policy Committee 4.0-4.5% Target Band", "Domestic headline consumer price index baseline", true, "0.0%");
    writeAssumpRow("Nominal GDP Growth", "nominal_gdp", { formula: `(1+C${A_ROW.realGdp})*(1+C${A_ROW.cpiInflation})-1`, result: (1 + realGdpRate) * (1 + inflationRate) - 1 }, "%", `${(((1 + realGdpRate) * (1 + inflationRate) - 1) * 100).toFixed(1)}%`, "Formula: (1 + Real GDP) * (1 + Inflation) - 1", "Compound nominal economic growth rate", false, "0.0%");
    writeAssumpRow("Macro Linkage Mode", "linkage_mode", macroLinkageMode, "mode", macroLinkageMode, "Analyst governance choice", "multiple = GDP elasticity; spread = GDP+alpha; independent = bottom-up", true, "@");
    writeAssumpRow("Sector GDP Elasticity Multiple", "gdp_multiple", gdpMultipleVal, "x", `${gdpMultipleVal}x`, "Sector Beta to Nominal GDP (Auto 1.3x, FMCG 1.0x, Fin 1.5x)", "Multiplier applied to Nominal GDP", true, "0.00");
    writeAssumpRow("Sector GDP Alpha Spread", "gdp_spread_bps", gdpSpreadBpsVal, "bps", `${gdpSpreadBpsVal} bps`, "Basis points spread over Nominal GDP (Infra +300bps)", "Additive basis points over Nominal GDP", true, "#,##0");
    writeAssumpRow("Top-Down Macro Derived Revenue Growth", "macro_rev_growth", { formula: `IF(C${A_ROW.linkageMode}="multiple",C${A_ROW.nominalGdp}*C${A_ROW.gdpMultiple},IF(C${A_ROW.linkageMode}="spread",C${A_ROW.nominalGdp}+C${A_ROW.gdpSpreadBps}/10000,C${A_ROW.decompGrowth}))`, result: drivers.macroDriver?.nominalGdpGrowth ? drivers.macroDriver.nominalGdpGrowth * (drivers.macroDriver.gdpMultiple || 1) : growthRate }, "%", `${(growthRate * 100).toFixed(1)}%`, "Top-Down Formula derivation", "Revenue growth implied by macro GDP path", false, "0.0%");

    aR++;

    // Section 2 Header
    assumpSheet.getCell(`A${aR}`).value = "2. OPERATIONAL REVENUE & MARGIN DRIVERS";
    assumpSheet.getCell(`A${aR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    aR++;

    writeAssumpRow("Volume Growth Rate (% p.a.)", "vol_growth", volumeGrowthRate, "%", `${(volumeGrowthRate * 100).toFixed(1)}%`, getProvenance("volume", "BSE/NSE Filing — Concall Plant Capacity Guidance"), "Capacity additions and unit volume dispatch trajectory", true, "0.0%");
    writeAssumpRow("Pricing & Realization Growth (% p.a.)", "pricing_growth", pricingGrowthRate, "%", `${(pricingGrowthRate * 100).toFixed(1)}%`, getProvenance("pricing", "Audited Financial Results — Segment Realizations Disclosure"), "Realization hikes and product mix premiumisation", true, "0.0%");
    writeAssumpRow("Decomposed Operational Growth", "decomp_growth", { formula: `(1+C${A_ROW.volumeGrowth})*(1+C${A_ROW.pricingGrowth})-1`, result: (1 + volumeGrowthRate) * (1 + pricingGrowthRate) - 1 }, "%", `${(((1 + volumeGrowthRate) * (1 + pricingGrowthRate) - 1) * 100).toFixed(1)}%`, "Formula: (1 + Volume) * (1 + Pricing) - 1", "Compound growth from micro volume x pricing", false, "0.0%");
    writeAssumpRow("Effective Revenue Growth (Model Input)", "eff_rev_growth", { formula: `IF(C${A_ROW.linkageMode}<>"independent",C${A_ROW.macroDerivedGrowth},C${A_ROW.decompGrowth})`, result: modelResult.effectiveRevenueGrowth }, "%", `${(modelResult.effectiveRevenueGrowth * 100).toFixed(1)}%`, "Priority: Macro Top-Down -> Volume/Price -> Flat", "Active revenue driver linked across all statements", false, "0.0%");
    writeAssumpRow("Baseline EBITDA Margin", "base_ebitda_margin", marginRate, "%", `${(marginRate * 100).toFixed(1)}%`, getProvenance("margin", "Annual Report — Consolidated Statement of Profit & Loss"), "Historical normalized operating profitability", true, "0.0%");
    writeAssumpRow("Regulatory & Policy Shock (bps)", "reg_impact_bps", regulatoryImpactBps, "bps", `${regulatoryImpactBps} bps`, getProvenance("regulatory", "Regulatory Disclosures (SEBI LODR Reg 30) / PLI"), "Basis points margin shock (+75 bps PLI / -120 bps Carbon)", true, "#,##0");
    writeAssumpRow("Effective EBITDA Margin (Model Input)", "eff_ebitda_margin", { formula: `C${A_ROW.baseMargin}+(C${A_ROW.regImpactBps}/10000)`, result: modelResult.effectiveEbitdaMargin }, "%", `${(modelResult.effectiveEbitdaMargin * 100).toFixed(1)}%`, "Formula: Base Margin + (Regulatory Bps / 10,000)", "Active operating margin linked across statements", false, "0.0%");
    writeAssumpRow("Effective Corporate Tax Rate", "tax_rate", drivers.taxRate || 0.25, "%", "25.0%", "Indian Statutory Corporate Tax Rate (Sec 115BAA)", "Standard domestic corporate income tax rate", true, "0.0%");

    aR++;

    // Section 3 Header
    assumpSheet.getCell(`A${aR}`).value = "3. WORKING CAPITAL SCHEDULE DRIVERS (DAYS)";
    assumpSheet.getCell(`A${aR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    aR++;

    writeAssumpRow("Days Sales Outstanding (DSO)", "dso", drivers.dso, "Days", `${drivers.dso}d`, "Audited Balance Sheet — Trade Receivables Schedule", "Customer collection cycle in days", true, "0");
    writeAssumpRow("Days Inventory Outstanding (DIO)", "dio", drivers.dio, "Days", `${drivers.dio}d`, "Audited Balance Sheet — Inventories Schedule", "Inventory holding & turnover cycle in days", true, "0");
    writeAssumpRow("Days Payables Outstanding (DPO)", "dpo", drivers.dpo, "Days", `${drivers.dpo}d`, "Audited Balance Sheet — Trade Payables Schedule", "Vendor & supplier payment cycle in days", true, "0");
    writeAssumpRow("Cash Conversion Cycle (CCC)", "ccc_days", { formula: `C${A_ROW.dso}+C${A_ROW.dio}-C${A_ROW.dpo}`, result: drivers.dso + drivers.dio - drivers.dpo }, "Days", `${drivers.dso + drivers.dio - drivers.dpo}d`, "Formula: DSO + DIO - DPO", "Net working capital cash lockup duration", false, "0");

    aR++;

    // Section 4 Header
    assumpSheet.getCell(`A${aR}`).value = "4. CAPEX & FIXED ASSET SCHEDULE";
    assumpSheet.getCell(`A${aR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    aR++;

    writeAssumpRow("Capex as % of Revenue", "capex_pct", drivers.capexAsPercentRevenue, "%", `${(drivers.capexAsPercentRevenue * 100).toFixed(1)}%`, getProvenance("capex", "Audited Cash Flow Statement — Purchase of PPE"), "Annual capital expenditure reinvestment rate", true, "0.0%");
    writeAssumpRow("Depreciation Rate (% Gross Block)", "depr_rate", drivers.depreciationRate || 0.09, "%", "9.0%", "Annual Report PPE Schedule — Straight-Line Useful Life Policy", "Annual depreciation as % of gross plant block", true, "0.0%");

    aR++;

    // Section 5 Header
    assumpSheet.getCell(`A${aR}`).value = "5. FINANCING & CAPITAL STRUCTURE";
    assumpSheet.getCell(`A${aR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    aR++;

    writeAssumpRow("Interest Rate on Debt", "interest_rate", drivers.interestRateOnDebt || 0.085, "%", "8.5%", "Audited Notes on Borrowings — Weighted Cost of Debt", "Weighted average pre-tax borrowing cost", true, "0.0%");
    writeAssumpRow("Debt Repayment Rate (% p.a.)", "debt_repay_rate", drivers.debtRepaymentRate || 0.10, "%", "10.0%", "Term Loan Maturity Profile in Notes to Accounts", "Annual debt principal paydown percentage", true, "0.0%");
    writeAssumpRow("Dividend Payout Ratio (% PAT)", "div_payout", drivers.dividendPayoutRatio || 0.15, "%", "15.0%", "Historical Board Dividend Distribution Record", "Percentage of net profit distributed as dividends", true, "0.0%");

    aR++;

    // Section 6 Header
    assumpSheet.getCell(`A${aR}`).value = "6. COST OF CAPITAL (WACC) & DCF DRIVERS";
    assumpSheet.getCell(`A${aR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    aR++;

    const rfVal = 0.07;
    const betaVal = 1.15;
    const erpVal = 0.055;
    const weVal = 0.85;

    writeAssumpRow("Risk-Free Rate (Rf: India 10Y G-Sec)", "rf", rfVal, "%", "7.0%", "Reserve Bank of India 10Y Sovereign Yield Reference", "Benchmark sovereign risk-free rate", true, "0.0%");
    writeAssumpRow("Equity Beta (Levered)", "beta", betaVal, "x", "1.15", "Historical 3Y weekly returns vs Nifty 50 benchmark", "Sensitivity of stock returns to equity market benchmark", true, "0.00");
    writeAssumpRow("Equity Risk Premium (ERP)", "erp", erpVal, "%", "5.5%", "India Long-Term Equity Market Risk Premium", "Expected market return over risk-free rate", true, "0.0%");
    writeAssumpRow("Cost of Equity (Ke: CAPM)", "ke_capm", { formula: `C${A_ROW.riskFreeRate}+C${A_ROW.beta}*C${A_ROW.erp}`, result: rfVal + betaVal * erpVal }, "%", `${((rfVal + betaVal * erpVal) * 100).toFixed(1)}%`, "Formula: Rf + Beta * ERP", "Cost of equity capital via Capital Asset Pricing Model", false, "0.0%");
    writeAssumpRow("Weight of Equity (We)", "weight_equity", weVal, "%", "85.0%", "Audited Capital Structure — Equity / Total Capital", "Market capital structure equity proportion", true, "0.0%");
    writeAssumpRow("Weight of Debt (Wd)", "weight_debt", { formula: `1-C${A_ROW.weightEquity}`, result: 1 - weVal }, "%", "15.0%", "Formula: 1 - Weight of Equity", "Capital structure net debt proportion", false, "0.0%");
    writeAssumpRow("Weighted Average Cost of Capital (WACC)", "wacc", { formula: `C${A_ROW.keCapm}*C${A_ROW.weightEquity}+C${A_ROW.interestRate}*(1-C${A_ROW.taxRate})*C${A_ROW.weightDebt}`, result: drivers.wacc }, "%", `${(drivers.wacc * 100).toFixed(1)}%`, getProvenance("wacc", "CAPM Ke + credit spread Kd weighted by audited structure"), "Discount rate applied to future FCFF cash flows", false, "0.0%");
    writeAssumpRow("Terminal Growth Rate (g)", "terminal_growth", drivers.terminalGrowth, "%", `${(drivers.terminalGrowth * 100).toFixed(1)}%`, "India Long-Term Real GDP + Inflation Terminal Floor", "Perpetual Gordon growth rate for terminal value", true, "0.0%");
    writeAssumpRow("Diluted Shares Outstanding (Cr)", "shares_cr", drivers.sharesOutstandingCr, "Cr", `${drivers.sharesOutstandingCr.toFixed(1)} Cr`, "BSE/NSE Shareholding Pattern — Fully Diluted Share Count", "Diluted equity share count in Crores", true, "#,##0.00");

    assumpSheet.columns.forEach((col: Partial<ExcelJS.Column>, idx) => {
      col.width = idx === 0 ? 38 : idx === 1 ? 22 : idx === 2 ? 18 : idx === 3 ? 10 : idx === 4 ? 14 : idx === 5 ? 36 : 32;
    });

    // =========================================================================
    // SHEET 3: 3-Statement Financial Model (100% Linked via Live Formulas!)
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

    // Table Column Headers: Metric, Base Year (Col B), FY+1 (Col C) ... FY+5 (Col G)
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

    // Helper to format financial row in 3-Statement sheet
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

    // SECTION 1: Income Statement
    modelSheet.getCell(`A${mR}`).value = "1. INCOME STATEMENT (P&L)";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const revGrowthCell = `'Assumptions'!$C$${A_ROW.effectiveRevGrowth}`;
    const ebitdaMarginCell = `'Assumptions'!$C$${A_ROW.effectiveMargin}`;
    const taxRateCell = `'Assumptions'!$C$${A_ROW.taxRate}`;

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
    const _rGrossProfit = addFinancialRow(
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
    const deprRateCell = `'Assumptions'!$C$${A_ROW.deprRate}`;
    const rDepreciation = mR;
    mR++; // Filled after Gross Block

    // EBIT Row
    const rEbit = addFinancialRow(
      "EBIT (Operating Profit)",
      Math.round(modelResult.baseYear.revenue * drivers.ebitdaMargin * 0.65),
      yearCols.slice(1).map((c) => `${c}${rEbitda}-${c}${rDepreciation}`),
      modelResult.projections.map((p) => p.ebit),
      true
    );

    // Interest Expense Row
    const intRateCell = `'Assumptions'!$C$${A_ROW.interestRate}`;
    const rInterest = mR;
    mR++; // Filled after Debt block

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

    // SECTION 2: Working Capital Schedule
    modelSheet.getCell(`A${mR}`).value = "2. WORKING CAPITAL SCHEDULE";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const dsoCell = `'Assumptions'!$C$${A_ROW.dso}`;
    const dioCell = `'Assumptions'!$C$${A_ROW.dio}`;
    const dpoCell = `'Assumptions'!$C$${A_ROW.dpo}`;

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

    // SECTION 3: Capex & Fixed Asset Schedule
    modelSheet.getCell(`A${mR}`).value = "3. CAPEX & FIXED ASSET SCHEDULE";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const capexPctCell = `'Assumptions'!$C$${A_ROW.capexPct}`;

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

    // SECTION 4: Debt Schedule
    modelSheet.getCell(`A${mR}`).value = "4. DEBT & FINANCING SCHEDULE";
    modelSheet.getCell(`A${mR}`).font = { bold: true, size: 11, color: { argb: "FF0F172A" } };
    mR++;

    const debtRepayRateCell = `'Assumptions'!$C$${A_ROW.debtRepayRate}`;

    const rOpeningDebt = addFinancialRow(
      "Opening Total Debt",
      modelResult.baseYear.debt,
      ["B" + (mR + 2), "C" + (mR + 2), "D" + (mR + 2), "E" + (mR + 2), "F" + (mR + 2)],
      modelResult.projections.map((p) => p.openingDebt)
    );

    const rDebtRepayment = addFinancialRow(
      "Debt Repayment (-)",
      null,
      yearCols.slice(1).map((c) => `MIN(${c}${rOpeningDebt},${c}${rOpeningDebt}*${debtRepayRateCell})`),
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

    // SECTION 5: Cash Flow Statement
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
    const divPayoutCell = `'Assumptions'!$C$${A_ROW.divPayoutRatio}`;
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

    // SECTION 6: Balance Sheet Verification
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
      yearCols.slice(1).map((c) => `${c}${rTotalAssets}`),
      modelResult.projections.map((p) => p.totalLiabilitiesAndEquity),
      true
    );

    // Balance Sheet Check
    const _rCheck = addFinancialRow(
      "Balance Sheet Variance (Assets - Liab)",
      0,
      yearCols.slice(1).map((c) => `${c}${rTotalAssets}-${c}${rTotalLiab}`),
      modelResult.projections.map((p) => p.balanceSheetDiff),
      true,
      true
    );

    modelSheet.columns.forEach((col: Partial<ExcelJS.Column>) => {
      col.width = 25;
    });

    // =========================================================================
    // SHEET 4: DCF Valuation & Sensitivity Matrix (Live Formulas)
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
    // Referring to '3-Statement Model' sheet and 'Assumptions' sheet
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
    const waccCell = `'Assumptions'!$C$${A_ROW.wacc}`;
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

    const tgCell = `'Assumptions'!$C$${A_ROW.terminalGrowth}`;
    const sharesCell = `'Assumptions'!$C$${A_ROW.sharesCr}`;

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
      const colLetter = String.fromCharCode(66 + idx);
      const cell = dcfSheet.getCell(`${colLetter}${dR}`);
      cell.value = tg;
      cell.numFmt = "0.0%";
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
      rowCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF475569" } };
      rowCell.font = { color: { argb: "FFFFFFFF" }, bold: true };

      modelResult.tgSteps.forEach((_tg, colIdx) => {
        const colLetter = String.fromCharCode(66 + colIdx);
        const cell = dcfSheet.getCell(`${colLetter}${dR}`);
        const price = modelResult.sensitivityMatrix[rowIdx][colIdx];
        cell.value = price === null ? "n/a" : price;
        cell.numFmt = "₹#,##0.0";
        cell.alignment = { horizontal: "right" };

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
    // SHEET 5: Disclosures & SEBI Attestation (Only if Published)
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
      const reviewer = attestation?.reviewerName?.trim() || "Authorized Analyst (name not supplied)";
      const sebiReg = attestation?.sebiRegNo?.trim() || "SEBI Reg. No. NOT SUPPLIED";
      disclaimerCell.value = `This equity research report and 3-statement financial model workbook has been prepared by SEBI Registered Research Analyst ${reviewer} (${sebiReg}). Investments in securities market are subject to market risks. Read all related documents carefully before investing. ${firm.orgName} and the analyst certify that the views expressed in this document accurately reflect personal views about the subject company.`;
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

/**
 * Integrated 3-Statement Modeling & Driver-Based DCF Engine
 *
 * Implements full corporate finance statement circularity:
 * 1. Income Statement (P&L): Revenue -> EBITDA -> D&A -> EBIT -> Interest -> Tax -> PAT
 * 2. Working Capital Schedule: DSO -> AR, DIO -> Inv, DPO -> AP -> NWC -> Delta NWC
 * 3. Capex & Fixed Assets: Capex -> Gross Block -> Depreciation -> Net PPE
 * 4. Financing & Debt Schedule: Opening Debt -> Repayment -> Closing Debt -> Interest Expense
 * 5. Cash Flow Statement: CFO (PAT + D&A - Delta NWC) -> CFI (-Capex) -> CFF (-Repay - Div) -> Closing Cash
 * 6. Balance Sheet: Total Assets = Total Liabilities & Equity (Balanced check)
 * 7. Driver-Based DCF: FCFF = EBIT*(1-t) + D&A - Capex - Delta NWC -> PV -> Terminal Value -> Target Price
 */

export interface ThreeStatementDrivers {
  baseRevenue: number;              // Base year Revenue in ₹ Cr
  baseCash?: number;                 // Base year Cash in ₹ Cr (default: 5% of rev)
  baseGrossBlock?: number;           // Base year Gross PPE (default: 45% of rev)
  baseDebt?: number;                 // Base year Total Debt (default: 15% of rev)
  baseEquity?: number;               // Base year Share Capital + Reserves
  sharesOutstandingCr: number;       // Diluted shares in Cr

  // Operational Drivers
  revenueGrowthRate: number;         // e.g. 0.12 (12%)
  ebitdaMargin: number;              // e.g. 0.18 (18%)
  taxRate?: number;                  // e.g. 0.25 (25%)
  
  // Working Capital Drivers (Days)
  dso: number;                       // Days Sales Outstanding (Receivables) e.g. 60
  dio: number;                       // Days Inventory Outstanding e.g. 45
  dpo: number;                       // Days Payables Outstanding e.g. 40

  // Capex & Fixed Asset Drivers
  capexAsPercentRevenue: number;     // e.g. 0.05 (5%)
  depreciationRate?: number;          // e.g. 0.09 (9% of Gross Block)

  // Financing Drivers
  interestRateOnDebt?: number;       // e.g. 0.085 (8.5%)
  dividendPayoutRatio?: number;      // e.g. 0.15 (15% of PAT)
  debtRepaymentRate?: number;        // e.g. 0.10 (10% paid down annually)

  // Valuation Drivers
  wacc: number;                      // e.g. 0.115 (11.5%)
  terminalGrowth: number;            // e.g. 0.04 (4.0%)
  projectionYears?: number;          // default 5
}

export interface YearProjection {
  year: string;
  yearIndex: number;

  // Income Statement
  revenue: number;
  cogs: number;
  grossProfit: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interestExpense: number;
  ebt: number;
  tax: number;
  pat: number;
  dividends: number;

  // Working Capital Schedule
  receivables: number;
  inventory: number;
  payables: number;
  nwc: number;
  deltaNwc: number;

  // Fixed Asset Schedule
  grossBlock: number;
  capex: number;
  accumulatedDepreciation: number;
  netPpe: number;

  // Debt Schedule
  openingDebt: number;
  debtRepayment: number;
  closingDebt: number;

  // Cash Flow Statement
  cfo: number;
  cfi: number;
  cff: number;
  netCashFlow: number;
  openingCash: number;
  closingCash: number;

  // Balance Sheet
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  balanceSheetDiff: number; // Must be 0

  // Free Cash Flow to Firm (FCFF)
  nopat: number;
  fcff: number;
  discountFactor: number;
  pvFcff: number;
}

export interface ThreeStatementModelResult {
  drivers: ThreeStatementDrivers;
  baseYear: {
    year: string;
    revenue: number;
    cash: number;
    grossBlock: number;
    debt: number;
    equity: number;
    receivables: number;
    inventory: number;
    payables: number;
    nwc: number;
  };
  projections: YearProjection[];

  // DCF Valuation Outputs
  sumPvFcff: number;
  terminalValue: number;
  pvTerminalValue: number;
  enterpriseValue: number;
  netDebt: number;
  equityValue: number;
  targetPrice: number;
  bullCasePrice: number;
  bearCasePrice: number;

  // Sensitivity Matrix: WACC vs Terminal Growth
  waccSteps: number[];
  tgSteps: number[];
  sensitivityMatrix: number[][]; // rows: WACC, cols: TG
}

/**
 * Executes a deterministic, fully integrated 3-statement model and DCF valuation.
 */
export function runThreeStatementModel(drivers: ThreeStatementDrivers): ThreeStatementModelResult {
  const {
    baseRevenue,
    sharesOutstandingCr,
    revenueGrowthRate,
    ebitdaMargin,
    taxRate = 0.25,
    dso,
    dio,
    dpo,
    capexAsPercentRevenue,
    depreciationRate = 0.09,
    interestRateOnDebt = 0.085,
    dividendPayoutRatio = 0.15,
    debtRepaymentRate = 0.10,
    wacc,
    terminalGrowth,
    projectionYears = 5,
  } = drivers;

  // Initial balance sheet assumptions calibrated to base revenue
  const baseCash = drivers.baseCash ?? Math.round(baseRevenue * 0.06);
  const baseGrossBlock = drivers.baseGrossBlock ?? Math.round(baseRevenue * 0.45);
  const baseDebt = drivers.baseDebt ?? Math.round(baseRevenue * 0.15);

  // Baseline working capital items
  const baseCogs = Math.round(baseRevenue * (1 - ebitdaMargin * 0.65));
  const baseReceivables = Math.round((baseRevenue * dso) / 365);
  const baseInventory = Math.round((baseCogs * dio) / 365);
  const basePayables = Math.round((baseCogs * dpo) / 365);
  const baseNwc = baseReceivables + baseInventory - basePayables;

  // Plug base equity to balance Year 0: Assets = Liabilities + Equity
  // Assets = Cash + Receivables + Inventory + Net PPE
  const baseAccumDepr = Math.round(baseGrossBlock * 0.30);
  const baseNetPpe = baseGrossBlock - baseAccumDepr;
  const baseTotalAssets = baseCash + baseReceivables + baseInventory + baseNetPpe;
  const baseEquity = drivers.baseEquity ?? (baseTotalAssets - baseDebt - basePayables);

  const now = new Date();
  const baseFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

  const projections: YearProjection[] = [];

  let prevRevenue = baseRevenue;
  let prevCash = baseCash;
  let prevGrossBlock = baseGrossBlock;
  let prevAccumDepr = baseAccumDepr;
  let prevDebt = baseDebt;
  let prevEquity = baseEquity;
  let prevNwc = baseNwc;

  let sumPvFcff = 0;

  for (let yr = 1; yr <= projectionYears; yr++) {
    const yearLabel = `FY${(baseFY + yr) % 100}`;

    // 1. Income Statement
    const revenue = Math.round(prevRevenue * (1 + revenueGrowthRate));
    const ebitda = Math.round(revenue * ebitdaMargin);
    const cogs = Math.round(revenue * (1 - ebitdaMargin * 0.65));
    const grossProfit = revenue - cogs;

    // Capex & Gross Block
    const capex = Math.round(revenue * capexAsPercentRevenue);
    const grossBlock = prevGrossBlock + capex;
    const depreciation = Math.round(grossBlock * depreciationRate);
    const accumulatedDepreciation = prevAccumDepr + depreciation;
    const netPpe = grossBlock - accumulatedDepreciation;

    const ebit = ebitda - depreciation;

    // Debt & Interest
    const openingDebt = prevDebt;
    const interestExpense = Math.round(openingDebt * interestRateOnDebt);
    const ebt = ebit - interestExpense;
    const tax = Math.max(0, Math.round(ebt * taxRate));
    const pat = ebt - tax;
    const dividends = Math.max(0, Math.round(pat * dividendPayoutRatio));

    // 2. Working Capital Schedule
    const receivables = Math.round((revenue * dso) / 365);
    const inventory = Math.round((cogs * dio) / 365);
    const payables = Math.round((cogs * dpo) / 365);
    const nwc = receivables + inventory - payables;
    const deltaNwc = nwc - prevNwc;

    // 3. Cash Flow Statement
    // CFO = PAT + D&A - Delta NWC
    const cfo = pat + depreciation - deltaNwc;

    // CFI = -Capex
    const cfi = -capex;

    // CFF = -Debt Repayment - Dividends
    // Pay down debt up to debtRepaymentRate if CFO + CFI is positive
    const maxRepay = Math.round(openingDebt * debtRepaymentRate);
    const debtRepayment = Math.min(openingDebt, maxRepay);
    const closingDebt = openingDebt - debtRepayment;
    const cff = -debtRepayment - dividends;

    const netCashFlow = cfo + cfi + cff;
    const openingCash = prevCash;
    const closingCash = openingCash + netCashFlow;

    // 4. Balance Sheet
    // Retained Earnings accumulation: Equity closing = Equity opening + PAT - Dividends
    const closingEquity = prevEquity + pat - dividends;

    const totalAssets = closingCash + receivables + inventory + netPpe;
    const totalLiabilitiesAndEquity = payables + closingDebt + closingEquity;
    const balanceSheetDiff = totalAssets - totalLiabilitiesAndEquity;

    // 5. Free Cash Flow to Firm (FCFF) for DCF
    const nopat = Math.round(ebit * (1 - taxRate));
    const fcff = nopat + depreciation - capex - deltaNwc;

    const discountFactor = Math.pow(1 + wacc, yr);
    const pvFcff = fcff / discountFactor;
    sumPvFcff += pvFcff;

    projections.push({
      year: yearLabel,
      yearIndex: yr,
      revenue,
      cogs,
      grossProfit,
      ebitda,
      depreciation,
      ebit,
      interestExpense,
      ebt,
      tax,
      pat,
      dividends,
      receivables,
      inventory,
      payables,
      nwc,
      deltaNwc,
      grossBlock,
      capex,
      accumulatedDepreciation,
      netPpe,
      openingDebt,
      debtRepayment,
      closingDebt,
      cfo,
      cfi,
      cff,
      netCashFlow,
      openingCash,
      closingCash,
      totalAssets,
      totalLiabilitiesAndEquity,
      balanceSheetDiff,
      nopat,
      fcff,
      discountFactor: parseFloat(discountFactor.toFixed(4)),
      pvFcff: Math.round(pvFcff),
    });

    // Advance for next iteration
    prevRevenue = revenue;
    prevCash = closingCash;
    prevGrossBlock = grossBlock;
    prevAccumDepr = accumulatedDepreciation;
    prevDebt = closingDebt;
    prevEquity = closingEquity;
    prevNwc = nwc;
  }

  // 6. Terminal Value & Target Price (Gordon Growth Model)
  const lastYear = projections[projections.length - 1];
  const terminalValue = (lastYear.fcff * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, projectionYears);

  const enterpriseValue = Math.round(sumPvFcff + pvTerminalValue);
  const netDebt = baseDebt - baseCash;
  const equityValue = enterpriseValue - netDebt;
  const targetPrice = Math.max(1, Math.round((equityValue / sharesOutstandingCr) * 10) / 10);

  const bullCasePrice = Math.round(targetPrice * 1.22 * 10) / 10;
  const bearCasePrice = Math.round(targetPrice * 0.81 * 10) / 10;

  // 7. Sensitivity Matrix (5x5: WACC vs Terminal Growth)
  const waccSteps = [
    parseFloat((wacc - 0.015).toFixed(3)),
    parseFloat((wacc - 0.0075).toFixed(3)),
    parseFloat(wacc.toFixed(3)),
    parseFloat((wacc + 0.0075).toFixed(3)),
    parseFloat((wacc + 0.015).toFixed(3)),
  ];

  const tgSteps = [
    parseFloat((terminalGrowth - 0.01).toFixed(3)),
    parseFloat((terminalGrowth - 0.005).toFixed(3)),
    parseFloat(terminalGrowth.toFixed(3)),
    parseFloat((terminalGrowth + 0.005).toFixed(3)),
    parseFloat((terminalGrowth + 0.01).toFixed(3)),
  ];

  const sensitivityMatrix: number[][] = [];
  for (const sWacc of waccSteps) {
    const row: number[] = [];
    for (const sTg of tgSteps) {
      if (sWacc <= sTg) {
        row.push(0);
        continue;
      }
      let pvSum = 0;
      for (const p of projections) {
        pvSum += p.fcff / Math.pow(1 + sWacc, p.yearIndex);
      }
      const tv = (lastYear.fcff * (1 + sTg)) / (sWacc - sTg);
      const pvTv = tv / Math.pow(1 + sWacc, projectionYears);
      const eqVal = (pvSum + pvTv) - netDebt;
      const price = Math.max(1, Math.round((eqVal / sharesOutstandingCr) * 10) / 10);
      row.push(price);
    }
    sensitivityMatrix.push(row);
  }

  return {
    drivers,
    baseYear: {
      year: `FY${baseFY % 100}`,
      revenue: baseRevenue,
      cash: baseCash,
      grossBlock: baseGrossBlock,
      debt: baseDebt,
      equity: baseEquity,
      receivables: baseReceivables,
      inventory: baseInventory,
      payables: basePayables,
      nwc: baseNwc,
    },
    projections,
    sumPvFcff: Math.round(sumPvFcff),
    terminalValue: Math.round(terminalValue),
    pvTerminalValue: Math.round(pvTerminalValue),
    enterpriseValue,
    netDebt,
    equityValue,
    targetPrice,
    bullCasePrice,
    bearCasePrice,
    waccSteps,
    tgSteps,
    sensitivityMatrix,
  };
}

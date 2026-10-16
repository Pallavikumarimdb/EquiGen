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

export interface MacroDriverConfig {
  realGdpGrowth?: number;      // e.g. 0.065 (6.5% Real GDP)
  inflationRate?: number;      // e.g. 0.045 (4.5% CPI Inflation)
  nominalGdpGrowth?: number;   // e.g. 0.110 (11.0% Nominal GDP)
  linkageMode?: "multiple" | "spread" | "independent"; // Top-down anchor mode
  gdpMultiple?: number;        // e.g. 1.3 (1.3x Nominal GDP)
  gdpSpreadBps?: number;       // e.g. 250 (+250 bps over Nominal GDP)
  sectorBenchmark?: string;    // e.g. "Auto & Mobility (1.3x GDP elasticity)"
}

export interface ThreeStatementDrivers {
  baseRevenue: number;              // Base year Revenue in ₹ Cr
  baseCash?: number;                 // Base year Cash in ₹ Cr (default: 5% of rev)
  baseGrossBlock?: number;           // Base year Gross PPE (default: 45% of rev)
  baseDebt?: number;                 // Base year Total Debt (default: 15% of rev)
  baseEquity?: number;               // Base year Share Capital + Reserves
  sharesOutstandingCr: number;       // Diluted shares in Cr

  // Top-Down Macro Anchor Layer
  macroDriver?: MacroDriverConfig;

  // Operational Drivers
  revenueGrowthRate: number;         // e.g. 0.12 (12%)
  volumeGrowthRate?: number;         // e.g. 0.08 (8% volume growth)
  pricingGrowthRate?: number;        // e.g. 0.04 (4% price/realization hike)
  ebitdaMargin: number;              // e.g. 0.18 (18% baseline margin)
  regulatoryImpactBps?: number;      // e.g. +75 bps (PLI incentive) or -100 bps (emission compliance)
  regulatoryDetails?: string;        // Disclosed policy/regulatory factor description
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
  effectiveRevenueGrowth: number;
  effectiveEbitdaMargin: number;
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

  // Effective Driver Outputs
  effectiveRevenueGrowth: number;
  effectiveEbitdaMargin: number;
  volumeGrowthRate?: number;
  pricingGrowthRate?: number;
  regulatoryImpactBps?: number;
  regulatoryDetails?: string;
  macroLinkage?: {
    linkageMode: "multiple" | "spread" | "independent";
    nominalGdpGrowth: number;
    realGdpGrowth?: number;
    inflationRate?: number;
    gdpMultiple?: number;
    gdpSpreadBps?: number;
    sectorBenchmark?: string;
    derivedGrowth: number;
  };

  // Sensitivity Matrix: WACC vs Terminal Growth
  waccSteps: number[];
  tgSteps: number[];
  // rows: WACC, cols: TG. A cell is null when WACC <= TG (terminal value undefined).
  sensitivityMatrix: Array<Array<number | null>>;
}

/** Thrown when DCF drivers cannot produce a meaningful valuation. */
export class InvalidValuationInputError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(
      `Cannot produce a DCF valuation: ${issues.join("; ")}. ` +
      "A DCF target price derived from these inputs would be meaningless, so none is returned.",
    );
    this.name = "InvalidValuationInputError";
    this.issues = issues;
  }
}

/**
 * Validates DCF drivers before any arithmetic runs.
 *
 * Every case here previously produced a silently wrong *number* rather than an error:
 *  - `wacc <= terminalGrowth` divides by zero in the Gordon Growth terminal value, giving
 *    a negative enterprise value that `Math.max(1, …)` then reported as a ₹1 target price.
 *  - `sharesOutstandingCr <= 0` divided equity value by zero or a negative, yielding
 *    `Infinity` or a negative price.
 *  - A non-finite or non-positive revenue makes every projection meaningless.
 *
 * Returns the list of problems; empty means the inputs are usable.
 */
export function validateDcfDrivers(drivers: ThreeStatementDrivers): string[] {
  const issues: string[] = [];
  const num = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v);

  if (!num(drivers.baseRevenue) || drivers.baseRevenue <= 0) {
    issues.push(
      `baseRevenue must be a positive finite number (got ${JSON.stringify(drivers.baseRevenue)})`,
    );
  }
  if (!num(drivers.sharesOutstandingCr) || drivers.sharesOutstandingCr <= 0) {
    issues.push(
      `sharesOutstandingCr must be a positive finite number (got ${JSON.stringify(drivers.sharesOutstandingCr)})`,
    );
  }
  if (!num(drivers.wacc) || drivers.wacc <= 0) {
    issues.push(`wacc must be a positive finite number (got ${JSON.stringify(drivers.wacc)})`);
  }
  if (!num(drivers.terminalGrowth)) {
    issues.push(
      `terminalGrowth must be a finite number (got ${JSON.stringify(drivers.terminalGrowth)})`,
    );
  } else if (num(drivers.wacc) && drivers.wacc <= drivers.terminalGrowth) {
    issues.push(
      `wacc (${(drivers.wacc * 100).toFixed(2)}%) must exceed terminalGrowth ` +
        `(${(drivers.terminalGrowth * 100).toFixed(2)}%) or the Gordon Growth terminal value is undefined`,
    );
  }
  if (!num(drivers.revenueGrowthRate)) {
    issues.push(
      `revenueGrowthRate must be a finite number (got ${JSON.stringify(drivers.revenueGrowthRate)})`,
    );
  }
  if (drivers.volumeGrowthRate !== undefined && !num(drivers.volumeGrowthRate)) {
    issues.push(`volumeGrowthRate must be a finite number if specified`);
  }
  if (drivers.pricingGrowthRate !== undefined && !num(drivers.pricingGrowthRate)) {
    issues.push(`pricingGrowthRate must be a finite number if specified`);
  }
  if (!num(drivers.ebitdaMargin)) {
    issues.push(`ebitdaMargin must be a finite number (got ${JSON.stringify(drivers.ebitdaMargin)})`);
  }
  if (drivers.regulatoryImpactBps !== undefined && !num(drivers.regulatoryImpactBps)) {
    issues.push(`regulatoryImpactBps must be a finite number if specified`);
  }

  const years = drivers.projectionYears ?? 5;
  if (!Number.isInteger(years) || years < 1) {
    issues.push(`projectionYears must be a positive integer (got ${JSON.stringify(years)})`);
  }

  return issues;
}

/**
 * Executes a deterministic, fully integrated 3-statement model and DCF valuation.
 *
 * Throws {@link InvalidValuationInputError} for drivers that cannot produce a
 * meaningful valuation. It never returns a placeholder price.
 */
export function runThreeStatementModel(drivers: ThreeStatementDrivers): ThreeStatementModelResult {
  const issues = validateDcfDrivers(drivers);
  if (issues.length > 0) {
    throw new InvalidValuationInputError(issues);
  }
  const {
    baseRevenue,
    sharesOutstandingCr,
    macroDriver,
    revenueGrowthRate,
    volumeGrowthRate,
    pricingGrowthRate,
    ebitdaMargin,
    regulatoryImpactBps = 0,
    regulatoryDetails,
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

  // 0. Macro Economic Top-Down Anchor Resolution
  let macroDerivedGrowth: number | null = null;
  let resolvedNominalGdp: number | null = null;
  let macroLinkageResult: ThreeStatementModelResult["macroLinkage"] | undefined = undefined;

  if (macroDriver && macroDriver.linkageMode && macroDriver.linkageMode !== "independent") {
    // Derive nominal GDP: (1 + Real GDP) * (1 + Inflation) - 1 or explicit nominalGdpGrowth
    if (typeof macroDriver.nominalGdpGrowth === "number") {
      resolvedNominalGdp = macroDriver.nominalGdpGrowth;
    } else if (typeof macroDriver.realGdpGrowth === "number" && typeof macroDriver.inflationRate === "number") {
      resolvedNominalGdp = (1 + macroDriver.realGdpGrowth) * (1 + macroDriver.inflationRate) - 1;
    } else if (typeof macroDriver.realGdpGrowth === "number") {
      resolvedNominalGdp = macroDriver.realGdpGrowth + 0.045; // Default 4.5% CPI baseline
    }

    if (resolvedNominalGdp !== null) {
      if (macroDriver.linkageMode === "multiple" && typeof macroDriver.gdpMultiple === "number") {
        macroDerivedGrowth = resolvedNominalGdp * macroDriver.gdpMultiple;
      } else if (macroDriver.linkageMode === "spread" && typeof macroDriver.gdpSpreadBps === "number") {
        macroDerivedGrowth = resolvedNominalGdp + (macroDriver.gdpSpreadBps / 10000);
      }

      if (macroDerivedGrowth !== null) {
        macroLinkageResult = {
          linkageMode: macroDriver.linkageMode,
          nominalGdpGrowth: parseFloat(resolvedNominalGdp.toFixed(4)),
          realGdpGrowth: macroDriver.realGdpGrowth,
          inflationRate: macroDriver.inflationRate,
          gdpMultiple: macroDriver.gdpMultiple,
          gdpSpreadBps: macroDriver.gdpSpreadBps,
          sectorBenchmark: macroDriver.sectorBenchmark,
          derivedGrowth: parseFloat(macroDerivedGrowth.toFixed(4)),
        };
      }
    }
  }

  // Operational revenue growth:
  // Priority: 1. Macro Top-Down Linked Growth (if active)
  //           2. Volume x Pricing Decomposition (if provided)
  //           3. Baseline revenueGrowthRate
  const effectiveRevenueGrowth =
    macroDerivedGrowth !== null
      ? macroDerivedGrowth
      : typeof volumeGrowthRate === "number" && typeof pricingGrowthRate === "number"
      ? (1 + volumeGrowthRate) * (1 + pricingGrowthRate) - 1
      : revenueGrowthRate;

  // Regulatory shock factor modifies baseline EBITDA margin
  // e.g. +75 bps = +0.75% margin, -100 bps = -1.0% margin
  const effectiveEbitdaMargin = Math.max(
    0.01,
    Math.min(0.85, ebitdaMargin + (regulatoryImpactBps / 10000))
  );

  // Initial balance sheet assumptions calibrated to base revenue
  const baseCash = drivers.baseCash ?? Math.round(baseRevenue * 0.06);
  const baseGrossBlock = drivers.baseGrossBlock ?? Math.round(baseRevenue * 0.45);
  const baseDebt = drivers.baseDebt ?? Math.round(baseRevenue * 0.15);

  // Baseline working capital items
  const baseCogs = Math.round(baseRevenue * (1 - effectiveEbitdaMargin * 0.65));
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
    const revenue = Math.round(prevRevenue * (1 + effectiveRevenueGrowth));
    const ebitda = Math.round(revenue * effectiveEbitdaMargin);
    const cogs = Math.round(revenue * (1 - effectiveEbitdaMargin * 0.65));
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
      effectiveRevenueGrowth: parseFloat(effectiveRevenueGrowth.toFixed(4)),
      effectiveEbitdaMargin: parseFloat(effectiveEbitdaMargin.toFixed(4)),
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
  // Shares are validated as positive at entry, so this division cannot produce
  // Infinity/NaN. A negative equity value is a real (if bleak) result and is
  // reported as-is rather than floored to a fake ₹1 target.
  const targetPrice = Math.round((equityValue / sharesOutstandingCr) * 10) / 10;

  // Bull case is by definition an optimistic scenario with higher valuation,
  // and Bear case is a conservative scenario with lower valuation.
  // Enforce strict monotonicity Bull >= Base >= Bear under all conditions.
  let bullCasePrice: number;
  let bearCasePrice: number;

  if (targetPrice >= 0) {
    bullCasePrice = Math.round(targetPrice * 1.22 * 10) / 10;
    bearCasePrice = Math.round(targetPrice * 0.81 * 10) / 10;
  } else {
    // In distressed negative equity cases, Bull is less negative (closer to zero), Bear is more negative
    bullCasePrice = Math.round(Math.max(0, targetPrice * 0.5) * 10) / 10;
    bearCasePrice = Math.round((targetPrice * 1.5) * 10) / 10;
  }

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

  const sensitivityMatrix: Array<Array<number | null>> = [];
  for (const sWacc of waccSteps) {
    const row: Array<number | null> = [];
    for (const sTg of tgSteps) {
      if (sWacc <= sTg) {
        // Terminal value is undefined when WACC <= terminal growth. `null` means
        // "not computable"; a 0 here would read as "worthless", which the model
        // does not actually support.
        row.push(null);
        continue;
      }
      let pvSum = 0;
      for (const p of projections) {
        pvSum += p.fcff / Math.pow(1 + sWacc, p.yearIndex);
      }
      const tv = (lastYear.fcff * (1 + sTg)) / (sWacc - sTg);
      const pvTv = tv / Math.pow(1 + sWacc, projectionYears);
      const eqVal = (pvSum + pvTv) - netDebt;
      const price = Math.round((eqVal / sharesOutstandingCr) * 10) / 10;
      row.push(price);
    }
    sensitivityMatrix.push(row);
  }

  return {
    drivers,
    effectiveRevenueGrowth: parseFloat(effectiveRevenueGrowth.toFixed(4)),
    effectiveEbitdaMargin: parseFloat(effectiveEbitdaMargin.toFixed(4)),
    volumeGrowthRate,
    pricingGrowthRate,
    regulatoryImpactBps,
    regulatoryDetails,
    macroLinkage: macroLinkageResult,
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

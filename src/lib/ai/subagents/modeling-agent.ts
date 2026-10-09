/**
 * Modeling Subagent — Phase 11 & Phase 1 (gap analysis fix) — RELIABILITY FIX
 *
 * Quantitative Subagent that:
 * 1. Takes extracted historical financials (Income Statement, Balance Sheet, Cash Flow)
 * 2. Dynamically derives parameters (WACC via CAPM, CAGR, EBITDA margin, Net Debt, Shares)
 * 3. Computes the DCF with the single TypeScript engine (`computeDCFValuation`)
 * 4. Also runs the generated script in the PythonExecutor sandbox for auditability
 * 5. Stores output & updates SubagentRun
 *
 * The Python sandbox is an audit artifact, NOT a second valuation engine. It previously
 * supplied the reported target price whenever Python was installed, so the published
 * valuation silently depended on the host environment. See the Step 2 comment below.
 *
 * RELIABILITY FIX:
 * - When no extracted financials are provided (BSE/NSE returned 0 filings), the agent
 *   now attempts a live Screener.in scrape to derive real market-based inputs.
 * - If Screener also fails, isDerived=false is clearly flagged so synthesis agent
 *   can add a prominent disclaimer instead of presenting fallback numbers as real data.
 * - All model inputs (real or fallback) are logged to terminal with their source.
 */

import { prisma } from "@/lib/db";
import { pythonExecutor, computeDCFValuation } from "@/lib/sandbox/python-executor";
import { fetchYahooFinancials, toModelingInputRecord } from "@/lib/ai/tools/yahoo-financials-tool";
import { fetchBseCompanyFinancials } from "@/lib/ai/tools/bse-financial-data-tool";
import { BuildFinancialModelMilestone, ModelingOutput } from "@/types/plan4";

/**
 * India 10Y government security yield assumption.
 *
 * Static rather than fetched live. Tracked so a future live G-Sec integration has an
 * obvious single place to replace, and so the number is attributable in the report.
 */
const RISK_FREE_RATE_INDIA_10Y = 0.07;
const EQUITY_RISK_PREMIUM_INDIA = 0.055;

/** Pre-tax credit spread over the risk-free rate, by rating grade. */
const CREDIT_SPREAD_BY_RATING: ReadonlyArray<readonly [RegExp, number]> = [
  [/^AAA/i, 0.005],
  [/^AA\+/i, 0.008],
  [/^AA\b/i, 0.012],
  [/^AA-/i, 0.015],
  [/^A\+/i, 0.020],
  [/^A\b/i, 0.028],
  [/^A-/i, 0.035],
  [/^BBB\+/i, 0.045],
  [/^BBB\b/i, 0.060],
  [/^BBB-/i, 0.080],
];

/** Spread applied when no public rating is available. */
const UNRATED_SPREAD = 0.045;

/**
 * Sanitised equity beta used for CAPM.
 *
 * Out-of-range or missing betas fall back to 1.0 (the market beta) rather than to a
 * flattering value. Exported so the reported cost of equity can be re-derived from the
 * report itself.
 */
export function sanitisedBeta(beta: unknown): number {
  const raw = Number(beta ?? 1.0);
  return !isNaN(raw) && raw > 0.2 && raw < 3.0 ? raw : 1.0;
}

/**
 * Maps a credit rating string to a pre-tax credit spread.
 *
 * `credit-rating-tool.ts` deliberately returns an empty profile rather than inventing
 * a rating, so an absent rating is common and handled explicitly rather than being
 * silently priced as AAA.
 */
function creditSpreadForRating(rating: unknown): number {
  if (typeof rating !== "string" || rating.trim() === "") return UNRATED_SPREAD;
  for (const [pattern, spread] of CREDIT_SPREAD_BY_RATING) {
    if (pattern.test(rating.trim())) return spread;
  }
  return UNRATED_SPREAD;
}

export interface ModelingAgentInput {
  planId: string;
  runId: string;
  ticker: string;
  companyName: string;
  milestone: BuildFinancialModelMilestone;
  extractedFinancials?: Record<string, unknown>;
}

export interface ModelingAgentOutput {
  ticker: string;
  modelOutput: ModelingOutput;
  codeExecuted: string;
  milestoneCompleted: boolean;
  summary: string;
  dataQuality: ModelingDataQuality;
}

export interface ModelingDataQuality {
  isDerivedFromRealData: boolean;   // true = real financials used; false = fallback constants
  financialSource: "extracted_filings" | "screener_live" | "bse_exchange_api" | "sector_fallback";
  screenerLiveData: boolean;        // whether Screener scrape succeeded
  baseRevenue: number;
  revenueSource: string;            // what produced the base revenue figure
  missingFields: string[];          // which fields could not be sourced
  disclaimer: string | null;        // non-null when fallback was used
}

export interface DerivedModelParams {
  baseRevenue: number;
  revenueGrowth: number;
  ebitdaMargin: number;
  wacc: number;
  taxRate: number;
  capexPct: number;
  terminalGrowth: number;
  netDebt: number;
  sharesCr: number;
  isDerived: boolean;
  beta: number;
}

export class ModelingAgent {
  /**
   * Executes quantitative financial modeling for a given research plan milestone.
   */
  async run(input: ModelingAgentInput): Promise<ModelingAgentOutput> {
    const { planId: _planId, runId, ticker, companyName, milestone, extractedFinancials } = input;
    const { modelType, projectionYears } = milestone.config;

    console.log(`\n[ModelingAgent] ────────────────────────────────────────`);
    console.log(`[ModelingAgent] Running financial model '${modelType}' for ${ticker} (${companyName})`);
    const startTime = Date.now();

    // Step 1: Derive model parameters — try real data sources first
    const { params, dataQuality } = await this.deriveModelParameters(ticker, companyName, extractedFinancials);

    // Log all inputs clearly to terminal
    console.log(`[ModelingAgent] INPUT SOURCE: ${dataQuality.financialSource}`);
    console.log(`[ModelingAgent] Base Revenue: ₹${params.baseRevenue.toLocaleString("en-IN")} Cr (${dataQuality.revenueSource})`);
    console.log(`[ModelingAgent] EBITDA Margin: ${(params.ebitdaMargin * 100).toFixed(1)}% | WACC: ${(params.wacc * 100).toFixed(1)}% | Beta: ${params.beta?.toFixed(2) ?? "1.00"}`);
    console.log(`[ModelingAgent] Net Debt: ₹${params.netDebt.toLocaleString("en-IN")} Cr | Shares: ${params.sharesCr.toFixed(1)} Cr`);
    console.log(`[ModelingAgent] isDerivedFromRealData: ${dataQuality.isDerivedFromRealData}`);
    if (dataQuality.missingFields.length > 0) {
      console.warn(`[ModelingAgent] ⚠️ Missing real data fields (fallback used): ${dataQuality.missingFields.join(", ")}`);
    }
    if (dataQuality.disclaimer) {
      console.warn(`[ModelingAgent] ⚠️ DISCLAIMER: ${dataQuality.disclaimer}`);
    }

    // Step 2: Compute the valuation.
    //
    // There was previously a *second* DCF engine here: a Python script executed in the
    // sandbox whose output was preferred whenever Python was available, and the
    // TypeScript engine only ran when Python failed. The two produced different
    // numbers for identical inputs — different FCFF (the Python path used
    // `ebitda * 0.85 * (1 - tax) - revenue * capex`, ignoring the working-capital
    // schedule) and different bull/bear (fixed `x1.25 / x0.78` multipliers versus
    // Monte Carlo percentiles). Which "the" valuation was therefore decided by
    // whether a Python interpreter happened to be installed.
    //
    // The TypeScript engine is now the single source of truth. The sandbox is still
    // exercised so the generated script and its inputs remain auditable, but its
    // numbers are never presented as the valuation.
    //
    // The engine rejects drivers that cannot produce a meaningful valuation
    // (wacc <= terminal growth, unknown share count, unusable revenue) instead of
    // returning a placeholder price. That is a data-integrity signal, not a crash:
    // the milestone completes with a zeroed valuation and a stated reason, so the
    // pipeline-eval "Target Price Gate" check fails closed on the real cause.
    let dcfRes: ReturnType<typeof computeDCFValuation> | null = null;
    let valuationError: string | null = null;
    try {
      dcfRes = computeDCFValuation({
        baseRevenue:           params.baseRevenue,
        revenueGrowthRate:     params.revenueGrowth,
        ebitdaMargin:          params.ebitdaMargin,
        wacc:                  params.wacc,
        taxRate:               params.taxRate,
        capexAsPercentRevenue: params.capexPct,
        terminalGrowth:        params.terminalGrowth,
        netDebt:               params.netDebt,
        sharesOutstandingCr:   params.sharesCr,
        projectionYears,
      });
    } catch (valuationErr) {
      valuationError =
        valuationErr instanceof Error ? valuationErr.message : String(valuationErr);
      console.warn(`[ModelingAgent] ⚠️ DCF refused to produce a target price — ${valuationError}`);
    }

    // Step 3: Record the generated script + inputs for audit ("show your work").
    // A failure here must not fail the valuation.
    const pythonCode = this.generatePythonModelScript(ticker, modelType, projectionYears, params);
    try {
      await pythonExecutor.execute(pythonCode, {
        runId,
        timeoutMs: 45000,
        inputs: {
          ticker,
          revenue:      params.baseRevenue,
          ebitdaMargin: params.ebitdaMargin,
          revenueGrowth: params.revenueGrowth,
          wacc:         params.wacc,
          taxRate:      params.taxRate,
          capexPct:     params.capexPct,
          terminalGrowth: params.terminalGrowth,
          netDebt:      params.netDebt,
          sharesCr:     params.sharesCr,
          projectionYears,
        },
      });
    } catch (sandboxErr) {
      console.warn("[ModelingAgent] Sandbox audit script did not run (valuation unaffected):", sandboxErr);
    }

    let modelOutput: ModelingOutput;

    if (dcfRes) {
      modelOutput = dcfRes as unknown as ModelingOutput;
    } else {
      // The engine refused these drivers. Emit an explicit "no valuation" output
      // rather than a plausible-looking number, and carry the reason through so the
      // report can state *why* there is no target price.
      modelOutput = {
        modelType: "dcf",
        baseTargetPrice: 0, // sentinel: 0 means "not available"
        bullCasePrice: 0,
        bearCasePrice: 0,
        assumptions: {
          baseRevenue: params.baseRevenue,
          wacc: `${(params.wacc * 100).toFixed(1)}%`,
          terminalGrowth: `${(params.terminalGrowth * 100).toFixed(1)}%`,
          netDebtCr: params.netDebt,
          valuationStatus: "NOT_COMPUTED",
          valuationError: valuationError ?? "Valuation inputs were insufficient.",
        },
        projections: [],
        chartUrls: [],
      } as unknown as ModelingOutput;
    }

    // If sector fallback was used, null out the target price so it is never
    // presented as authoritative data — synthesis agent will handle the gap.
    if (!dataQuality.isDerivedFromRealData) {
      console.warn(`[ModelingAgent] ⚠️ Sector fallback active — suppressing target price from report output.`);
      modelOutput = {
        ...modelOutput,
        baseTargetPrice: 0, // sentinel: 0 means "not available"
        bullCasePrice: 0,
        bearCasePrice: 0,
      };
    }

    // Inject data quality metadata into model assumptions
    modelOutput.assumptions = {
      ...modelOutput.assumptions,
      isDerivedFromExtractedData: dataQuality.isDerivedFromRealData ? "True" : "False",
      financialSource: dataQuality.financialSource,
      ...(dataQuality.disclaimer ? { disclaimer: dataQuality.disclaimer } : {}),
      // Make the discount-rate derivation auditable rather than a bare percentage.
      costOfEquity: `${((RISK_FREE_RATE_INDIA_10Y + sanitisedBeta(params.beta) * EQUITY_RISK_PREMIUM_INDIA) * 100).toFixed(1)}%`,
      waccDerivation:
        "Ke = rf + beta x ERP; Kd = rf + rating spread; WACC = Ke x E/(D+E) + Kd x (1-t) x D/(D+E). " +
        "rf is a static India 10Y assumption, not a live G-Sec fetch.",
      ...(valuationError ? { valuationError } : {}),
    };

    const priceLog = modelOutput.baseTargetPrice
      ? `Base: ₹${Math.round(modelOutput.baseTargetPrice)}/sh | Bull: ₹${Math.round(modelOutput.bullCasePrice)}/sh | Bear: ₹${Math.round(modelOutput.bearCasePrice)}/sh`
      : `No target price computed — ${valuationError ?? "insufficient inputs"}`;
    console.log(`[ModelingAgent] ✓ DCF COMPLETE → ${priceLog}`);
    console.log(`[ModelingAgent] ────────────────────────────────────────\n`);

    const output: ModelingAgentOutput = {
      ticker,
      modelOutput,
      codeExecuted: pythonCode,
      milestoneCompleted: true,
      summary: this.buildSummary(ticker, companyName, modelOutput, dataQuality),
      dataQuality,
    };

    // Update SubagentRun record in DB (if record exists)
    try {
      const runExists = await prisma.subagentRun.findUnique({ where: { id: runId } }).catch(() => null);
      if (runExists) {
        await prisma.subagentRun.update({
          where: { id: runId },
          data: {
            status: "completed",
            outputJson: output as unknown as import("@prisma/client").Prisma.JsonObject,
            latencyMs: Date.now() - startTime,
          },
        });
      }
    } catch {
      // ignore
    }

    return output;
  }

  // ─── Parameter Derivation ─────────────────────────────────────────────────────

  /**
   * Attempts to derive model parameters from real data in this order:
   * 1. Extracted financials from document agent (best)
   * 2. Live Screener.in market data (medium — gives price/market cap, not P&L)
   * 3. Sector-average fallback constants (worst — clearly flagged)
   */
  private async deriveModelParameters(
    ticker: string,
    companyName: string,
    extractedFinancials?: Record<string, unknown>
  ): Promise<{ params: DerivedModelParams; dataQuality: ModelingDataQuality }> {

    // === Path 1: Extracted financials from document agent ===
    if (extractedFinancials && Object.keys(extractedFinancials).length > 0) {
      const hasRevenue = extractedFinancials.revenue ?? extractedFinancials.sales;
      if (hasRevenue && Number(hasRevenue) > 0) {
        console.log(`[ModelingAgent] Using extracted financials from DocumentAgent.`);
        const params = this.buildParamsFromFinancials(extractedFinancials);
        return {
          params,
          dataQuality: {
            isDerivedFromRealData: true,
            financialSource: "extracted_filings",
            screenerLiveData: false,
            baseRevenue: params.baseRevenue,
            revenueSource: "Extracted from BSE/NSE filing documents",
            missingFields: this.detectMissingFields(extractedFinancials),
            disclaimer: null,
          },
        };
      }
    }

    // === Path 2: Yahoo Finance quoteSummary (free, no API key needed) ===
    console.log(`[ModelingAgent] No extracted financials from DocumentAgent — attempting Yahoo Finance quoteSummary for ${ticker}...`);
    let screenerLiveData = false;

    try {
      const yf = await fetchYahooFinancials(ticker);
      if (yf.isLiveData && yf.revenueCr !== null && yf.revenueCr > 0) {
        const record = toModelingInputRecord(yf);
        const params = this.buildParamsFromFinancials(record);
        const missingFields = this.detectMissingFields(record);
        screenerLiveData = true;

        console.log(`[ModelingAgent] ✓ Yahoo Finance data obtained for ${ticker}.`);

        return {
          params,
          dataQuality: {
            isDerivedFromRealData: true,
            financialSource: "screener_live", // keep enum value compatible with downstream
            screenerLiveData: true,
            baseRevenue: params.baseRevenue,
            revenueSource: `Yahoo Finance quoteSummary (₹${params.baseRevenue.toLocaleString("en-IN")} Cr TTM revenue)`,
            missingFields,
            disclaimer: missingFields.length > 0
              ? `Some model inputs could not be sourced from Yahoo Finance. Missing: ${missingFields.join(", ")}. Verify figures against latest annual report.`
              : null,
          },
        };
      } else {
        console.warn(`[ModelingAgent] Yahoo Finance returned no revenue for ${ticker} (isLiveData=${yf.isLiveData}, error=${yf.fetchError ?? "none"}).`);
      }
    } catch (err) {
      console.warn(`[ModelingAgent] Yahoo Finance fetch failed for ${ticker}:`, err instanceof Error ? err.message : String(err));
    }

    // === Path 2b: BSE India Official Financial Results API ===
    try {
      console.log(`[ModelingAgent] Checking BSE India official financial results for ${ticker}...`);
      const bseData = await fetchBseCompanyFinancials(ticker);
      const latestPnl = bseData.historicalSeries?.[0];
      if (latestPnl && latestPnl.revenueCr && latestPnl.revenueCr > 0) {
        const priorPnl = bseData.historicalSeries?.[1];
        const revGrowth = latestPnl.revenueCr && priorPnl?.revenueCr && priorPnl.revenueCr > 0
          ? Math.round(((latestPnl.revenueCr - priorPnl.revenueCr) / priorPnl.revenueCr) * 1000) / 1000
          : 0.12;

        const sharesDerived = bseData.currentPrice && bseData.marketCapCr
          ? Math.round((bseData.marketCapCr / bseData.currentPrice) * 100) / 100
          : undefined;

        const bseRecord: Record<string, unknown> = {
          revenue: latestPnl.revenueCr,
          sales: latestPnl.revenueCr,
          ebitda: latestPnl.ebitdaCr,
          ebitdaMargin: latestPnl.ebitdaCr ? latestPnl.ebitdaCr / latestPnl.revenueCr : undefined,
          revenueGrowth: revGrowth,
          netIncome: latestPnl.patCr,
          currentPrice: bseData.currentPrice,
          marketCapCr: bseData.marketCapCr,
          outstandingShares: sharesDerived,
          sharesCr: sharesDerived,
          peRatio: bseData.peRatio,
          _isLiveData: true,
          _source: "bse_exchange_api",
        };

        const params = this.buildParamsFromFinancials(bseRecord);
        const missingFields = this.detectMissingFields(bseRecord);

        console.log(`[ModelingAgent] ✓ BSE India official filings obtained for ${ticker} (₹${params.baseRevenue.toLocaleString("en-IN")} Cr).`);

        return {
          params,
          dataQuality: {
            isDerivedFromRealData: true,
            financialSource: "bse_exchange_api",
            screenerLiveData: true,
            baseRevenue: params.baseRevenue,
            revenueSource: `BSE India official exchange filings (₹${params.baseRevenue.toLocaleString("en-IN")} Cr audited revenue)`,
            missingFields,
            disclaimer: missingFields.length > 0
              ? `Model inputs sourced from BSE India exchange filings. Missing: ${missingFields.join(", ")}.`
              : null,
          },
        };
      }
    } catch (bseErr) {
      console.warn(`[ModelingAgent] BSE financial results check failed for ${ticker}:`, bseErr instanceof Error ? bseErr.message : String(bseErr));
    }

    // === Path 3: Sector fallback constants (last resort) ===
    console.warn(
      `[ModelingAgent] ⚠️ FALLBACK: Could not obtain real financial data for ${ticker} (${companyName}) ` +
      `from DocumentAgent, Yahoo Finance, or BSE India. Using sector-average constants. ` +
      `DCF output will be UNRELIABLE — target price is suppressed.`
    );

    const fallbackParams = {
      baseRevenue: 10000,
      revenueGrowth: 0.12,
      ebitdaMargin: 0.18,
      wacc: 0.115,
      taxRate: 0.25,
      capexPct: 0.05,
      terminalGrowth: 0.04,
      netDebt: 0,
      sharesCr: 50,
      isDerived: false,
      beta: 1.0,
    };

    return {
      params: fallbackParams,
      dataQuality: {
        isDerivedFromRealData: false,
        financialSource: "sector_fallback",
        screenerLiveData,
        baseRevenue: fallbackParams.baseRevenue,
        revenueSource: "Sector-average fallback constant (₹10,000 Cr) — NOT from actual financials",
        missingFields: ["revenue", "EBITDA", "net_debt", "shares_outstanding", "beta"],
        disclaimer:
          `⚠️ IMPORTANT: Financial model used sector-average fallback constants — actual financial figures ` +
          `for ${companyName} (${ticker}) were unavailable from BSE/NSE filings and market data feeds. ` +
          `Target price is INDICATIVE ONLY and must NOT be used for investment decisions. ` +
          `Please obtain real audited financials before use.`,
      },
    };
  }

  // ─── Parameter Builder from Extracted Financials ──────────────────────────────

  private buildParamsFromFinancials(financials: Record<string, unknown>): DerivedModelParams {
    // 1. Base Revenue (Crores)
    let baseRevenue = Number(financials.revenue ?? financials.sales ?? financials.revenueCr ?? 10000);
    if (isNaN(baseRevenue) || baseRevenue <= 0) baseRevenue = 10000;

    // 2. EBITDA Margin
    let ebitdaMargin = Number(financials.ebitdaMargin ?? 0.18);
    if (financials.ebitda && baseRevenue > 0) {
      const extractedEbitda = Number(financials.ebitda);
      if (!isNaN(extractedEbitda) && extractedEbitda > 0 && extractedEbitda <= baseRevenue) {
        ebitdaMargin = extractedEbitda / baseRevenue;
      }
    }
    if (isNaN(ebitdaMargin) || ebitdaMargin <= 0 || ebitdaMargin > 0.6) ebitdaMargin = 0.18;

    // 3. Discount rate.
    //
    // The previous line was `wacc = rf + beta * erp`, labelled "WACC". That formula is
    // the CAPM **cost of equity**; calling it WACC overstated the discount rate for any
    // company carrying debt, because it omitted the cost-of-debt term and the
    // capital-structure weights entirely. The two are now built separately and
    // combined properly:
    //
    //   Ke  = rf + beta x ERP                       (cost of equity)
    //   Kd  = rf + rating-based credit spread       (pre-tax cost of debt)
    //   WACC = Ke x E/(D+E) + Kd x (1-t) x D/(D+E)
    //
    // The risk-free rate and ERP are still static constants rather than a live India
    // 10Y G-Sec fetch, and the capital structure is the company's actual net debt
    // rather than a target D/E. Both are recorded in the assumptions so a reader can
    // see which inputs were assumptions.
    const beta = sanitisedBeta(financials.beta);
    const rf = RISK_FREE_RATE_INDIA_10Y;
    const erp = EQUITY_RISK_PREMIUM_INDIA;
    const costOfEquity = rf + beta * erp;

    const rawDebt = Number(financials.totalDebt ?? financials.debt ?? 0);
    const rawCash = Number(financials.cash ?? 0);
    const grossDebt = !isNaN(rawDebt) && rawDebt > 0 ? rawDebt : 0;
    const cashForStructure = !isNaN(rawCash) && rawCash > 0 ? rawCash : 0;

    // Credit spread by rating grade; unrated companies fall back to a documented
    // investment-grade-equivalent spread rather than pretending to be AAA.
    const spread = creditSpreadForRating(financials.creditRating);
    const costOfDebt = rf + spread;

    // Weights use net debt on the debt side, floored at zero so a net-cash company
    // is not assigned negative leverage.
    const leverageBase = Math.max(0, grossDebt - cashForStructure);
    const totalCapital = leverageBase + baseRevenue; // equity proxied by market-scale revenue
    const debtWeight = totalCapital > 0 ? leverageBase / totalCapital : 0;
    const equityWeight = 1 - debtWeight;
    const taxForWacc = 0.25;
    const wacc = Math.min(
      0.30,
      Math.max(0.08, equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxForWacc)),
    );

    // 4. Revenue Growth Rate
    let revenueGrowth = Number(financials.revenueGrowth ?? financials.revenueGrowthYoY ?? financials.salesGrowth ?? 0.12);
    if (isNaN(revenueGrowth) || revenueGrowth <= 0 || revenueGrowth > 0.4) revenueGrowth = 0.12;

    // 5. Net Debt & Outstanding Shares
    const debt = Number(financials.totalDebt ?? financials.debt ?? 0);
    const cash = Number(financials.cash ?? 0);
    // Net debt may legitimately be NEGATIVE (net cash). It was previously clamped to
    // `Math.max(0, ...)`, which threw away the cash pile for every cash-rich company
    // — IT majors typically hold more cash than debt — and valued them as though they
    // had neither. A negative net debt increases equity value by exactly that amount,
    // so it must be carried through. The DCF engine splits it into baseDebt/baseCash.
    const netDebt =
      !isNaN(debt) && !isNaN(cash) ? debt - cash : 0;

    let shares = Number(financials.outstandingShares ?? financials.shares ?? financials.sharesCr ?? 0);
    // Real calculation: derive shares from Market Cap / CMP if not explicitly provided
    if ((isNaN(shares) || shares <= 0) && financials.marketCapCr && financials.currentPrice) {
      const mcap = Number(financials.marketCapCr);
      const cmp = Number(financials.currentPrice);
      if (mcap > 0 && cmp > 0) {
        shares = Math.round((mcap / cmp) * 100) / 100;
      }
    }
    // A fabricated share count is not a fallback: it silently scales every per-share
    // number, including the target price. Leave it at 0 so the DCF engine rejects the
    // valuation outright and nothing is published.
    const sharesCr = !isNaN(shares) && shares > 0 ? shares : 0;

    // Real Capex as % of Revenue
    let capexPct = 0.05;
    if (financials.capex && baseRevenue > 0) {
      const c = Number(financials.capex);
      if (!isNaN(c) && c > 0) {
        capexPct = Math.max(0.02, Math.min(0.20, c / baseRevenue));
      }
    }

    return { baseRevenue, revenueGrowth, ebitdaMargin, wacc, taxRate: 0.25, capexPct, terminalGrowth: 0.04, netDebt, sharesCr, isDerived: true, beta };
  }

  private detectMissingFields(financials: Record<string, unknown>): string[] {
    const missing: string[] = [];
    if (!financials.revenue && !financials.sales) missing.push("revenue");
    if (!financials.ebitda && !financials.ebitdaMargin) missing.push("EBITDA");
    if (!financials.beta) missing.push("beta");
    if (!financials.outstandingShares && !financials.shares) missing.push("shares_outstanding");
    if (!financials.totalDebt && !financials.debt) missing.push("net_debt");
    return missing;
  }

  // ─── Python Script Generator ──────────────────────────────────────────────────

  private generatePythonModelScript(
    ticker: string,
    modelType: string,
    projectionYears: number,
    params: ReturnType<typeof this.buildParamsFromFinancials>
  ): string {
    // Compute current Indian fiscal year base (FY runs Apr–Mar)
    const now = new Date();
    const baseFY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

    return `
# EquiGen Dynamic Valuation Engine (SEBI Compliant)
# Company: ${ticker} | Model: ${modelType} | Projection Window: ${projectionYears} Years
# isDerivedFromExtractedData: ${params.isDerived}

import json

def run_dcf_model(
    base_revenue=${params.baseRevenue},
    years=${projectionYears},
    growth=${params.revenueGrowth},
    margin=${params.ebitdaMargin},
    wacc=${params.wacc},
    tax=${params.taxRate},
    capex_pct=${params.capexPct},
    tgr=${params.terminalGrowth},
    net_debt=${params.netDebt},
    shares=${params.sharesCr}
):
    pv_sum = 0
    cur_rev = base_revenue
    projections = []
    BASE_FY = ${baseFY}

    for yr in range(1, years + 1):
        cur_rev *= (1 + growth)
        ebitda = cur_rev * margin
        ebit = ebitda * 0.85
        fcff = ebit * (1 - tax) - (cur_rev * capex_pct)
        pv = fcff / ((1 + wacc) ** yr)
        pv_sum += pv
        projections.append({
            "year": f"FY{BASE_FY + yr}",
            "revenue": round(cur_rev, 2),
            "ebitda": round(ebitda, 2),
            "fcff": round(fcff, 2)
        })

    last_f = projections[-1]["fcff"]
    tv = (last_f * (1 + tgr)) / (wacc - tgr)
    pv_tv = tv / ((1 + wacc) ** years)
    eq_val = pv_sum + pv_tv - net_debt
    target_price = round(max(1, eq_val / shares), 2)

    return {
        "modelType": "${modelType}",
        "baseTargetPrice": target_price,
        "bullCasePrice": round(target_price * 1.25, 2),
        "bearCasePrice": round(target_price * 0.78, 2),
        "projections": projections,
        "assumptions": {
            "wacc": f"{round(wacc * 100, 2)}%",
            "terminalGrowth": f"{round(tgr * 100, 2)}%",
            "revenueGrowth": f"{round(growth * 100, 2)}%",
            "ebitdaMargin": f"{round(margin * 100, 2)}%",
            "isDerivedFromExtractedData": ${params.isDerived ? "True" : "False"}
        }
    }

if __name__ == "__main__":
    result = run_dcf_model()
    print(json.dumps(result))
`.trim();
  }

  private buildSummary(ticker: string, companyName: string, output: ModelingOutput, quality: ModelingDataQuality): string {
    const dataNote = quality.isDerivedFromRealData
      ? `✓ Model inputs sourced from: ${quality.financialSource}`
      : `⚠️ Model used sector-average fallback constants — target price is INDICATIVE only`;

    return [
      `Quantitative Valuation Model Complete for ${ticker} (${companyName}):`,
      `• Model Type: ${output.modelType.toUpperCase()}`,
      `• Base Case Target Price: ₹${output.baseTargetPrice}/share`,
      `• Bull Case Target Price: ₹${output.bullCasePrice}/share`,
      `• Bear Case Target Price: ₹${output.bearCasePrice}/share`,
      `• WACC: ${output.assumptions?.wacc ?? "11.5%"} | Terminal Growth: ${output.assumptions?.terminalGrowth ?? "4.0%"}`,
      `• Data Quality: ${dataNote}`,
      output.sensitivityMatrix ? `• 5x5 Sensitivity Matrix generated` : "",
      output.monteCarlo
        ? `• Monte Carlo (1,000 runs): Median ₹${output.monteCarlo.medianTargetPrice}/share`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
}

export const modelingAgent = new ModelingAgent();

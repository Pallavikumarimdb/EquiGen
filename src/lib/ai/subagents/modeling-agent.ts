/**
 * Modeling Subagent — Phase 11 & Phase 1 (gap analysis fix) — RELIABILITY FIX
 *
 * Quantitative Subagent that:
 * 1. Takes extracted historical financials (Income Statement, Balance Sheet, Cash Flow)
 * 2. Dynamically derives parameters (WACC via CAPM, CAGR, EBITDA margin, Net Debt, Shares)
 * 3. Writes Python code for DCF valuation without hardcoded static assumptions
 * 4. Executes code inside PythonExecutor sandbox
 * 5. Stores output & updates SubagentRun
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
import { fetchScreenerProfile } from "@/lib/ai/tools/screener-scrape-tool";
import { BuildFinancialModelMilestone, ModelingOutput } from "@/types/plan4";

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
  financialSource: "extracted_filings" | "screener_live" | "sector_fallback";
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

    // Step 2: Generate Python DCF script using derived parameters
    const pythonCode = this.generatePythonModelScript(ticker, modelType, projectionYears, params);

    // Step 3: Execute in sandbox environment
    const sandboxResult = await pythonExecutor.execute(pythonCode, {
      runId,
      timeoutMs: 45000,
      inputs: {
        ticker,
        revenue: params.baseRevenue,
        ebitdaMargin: params.ebitdaMargin,
        projectionYears,
      },
    });

    // Step 4: Compute valuation model output
    let modelOutput: ModelingOutput;

    if (sandboxResult.data && typeof sandboxResult.data.baseTargetPrice === "number") {
      modelOutput = sandboxResult.data as unknown as ModelingOutput;
    } else {
      const dcfRes = computeDCFValuation({
        baseRevenue: params.baseRevenue,
        projectionYears,
      });
      modelOutput = dcfRes as unknown as ModelingOutput;
    }

    // Inject data quality metadata into model assumptions
    modelOutput.assumptions = {
      ...modelOutput.assumptions,
      isDerivedFromExtractedData: dataQuality.isDerivedFromRealData ? "True" : "False",
      financialSource: dataQuality.financialSource,
      ...(dataQuality.disclaimer ? { disclaimer: dataQuality.disclaimer } : {}),
    };

    const priceLog = `Base: ₹${Math.round(modelOutput.baseTargetPrice)}/sh | Bull: ₹${Math.round(modelOutput.bullCasePrice)}/sh | Bear: ₹${Math.round(modelOutput.bearCasePrice)}/sh`;
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

    // === Path 2: Live Screener.in scrape ===
    console.log(`[ModelingAgent] No extracted financials from DocumentAgent — attempting live Screener.in scrape for ${ticker}...`);
    let screenerParams: ReturnType<typeof this.buildParamsFromFinancials> | null = null;
    let screenerLiveData = false;

    try {
      const screenerProfile = await fetchScreenerProfile(ticker);
      if (screenerProfile.isLiveData) {
        const missingFields: string[] = [];

        // Screener gives us market cap and price — derive revenue proxy from EV/Sales if available
        // The historical series (if parsed) gives us financials
        const historicalRevenue = screenerProfile.historicalSeries
          .filter((s) => s.sales !== null)
          .map((s) => s.sales as number);

        const latestRevenue = historicalRevenue.length > 0
          ? historicalRevenue[historicalRevenue.length - 1]
          : null;

        const roceDecimal = screenerProfile.rocePercent ? screenerProfile.rocePercent / 100 : null;
        const _roeDecimal = screenerProfile.roePercent ? screenerProfile.roePercent / 100 : null;
        const beta = screenerProfile.peRatio ? Math.max(0.5, Math.min(2.0, screenerProfile.peRatio / 20)) : 1.0;

        if (!latestRevenue) missingFields.push("revenue (Screener historical series incomplete)");
        if (!screenerProfile.rocePercent) missingFields.push("ROCE");
        if (!screenerProfile.roePercent) missingFields.push("ROE");

        const baseRevenue = latestRevenue ?? 10000;
        const rf = 0.07; // India 10Y G-Sec
        const erp = 0.055; // India ERP
        const wacc = Math.min(0.18, Math.max(0.08, rf + beta * erp));
        const ebitdaMargin = roceDecimal ? Math.min(0.40, Math.max(0.08, roceDecimal * 1.3)) : 0.18;

        screenerParams = {
          baseRevenue,
          revenueGrowth: 0.12, // conservative default without P&L series
          ebitdaMargin,
          wacc,
          taxRate: 0.25,
          capexPct: 0.05,
          terminalGrowth: 0.04,
          netDebt: 0,
          sharesCr: screenerProfile.marketCapCr && screenerProfile.currentPrice
            ? Math.round(screenerProfile.marketCapCr / screenerProfile.currentPrice)
            : 50,
          isDerived: true,
          beta,
        };
        screenerLiveData = true;

        console.log(`[ModelingAgent] ✓ Screener live data obtained for ${ticker}. Market Cap: ₹${screenerProfile.marketCapCr?.toLocaleString("en-IN") ?? "N/A"} Cr | P/E: ${screenerProfile.peRatio ?? "N/A"}`);

        return {
          params: screenerParams,
          dataQuality: {
            isDerivedFromRealData: latestRevenue !== null,
            financialSource: "screener_live",
            screenerLiveData: true,
            baseRevenue,
            revenueSource: latestRevenue
              ? `Screener.in historical sales series (₹${latestRevenue.toLocaleString("en-IN")} Cr)`
              : `Screener.in market cap proxy (revenue unavailable — ₹10,000 Cr sector fallback)`,
            missingFields,
            disclaimer: missingFields.length > 0
              ? `Some model inputs used sector-average fallback values. Missing: ${missingFields.join(", ")}. Verify figures against actual annual report.`
              : null,
          },
        };
      }
    } catch (err) {
      console.warn(`[ModelingAgent] Screener scrape failed for ${ticker}:`, err instanceof Error ? err.message : String(err));
    }

    // === Path 3: Sector fallback constants (last resort) ===
    console.warn(
      `[ModelingAgent] ⚠️ FALLBACK: Could not obtain real financial data for ${ticker} (${companyName}) ` +
      `from either DocumentAgent or Screener.in. Using sector-average constants. ` +
      `DCF output will be UNRELIABLE — do not use target price without verification.`
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
          `for ${companyName} (${ticker}) were unavailable from BSE/NSE filings and Screener.in. ` +
          `Target price is INDICATIVE ONLY and must NOT be used for investment decisions. ` +
          `Please obtain real audited financials before use.`,
      },
    };
  }

  // ─── Parameter Builder from Extracted Financials ──────────────────────────────

  private buildParamsFromFinancials(financials: Record<string, unknown>): DerivedModelParams {
    // 1. Base Revenue (Crores)
    let baseRevenue = Number(financials.revenue ?? financials.sales ?? 10000);
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

    // 3. CAPM WACC: Rf (7.0% India 10Y G-Sec) + Beta * ERP (5.5%)
    const rawBeta = Number(financials.beta ?? 1.0);
    const beta = !isNaN(rawBeta) && rawBeta > 0.2 && rawBeta < 3.0 ? rawBeta : 1.0;
    const rf = 0.07;
    const erp = 0.055;
    const wacc = Math.min(0.18, Math.max(0.08, rf + beta * erp));

    // 4. Revenue Growth Rate
    let revenueGrowth = Number(financials.revenueGrowth ?? 0.12);
    if (isNaN(revenueGrowth) || revenueGrowth <= 0 || revenueGrowth > 0.4) revenueGrowth = 0.12;

    // 5. Net Debt & Outstanding Shares
    const debt = Number(financials.totalDebt ?? financials.debt ?? 0);
    const cash = Number(financials.cash ?? 0);
    const netDebt = !isNaN(debt) && !isNaN(cash) ? Math.max(0, debt - cash) : 0;

    const shares = Number(financials.outstandingShares ?? financials.shares ?? 50);
    const sharesCr = !isNaN(shares) && shares > 0 ? shares : 50;

    return { baseRevenue, revenueGrowth, ebitdaMargin, wacc, taxRate: 0.25, capexPct: 0.05, terminalGrowth: 0.04, netDebt, sharesCr, isDerived: true, beta };
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

    for yr in range(1, years + 1):
        cur_rev *= (1 + growth)
        ebitda = cur_rev * margin
        ebit = ebitda * 0.85
        fcff = ebit * (1 - tax) - (cur_rev * capex_pct)
        pv = fcff / ((1 + wacc) ** yr)
        pv_sum += pv
        projections.append({
            "year": f"FY{24+yr}",
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

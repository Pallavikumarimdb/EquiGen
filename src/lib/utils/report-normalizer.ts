import { EquityResearchData, FiveYearSummaryData } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeEquityResearchData(raw: any): EquityResearchData {
  if (!raw) {
    return null as unknown as EquityResearchData;
  }

  // Extract sections if raw is an autonomous report payload containing sections array
  const sections: Array<{ name: string; content: string }> = Array.isArray(raw.sections) ? raw.sections : [];
  const findSec = (name: string) => sections.find((s) => s.name === name)?.content || "";

  const execSummaryText = findSec("executive_summary") || raw.executiveSummary || "";
  const bizDescText = findSec("business_description") || raw.businessOverview || "";
  const finAnalysisText = findSec("financial_analysis") || raw.narrativeSummary || "";
  const valAnalysisText = findSec("valuation") || raw.valuationAnalysis || "";
  const risksText = findSec("key_risks") || (Array.isArray(raw.investmentRisks) ? raw.investmentRisks.join("\n") : "");

  // Extract modeling data if available
  const modelingData = raw.modelingData || {};
  const assumptions = modelingData?.assumptions || {};

  const companyName = raw.companyName || raw.company?.name || "Target Company";
  const ticker = raw.ticker || raw.company?.ticker || "TICKER";

  // Official real metric extraction — strictly real DCF model output (handling negative DCF for distressed/debt-heavy equity)
  const rawBaseTarget =
    typeof modelingData?.baseTargetPrice === "number"
      ? modelingData.baseTargetPrice
      : typeof raw.recommendation?.targetPrice === "number"
      ? raw.recommendation.targetPrice
      : null;

  const baseTargetPrice = rawBaseTarget != null ? Math.round(rawBaseTarget * 10) / 10 : null;

  const pe =
    typeof assumptions.pe === "number"
      ? assumptions.pe
      : typeof raw.companyData?.pe === "number"
      ? raw.companyData.pe
      : typeof assumptions.peRatio === "number"
      ? assumptions.peRatio
      : null;

  const evEbitda =
    typeof assumptions.evEbitda === "number"
      ? assumptions.evEbitda
      : typeof raw.companyData?.evEbitda === "number"
      ? raw.companyData.evEbitda
      : null;

  const roe =
    typeof assumptions.roe === "number"
      ? assumptions.roe
      : typeof raw.companyData?.roe === "number"
      ? raw.companyData.roe
      : typeof assumptions.roePercent === "number"
      ? assumptions.roePercent
      : null;

  const deRatio =
    typeof assumptions.deRatio === "number"
      ? assumptions.deRatio
      : typeof raw.companyData?.deRatio === "number"
      ? raw.companyData.deRatio
      : null;

  const beta =
    typeof assumptions.beta === "number"
      ? assumptions.beta
      : typeof raw.companyData?.beta === "number"
      ? raw.companyData.beta
      : null;

  const marketCap =
    typeof raw.companyData?.marketCap === "number"
      ? raw.companyData.marketCap
      : typeof assumptions.marketCap === "number"
      ? assumptions.marketCap
      : typeof assumptions.marketCapCr === "number"
      ? assumptions.marketCapCr
      : null;

  const highLow52W =
    typeof raw.companyData?.highLow52W === "string"
      ? raw.companyData.highLow52W
      : typeof assumptions.highLow52W === "string"
      ? assumptions.highLow52W
      : null;

  const currentPrice =
    typeof raw.recommendation?.currentPrice === "number"
      ? raw.recommendation.currentPrice
      : typeof assumptions.currentPrice === "number"
      ? assumptions.currentPrice
      : null;

  const targetPrice = baseTargetPrice;
  const cmp = currentPrice;

  const upside =
    raw.recommendation?.upsidePotential != null
      ? raw.recommendation.upsidePotential
      : cmp != null && targetPrice != null && cmp > 0
      ? parseFloat((((targetPrice - cmp) / cmp) * 100).toFixed(1))
      : null;

  // Deriving rating accurately from fundamental valuation gap:
  let derivedRating: string | null = null;
  if (raw.recommendation?.rating) {
    derivedRating = raw.recommendation.rating;
  } else if (targetPrice != null && cmp != null && cmp > 0) {
    if (upside !== null) {
      if (upside < -20 || targetPrice <= 0) derivedRating = "SELL";
      else if (upside < -5) derivedRating = "REDUCE";
      else if (upside <= 10) derivedRating = "HOLD";
      else if (upside <= 20) derivedRating = "ACCUMULATE";
      else derivedRating = "BUY";
    }
  }
  const rating = derivedRating;

  // Company Data block — strictly null if real metric was not fetched
  const companyData = {
    marketCap,
    highLow52W,
    enterpriseValue: raw.companyData?.enterpriseValue ?? (typeof assumptions.enterpriseValue === "number" ? assumptions.enterpriseValue : null),
    outstandingShares: raw.companyData?.outstandingShares ?? (typeof assumptions.sharesCr === "number" ? assumptions.sharesCr : null),
    freeFloat: raw.companyData?.freeFloat || null,
    dividendYield: raw.companyData?.dividendYield || (typeof assumptions.dividendYield === "number" ? `${assumptions.dividendYield}%` : null),
    beta,
    pe,
    evEbitda,
    roe,
    deRatio,
  };

  // 5-Year Summary block — strictly derived from quantitative modeling projections + filings
  const projections: Array<{ year?: string; revenue?: number; ebitda?: number; pat?: number; ebit?: number; cfo?: number; fcff?: number; capex?: number }> =
    Array.isArray(modelingData?.projections) ? modelingData.projections : [];

  let fiveYearSummary: FiveYearSummaryData[] = [];
  if (Array.isArray(raw.fiveYearSummary) && raw.fiveYearSummary.length > 1) {
    fiveYearSummary = raw.fiveYearSummary;
  } else if (projections.length > 0) {
    // Generate full historical + 5-year forecasted progression
    const ttmSales = typeof assumptions.revenue === "number" ? assumptions.revenue : (raw.companyData?.sales ?? (raw.companyData?.revenue ?? null));
    const ttmEbitda = typeof assumptions.ebitda === "number" ? assumptions.ebitda : null;
    const ttmMargin = ttmSales && ttmEbitda ? Math.round((ttmEbitda / ttmSales) * 1000) / 10 : null;
    const ttmPat = typeof assumptions.pat === "number" ? assumptions.pat : (pe && marketCap ? Math.round(marketCap / pe) : null);

    const ttmRow: FiveYearSummaryData = {
      period: "TTM",
      sales: ttmSales,
      ebitda: ttmEbitda,
      ebitdaMargin: ttmMargin != null ? `${ttmMargin}%` : null,
      patAdjusted: ttmPat,
      pe,
      evEbitda,
      roe: roe != null ? `${roe}%` : null,
      deRatio: deRatio != null ? String(deRatio) : null,
    };

    const currentYear = new Date().getFullYear();
    const projRows: FiveYearSummaryData[] = projections.map((p, idx) => {
      const yearLabel = `FY${(currentYear + idx + 1).toString().slice(-2)}E`;
      const prevRev = idx === 0 ? (ttmSales || p.revenue) : projections[idx - 1].revenue;
      const revGrowth = prevRev && p.revenue ? parseFloat((((p.revenue - prevRev) / prevRev) * 100).toFixed(1)) : null;
      const margin = p.revenue && p.ebitda ? parseFloat(((p.ebitda / p.revenue) * 100).toFixed(1)) : null;
      const prevPat = idx === 0 ? ttmPat : projections[idx - 1].pat;
      const patGrowth = prevPat && p.pat ? parseFloat((((p.pat - prevPat) / Math.abs(prevPat)) * 100).toFixed(1)) : null;
      const pShares = typeof assumptions.sharesCr === "number" && assumptions.sharesCr > 0 ? assumptions.sharesCr : null;
      const adjEps = pShares && p.pat != null ? parseFloat((p.pat / pShares).toFixed(2)) : null;
      const pPe = marketCap && p.pat && p.pat > 0 ? parseFloat((marketCap / p.pat).toFixed(1)) : null;
      const pEvEbitda = assumptions.enterpriseValue && p.ebitda && p.ebitda > 0 ? parseFloat((Number(assumptions.enterpriseValue) / p.ebitda).toFixed(1)) : null;

      return {
        period: yearLabel,
        sales: p.revenue ? Math.round(p.revenue) : null,
        salesGrowth: revGrowth != null ? `${revGrowth}%` : null,
        ebitda: p.ebitda ? Math.round(p.ebitda) : null,
        ebitdaMargin: margin != null ? `${margin}%` : null,
        patAdjusted: p.pat ? Math.round(p.pat) : null,
        patGrowth: patGrowth != null ? `${patGrowth}%` : null,
        adjEps,
        pe: pPe,
        evEbitda: pEvEbitda,
        roe: roe != null ? `${roe}%` : null,
        deRatio: deRatio != null ? String(deRatio) : null,
      };
    });

    fiveYearSummary = [ttmRow, ...projRows];
  } else if (Array.isArray(raw.fiveYearSummary) && raw.fiveYearSummary.length > 0) {
    fiveYearSummary = raw.fiveYearSummary;
  } else if (pe != null || marketCap != null || roe != null || evEbitda != null) {
    fiveYearSummary = [
      {
        period: "TTM",
        sales: typeof assumptions.revenue === "number" ? assumptions.revenue : null,
        ebitda: typeof assumptions.ebitda === "number" ? assumptions.ebitda : null,
        pe,
        evEbitda,
        roe,
        deRatio,
      },
    ];
  }

  // Investment Risks
  let investmentRisks = Array.isArray(raw.investmentRisks) && raw.investmentRisks.length > 0 ? raw.investmentRisks : [];
  if (investmentRisks.length === 0 && risksText) {
    investmentRisks = risksText
      .split("\n")
      .filter((l: string) => l.trim().startsWith("-") || l.trim().startsWith("*") || /^\d+\./.test(l.trim()))
      .map((l: string) => l.replace(/^[-*\d.]+\s*/, "").replace(/\*\*/g, "").trim())
      .filter(Boolean);
  }

  // SWOT Analysis — synthesized from section narratives if not present
  let swotAnalysis = raw.swotAnalysis || null;
  if (!swotAnalysis || (!swotAnalysis.strengths?.length && !swotAnalysis.weaknesses?.length)) {
    const extractBullets = (text: string, max = 3): string[] => {
      if (!text) return [];
      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("-") || l.startsWith("*") || /^\d+\./.test(l))
        .map((l) => l.replace(/^[-*\d.]+\s*/, "").replace(/\*\*/g, "").trim())
        .filter((l) => l.length > 15 && l.length < 240);
      if (lines.length > 0) return lines.slice(0, max);

      const sentences = text
        .replace(/\n+/g, " ")
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.replace(/\*\*/g, "").trim())
        .filter((s) => s.length > 25 && s.length < 180 && !s.toLowerCase().includes("disclaimer") && !s.toLowerCase().includes("user safety"));
      return sentences.slice(0, max);
    };

    const sBullets = extractBullets(bizDescText, 3);
    const wBullets = extractBullets(finAnalysisText, 3);
    const oBullets = extractBullets(execSummaryText, 3);
    const tBullets = investmentRisks.length > 0 ? investmentRisks.slice(0, 3) : extractBullets(risksText, 3);

    swotAnalysis = {
      strengths: sBullets.length > 0 ? sBullets : [`Market positioning in ${raw.company?.sector || "core business segments"}.`, `Disclosed operating revenue base for ${companyName}.`],
      weaknesses: wBullets.length > 0 ? wBullets : [`Operating margin sensitivity under input cost variations.`, `Earnings conversion variability across reporting periods.`],
      opportunities: oBullets.length > 0 ? oBullets : [`Market expansion and demand growth in target industry segments.`, `Operating efficiency gains from ongoing scale.`],
      threats: tBullets.length > 0 ? tBullets : [`Sector competitive dynamics and macro regulatory developments.`, `Input pricing pressures across supply chains.`],
    };
  }

  // Detailed Financials — synthesize structured statements for 3-statement model & PDF SVG charts
  let detailedFinancials = raw.detailedFinancials || null;
  if ((!detailedFinancials || (Array.isArray(detailedFinancials) && detailedFinancials.length === 0)) && fiveYearSummary.length > 0) {
    const periods = fiveYearSummary.map((f) => f.period);
    const incRows: Record<string, string | number | null>[] = [
      {
        metric: "Sales",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.sales ?? "-"])),
      },
      {
        metric: "EBITDA",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.ebitda ?? "-"])),
      },
      {
        metric: "EBITDA Margin (%)",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.ebitdaMargin ?? "-"])),
      },
      {
        metric: "Reported PAT",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.patAdjusted ?? "-"])),
      },
      {
        metric: "Adjusted PAT",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.patAdjusted ?? "-"])),
      },
      {
        metric: "Adjusted EPS",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.adjEps ?? "-"])),
      },
    ];

    const bsLines = raw.companyData?.balanceSheetLines || assumptions.balanceSheetLines || {};
    const bsRows: Record<string, string | number | null>[] = [
      {
        metric: "Total Assets",
        ...Object.fromEntries(periods.map((p) => [p, bsLines.totalAssetsCr ?? "-"])),
      },
      {
        metric: "Total Equity / Net Worth",
        ...Object.fromEntries(periods.map((p) => [p, bsLines.totalShareholdersEquityCr ?? assumptions.equityValueCr ?? assumptions.equityValue ?? "-"])),
      },
      {
        metric: "Total Borrowings / Debt",
        ...Object.fromEntries(periods.map((p) => [p, assumptions.totalDebtCr ?? assumptions.totalDebt ?? "-"])),
      },
      {
        metric: "Net Debt",
        ...Object.fromEntries(periods.map((p) => [p, assumptions.netDebtCr ?? assumptions.netDebt ?? "-"])),
      },
      {
        metric: "Current Assets",
        ...Object.fromEntries(periods.map((p) => [p, bsLines.totalCurrentAssetsCr ?? "-"])),
      },
      {
        metric: "Current Liabilities",
        ...Object.fromEntries(periods.map((p) => [p, bsLines.totalCurrentLiabilitiesCr ?? "-"])),
      },
    ];

    const currentYear = new Date().getFullYear();
    const ttmCfo = typeof assumptions.cfo === "number" ? assumptions.cfo : (raw.companyData?.operatingCashflowCr ?? raw.companyData?.cfo ?? null);
    const ttmFcf = typeof assumptions.fcf === "number" ? assumptions.fcf : (raw.companyData?.freeCashflowCr ?? raw.companyData?.fcf ?? null);
    const ttmCapex = typeof assumptions.capex === "number" ? assumptions.capex : (raw.companyData?.capexCr ?? raw.companyData?.capex ?? null);

    const cfRows: Record<string, string | number | null>[] = [
      {
        metric: "Operating Cash Flow",
        TTM: ttmCfo != null ? Math.round(ttmCfo) : "-",
        ...Object.fromEntries(projections.map((p, idx) => [`FY${(currentYear + idx + 1).toString().slice(-2)}E`, p.cfo ? Math.round(p.cfo) : "-"])),
      },
      {
        metric: "Capital Expenditure (Capex)",
        TTM: ttmCapex != null ? Math.round(ttmCapex) : "-",
        ...Object.fromEntries(projections.map((p, idx) => [`FY${(currentYear + idx + 1).toString().slice(-2)}E`, p.capex ? Math.round(p.capex) : "-"])),
      },
      {
        metric: "Free Cash Flow to Firm",
        TTM: ttmFcf != null ? Math.round(ttmFcf) : "-",
        ...Object.fromEntries(projections.map((p, idx) => [`FY${(currentYear + idx + 1).toString().slice(-2)}E`, p.fcff ? Math.round(p.fcff) : "-"])),
      },
    ];

    const ratioRows: Record<string, string | number | null>[] = [
      {
        metric: "P/E (x)",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.pe ?? "-"])),
      },
      {
        metric: "EV/EBITDA",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.evEbitda ?? "-"])),
      },
      {
        metric: "ROE (%)",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.roe ?? "-"])),
      },
      {
        metric: "D/E Ratio",
        ...Object.fromEntries(fiveYearSummary.map((f) => [f.period, f.deRatio ?? "-"])),
      },
    ];

    detailedFinancials = {
      incomeStatement: incRows,
      balanceSheet: bsRows,
      cashFlow: cfRows,
      ratios: ratioRows,
    };
  }

  return {
    ...raw,
    company: {
      name: companyName,
      ticker,
      sector: raw.company?.sector || "Equity Research",
      industry: raw.company?.industry || "Capital Markets",
      reportDate: raw.company?.reportDate || new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    },
    recommendation: {
      rating,
      currentPrice: cmp,
      targetPrice,
      upsidePotential: upside,
      rationale: raw.recommendation?.rationale || [
        execSummaryText.slice(0, 180) + (execSummaryText.length > 180 ? "..." : ""),
        targetPrice != null ? `Target Price: ₹${targetPrice} based on quantitative valuation engine.` : "Target price pending official financial disclosures.",
      ].filter(Boolean),
    },
    companyData,
    executiveSummary: execSummaryText || raw.executiveSummary || "",
    businessOverview: bizDescText || raw.businessOverview || "",
    narrativeSummary: finAnalysisText || raw.narrativeSummary || "",
    valuationAnalysis: valAnalysisText || raw.valuationAnalysis || "",
    investmentRisks,
    swotAnalysis,
    fiveYearSummary,
    detailedFinancials,
    keyFinancials: raw.keyFinancials || {
      incomeStatement: [],
      balanceSheet: [],
      cashFlow: [],
    },
    sections,
    sourceType: raw.sourceType || (sections.length > 0 ? "autonomous" : undefined),
    forensicAnalysis: raw.forensicAnalysis || null,
    financialAudit: raw.financialAudit || null,
    consistencyCheck: raw.consistencyCheck ?? null,
    complianceAudit: raw.complianceAudit ?? null,
    dataFetchedAt: raw.dataFetchedAt ?? null,
    dataAsOf: raw.dataAsOf ?? null,
    dataSources: raw.dataSources ?? null,
  };
}

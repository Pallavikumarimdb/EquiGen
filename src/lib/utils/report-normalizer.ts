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

  // Official real metric extraction — strictly null if unprovided, NEVER fabricated dummy constants
  const baseTargetPrice =
    typeof modelingData?.baseTargetPrice === "number" && modelingData.baseTargetPrice > 0
      ? modelingData.baseTargetPrice
      : typeof raw.recommendation?.targetPrice === "number" && raw.recommendation.targetPrice > 0
      ? raw.recommendation.targetPrice
      : null;

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

  const rating =
    raw.recommendation?.rating ||
    (targetPrice != null && cmp != null ? (targetPrice <= cmp ? "HOLD" : upside != null && upside > 15 ? "BUY" : "ACCUMULATE") : null);

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

  // 5-Year Summary block — strictly real data if available
  const fiveYearSummary: FiveYearSummaryData[] =
    Array.isArray(raw.fiveYearSummary) && raw.fiveYearSummary.length > 0
      ? raw.fiveYearSummary
      : Array.isArray(raw.historicalSeries) && raw.historicalSeries.length > 0
      ? raw.historicalSeries
      : [];

  // Investment Risks
  let investmentRisks = Array.isArray(raw.investmentRisks) && raw.investmentRisks.length > 0 ? raw.investmentRisks : [];
  if (investmentRisks.length === 0 && risksText) {
    investmentRisks = risksText
      .split("\n")
      .filter((l: string) => l.trim().startsWith("-") || l.trim().startsWith("*") || /^\d+\./.test(l.trim()))
      .map((l: string) => l.replace(/^[-*\d.]+\s*/, "").trim())
      .filter(Boolean);
  }

  // SWOT Analysis
  const swotAnalysis = raw.swotAnalysis || null;

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
    keyFinancials: raw.keyFinancials || {
      incomeStatement: [],
      balanceSheet: [],
      cashFlow: [],
    },
    sections,
    sourceType: raw.sourceType || (sections.length > 0 ? "autonomous" : undefined),
  };
}

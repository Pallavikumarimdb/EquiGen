/**
 * Unit tests for report-normalizer.ts
 */

import { describe, it, expect } from "vitest";
import { normalizeEquityResearchData } from "@/lib/utils/report-normalizer";

describe("normalizeEquityResearchData", () => {
  it("returns null when input is null or undefined", () => {
    expect(normalizeEquityResearchData(null)).toBeNull();
    expect(normalizeEquityResearchData(undefined)).toBeNull();
  });

  it("normalizes autonomous agent raw payload with sections array", () => {
    const raw = {
      companyName: "Infosys Ltd",
      ticker: "INFY",
      sections: [
        { name: "executive_summary", content: "Strong digital transformation pipeline." },
        { name: "business_description", content: "Leading Indian IT services exporter." },
        { name: "financial_analysis", content: "Consistent 20%+ operating margins." },
        { name: "valuation", content: "DCF model yields ₹2,100 per share." },
        { name: "key_risks", content: "- High attrition in tech\n- BFSI slowdown in US\n- Currency volatility" },
      ],
      modelingData: {
        baseTargetPrice: 2100,
        assumptions: {
          currentPrice: 1850,
          pe: 26.5,
          evEbitda: 18.2,
          roe: 31.4,
          beta: 0.9,
          marketCapCr: 750000,
        },
      },
      fiveYearSummary: [
        { period: "FY24", sales: 153670, ebitda: 36000, pat: 26248, eps: 63.4 },
        { period: "FY23", sales: 146767, ebitda: 35131, pat: 24095, eps: 57.6 },
      ],
    };

    const normalized = normalizeEquityResearchData(raw);

    expect(normalized.company.name).toBe("Infosys Ltd");
    expect(normalized.company.ticker).toBe("INFY");
    expect(normalized.executiveSummary).toBe("Strong digital transformation pipeline.");
    expect(normalized.businessOverview).toBe("Leading Indian IT services exporter.");
    expect(normalized.recommendation.targetPrice).toBe(2100);
    expect(normalized.recommendation.currentPrice).toBe(1850);
    expect(normalized.recommendation.upsidePotential).toBeCloseTo(13.5, 1);
    expect(normalized.recommendation.rating).toBe("ACCUMULATE"); // upside <= 15% but target > cmp
    const cData = normalized.companyData as Record<string, unknown>;
    expect(cData.pe).toBe(26.5);
    expect(cData.evEbitda).toBe(18.2);
    expect(cData.roe).toBe(31.4);
    expect(cData.beta).toBe(0.9);
    expect(normalized.investmentRisks).toEqual([
      "High attrition in tech",
      "BFSI slowdown in US",
      "Currency volatility",
    ]);
    expect(normalized.fiveYearSummary).toHaveLength(2);
  });

  it("calculates BUY rating when upside exceeds 15%", () => {
    const raw = {
      ticker: "TCS",
      recommendation: {
        currentPrice: 3000,
        targetPrice: 3600,
      },
      modelingData: {
        baseTargetPrice: 3600,
      },
    };

    const normalized = normalizeEquityResearchData(raw);
    expect(normalized.recommendation.upsidePotential).toBe(20.0);
    expect(normalized.recommendation.rating).toBe("BUY");
  });

  it("calculates HOLD rating when targetPrice is below or equal to CMP", () => {
    const raw = {
      ticker: "OVERVALUED",
      recommendation: {
        currentPrice: 1500,
        targetPrice: 1400,
      },
      modelingData: {
        baseTargetPrice: 1400,
      },
    };

    const normalized = normalizeEquityResearchData(raw);
    expect(normalized.recommendation.upsidePotential).toBeCloseTo(-6.7, 1);
    expect(normalized.recommendation.rating).toBe("HOLD");
  });

  it("does not fabricate fallback numbers if metrics are missing", () => {
    const raw = {
      companyName: "Unknown Corp",
      ticker: "UNKN",
    };

    const normalized = normalizeEquityResearchData(raw);
    const cData = normalized.companyData as Record<string, unknown>;
    expect(cData.pe).toBeNull();
    expect(cData.evEbitda).toBeNull();
    expect(cData.roe).toBeNull();
    expect(cData.beta).toBeNull();
    expect(cData.marketCap).toBeNull();
    expect(normalized.recommendation.targetPrice).toBeNull();
  });
});

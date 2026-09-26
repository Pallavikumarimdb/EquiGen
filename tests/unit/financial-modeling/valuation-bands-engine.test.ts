import { describe, it, expect } from "vitest";
import {
  calculateMeanAndStdDev,
  classifyValuationRegime,
  calculatePercentileRank,
  generateSyntheticHistory,
  buildValuationBands,
} from "@/lib/financial-modeling/valuation-bands-engine";
import { GET } from "@/app/api/valuation-bands/route";
import { NextRequest } from "next/server";

describe("Issue 3: Historical Valuation Multiples Bands (P/E & EV/EBITDA)", () => {
  it("1. Accurately calculates sample Mean, Standard Deviation, and ±1σ, ±2σ corridors", () => {
    const sampleMultiples = [10, 12, 14, 16, 18, 20, 22]; // Mean = 16
    const { mean, stdDev } = calculateMeanAndStdDev(sampleMultiples);

    expect(mean).toBe(16);
    expect(stdDev).toBeGreaterThan(4); // Sample std dev is ~4.32

    const plus2Sigma = mean + 2 * stdDev;
    const plus1Sigma = mean + 1 * stdDev;
    const minus1Sigma = mean - 1 * stdDev;
    const minus2Sigma = mean - 2 * stdDev;

    // Strict mathematical ordering of corridors
    expect(plus2Sigma).toBeGreaterThan(plus1Sigma);
    expect(plus1Sigma).toBeGreaterThan(mean);
    expect(mean).toBeGreaterThan(minus1Sigma);
    expect(minus1Sigma).toBeGreaterThan(minus2Sigma);
  });

  it("2. Accurately classifies cyclical extremes (Peak vs Trough) by Z-Score", () => {
    // Extreme Peak (Z >= 2.0)
    const peak = classifyValuationRegime(2.35, "PE");
    expect(peak.regime).toBe("CYCLICAL_PEAK");
    expect(peak.regimeLabel).toContain("+2σ");
    expect(peak.cyclicalRecommendation).toContain("multiple compression");

    // Elevated (1.0 <= Z < 2.0)
    const elevated = classifyValuationRegime(1.2, "PE");
    expect(elevated.regime).toBe("ELEVATED");

    // Fair Value (-1.0 <= Z <= 1.0)
    const fair = classifyValuationRegime(0.15, "PE");
    expect(fair.regime).toBe("FAIR_VALUE");

    // Extreme Trough (Z <= -2.0)
    const trough = classifyValuationRegime(-2.4, "EV_EBITDA");
    expect(trough.regime).toBe("CYCLICAL_TROUGH");
    expect(trough.regimeLabel).toContain("-2σ");
    expect(trough.cyclicalRecommendation).toContain("contrarian entry");
  });

  it("3. Accurately charts cyclical sector company (Tata Steel) with detected peaks and troughs", async () => {
    // Generate deterministic 5Y (60-month) cyclical wave representing Tata Steel commodity cycle
    const basePrice = 188; // CMP ₹188
    const cyclicalCandles = generateSyntheticHistory(60, basePrice, true);

    expect(cyclicalCandles.length).toBe(60);

    const result = await buildValuationBands({
      ticker: "TATASTEEL",
      companyName: "Tata Steel Ltd",
      metric: "PE",
      lookback: "5Y",
      currentPrice: basePrice,
      historicalCandles: cyclicalCandles,
      baseEps: 13.5, // TTM EPS ₹13.5 -> CMP/EPS ~ 13.9x P/E
    });

    expect(result.ticker).toBe("TATASTEEL");
    expect(result.metric).toBe("PE");
    expect(result.lookback).toBe("5Y");
    expect(result.series.length).toBe(60);

    // Corridors sanity checks
    const { stats } = result;
    expect(stats.mean).toBeGreaterThan(5);
    expect(stats.plus2Sigma).toBeGreaterThan(stats.plus1Sigma);
    expect(stats.plus1Sigma).toBeGreaterThan(stats.mean);
    expect(stats.mean).toBeGreaterThan(stats.minus1Sigma);
    expect(stats.minus1Sigma).toBeGreaterThan(stats.minus2Sigma);

    // Ensure cyclical peaks (+2σ) and troughs (-2σ) are flagged in the series
    const peaks = result.series.filter((s) => s.isPeak);
    const troughs = result.series.filter((s) => s.isTrough);

    expect(peaks.length).toBeGreaterThanOrEqual(1);
    expect(troughs.length).toBeGreaterThanOrEqual(1);

    // Verify implied price corridor translation
    const latest = result.series[result.series.length - 1];
    expect(latest.pricePlus2Sigma).toBeGreaterThan(latest.pricePlus1Sigma);
    expect(latest.pricePlus1Sigma).toBeGreaterThan(latest.priceMean);
    expect(latest.priceMean).toBeGreaterThan(latest.priceMinus1Sigma);
    expect(latest.priceMinus1Sigma).toBeGreaterThan(latest.priceMinus2Sigma);

    // Verify empirical extreme stats exist
    expect(result.historicalExtremes.peakTouchCount).toBeGreaterThanOrEqual(1);
    expect(result.historicalExtremes.troughTouchCount).toBeGreaterThanOrEqual(1);
  });

  it("4. Evaluates Hindalco under EV/EBITDA over 3-Year horizon", async () => {
    const basePrice = 640;
    const candles3Y = generateSyntheticHistory(36, basePrice, true);

    const result = await buildValuationBands({
      ticker: "HINDALCO",
      companyName: "Hindalco Industries Ltd",
      metric: "EV_EBITDA",
      lookback: "3Y",
      currentPrice: basePrice,
      historicalCandles: candles3Y,
      baseEbitdaPerShare: 72.0, // Implied ~8.8x EV/EBITDA
    });

    expect(result.metric).toBe("EV_EBITDA");
    expect(result.lookback).toBe("3Y");
    expect(result.series.length).toBe(36);
    expect(result.stats.currentMultiple).toBeGreaterThan(5);
    expect(result.stats.percentileRank).toBeGreaterThanOrEqual(0);
    expect(result.stats.percentileRank).toBeLessThanOrEqual(100);
  });

  it("5. End-to-end API Route (/api/valuation-bands) handles dynamic requests", async () => {
    const req = new NextRequest(
      "https://localhost:3000/api/valuation-bands?ticker=TATASTEEL&metric=PE&lookback=5Y&currentPrice=188"
    );

    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ticker).toBe("TATASTEEL");
    expect(data.metric).toBe("PE");
    expect(data.lookback).toBe("5Y");
    expect(data.stats).toBeDefined();
    expect(data.stats.plus2Sigma).toBeGreaterThan(data.stats.mean);
    expect(data.series.length).toBeGreaterThan(0);
  });
});

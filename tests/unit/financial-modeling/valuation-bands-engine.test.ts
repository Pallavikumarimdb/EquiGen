import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  calculateMeanAndStdDev,
  classifyValuationRegime,
  calculatePercentileRank,
  generateSyntheticHistory,
  buildValuationBands,
  InsufficientPriceHistoryError,
} from "@/lib/financial-modeling/valuation-bands-engine";
import { GET } from "@/app/api/valuation-bands/route";
import { NextRequest } from "next/server";

describe("Issue 3: Historical Valuation Multiples Bands (P/E & EV/EBITDA)", () => {
  beforeEach(() => {
    // The internal service credential is configured via env, never a hardcoded literal.
    vi.stubEnv("INTERNAL_API_SECRET", "unit-test-internal-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
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

    // Percentile rank
    expect(calculatePercentileRank(16, sampleMultiples)).toBe(57);
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

  it("5. End-to-end API Route (/api/valuation-bands) requires authentication", async () => {
    const req = new NextRequest(
      "https://localhost:3000/api/valuation-bands?ticker=TATASTEEL&metric=PE&lookback=5Y&currentPrice=188"
    );

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("5b. End-to-end API Route requires authentication before touching any data", async () => {
    const res = await GET(
      new NextRequest("https://localhost:3000/api/valuation-bands?ticker=%3Cscript%3E"),
    );
    // Auth runs first: an unauthenticated caller must not be able to probe the
    // endpoint's validation behaviour.
    expect(res.status).toBe(401);
  });

  it("5c. End-to-end API Route rejects a malformed ticker once authenticated", async () => {
    const req = new NextRequest("https://localhost:3000/api/valuation-bands?ticker=%3Cscript%3E");
    req.headers.set("x-api-secret", process.env.INTERNAL_API_SECRET ?? "");

    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});

/**
 * A +/-1s/+/-2s band is a statistical claim about a company's own trading history.
 * When real data is unavailable the engine must refuse rather than substitute an
 * invented curve, because a synthetic chart is visually indistinguishable from
 * real analysis while being entirely fictitious.
 */
describe("Valuation bands data provenance", () => {
  beforeEach(() => {
    // The internal service credential is configured, not hardcoded.
    vi.stubEnv("INTERNAL_API_SECRET", "unit-test-internal-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses to build bands without real price history", async () => {
    await expect(
      buildValuationBands({
        ticker: "NOSUCHCO",
        companyName: "No Such Company",
        metric: "PE",
        lookback: "5Y",
        currentPrice: 100,
        historicalCandles: generateSyntheticHistory(60, 100, false).slice(0, 5), // only 5 candles
      }),
    ).rejects.toThrow(InsufficientPriceHistoryError);
  });

  it("names the ticker and explains why no substitute was generated", async () => {
    const err = await buildValuationBands({
      ticker: "NOSUCHCO",
      companyName: "No Such Company",
      metric: "PE",
      currentPrice: 100,
      historicalCandles: [],
    }).catch((e: unknown) => e as InsufficientPriceHistoryError);

    expect(err).toBeInstanceOf(InsufficientPriceHistoryError);
    const typed = err as InsufficientPriceHistoryError;
    expect(typed.code).toBe("INSUFFICIENT_PRICE_HISTORY");
    expect(typed.ticker).toBe("NOSUCHCO");
    expect(typed.message).toContain("NOSUCHCO");
    expect(typed.message).toMatch(/no synthetic substitute/i);
  });

  it("allows synthetic history only when explicitly opted in", async () => {
    const result = await buildValuationBands({
      ticker: "TESTCO",
      companyName: "Test Co",
      metric: "PE",
      lookback: "5Y",
      currentPrice: 188,
      historicalCandles: [],
      allowSyntheticHistory: true,
      baseEps: 13.5,
    });

    expect(result.dataProvenance).toBe("synthetic");
    expect(result.dataQualityNote).toMatch(/SYNTHETIC/);
    expect(result.dataQualityNote).toMatch(/NOT a statistical claim/);
  });

  it("ignores the synthetic opt-in entirely in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      buildValuationBands({
        ticker: "TESTCO",
        companyName: "Test Co",
        metric: "PE",
        currentPrice: 188,
        historicalCandles: [],
        allowSyntheticHistory: true,
        baseEps: 13.5,
      }),
    ).rejects.toThrow(InsufficientPriceHistoryError);
  });

  it("marks a short-but-real series as partial rather than silently trusting it", async () => {
    const result = await buildValuationBands({
      ticker: "SHORTCO",
      companyName: "Short History Co",
      metric: "PE",
      lookback: "5Y",
      currentPrice: 200,
      historicalCandles: generateSyntheticHistory(20, 200, false),
      baseEps: 12,
    });

    expect(result.dataProvenance).toBe("partial");
    expect(result.dataQualityNote).toMatch(/20 months of real price history/);
    expect(result.dataQualityNote).toMatch(/60 requested/);
  });

  it("marks a full real series as live with no caveat", async () => {
    const result = await buildValuationBands({
      ticker: "FULLCO",
      companyName: "Full History Co",
      metric: "PE",
      lookback: "5Y",
      currentPrice: 300,
      historicalCandles: generateSyntheticHistory(60, 300, true),
      baseEps: 20,
    });

    expect(result.dataProvenance).toBe("live");
    expect(result.dataQualityNote).toBeNull();
  });
});

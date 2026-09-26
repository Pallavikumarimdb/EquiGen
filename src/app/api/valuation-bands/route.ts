import { NextRequest, NextResponse } from "next/server";
import {
  buildValuationBands,
  ValuationMetric,
  LookbackPeriod,
} from "@/lib/financial-modeling/valuation-bands-engine";

/**
 * GET /api/valuation-bands
 * Returns historical valuation multiples (P/E and EV/EBITDA) and ±1σ, ±2σ standard deviation corridors
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawTicker = searchParams.get("ticker");
    if (!rawTicker) {
      return NextResponse.json(
        { error: "Query parameter 'ticker' is required." },
        { status: 400 }
      );
    }

    const cleanTicker = rawTicker.trim().toUpperCase();
    if (!/^[A-Z0-9_.-]{1,15}$/.test(cleanTicker)) {
      return NextResponse.json(
        { error: "Invalid ticker format. Must be 1-15 alphanumeric characters." },
        { status: 400 }
      );
    }

    const rawMetric = searchParams.get("metric");
    const metric: ValuationMetric = rawMetric === "EV_EBITDA" ? "EV_EBITDA" : "PE";

    const rawLookback = searchParams.get("lookback");
    const lookback: LookbackPeriod = rawLookback === "3Y" ? "3Y" : "5Y";

    const currentPriceParam = searchParams.get("currentPrice");
    const currentMultipleParam = searchParams.get("currentMultiple");

    const currentPrice = currentPriceParam ? parseFloat(currentPriceParam) : undefined;
    const currentMultiple = currentMultipleParam ? parseFloat(currentMultipleParam) : undefined;

    const result = await buildValuationBands({
      ticker: cleanTicker,
      metric,
      lookback,
      currentPrice: currentPrice && !isNaN(currentPrice) && currentPrice > 0 ? currentPrice : undefined,
      currentMultiple: currentMultiple && !isNaN(currentMultiple) && currentMultiple > 0 ? currentMultiple : undefined,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("[ValuationBandsAPI] Error:", error);
    return NextResponse.json(
      { error: "Failed to compute valuation multiples bands", details: String(error) },
      { status: 500 }
    );
  }
}

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
    const ticker = searchParams.get("ticker");

    if (!ticker) {
      return NextResponse.json(
        { error: "Query parameter 'ticker' is required." },
        { status: 400 }
      );
    }

    const metric = (searchParams.get("metric") || "PE") as ValuationMetric;
    const lookback = (searchParams.get("lookback") || "5Y") as LookbackPeriod;
    const currentPriceParam = searchParams.get("currentPrice");
    const currentMultipleParam = searchParams.get("currentMultiple");

    const currentPrice = currentPriceParam ? parseFloat(currentPriceParam) : undefined;
    const currentMultiple = currentMultipleParam ? parseFloat(currentMultipleParam) : undefined;

    const result = await buildValuationBands({
      ticker,
      metric,
      lookback,
      currentPrice,
      currentMultiple,
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

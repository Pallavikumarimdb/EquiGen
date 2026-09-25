/**
 * GET /api/eval/run?ticker=RELIANCE
 *
 * Runs the pipeline eval suite against the most recent stored agent output
 * for a given ticker. Returns a PipelineEvalReport JSON.
 *
 * Use this endpoint to:
 *   - Validate data quality before publishing a report to clients
 *   - Debug why a specific ticker is producing empty/wrong data
 *   - CI: Run as a smoke test after code changes
 *
 * Example:
 *   GET /api/eval/run?ticker=RELIANCE
 *   GET /api/eval/run?ticker=TCS
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pipelineEval, AgentRunSnapshot } from "@/lib/eval/pipeline-eval";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.toUpperCase();

  if (!ticker) {
    return NextResponse.json(
      { error: "Missing required query param: ticker. Example: /api/eval/run?ticker=RELIANCE" },
      { status: 400 }
    );
  }

  try {
    // Fetch the most recent ReportHistory entry for this ticker
    const report = await prisma.reportHistory.findFirst({
      where: {
        companyName: { contains: ticker, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        companyName: true,
        createdAt: true,
        reportData: true,
      },
    });

    if (!report) {
      return NextResponse.json(
        {
          error: `No agent run found for ticker "${ticker}". Run an autonomous research report first.`,
          hint: `POST /api/agent/run with { ticker: "${ticker}" }`,
        },
        { status: 404 }
      );
    }

    // Extract the nested agent output fields from reportData
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawData = report.reportData as any;

    const evalSnapshot: AgentRunSnapshot = {
      // Yahoo Finance data is stored in the report's companyData block
      yahoo: rawData?.companyData
        ? {
            isLiveData: rawData?.companyData?.marketCap != null || rawData?.companyData?.currentPrice != null,
            revenueCr: rawData?.modelingData?.assumptions?.baseRevenue ?? null,
            marketCapCr: rawData?.companyData?.marketCap ?? null,
            currentPrice: rawData?.companyData?.currentPrice ?? rawData?.recommendation?.currentPrice ?? null,
            trailingPE: rawData?.companyData?.pe ?? null,
            ebitdaMargin: null, // not in normalized output
            beta: rawData?.companyData?.beta ?? null,
            ticker: ticker,
            fetchedAt: rawData?.completedAt ?? new Date().toISOString(),
            dataSource: "stored_report",
            // Null fields (not stored)
            revenueGrowthYoY: null, ebitdaCr: null, grossMargin: null,
            operatingMargin: null, netIncomeCr: null, epsCurrent: null,
            epsGrowth: null, totalDebtCr: null, cashCr: null, netDebtCr: null,
            bookValuePerShare: null, enterpriseValueCr: null, sharesOutstandingCr: null,
            forwardPE: null, evEbitda: null, priceToBook: null, dividendYield: null,
            currency: "INR",
          }
        : null,
      modelingDataQuality: rawData?.modelingData?.dataQuality ?? undefined,
      modelOutput: rawData?.modelingData
        ? {
            baseTargetPrice: rawData?.modelingData?.baseTargetPrice ?? 0,
            assumptions: rawData?.modelingData?.assumptions,
          }
        : undefined,
      sections: rawData?.sections ?? [],
      dataSources: rawData?.dataSources ?? undefined,
    };

    const evalReport = await pipelineEval.run(ticker, evalSnapshot);

    return NextResponse.json({
      success: true,
      reportId: report.id,
      companyName: report.companyName,
      reportGeneratedAt: report.createdAt,
      eval: evalReport,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/eval/run] Error:", msg);
    return NextResponse.json({ error: "Eval failed", detail: msg }, { status: 500 });
  }
}

/**
 * Phase 12 Test Script — Market Intelligence Subagent & Deep Web Research
 *
 * Tests:
 * 1. WebScraperClient politeness & HTML-to-text extraction
 * 2. Screener.in Scraping Tool profile extraction
 * 3. Credit Rating Tool ratings & rationale formatting
 * 4. Sector News Deep Tool sentiment scoring & digest output
 * 5. MarketIntelAgent orchestration & peer comparison benchmark Markdown generator
 */

import { webScraperClient, extractTextFromHtml } from "../src/lib/scraping/puppeteer-client";
import { fetchScreenerProfile } from "../src/lib/ai/tools/screener-scrape-tool";
import { fetchCreditRatings, formatCreditRatingsMarkdown } from "../src/lib/ai/tools/credit-rating-tool";
import { fetchSectorNews } from "../src/lib/ai/tools/sector-news-deep-tool";
import { marketIntelAgent } from "../src/lib/ai/subagents/market-intel-agent";
import { PeerBenchmarkMilestone } from "../src/types/plan4";

const TEST_TICKER = "TATAMOTORS";
const MOCK_PLAN_ID = "test-plan-phase12";
const MOCK_RUN_ID  = "test-run-phase12";

async function runTests() {
  console.log("======================================================");
  console.log("   EquiGen Phase 12 — Market Intelligence Test        ");
  console.log("======================================================\n");

  let passed = 0;
  let failed = 0;

  // ─── Test 1: HTML Text Extractor ────────────────────────────────────────
  console.log("📋 Test 1: WebScraperClient HTML Text Extractor...");
  try {
    const rawHtml = `<html><head><style>body { color: red; }</style></head><body><h1>Tata Motors</h1><p>Q3 Revenue <b>Rs 1,05,000 Cr</b></p></body></html>`;
    const text = extractTextFromHtml(rawHtml);
    if (!text.includes("Tata Motors") || !text.includes("Q3 Revenue") || text.includes("<style>")) {
      throw new Error("HTML text extraction failed to strip tags correctly");
    }
    console.log(`  Extracted text snippet: "${text}" ✅`);
    passed++;
  } catch (e) {
    console.error("  ❌ HTML Text Extractor test failed:", e);
    failed++;
  }

  // ─── Test 2: Screener Profile Scraping ──────────────────────────────────
  console.log("\n📋 Test 2: Screener Profile Extractor...");
  try {
    const profile = await fetchScreenerProfile(TEST_TICKER);
    if (profile.ticker !== TEST_TICKER) throw new Error("Ticker mismatch");
    if (profile.historicalSeries.length === 0) throw new Error("Historical series empty");

    console.log(`  Ticker: ${profile.ticker} | P/E: ${profile.peRatio}x | Market Cap: ₹${profile.marketCapCr} Cr`);
    console.log(`  Shareholding: Promoters ${profile.shareholding.promoters}%, FII ${profile.shareholding.fii}% ✅`);
    passed++;
  } catch (e) {
    console.error("  ❌ Screener Profile Extractor test failed:", e);
    failed++;
  }

  // ─── Test 3: Credit Ratings & Rationale ─────────────────────────────────
  console.log("\n📋 Test 3: Credit Rating Tool...");
  try {
    const credit = await fetchCreditRatings(TEST_TICKER);
    if (credit.ratings.length === 0) throw new Error("No credit ratings returned");

    const md = formatCreditRatingsMarkdown(credit);
    if (!md.includes("Credit Ratings & Solvency Profile") || !md.includes("CRISIL")) {
      throw new Error("Markdown formatting failed");
    }

    console.log(`  Overall Credit Profile: ${credit.overallCreditProfile}`);
    console.log(`  Rating Agency: ${credit.ratings[0].agency} -> ${credit.ratings[0].rating} ✅`);
    passed++;
  } catch (e) {
    console.error("  ❌ Credit Rating Tool test failed:", e);
    failed++;
  }

  // ─── Test 4: Sector News Sentiment ─────────────────────────────────────
  console.log("\n📋 Test 4: Sector News Deep Tool...");
  try {
    const newsDigest = await fetchSectorNews(TEST_TICKER);
    if (newsDigest.news.length === 0) throw new Error("News items array empty");

    console.log(`  News items count: ${newsDigest.news.length}`);
    console.log(`  Sentiment breakdown: ${JSON.stringify(newsDigest.sentimentBreakdown)} ✅`);
    passed++;
  } catch (e) {
    console.error("  ❌ Sector News Deep Tool test failed:", e);
    failed++;
  }

  // ─── Test 5: MarketIntelAgent Orchestration ────────────────────────────
  console.log("\n📋 Test 5: MarketIntelAgent orchestration...");
  try {
    const mockMilestone: PeerBenchmarkMilestone = {
      id: "m_peer",
      type: "peer_benchmark",
      label: "Peer Benchmarking",
      description: "Compare TATAMOTORS vs M_M and HEROMOTOCO",
      agentType: "market_intel",
      estimatedMinutes: 2,
      estimatedCostUsd: 0.08,
      status: "pending",
      config: {
        peerTickers: ["M_M", "HEROMOTOCO"],
        metrics: ["pe", "ev_ebitda", "roe"],
      },
    };

    const output = await marketIntelAgent.run({
      planId: MOCK_PLAN_ID,
      runId: MOCK_RUN_ID,
      ticker: TEST_TICKER,
      companyName: "Tata Motors Limited",
      milestone: mockMilestone,
    });

    if (!output.milestoneCompleted) throw new Error("milestoneCompleted should be true");
    if (output.peerProfiles.length < 2) throw new Error("Expected at least 2 peer profiles");
    if (!output.benchmarkMarkdown.includes("Valuation & Operational Peer Benchmark")) {
      throw new Error("Benchmark table missing in markdown output");
    }

    console.log("  ✅ MarketIntelAgent.run() completed successfully ✅");
    console.log(`  Benchmark Table Excerpt:\n${output.benchmarkMarkdown.split("\n").slice(0, 8).join("\n")}`);
    passed++;
  } catch (e) {
    console.error("  ❌ MarketIntelAgent test failed:", e);
    failed++;
  }

  console.log("\n======================================================");
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("❌ PHASE 12 — Market Intelligence Subagent: SOME TESTS FAILED");
    process.exit(1);
  } else {
    console.log("✅ PHASE 12 — Market Intelligence Subagent: ALL TESTS PASSED");
  }
  console.log("======================================================\n");
}

runTests().catch((e) => {
  console.error("❌ Phase 12 test runner error:", e);
  process.exit(1);
});

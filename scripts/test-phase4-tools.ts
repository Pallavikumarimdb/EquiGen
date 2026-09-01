import { fetchMarketData } from "../src/lib/ai/tools/market-data-tool";
import { fetchPeerComparison } from "../src/lib/ai/tools/peer-comparison-tool";
import { fetchNewsAndFilings } from "../src/lib/ai/tools/news-search-tool";

async function runTests() {
  console.log("=== Testing Phase 4 Read-only Live Data Tools ===");

  console.log("\n1. Testing MarketDataTool...");
  const marketRes = await fetchMarketData("RELIANCE");
  console.log("Source:", marketRes.source);
  console.log("AsOf:", marketRes.asOf);
  console.log("Summary Output:\n", marketRes.rawSummary);

  console.log("\n2. Testing PeerComparisonTool...");
  const peerRes = await fetchPeerComparison("TCS");
  console.log("Sector:", peerRes.sector);
  console.log("Peers Count:", peerRes.peers.length);
  console.log("Summary Output:\n", peerRes.rawSummary);

  console.log("\n3. Testing NewsSearchTool...");
  const newsRes = await fetchNewsAndFilings("Tata Motors");
  console.log("Query:", newsRes.query);
  console.log("Articles Found:", newsRes.articles.length);
  console.log("Summary Output:\n", newsRes.rawSummary);

  console.log("\n✅ All Phase 4 Read-only Live Data Tools Executed Successfully!");
}

runTests().catch((e) => {
  console.error("❌ Phase 4 Tool Test Failed:", e);
  process.exit(1);
});

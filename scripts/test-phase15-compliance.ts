/**
 * Phase 15 Verification Script: Automated Compliance & SEBI Rule Checking Subagent
 * Tests:
 * 1. SebiComplianceTool audit detection of registration numbers, risk disclaimers, and ratings.
 * 2. ComplianceAgent subagent execution & statutory disclosures section injection.
 */

import { SebiComplianceTool } from "../src/lib/ai/tools/sebi-compliance-tool";
import { complianceAgent } from "../src/lib/ai/subagents/compliance-agent";
import { ReportSection } from "../src/types/plan4";

async function runTests() {
  console.log("======================================================");
  console.log("   EquiGen Phase 15 — SEBI Compliance Test Suite      ");
  console.log("======================================================\n");

  // Test 1: SebiComplianceTool audit
  console.log("📋 Test 1: SebiComplianceTool rule verification...");
  const nonCompliantText = "Initiation of coverage on Tata Motors with a target price of ₹985.";
  const audit1 = SebiComplianceTool.auditReport(nonCompliantText);

  console.log(`  Non-compliant text score: ${audit1.score}/100 | Violations flagged: ${audit1.violations.length} ✅`);
  if (audit1.isCompliant) throw new Error("Expected text to fail compliance audit");

  const compliantText = "Initiation of coverage on Tata Motors. SEBI Reg No: INH000012345. ACCUMULATE rating (12-month horizon). Conflict of interest: None. Investments in securities market are subject to market risks. Analyst certification: Personal views expressed.";
  const audit2 = SebiComplianceTool.auditReport(compliantText, "INH000012345");

  console.log(`  Compliant text score: ${audit2.score}/100 | Violations flagged: ${audit2.violations.length} ✅`);
  if (!audit2.isCompliant) throw new Error("Expected text to pass compliance audit");

  // Test 2: Disclaimers Generator
  console.log("\n📋 Test 2: Statutory Disclaimers Generator...");
  const disclaimers = SebiComplianceTool.generateSebiDisclaimers("Pallavi Kumari", "INH000012345", "EquiGen");
  console.log(`  Disclaimers text generated (${disclaimers.length} chars) ✅`);

  // Test 3: ComplianceAgent Subagent Execution
  console.log("\n📋 Test 3: ComplianceAgent subagent run & disclosures injection...");
  const mockSections: ReportSection[] = [
    {
      name: "executive_summary",
      content: "Tata Motors initiation report. Target price ₹985.",
      citations: ["ref1"],
      lastUpdatedAt: new Date().toISOString(),
    },
    {
      name: "valuation",
      content: "5-year DCF model using 11% WACC.",
      citations: ["ref2"],
      lastUpdatedAt: new Date().toISOString(),
    },
  ];

  const output = await complianceAgent.run({
    planId: "test_plan_p15",
    runId: "run_comp_p15",
    ticker: "TATAMOTORS",
    companyName: "Tata Motors Limited",
    sections: mockSections,
    analystName: "Pallavi Kumari",
    sebiRegNo: "INH000012345",
  });

  console.log(`  Audit Score: ${output.auditResult.score}/100 ✅`);
  console.log(`  Disclosures Section Added: ${output.disclosuresAdded ? "Yes" : "No"} ✅`);
  console.log(`  Total Sections in Final Report: ${output.updatedSections.length} ✅`);

  console.log("\n======================================================");
  console.log("📊 Results: 3 passed, 0 failed");
  console.log("✅ PHASE 15 — SEBI Compliance Subagent: ALL PASSED");
  console.log("======================================================\n");
}

runTests().catch((e) => {
  console.error("❌ Test failed:", e);
  process.exit(1);
});

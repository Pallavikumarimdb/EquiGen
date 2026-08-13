import { describe, it } from "node:test";
import assert from "node:assert";
import { detectSections, estimateTableDensity } from "../section-detector";

const financialsPage = `
CONSOLIDATED BALANCE SHEET
as at 31 March 2025
                        Note   31-Mar-25     31-Mar-24
Shareholders' funds     3      12,345.67     10,987.65
Reserves and surplus    4       8,765.43      7,654.32
Total equity                   21,111.10     18,641.97
`;

const narrativePage = `
MANAGEMENT DISCUSSION AND ANALYSIS
The Company continues to strengthen its market position. Key risks include
commodity price volatility and foreign exchange exposure. Our growth strategy
focuses on domestic expansion and new product segments.
`;

const notesPage = `
NOTES TO ACCOUNTS
1. Corporate information — the Company was incorporated in 1992.
2. Significant accounting policies are consistent with prior year.
`;

const genericPage = `
Quarterly performance summary for the retail division. The board reviewed
operational efficiency across all branches during the period under review.
`;

describe("section-detector", () => {
  it("finds financial statements and narrative sections in a standard filing", () => {
    const result = detectSections([
      { pageNo: 1, text: narrativePage },
      { pageNo: 2, text: financialsPage },
      { pageNo: 3, text: notesPage },
      { pageNo: 4, text: genericPage },
    ]);

    assert.ok(
      result.map.financials.includes(2),
      "financials should include page 2",
    );
    assert.ok(
      result.map.narrative.includes(1),
      "narrative should include page 1",
    );
    assert.ok(result.map.swotCandidates.length > 0);
    assert.strictEqual(result.verdict, "ok");
    assert.strictEqual(result.confidence.financials, 0.5); // balance sheet + notes found
    assert.ok(result.missingCoreMarkers.includes("profit_loss"));
    assert.ok(result.missingCoreMarkers.includes("cash_flow"));
  });

  it("verdicts ocr_recheck when markers are missing and scanned pages exist", () => {
    const result = detectSections([
      { pageNo: 1, text: genericPage },
      { pageNo: 2, text: "", isScanned: true },
      { pageNo: 3, text: "", isScanned: true },
    ]);
    assert.strictEqual(result.verdict, "ocr_recheck");
    assert.deepStrictEqual(result.scannedPages, [2, 3]);
  });

  it("verdicts full_document when markers are missing on a text-rich doc", () => {
    const result = detectSections([
      { pageNo: 1, text: genericPage },
      { pageNo: 2, text: genericPage },
      { pageNo: 3, text: genericPage },
    ]);
    assert.strictEqual(result.verdict, "full_document");
    assert.strictEqual(result.missingCoreMarkers.length, 4);
  });

  it("verdicts blocked for a blank PDF (no text, nothing to OCR)", () => {
    const result = detectSections([
      { pageNo: 1, text: "", isScanned: false },
      { pageNo: 2, text: " ", isScanned: false },
    ]);
    assert.strictEqual(result.verdict, "blocked");
  });

  it("detects all four core markers in a complete filing", () => {
    const result = detectSections([
      { pageNo: 1, text: "BALANCE SHEET" },
      { pageNo: 2, text: "Statement of Profit and Loss" },
      { pageNo: 3, text: "CASH FLOW STATEMENT" },
      { pageNo: 4, text: "Notes to the Financial Statements" },
    ]);
    assert.strictEqual(result.confidence.financials, 1);
    assert.strictEqual(result.missingCoreMarkers.length, 0);
  });

  it("estimates table density from numeric multi-column lines", () => {
    assert.ok(estimateTableDensity(financialsPage) > 0.3);
    assert.ok(estimateTableDensity(genericPage) < 0.15);
  });
});

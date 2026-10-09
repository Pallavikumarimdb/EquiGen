/**
 * Regression tests: the autonomous report renderer must never invent figures.
 *
 * Every case below was a fabrication that shipped in the generated PDF/HTML:
 *  - a peer table for real listed companies (SBIN Rs 812, HDFC Bank Rs 1,640) whenever
 *    the report text merely mentioned their ticker;
 *  - literal comparables "PEER1"/"PEER2" named "Sector Peer A"/"Sector Peer B";
 *  - a five-year financial history extrapolated from one revenue figure, with FY24/FY25
 *    labelled as actuals;
 *  - subject metrics defaulting to market cap Rs 2,50,000 Cr, P/E 21.5x, ROE 15.8%,
 *    ROCE 12.4%, dividend yield 0.85%, FII 44.4%, DII 45.3%;
 *  - a current price invented as `targetPrice / 1.16`, which manufactured ~16% upside
 *    and therefore a BUY rating for a company with no market data at all;
 *  - bull/bear driver assumptions (growth x 0.75, terminal growth 3.5%) for scenarios
 *    the model never ran.
 */

import { describe, it, expect } from "vitest";
import { HtmlReportGenerator } from "@/lib/ai/html-report-generator";
import type { AutonomousReportInput } from "@/lib/ai/html-report-generator";

function makeInput(overrides: Partial<AutonomousReportInput> = {}): AutonomousReportInput {
  return {
    ticker: "ACME",
    companyName: "Acme Industries Ltd",
    sections: [
      {
        name: "executive_summary",
        content: "We initiate coverage with a DCF-based target price.",
        citations: [],
        lastUpdatedAt: "2026-03-12T10:00:00.000Z",
      },
    ],
    modelingData: {
      baseTargetPrice: 1000,
      bullCasePrice: 1400,
      bearCasePrice: 700,
      assumptions: { wacc: "11.5%", terminalGrowth: "4.0%" },
    },
    marketIntelData: null,
    dataSources: null,
    financialAudit: null,
    ...overrides,
  } as AutonomousReportInput;
}

const html = (o: Partial<AutonomousReportInput> = {}) =>
  HtmlReportGenerator.generateAutonomousHTML(makeInput(o));

describe("no fabricated peers", () => {
  it("does not invent PEER1/PEER2 when no peer data was retrieved", () => {
    const out = html();
    expect(out).not.toContain("PEER1");
    expect(out).not.toContain("PEER2");
    // The section heading "Sector Peer Valuation Multiples" is legitimate; the
    // fabricated comparator rows were named "Sector Peer A" / "Sector Peer B".
    expect(out).not.toContain("Sector Peer A");
    expect(out).not.toContain("Sector Peer B");
  });

  it("does not fabricate a table for real banks merely mentioned in the text", () => {
    const out = html({
      sections: [
        {
          name: "key_risks",
          // Mentioning a competitor must not cause its price/multiples to be asserted.
          content: "Competition from SBIN and HDFCBANK remains a risk in the banking segment.",
          citations: [],
          lastUpdatedAt: "2026-03-12T10:00:00.000Z",
        },
      ],
    });
    expect(out).not.toContain("824000");
    expect(out).not.toContain("1250000");
    // No hardcoded price rows for those names.
    expect(out).not.toMatch(/State Bank of India[\s\S]{0,200}1,250,000/);
  });

  it("states that peer comparables are unavailable instead of listing any", () => {
    const out = html();
    expect(out).toMatch(/No peer comparables were retrieved/i);
    expect(out).toMatch(/not estimated/i);
  });

  it("renders only peers that were actually fetched", () => {
    const out = html({
      marketIntelData: {
        peerProfiles: [
          { ticker: "ACME", companyName: "Acme", currentPrice: 900, peRatio: 20, marketCapCr: 90000 },
          { ticker: "ZZZ", companyName: "Zed Industries", currentPrice: 250, peRatio: 18, marketCapCr: 40000 },
        ],
      },
    });
    expect(out).toContain("ZZZ");
    expect(out).not.toContain("PEER1");
  });

  it("shows n/a for a peer metric the provider could not supply", () => {
    const out = html({
      marketIntelData: {
        peerProfiles: [
          { ticker: "ACME", currentPrice: 900 },
          { ticker: "ZZZ", companyName: "Zed", currentPrice: 250 },
        ],
      },
    });
    // ZZZ has no P/E; it must not be filled with a constant like 15.0x.
    expect(out).toMatch(/n\/a/);
    expect(out).not.toMatch(/15\.0x/);
  });
});

describe("no fabricated subject metrics", () => {
  it("does not default market cap to Rs 2,50,000 Cr", () => {
    expect(html()).not.toContain("2,50,000");
  });

  it("does not default the valuation multiples", () => {
    const out = html();
    expect(out).not.toContain("21.5x");
    expect(out).not.toContain("2.85x");
    expect(out).not.toContain("15.8%");
    expect(out).not.toContain("12.4%");
  });

  it("does not default institutional holdings to 44.4% / 45.3%", () => {
    const out = html();
    expect(out).not.toContain("89.7%"); // 44.4 + 45.3
    expect(out).not.toContain("44.4");
  });
});

describe("no fabricated rating", () => {
  it("does not invent a current price when none is available", () => {
    const out = html();
    expect(out).toMatch(/NOT RATED/);
  });

  it("does not issue a BUY without any price or upside evidence", () => {
    const out = html();
    expect(out).not.toMatch(/rec-badge rec-buy">BUY/);
  });

  it("still rates the stock when a real price is supplied", () => {
    const out = html({
      marketIntelData: {
        peerProfiles: [{ ticker: "ACME", companyName: "Acme", currentPrice: 800, marketCapCr: 80000 }],
      },
    });
    expect(out).not.toMatch(/NOT RATED/);
    // target 1000 vs price 800 = +25% => BUY
    expect(out).toMatch(/rec-badge rec-buy">BUY/);
  });
});

describe("no fabricated financial history", () => {
  it("does not emit an extrapolated five-year table", () => {
    const out = html();
    expect(out).not.toMatch(/FY24/);
    expect(out).not.toMatch(/FY28E/);
  });

  it("says the table is unavailable rather than estimating it", () => {
    const out = html();
    expect(out).toMatch(/No financial history or forecast was retrieved/i);
  });

  it("does not invent a flat Rs 12.5 EPS or a 500 Cr share count", () => {
    const out = html();
    expect(out).not.toContain("₹12.5");
  });
});

describe("no fabricated sensitivity grid or scenarios", () => {
  it("does not synthesise a sensitivity grid from the target price", () => {
    const out = html();
    expect(out).toMatch(/Sensitivity analysis not available/i);
  });

  it("does not state scenario drivers the engine never ran", () => {
    const out = html();
    // Bear case previously printed "Growth: 7.5% CAGR / Term Growth: 3.5%".
    expect(out).not.toMatch(/Term Growth: 3\.5%/);
    expect(out).not.toMatch(/Term Growth: 5\.0%/);
  });

  it("describes bull and bear by their actual simulation provenance", () => {
    const out = html();
    expect(out).toMatch(/10th percentile of the Monte Carlo simulation/i);
    expect(out).toMatch(/90th percentile of the Monte Carlo simulation/i);
  });
});
/**
 * Unit tests for research provenance resolution.
 *
 * The published PDF previously printed a hardcoded green "Verified" badge for
 * exchange disclosures, "Investment Grade" for credit rating and "Audited Inputs"
 * for the DCF — unconditionally, regardless of what data was actually used. These
 * tests pin the rule that a badge must reflect the source state, and in particular
 * that "not assessed" is never rendered as "verified".
 */

import { describe, it, expect } from "vitest";
import {
  resolveProvenance,
  provenanceBadgeClass,
  type ProvenanceState,
} from "@/lib/report/provenance";

const LIVE_SOURCES = {
  bseNseFilings: { isLive: true, count: 14 },
  concallTranscript: { isLive: true, quotesFound: 8 },
  screenerMarketData: { isLive: true },
  creditRating: { isLive: true, found: true, source: "CRISIL" },
  news: { isLive: true, count: 6 },
  dcfModel: { isDerivedFromRealData: true, source: "extracted_filings" },
};

const PASSING_AUDIT = {
  verdict: "CERTIFIED_AUTHENTIC",
  overallScore: 93,
  criticalFailures: [],
  warnings: [],
};

function byLabel(summary: ReturnType<typeof resolveProvenance>, label: string) {
  const found = summary.items.find((i) => i.label === label);
  if (!found) throw new Error(`No provenance item labelled "${label}"`);
  return found;
}

describe("resolveProvenance — fully verified report", () => {
  it("marks every item verified when all sources are live and the audit passed", () => {
    const s = resolveProvenance({
      dataSources: LIVE_SOURCES,
      financialAudit: PASSING_AUDIT,
    });

    expect(s.worstState).toBe("verified");
    expect(s.hasUnverifiedItems).toBe(false);
    expect(s.items.every((i) => i.state === "verified")).toBe(true);
  });

  it("cites the document count and rating agency", () => {
    const s = resolveProvenance({ dataSources: LIVE_SOURCES, financialAudit: PASSING_AUDIT });
    expect(byLabel(s, "Research Provenance").detail).toContain("14 document(s)");
    expect(byLabel(s, "Credit Rating").detail).toContain("CRISIL");
    expect(byLabel(s, "Valuation Methodology").detail).toContain("extracted_filings");
  });

  it("includes the audit score", () => {
    const s = resolveProvenance({ dataSources: LIVE_SOURCES, financialAudit: PASSING_AUDIT });
    expect(byLabel(s, "Financial Authenticity Audit").detail).toContain("93/100");
  });
});

describe("resolveProvenance — must not overstate", () => {
  it("reports the DCF as fallback when sector constants were used", () => {
    const s = resolveProvenance({
      dataSources: { ...LIVE_SOURCES, dcfModel: { isDerivedFromRealData: false, source: "sector_fallback" } },
      financialAudit: PASSING_AUDIT,
    });

    const v = byLabel(s, "Valuation Methodology");
    expect(v.state).toBe("fallback");
    expect(v.badge).toBe("Fallback used");
    expect(v.detail).toMatch(/NOT company-specific/i);
    expect(v.detail).toMatch(/sector-average/i);
    expect(s.hasUnverifiedItems).toBe(true);
  });

  it("reports credit rating as unavailable rather than inventing a grade", () => {
    const s = resolveProvenance({
      dataSources: { ...LIVE_SOURCES, creditRating: { isLive: false, found: false } },
      financialAudit: PASSING_AUDIT,
    });

    const c = byLabel(s, "Credit Rating");
    expect(c.state).toBe("unavailable");
    expect(c.badge).toBe("Not available");
    expect(c.detail).toMatch(/Many unrated companies have none/i);
    // Explicitly must NOT claim investment grade.
    expect(c.badge).not.toMatch(/Investment Grade/i);
    expect(c.detail).not.toMatch(/CRISIL \/ ICRA/i);
  });

  it("reports missing exchange filings as unavailable", () => {
    const s = resolveProvenance({
      dataSources: { ...LIVE_SOURCES, bseNseFilings: { isLive: false, count: 0 } },
      financialAudit: PASSING_AUDIT,
    });
    expect(byLabel(s, "Research Provenance").state).toBe("unavailable");
    expect(s.worstState).toBe("unavailable");
  });
});

describe("resolveProvenance — absence of evidence is not evidence", () => {
  it("marks everything not_assessed when dataSources is absent", () => {
    const s = resolveProvenance({ dataSources: null, financialAudit: null });

    expect(s.items.every((i) => i.state === "not_assessed")).toBe(true);
    expect(s.hasUnverifiedItems).toBe(true);
    expect(s.worstState).toBe("not_assessed");
  });

  it("marks everything not_assessed when dataSources is an empty object", () => {
    const s = resolveProvenance({ dataSources: {}, financialAudit: PASSING_AUDIT });
    expect(byLabel(s, "Research Provenance").state).toBe("not_assessed");
    expect(byLabel(s, "Credit Rating").state).toBe("not_assessed");
    expect(byLabel(s, "Valuation Methodology").state).toBe("not_assessed");
  });

  it("marks the audit not_assessed when no audit is attached, even with live sources", () => {
    const s = resolveProvenance({ dataSources: LIVE_SOURCES, financialAudit: null });
    const a = byLabel(s, "Financial Authenticity Audit");
    expect(a.state).toBe("not_assessed");
    expect(a.detail).toMatch(/unverified/i);
    expect(s.hasUnverifiedItems).toBe(true);
  });

  it("ignores an unrecognised verdict string instead of assuming success", () => {
    const s = resolveProvenance({
      dataSources: LIVE_SOURCES,
      financialAudit: { verdict: "LOOKS_FINE_TO_ME" },
    });
    expect(byLabel(s, "Financial Authenticity Audit").state).toBe("not_assessed");
  });
});

describe("resolveProvenance — failing and warning audits", () => {
  it("surfaces a failed audit and says the note must not be distributed", () => {
    const s = resolveProvenance({
      dataSources: LIVE_SOURCES,
      financialAudit: {
        verdict: "FAILED_UNRELIABLE",
        overallScore: 39,
        criticalFailures: ["VAL_01: WACC <= terminal growth"],
        warnings: [],
      },
    });

    const a = byLabel(s, "Financial Authenticity Audit");
    expect(a.state).toBe("unavailable");
    expect(a.detail).toContain("VAL_01");
    expect(a.detail).toMatch(/must not be distributed/i);
    expect(s.worstState).toBe("unavailable");
  });

  it("lists advisories on a warnings verdict", () => {
    const s = resolveProvenance({
      dataSources: LIVE_SOURCES,
      financialAudit: {
        verdict: "VALIDATED_WITH_WARNINGS",
        overallScore: 72,
        criticalFailures: [],
        warnings: ["AUTH_02: freshness advisory", "HALLUC_02: placeholder text"],
      },
    });

    const a = byLabel(s, "Financial Authenticity Audit");
    expect(a.state).toBe("fallback");
    expect(a.detail).toContain("AUTH_02");
    expect(a.detail).toContain("HALLUC_02");
  });

  it("survives malformed warning/failure arrays", () => {
    const s = resolveProvenance({
      dataSources: LIVE_SOURCES,
      financialAudit: {
        verdict: "FAILED_UNRELIABLE",
        criticalFailures: ["real", 42, null],
        warnings: "not-an-array",
      },
    });
    const a = byLabel(s, "Financial Authenticity Audit");
    expect(a.state).toBe("unavailable");
    expect(a.detail).toContain("real");
    expect(a.detail).not.toContain("42");
  });
});

describe("provenanceBadgeClass", () => {
  it("only renders a green badge for a verified state", () => {
    expect(provenanceBadgeClass("verified")).toBe("prov-live");
  });

  it.each<ProvenanceState>(["fallback", "unavailable", "not_assessed"])(
    "renders %s with the amber fallback style",
    (state) => {
      expect(provenanceBadgeClass(state)).toBe("prov-fallback");
      expect(provenanceBadgeClass(state)).not.toBe("prov-live");
    },
  );
});

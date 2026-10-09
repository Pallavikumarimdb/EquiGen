import { describe, it, expect } from "vitest";
import {
  readAuditSummary,
  evaluateDistributionGate,
  isDistributionAllowed,
  forcedStatusForAudit,
  readIntegritySummary,
  type AuditState,
} from "@/lib/eval/distribution-gate";

/**
 * A report payload carrying a persisted authenticity audit plus passing integrity
 * checks. The gate fails closed when consistency/compliance results are absent, so
 * tests about the *authenticity* verdict must declare those results explicitly.
 */
function reportWithAudit(audit: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    company: { ticker: "TCS" },
    financialAudit: audit,
    consistencyCheck: CLEAN_CONSISTENCY,
    complianceAudit: CLEAN_COMPLIANCE,
    ...extra,
  };
}

/** A report payload that clears authenticity but omits the integrity checks. */
function reportWithAuditOnly(audit: unknown): Record<string, unknown> {
  return { company: { ticker: "TCS" }, financialAudit: audit };
}

const CLEAN_CONSISTENCY = {
  isConsistent: true,
  score: 1,
  contradictions: [],
  warnings: [],
  sectionsChecked: ["executive_summary", "valuation"],
};

const CLEAN_COMPLIANCE = {
  isCompliant: true,
  score: 96,
  violations: [],
  mandatoryDisclaimersPresent: [],
  missingDisclaimers: [],
};

const PASSING = {
  verdict: "CERTIFIED_AUTHENTIC",
  overallScore: 94,
  criticalFailures: [],
  warnings: [],
  evaluatedAt: "2026-03-12T10:00:00.000Z",
};

const WARNING = {
  verdict: "VALIDATED_WITH_WARNINGS",
  overallScore: 74,
  criticalFailures: [],
  warnings: ["AUTH_02: data freshness advisory"],
  evaluatedAt: "2026-03-12T10:00:00.000Z",
};

const FAILING = {
  verdict: "FAILED_UNRELIABLE",
  overallScore: 41,
  criticalFailures: ["VAL_01: WACC 4.0% <= terminal growth 5.0%"],
  warnings: [],
  evaluatedAt: "2026-03-12T10:00:00.000Z",
};

describe("readAuditSummary", () => {
  it("reads a passing verdict with its score", () => {
    const s = readAuditSummary(reportWithAudit(PASSING));
    expect(s.verdict).toBe("CERTIFIED_AUTHENTIC");
    expect(s.overallScore).toBe(94);
    expect(s.evaluatedAt).toBe("2026-03-12T10:00:00.000Z");
  });

  it("treats a report with no audit as UNKNOWN, never as passing", () => {
    expect(readAuditSummary(reportWithAudit(undefined)).verdict).toBe("UNKNOWN");
    expect(readAuditSummary({ company: {} }).verdict).toBe("UNKNOWN");
  });

  it.each([
    ["null payload", null],
    ["non-object payload", "a report"],
    ["number payload", 42],
    ["array payload", []],
  ])("treats %s as UNKNOWN", (_label, payload) => {
    expect(readAuditSummary(payload).verdict).toBe("UNKNOWN");
  });

  it("rejects an unrecognised verdict string rather than guessing", () => {
    expect(readAuditSummary(reportWithAudit({ verdict: "TOTALLY_FINE" })).verdict).toBe("UNKNOWN");
    expect(readAuditSummary(reportWithAudit({ verdict: 42 })).verdict).toBe("UNKNOWN");
    expect(readAuditSummary(reportWithAudit({})).verdict).toBe("UNKNOWN");
  });

  it("drops non-string entries from failure and warning arrays", () => {
    const s = readAuditSummary(
      reportWithAudit({
        verdict: "FAILED_UNRELIABLE",
        criticalFailures: ["real failure", 7, null, { x: 1 }],
        warnings: "not-an-array",
      }),
    );
    expect(s.criticalFailures).toEqual(["real failure"]);
    expect(s.warnings).toEqual([]);
  });

  it("tolerates a missing or non-numeric overallScore", () => {
    expect(readAuditSummary(reportWithAudit({ verdict: "CERTIFIED_AUTHENTIC" })).overallScore).toBeNull();
    expect(
      readAuditSummary(reportWithAudit({ verdict: "CERTIFIED_AUTHENTIC", overallScore: "94" }))
        .overallScore,
    ).toBeNull();
  });
});

describe("evaluateDistributionGate", () => {
  it("allows a CERTIFIED_AUTHENTIC report", () => {
    const r = evaluateDistributionGate(reportWithAudit(PASSING));
    expect(r.allowed).toBe(true);
    expect(r.state).toBe("CERTIFIED_AUTHENTIC");
    expect(r.overridden).toBe(false);
  });

  it("allows VALIDATED_WITH_WARNINGS without requiring an override", () => {
    const r = evaluateDistributionGate(reportWithAudit(WARNING));
    expect(r.allowed).toBe(true);
    expect(r.overridden).toBe(false);
  });

  it("BLOCKS FAILED_UNRELIABLE and names the critical failures", () => {
    const r = evaluateDistributionGate(reportWithAudit(FAILING));
    expect(r.allowed).toBe(false);
    expect(r.state).toBe("FAILED_UNRELIABLE");
    expect(r.reason).toContain("WACC 4.0% <= terminal growth 5.0%");
    expect(r.reason).toContain("41");
  });

  it("BLOCKS a report with no audit — fail closed, not fail open", () => {
    const r = evaluateDistributionGate({ company: { ticker: "TCS" } });
    expect(r.allowed).toBe(false);
    expect(r.state).toBe("UNKNOWN");
    expect(r.reason).toMatch(/no usable financial authenticity audit/i);
  });

  it("permits an explicit, attributed override of a failed audit", () => {
    const r = evaluateDistributionGate(reportWithAudit(FAILING), {
      overrideWithJustification: true,
      overriddenBy: "Pallavi Kumari",
    });
    expect(r.allowed).toBe(true);
    expect(r.overridden).toBe(true);
    expect(r.reason).toContain("Pallavi Kumari");
    expect(r.reason).toContain("OVERRIDDEN");
  });

  it("does NOT treat a falsy override flag as permission", () => {
    const r = evaluateDistributionGate(reportWithAudit(FAILING), {
      overrideWithJustification: false,
    });
    expect(r.allowed).toBe(false);
    expect(r.overridden).toBe(false);
  });
});

describe("isDistributionAllowed", () => {
  it.each<[AuditState, boolean]>([
    ["CERTIFIED_AUTHENTIC", true],
    ["VALIDATED_WITH_WARNINGS", true],
    ["FAILED_UNRELIABLE", false],
    ["UNKNOWN", false],
  ])("verdict %s -> allowed=%s", (verdict, expected) => {
    const payload =
      verdict === "UNKNOWN" ? {} : reportWithAudit({ verdict, overallScore: 50 });
    expect(isDistributionAllowed(payload)).toBe(expected);
  });
});

describe("forcedStatusForAudit", () => {
  it("holds a failed audit at pending_review", () => {
    expect(forcedStatusForAudit(reportWithAudit(FAILING))).toBe("pending_review");
  });

  it("holds an unauditable report at pending_review", () => {
    expect(forcedStatusForAudit({})).toBe("pending_review");
  });

  it.each<[AuditState]>([["CERTIFIED_AUTHENTIC"], ["VALIDATED_WITH_WARNINGS"]])(
    "does not force a status for %s",
    (verdict) => {
      expect(forcedStatusForAudit(reportWithAudit({ verdict }))).toBeNull();
    },
  );
});

describe("consistency gate (P0-6)", () => {
  const CONTRADICTING = {
    isConsistent: false,
    score: 0.4,
    contradictions: [
      {
        sectionName: "valuation",
        field: "target_price",
        expectedValue: "₹1,000",
        foundValue: "₹1,300",
        severity: "high",
      },
    ],
    warnings: [],
    sectionsChecked: ["valuation"],
  };

  it("blocks a report whose text contradicts its own model", () => {
    const r = evaluateDistributionGate(
      reportWithAudit(PASSING, { consistencyCheck: CONTRADICTING }),
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/contradiction/i);
    expect(r.reason).toContain("target_price");
  });

  it("holds such a report at pending_review", () => {
    expect(forcedStatusForAudit(reportWithAudit(PASSING, { consistencyCheck: CONTRADICTING }))).toBe(
      "pending_review",
    );
  });

  it("ignores low-severity consistency notes", () => {
    const advisory = {
      ...CLEAN_CONSISTENCY,
      isConsistent: false,
      contradictions: [
        { sectionName: "key_risks", field: "ebitda_margin", severity: "low", foundValue: "26%", expectedValue: "26.2%" },
      ],
    };
    expect(forcedStatusForAudit(reportWithAudit(PASSING, { consistencyCheck: advisory }))).toBeNull();
  });

  it("blocks a report with no consistency check at all (fail closed)", () => {
    const r = evaluateDistributionGate(reportWithAuditOnly(PASSING));
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/consistency check/i);
    expect(forcedStatusForAudit(reportWithAuditOnly(PASSING))).toBe("pending_review");
  });

  it("blocks an unreadable consistency result rather than passing it", () => {
    expect(
      forcedStatusForAudit(reportWithAudit(PASSING, { consistencyCheck: "passed!" })),
    ).toBe("pending_review");
    expect(
      forcedStatusForAudit(reportWithAudit(PASSING, { consistencyCheck: { score: 1 } })),
    ).toBe("pending_review");
  });

  it("permits an explicit, attributed override", () => {
    const r = evaluateDistributionGate(reportWithAudit(PASSING, { consistencyCheck: CONTRADICTING }), {
      overrideWithJustification: true,
      overriddenBy: "Pallavi Kumari",
    });
    expect(r.allowed).toBe(true);
    expect(r.overridden).toBe(true);
  });
});

describe("compliance gate (P0-6)", () => {
  it("blocks a report that failed its SEBI compliance audit", () => {
    const nonCompliant = {
      isCompliant: false,
      score: 42,
      violations: [
        {
          ruleId: "R_001",
          ruleName: "Target price without timeframe",
          severity: "critical",
          description: "Target price stated without a 12-month horizon.",
          recommendation: "Add the rating definition and timeframe.",
        },
      ],
      missingDisclaimers: ["Rating Definition & Target Timeframe"],
    };
    const r = evaluateDistributionGate(
      reportWithAudit(PASSING, { complianceAudit: nonCompliant }),
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/target price without timeframe/i);
    expect(forcedStatusForAudit(reportWithAudit(PASSING, { complianceAudit: nonCompliant }))).toBe(
      "pending_review",
    );
  });

  it("blocks a report with no compliance audit at all (fail closed)", () => {
    const r = evaluateDistributionGate(reportWithAuditOnly(PASSING));
    expect(r.reason).toMatch(/compliance audit/i);
    expect(forcedStatusForAudit(reportWithAuditOnly(PASSING))).toBe("pending_review");
  });

  it("ignores warning-level compliance violations", () => {
    const warningOnly = {
      isCompliant: true,
      score: 78,
      violations: [
        { ruleId: "R_010", ruleName: "Analyst certification", severity: "warning", description: "Signed by a reviewer." },
      ],
    };
    expect(forcedStatusForAudit(reportWithAudit(PASSING, { complianceAudit: warningOnly }))).toBeNull();
  });
});

describe("readIntegritySummary", () => {
  it("reports no blockers for a fully clean report", () => {
    const s = readIntegritySummary(reportWithAudit(PASSING));
    expect(s.blockers).toHaveLength(0);
    expect(s.consistencyContradictions).toHaveLength(0);
    expect(s.complianceViolations).toHaveLength(0);
  });

  it("reports a blocker per missing integrity check on a bare payload", () => {
    const s = readIntegritySummary(null);
    expect(s.blockers.map((b) => b.source)).toEqual(["consistency", "compliance"]);
  });

  it("describes each contradiction with both values", () => {
    const s = readIntegritySummary(
      reportWithAudit(PASSING, {
        consistencyCheck: {
          isConsistent: false,
          contradictions: [
            {
              sectionName: "valuation",
              field: "wacc",
              expectedValue: "11.5%",
              foundValue: "115%",
              severity: "high",
            },
          ],
        },
      }),
    );
    expect(s.consistencyContradictions[0]).toContain("valuation");
    expect(s.consistencyContradictions[0]).toContain("115%");
    expect(s.consistencyContradictions[0]).toContain("11.5%");
  });
});

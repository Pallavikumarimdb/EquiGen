import { describe, it, expect } from "vitest";
import {
  readAuditSummary,
  evaluateDistributionGate,
  isDistributionAllowed,
  forcedStatusForAudit,
  type AuditState,
} from "@/lib/eval/distribution-gate";

/** Minimal report payload carrying a persisted authenticity audit. */
function reportWithAudit(audit: unknown): Record<string, unknown> {
  return { company: { ticker: "TCS" }, financialAudit: audit };
}

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

/**
 * Financial authenticity publication gate.
 *
 * `FinancialEvaluationEngine` already produces a `CertificationVerdict` for every
 * report, but until now that verdict was display-only: nothing downstream read it.
 * A report certified `FAILED_UNRELIABLE` could still be downloaded, Excel-exported
 * and (via the autonomous pipeline) written straight to `status: "published"`.
 *
 * This module is the single place that decides whether a report may leave the
 * system, so every export path and the approval path enforce the same rule.
 *
 * Design rules:
 *  - FAIL CLOSED. A report with no audit, or with an unparseable audit, is treated as
 *    `UNKNOWN`, which is NOT distributable. "We could not verify it" must never
 *    silently degrade into "we may publish it".
 *  - Overrides are explicit, justified, and recorded by the caller in the AuditLog.
 */

import type { CertificationVerdict } from "./financial-eval-engine";

export type AuditState = CertificationVerdict | "UNKNOWN";

export interface AuditSummary {
  verdict: AuditState;
  overallScore: number | null;
  criticalFailures: string[];
  warnings: string[];
  evaluatedAt: string | null;
}

/** Verdicts that may not be distributed without an explicit, logged override. */
const BLOCKING_VERDICTS: ReadonlySet<AuditState> = new Set<AuditState>([
  "FAILED_UNRELIABLE",
  "UNKNOWN",
]);

/**
 * Safely reads the persisted authenticity audit off a report payload.
 *
 * `ReportHistory.reportData` is stored as untyped JSON, so every field is probed
 * defensively — a malformed audit must produce `UNKNOWN`, never a crash and never
 * a default of "looks fine".
 */
export function readAuditSummary(reportData: unknown): AuditSummary {
  const empty: AuditSummary = {
    verdict: "UNKNOWN",
    overallScore: null,
    criticalFailures: [],
    warnings: [],
    evaluatedAt: null,
  };

  if (!reportData || typeof reportData !== "object") return empty;
  const audit = (reportData as Record<string, unknown>).financialAudit;
  if (!audit || typeof audit !== "object") return empty;

  const rec = audit as Record<string, unknown>;
  const verdict = rec.verdict;

  const isVerdict = (v: unknown): v is CertificationVerdict =>
    v === "CERTIFIED_AUTHENTIC" ||
    v === "VALIDATED_WITH_WARNINGS" ||
    v === "FAILED_UNRELIABLE";

  if (!isVerdict(verdict)) return empty;

  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return {
    verdict,
    overallScore: typeof rec.overallScore === "number" ? rec.overallScore : null,
    criticalFailures: strArray(rec.criticalFailures),
    warnings: strArray(rec.warnings),
    evaluatedAt: typeof rec.evaluatedAt === "string" ? rec.evaluatedAt : null,
  };
}

/** Non-authenticity blockers that a report must also clear before distribution. */
export interface IntegrityBlocker {
  source: "consistency" | "compliance";
  reason: string;
  details: string[];
}

export interface IntegritySummary {
  consistencyContradictions: string[];
  complianceViolations: string[];
  blockers: IntegrityBlocker[];
}

/**
 * Reads the cross-section consistency check and the SEBI compliance audit off a
 * report payload, defensively. A missing or malformed result yields a blocker —
 * never a silent pass.
 */
export function readIntegritySummary(reportData: unknown): IntegritySummary {
  const none: IntegritySummary = {
    consistencyContradictions: [],
    complianceViolations: [],
    blockers: [],
  };
  if (!reportData || typeof reportData !== "object") {
    return {
      ...none,
      blockers: [
        { source: "consistency", reason: "No consistency check is attached to this report.", details: [] },
        { source: "compliance", reason: "No compliance audit is attached to this report.", details: [] },
      ],
    };
  }

  const rec = reportData as Record<string, unknown>;
  const blockers: IntegrityBlocker[] = [];

  // ── Consistency ──────────────────────────────────────────────────────────
  const consistencyContradictions: string[] = [];
  const consistency = rec.consistencyCheck;
  if (!consistency || typeof consistency !== "object") {
    blockers.push({
      source: "consistency",
      reason: "No cross-section consistency check is attached, so the report's figures cannot be cross-verified against its own model.",
      details: [],
    });
  } else if (!Array.isArray((consistency as Record<string, unknown>).contradictions)) {
    blockers.push({
      source: "consistency",
      reason: "The consistency check result is unreadable.",
      details: [],
    });
  } else {
    const contradictions = ((consistency as Record<string, unknown>).contradictions ?? []) as unknown[];
    for (const c of contradictions) {
      if (!c || typeof c !== "object") continue;
      const cr = c as Record<string, unknown>;
      const severity = cr.severity;
      if (severity !== "high" && severity !== "critical") continue;
      consistencyContradictions.push(
        `${String(cr.sectionName ?? "report")}: ${String(cr.field ?? "field")} stated as ` +
        `${String(cr.foundValue ?? "n/a")} but the model says ${String(cr.expectedValue ?? "n/a")}.`,
      );
    }
    if (consistencyContradictions.length > 0) {
      blockers.push({
        source: "consistency",
        reason: `${consistencyContradictions.length} unresolved high-severity contradiction(s) between the report text and its valuation model.`,
        details: consistencyContradictions,
      });
    }
  }

  // ── Compliance ───────────────────────────────────────────────────────────
  const complianceViolations: string[] = [];
  const compliance = rec.complianceAudit;
  if (!compliance || typeof compliance !== "object") {
    blockers.push({
      source: "compliance",
      reason: "No SEBI compliance audit is attached to this report.",
      details: [],
    });
  } else {
    const compRec = compliance as Record<string, unknown>;
    const score = typeof compRec.score === "number" ? compRec.score : null;
    const mode = typeof compRec.auditMode === "string" ? compRec.auditMode : null;
    if (Array.isArray(compRec.violations)) {
      for (const v of compRec.violations) {
        if (!v || typeof v !== "object") continue;
        const vr = v as Record<string, unknown>;
        const severity = vr.severity;
        if (severity !== "critical") continue;
        complianceViolations.push(
          `${String(vr.ruleName ?? vr.ruleId ?? "rule")}: ${String(vr.description ?? "violation")}`,
        );
      }
    }
    if (compRec.isCompliant !== true) {
      blockers.push({
        source: "compliance",
        reason:
          `SEBI compliance audit did not pass (score ${score ?? "n/a"}` +
          `${mode ? `, mode ${mode}` : ""})` +
          `${complianceViolations.length ? `: ${complianceViolations.join("; ")}` : "."}`,
        details: complianceViolations,
      });
    }
  }

  return { consistencyContradictions, complianceViolations, blockers };
}

export interface DistributionGateResult {
  allowed: boolean;
  state: AuditState;
  /** Human-readable reason, safe to surface to a reviewer. */
  reason: string;
  /** True when the block is being bypassed by an explicit reviewer override. */
  overridden: boolean;
}

export interface DistributionGateOptions {
  /**
   * Reviewer's explicit acknowledgement that they have inspected the audit
   * failures and are overriding the block. Must be `true`; anything else blocks.
   * The caller is responsible for writing an AuditLog entry.
   */
  overrideWithJustification?: boolean;
  /** Identity of the reviewer granting the override, for the AuditLog. */
  overriddenBy?: string;
}

/**
 * Decides whether a report may be exported or published.
 *
 * Allow rules:
 *  - `CERTIFIED_AUTHENTIC` -> allowed
 *  - `VALIDATED_WITH_WARNINGS` -> allowed (warnings surface in the artifact)
 *  - `FAILED_UNRELIABLE` -> blocked unless `overrideWithJustification === true`
 *  - `UNKNOWN` (no audit / unparseable audit) -> blocked unless overridden
 */
export function evaluateDistributionGate(
  reportData: unknown,
  options: DistributionGateOptions = {},
): DistributionGateResult {
  const { verdict, overallScore, criticalFailures, evaluatedAt } = readAuditSummary(reportData);
  const { blockers } = readIntegritySummary(reportData);
  const overridden = options.overrideWithJustification === true;

  if (!BLOCKING_VERDICTS.has(verdict)) {
    // The authenticity audit passed, but consistency/compliance may still block.
    if (blockers.length > 0) {
      if (overridden) {
        return {
          allowed: true,
          state: verdict,
          reason:
            `Authenticity audit passed, but ${blockers.length} integrity check(s) were ` +
            `OVERRIDDEN by ${options.overriddenBy ?? "an authorised reviewer"}.`,
          overridden: true,
        };
      }
      return {
        allowed: false,
        state: verdict,
        reason: blockers
          .map((b) => {
            const detail =
              b.details.length > 0
                ? ` ${b.details.slice(0, 3).join(" ")}${b.details.length > 3 ? ` (+${b.details.length - 3} more)` : ""}`
                : "";
            return `${b.reason}${detail}`;
          })
          .join(" "),
        overridden: false,
      };
    }
    return {
      allowed: true,
      state: verdict,
      reason:
        verdict === "CERTIFIED_AUTHENTIC"
          ? `Authenticity audit passed with score ${overallScore ?? "n/a"}.`
          : `Authenticity audit passed with advisories (score ${overallScore ?? "n/a"}).`,
      overridden: false,
    };
  }

  if (overridden) {
    return {
      allowed: true,
      state: verdict,
      reason: `Blocked by authenticity audit but OVERRIDDEN by ${
        options.overriddenBy ?? "an authorised reviewer"
      }. ${criticalFailures.length} critical failure(s) acknowledged.`,
      overridden: true,
    };
  }

  if (verdict === "UNKNOWN") {
    return {
      allowed: false,
      state: verdict,
      reason:
        "No usable financial authenticity audit is attached to this report, so its figures cannot be verified. " +
        "Distribution is blocked until the audit runs and passes.",
      overridden: false,
    };
  }

  return {
    allowed: false,
    state: verdict,
    reason:
      `Financial authenticity audit FAILED (score ${overallScore ?? "n/a"}` +
      `${evaluatedAt ? `, evaluated ${evaluatedAt}` : ""}). ` +
      `Critical failures: ${criticalFailures.length ? criticalFailures.join("; ") : "unspecified"}. ` +
      "This report must not be distributed or exported in its current state.",
    overridden: false,
  };
}

/** Convenience predicate for callers that only need a boolean. */
export function isDistributionAllowed(reportData: unknown, options?: DistributionGateOptions): boolean {
  return evaluateDistributionGate(reportData, options).allowed;
}

/**
 * Maps a distribution-gate decision onto the report status that should be forced.
 * Used by the orchestrator so a failed audit can never be written as `published`.
 *
 * Also enforces the two checks that were previously computed and discarded:
 *  - the synthesis agent's cross-section consistency check, and
 *  - the SEBI compliance audit.
 * Both fail closed: a missing or malformed result blocks, because "we could not
 * check it" must not read as "it is fine".
 */
export function forcedStatusForAudit(reportData: unknown): "pending_review" | null {
  const { verdict } = readAuditSummary(reportData);
  if (verdict === "FAILED_UNRELIABLE" || verdict === "UNKNOWN") return "pending_review";

  if (!reportData || typeof reportData !== "object") return "pending_review";
  const rec = reportData as Record<string, unknown>;

  // ── Cross-section consistency ────────────────────────────────────────────
  // An unresolved high-severity contradiction means the report states numbers
  // that disagree with the model that produced them. That must not ship.
  const consistency = rec.consistencyCheck;
  if (!consistency || typeof consistency !== "object") return "pending_review";
  const consistencyRec = consistency as Record<string, unknown>;
  if (Array.isArray(consistencyRec.contradictions)) {
    const highSeverity = consistencyRec.contradictions.filter((c): c is Record<string, unknown> => {
      if (!c || typeof c !== "object") return false;
      const s = (c as Record<string, unknown>).severity;
      return s === "high" || s === "critical";
    });
    if (highSeverity.length > 0) return "pending_review";
  } else {
    // Present but unreadable — fail closed.
    return "pending_review";
  }

  // ── SEBI compliance ──────────────────────────────────────────────────────
  const compliance = rec.complianceAudit;
  if (!compliance || typeof compliance !== "object") return "pending_review";
  const complianceRec = compliance as Record<string, unknown>;
  if (complianceRec.isCompliant !== true) return "pending_review";
  if (Array.isArray(complianceRec.violations)) {
    const criticalViolations = complianceRec.violations.filter(
      (v): v is Record<string, unknown> =>
        Boolean(v) &&
        typeof v === "object" &&
        (v as Record<string, unknown>).severity === "critical",
    );
    if (criticalViolations.length > 0) return "pending_review";
  } else {
    return "pending_review";
  }

  return null;
}

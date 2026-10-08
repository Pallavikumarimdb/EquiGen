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
  const overridden = options.overrideWithJustification === true;

  if (!BLOCKING_VERDICTS.has(verdict)) {
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
 */
export function forcedStatusForAudit(reportData: unknown): "pending_review" | null {
  const { verdict } = readAuditSummary(reportData);
  if (verdict === "FAILED_UNRELIABLE" || verdict === "UNKNOWN") return "pending_review";
  return null;
}

/**
 * Research provenance for exported report artifacts.
 *
 * A published research note must not assert a data source it did not use. This
 * module turns the raw `dataSources` / `financialAudit` state attached to a report
 * into explicit, per-item provenance badges.
 *
 * Every item resolves to one of four states, and the badge reflects the state
 * rather than the intent:
 *
 *  - `verified`     the item was sourced from a live exchange/market-data feed
 *  - `fallback`     the item used a substitute (sector constants, partial data)
 *  - `unavailable`  the item was looked for and genuinely not found
 *  - `not_assessed` the item was never evaluated, so nothing can be claimed
 *
 * "Not assessed" is deliberately distinct from "verified". A missing assessment is
 * an absence of evidence, and rendering it as a green tick is how an unverified
 * number acquires the appearance of a verified one.
 */

import type { CertificationVerdict } from "@/lib/eval/financial-eval-engine";

export type ProvenanceState = "verified" | "fallback" | "unavailable" | "not_assessed";

export interface ProvenanceItem {
  label: string;
  state: ProvenanceState;
  /** Short badge text, e.g. "Verified" / "Not available" / "Not assessed". */
  badge: string;
  /** One-line explanation suitable for a footnote beneath the badge. */
  detail: string;
}

export interface ProvenanceSummary {
  items: ProvenanceItem[];
  /**
   * True when at least one item is not `verified`. Drives the report's data-quality
   * watermark so a reader is never shown an unqualified "all sources verified" note.
   */
  hasUnverifiedItems: boolean;
  /** Highest-severity state present, for headline placement. */
  worstState: ProvenanceState;
}

const BADGE: Record<ProvenanceState, string> = {
  verified: "Verified",
  fallback: "Fallback used",
  unavailable: "Not available",
  not_assessed: "Not assessed",
};

const CSS_CLASS: Record<ProvenanceState, string> = {
  verified: "prov-live",
  fallback: "prov-fallback",
  unavailable: "prov-fallback",
  not_assessed: "prov-fallback",
};

export function provenanceBadgeClass(state: ProvenanceState): string {
  return CSS_CLASS[state];
}

const SEVERITY_ORDER: Record<ProvenanceState, number> = {
  verified: 0,
  not_assessed: 1,
  fallback: 2,
  unavailable: 3,
};

/** Shape of the per-source state attached to a report by the orchestrator. */
export interface DataSourceEntry {
  isLive?: boolean;
  count?: number;
  found?: boolean;
  source?: string;
  isDerivedFromRealData?: boolean;
  quotesFound?: number;
}

export interface ProvenanceInput {
  dataSources?: Record<string, DataSourceEntry> | null;
  financialAudit?: Record<string, unknown> | null;
  /** As-of timestamp for the underlying data, ISO string. */
  asOf?: string | null;
}

function readVerdict(audit: Record<string, unknown> | null | undefined): CertificationVerdict | null {
  const v = audit?.verdict;
  return v === "CERTIFIED_AUTHENTIC" || v === "VALIDATED_WITH_WARNINGS" || v === "FAILED_UNRELIABLE"
    ? v
    : null;
}

function item(label: string, state: ProvenanceState, detail: string): ProvenanceItem {
  return { label, state, badge: BADGE[state], detail };
}

/**
 * Resolves the full provenance summary for a report.
 *
 * When `dataSources` is entirely absent, every item resolves to `not_assessed`.
 * This is the important default: an absent provenance block means we know nothing,
 * and the artifact must say so rather than falling back to a reassuring tick.
 */
export function resolveProvenance(input: ProvenanceInput): ProvenanceSummary {
  const ds = input.dataSources ?? null;
  const verdict = readVerdict(input.financialAudit);
  const hasSources = !!ds && Object.keys(ds).length > 0;

  // ── Research provenance: exchange filings ──────────────────────────────────
  const filings = ds?.bseNseFilings;
  let filingsItem: ProvenanceItem;
  if (!hasSources) {
    filingsItem = item(
      "Research Provenance",
      "not_assessed",
      "No data-source provenance was recorded for this report.",
    );
  } else if (filings?.isLive && (filings.count ?? 0) > 0) {
    filingsItem = item(
      "Research Provenance",
      "verified",
      `${filings.count} document(s) retrieved from BSE/NSE exchange disclosures.`,
    );
  } else {
    filingsItem = item(
      "Research Provenance",
      "unavailable",
      "No exchange filings were retrieved for this report.",
    );
  }

  // ── Credit rating ─────────────────────────────────────────────────────────
  const credit = ds?.creditRating;
  let creditItem: ProvenanceItem;
  if (!hasSources) {
    creditItem = item("Credit Rating", "not_assessed", "Credit rating was not assessed.");
  } else if (credit?.found && credit.isLive) {
    creditItem = item(
      "Credit Rating",
      "verified",
      credit.source
        ? `Rating agency disclosure: ${credit.source}.`
        : "Rating retrieved from an exchange-filed announcement.",
    );
  } else {
    creditItem = item(
      "Credit Rating",
      "unavailable",
      "No public credit-rating announcement was found on BSE/NSE. Many unrated companies have none.",
    );
  }

  // ── Valuation methodology ─────────────────────────────────────────────────
  const dcf = ds?.dcfModel;
  let valuationItem: ProvenanceItem;
  if (!hasSources) {
    valuationItem = item(
      "Valuation Methodology",
      "not_assessed",
      "Valuation inputs were never assessed for provenance.",
    );
  } else if (dcf?.isDerivedFromRealData === true) {
    valuationItem = item(
      "Valuation Methodology",
      "verified",
      dcf.source
        ? `DCF built on ${dcf.source} inputs.`
        : "DCF built on audited filing inputs.",
    );
  } else {
    valuationItem = item(
      "Valuation Methodology",
      "fallback",
      "DCF inputs were NOT company-specific — sector-average fallback constants were used, so the resulting target price is not research-grade.",
    );
  }

  // ── Overall authenticity verdict ──────────────────────────────────────────
  let verdictItem: ProvenanceItem;
  if (verdict === "CERTIFIED_AUTHENTIC") {
    const score = typeof input.financialAudit?.overallScore === "number"
      ? ` Score ${input.financialAudit.overallScore}/100.`
      : "";
    verdictItem = item("Financial Authenticity Audit", "verified", `All authenticity checks passed.${score}`);
  } else if (verdict === "VALIDATED_WITH_WARNINGS") {
    const warnings = Array.isArray(input.financialAudit?.warnings)
      ? (input.financialAudit.warnings as unknown[]).filter((w): w is string => typeof w === "string")
      : [];
    verdictItem = item(
      "Financial Authenticity Audit",
      "fallback",
      warnings.length
        ? `Passed with ${warnings.length} advisory item(s): ${warnings.join("; ")}`
        : "Passed with advisories.",
    );
  } else if (verdict === "FAILED_UNRELIABLE") {
    const failures = Array.isArray(input.financialAudit?.criticalFailures)
      ? (input.financialAudit.criticalFailures as unknown[]).filter((f): f is string => typeof f === "string")
      : [];
    verdictItem = item(
      "Financial Authenticity Audit",
      "unavailable",
      failures.length
        ? `FAILED — ${failures.join("; ")}. This note must not be distributed.`
        : "FAILED. This note must not be distributed.",
    );
  } else {
    verdictItem = item(
      "Financial Authenticity Audit",
      "not_assessed",
      "No authenticity audit is attached to this report, so its figures are unverified.",
    );
  }

  const items = [filingsItem, creditItem, valuationItem, verdictItem];
  const worstState = items.reduce<ProvenanceState>(
    (worst, i) => (SEVERITY_ORDER[i.state] > SEVERITY_ORDER[worst] ? i.state : worst),
    "verified",
  );

  return {
    items,
    hasUnverifiedItems: worstState !== "verified",
    worstState,
  };
}

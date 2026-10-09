/**
 * Consistency Checker Tool
 *
 * Scans generated report section text against structured financial modeling outputs
 * and extracted filings to detect numerical contradictions, target price mismatches,
 * or margin inconsistencies.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 *
 * The synthesis agent writes prose from structured data. Nothing previously verified
 * that the prose agreed with the data it was derived from, so a section could state a
 * target price, rating, WACC, revenue or margin that contradicted the model and the
 * report would still publish. The check ran on `executive_summary` only, was passed
 * `undefined` for the financials (so the rating check could never fire), and its
 * result was written to the database and then ignored.
 *
 * It now runs over EVERY section, receives the real extracted financials, and its
 * findings are blocking: a high-severity contradiction regenerates the offending
 * section with the discrepancy injected into the prompt.
 */

import { ModelingOutput } from "@/types/plan4";

export interface ConsistencyCheckResult {
  isConsistent: boolean;
  score: number; // 0.0 to 1.0 (1.0 = perfect consistency)
  contradictions: ContradictionItem[];
  warnings: string[];
  /** Sections that were checked. Empty means nothing could be checked. */
  sectionsChecked: string[];
}

export interface ContradictionItem {
  sectionName: string;
  field: string;
  expectedValue: string | number;
  foundValue: string | number;
  description: string;
  severity: "high" | "medium" | "low";
}

/** Numeric fields a section may state, mapped to where the truth lives. */
interface FieldProbe {
  field: string;
  /** Human label used in messages. */
  label: string;
  /** Extract the expected value from the model/financials. */
  expected: (model: ModelingOutput | undefined, fin: Record<string, unknown> | undefined) => number | null;
  /** Regex capturing the value as written in prose. */
  pattern: RegExp;
  /** Tolerance as a fraction, e.g. 0.02 = 2%. */
  tolerance: number;
  /** Severity when the deviation exceeds tolerance. */
  severity: "high" | "medium" | "low";
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Probes for numeric fields stated in prose.
 *
 * Each probe compares the number the section actually states against the number the
 * model or the extracted financials carry. A section that states no number for a
 * field is not a contradiction — it is simply silent — so absence is not flagged.
 */
const FIELD_PROBES: FieldProbe[] = [
  {
    field: "target_price",
    label: "target price",
    expected: (m) => (m?.baseTargetPrice ? Math.round(m.baseTargetPrice) : null),
    pattern: /(?:target price|tp|fair value|price target|valuation)(?:\s+\w+){0,4}?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)/i,
    tolerance: 0.05,
    severity: "high",
  },
  {
    field: "wacc",
    label: "WACC",
    expected: (m) => {
      const raw = m?.assumptions?.wacc;
      const n = num(raw);
      if (n === null) return null;
      // Stored either as a decimal (0.115) or a percent string ("11.5%").
      return n <= 1 ? n * 100 : n;
    },
    pattern: /wacc(?:\s+of|\s+is|\s*[:=])?\s*(\d+(?:\.\d+)?)\s*%/i,
    tolerance: 0.02,
    severity: "medium",
  },
  {
    field: "terminal_growth",
    label: "terminal growth",
    expected: (m) => {
      const raw = m?.assumptions?.terminalGrowth;
      const n = num(raw);
      if (n === null) return null;
      return n <= 1 ? n * 100 : n;
    },
    pattern: /terminal growth(?:\s+rate)?(?:\s+of|\s+is|\s*[:=])?\s*(\d+(?:\.\d+)?)\s*%/i,
    tolerance: 0.02,
    severity: "medium",
  },
  {
    field: "revenue",
    label: "revenue",
    expected: (_m, fin) => num(fin?.revenueCr),
    pattern: /(?:revenue|sales|turnover)(?:\s+\w+){0,3}?\s*(?:₹|rs\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:cr|crore|lakh|mn|million)?/i,
    tolerance: 0.03,
    severity: "high",
  },
  {
    field: "ebitda",
    label: "EBITDA",
    expected: (_m, fin) => num(fin?.ebitdaCr),
    pattern: /ebitda(?:\s+of|\s+is|\s*[:=])?\s*(?:₹|rs\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:cr|crore|lakh|mn|million)?/i,
    tolerance: 0.03,
    severity: "high",
  },
  {
    field: "pat",
    label: "net profit",
    expected: (_m, fin) => num(fin?.netIncomeCr),
    pattern: /(?:net profit|net income|pat)(?:\s+of|\s+is|\s*[:=])?\s*(?:₹|rs\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:cr|crore|lakh|mn|million)?/i,
    tolerance: 0.03,
    severity: "high",
  },
  {
    field: "ebitda_margin",
    label: "EBITDA margin",
    expected: (_m, fin) => {
      const m = num(fin?.ebitdaMargin);
      if (m === null) return null;
      return m <= 1 ? m * 100 : m;
    },
    pattern: /ebitda margin(?:\s+of|\s+is|\s*[:=])?\s*(\d+(?:\.\d+)?)\s*%/i,
    tolerance: 0.05,
    severity: "medium",
  },
  {
    field: "net_debt",
    label: "net debt",
    expected: (_m, fin) => num(fin?.netDebtCr),
    pattern: /net debt(?:\s+of|\s+is|\s*[:=])?\s*(?:₹|rs\.?)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:cr|crore|lakh|mn|million)?/i,
    tolerance: 0.05,
    severity: "medium",
  },
  {
    field: "shares_outstanding",
    label: "share count",
    expected: (_m, fin) => num(fin?.sharesOutstandingCr),
    pattern: /(\d+(?:\.\d+)?)\s*(?:cr|crore)\s*(?:shares|of shares)/i,
    tolerance: 0.02,
    severity: "low",
  },
];

export class ConsistencyCheckerTool {
  /**
   * Scans one section against model outputs and financial data.
   */
  public static checkSectionConsistency(
    sectionName: string,
    sectionText: string,
    modelOutput?: ModelingOutput,
    extractedFinancials?: Record<string, unknown>,
  ): ConsistencyCheckResult {
    const contradictions: ContradictionItem[] = [];
    const warnings: string[] = [];

    if (!sectionText || sectionText.trim().length === 0) {
      return {
        isConsistent: true,
        score: 1.0,
        contradictions: [],
        warnings: ["Section text is empty."],
        sectionsChecked: [sectionName],
      };
    }

    for (const probe of FIELD_PROBES) {
      const expected = probe.expected(modelOutput, extractedFinancials);
      if (expected === null) continue; // truth unknown for this field — nothing to compare

      const match = sectionText.match(probe.pattern);
      if (!match || !match[1]) continue; // section is silent on this field

      const found = parseFloat(match[1].replace(/,/g, ""));
      if (!Number.isFinite(found)) continue;

      const diff = Math.abs(found - expected);
      const diffPercent = expected !== 0 ? diff / Math.abs(expected) : diff > 0 ? 1 : 0;

      if (diffPercent > probe.tolerance) {
        const item: ContradictionItem = {
          sectionName,
          field: probe.field,
          expectedValue: probe.field.includes("margin") || probe.field === "wacc" || probe.field === "terminal_growth"
            ? `${expected.toFixed(1)}%`
            : `₹${Math.round(expected).toLocaleString("en-IN")}`,
          foundValue: probe.field.includes("margin") || probe.field === "wacc" || probe.field === "terminal_growth"
            ? `${found.toFixed(1)}%`
            : `₹${Math.round(found).toLocaleString("en-IN")}`,
          description:
            `${probe.label} stated in ${sectionName} (${found}) disagrees with the model value ` +
            `(${expected}) by ${(diffPercent * 100).toFixed(1)}%.`,
          severity: probe.severity,
        };
        contradictions.push(item);
      }
    }

    // Rating vs upside coherence. Requires the real current price, which is why the
    // financials argument matters: it was previously passed as `undefined`, so this
    // check could never fire in production.
    const currentPrice = num(extractedFinancials?.currentPrice);
    if (modelOutput?.baseTargetPrice && currentPrice !== null && currentPrice > 0) {
      const upsidePercent = ((modelOutput.baseTargetPrice - currentPrice) / currentPrice) * 100;
      if (upsidePercent > 15 && /SELL|REDUCE|UNDERPERFORM/i.test(sectionText)) {
        contradictions.push({
          sectionName,
          field: "recommendation_rating",
          expectedValue: "BUY / ACCUMULATE",
          foundValue: "SELL / REDUCE",
          description: `Section recommends SELL despite a ${upsidePercent.toFixed(1)}% modelled upside.`,
          severity: "high",
        });
      } else if (upsidePercent < 0 && /STRONG BUY|BUY/i.test(sectionText)) {
        contradictions.push({
          sectionName,
          field: "recommendation_rating",
          expectedValue: "HOLD / SELL",
          foundValue: "BUY",
          description: `Section recommends BUY despite a ${Math.abs(upsidePercent).toFixed(1)}% modelled downside.`,
          severity: "high",
        });
      }
    }

    const highSeverityCount = contradictions.filter((c) => c.severity === "high").length;
    const score = Math.max(0, 1.0 - highSeverityCount * 0.3 - contradictions.length * 0.1);

    return {
      isConsistent: contradictions.length === 0,
      score: parseFloat(score.toFixed(2)),
      contradictions,
      warnings,
      sectionsChecked: [sectionName],
    };
  }

  /**
   * Checks every section and merges the results.
   *
   * Used by the synthesis agent after all sections are generated, so a contradiction
   * in any section — not just the executive summary — is caught.
   */
  public static checkAllSections(
    sections: Array<{ name: string; content: string }>,
    modelOutput?: ModelingOutput,
    extractedFinancials?: Record<string, unknown>,
  ): ConsistencyCheckResult {
    const all: ConsistencyCheckResult[] = sections.map((s) =>
      ConsistencyCheckerTool.checkSectionConsistency(
        s.name,
        s.content,
        modelOutput,
        extractedFinancials,
      ),
    );

    return {
      isConsistent: all.every((r) => r.isConsistent),
      score: parseFloat(
        (all.reduce((sum, r) => sum + r.score, 0) / Math.max(all.length, 1)).toFixed(2),
      ),
      contradictions: all.flatMap((r) => r.contradictions),
      warnings: all.flatMap((r) => r.warnings),
      sectionsChecked: all.flatMap((r) => r.sectionsChecked),
    };
  }

  /**
   * Builds a prompt fragment describing a contradiction, for injection into a
   * regeneration request.
   */
  public static describeForRepair(result: ConsistencyCheckResult): string {
    return result.contradictions
      .map(
        (c) =>
          `- ${c.field}: the section states ${c.foundValue} but the model value is ` +
          `${c.expectedValue}. ${c.description}`,
      )
      .join("\n");
  }
}

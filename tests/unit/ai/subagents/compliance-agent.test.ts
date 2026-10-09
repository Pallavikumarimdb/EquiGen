/**
 * Regression tests for the SEBI compliance disclosure ordering bug.
 *
 * `ComplianceAgent` used to run the rule-based audit on the report text *before*
 * appending the statutory disclosures section. The audit raises a `critical`
 * violation when the SEBI registration number or the conflict-of-interest
 * statement is absent, and those two live in the disclosures the agent adds
 * moments later — so every run reported `isCompliant: false`.
 *
 * The verdict is now enforced by the publication gate, which means that ordering
 * bug would have blocked every report from ever being approved.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const auditReportAsync = vi.fn();
const auditReport = vi.fn();
const generateSebiDisclaimers = vi.fn();

vi.mock("@/lib/ai/tools/sebi-compliance-tool", () => ({
  SebiComplianceTool: {
    auditReportAsync: (...args: unknown[]) => auditReportAsync(...args),
    auditReport: (...args: unknown[]) => auditReport(...args),
    generateSebiDisclaimers: (...args: unknown[]) => generateSebiDisclaimers(...args),
  },
}));

vi.mock("@/lib/ai/trajectory-bus", () => ({
  trajectoryBus: { emitEvent: vi.fn() },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    subagentRun: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    user: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

import { ComplianceAgent } from "@/lib/ai/subagents/compliance-agent";
import type { ReportSection } from "@/types/plan4";

const now = "2026-03-12T10:00:00.000Z";

const SECTIONS: ReportSection[] = [
  {
    name: "executive_summary",
    content: "We rate the stock BUY with a 12-month target price.",
    citations: [],
    lastUpdatedAt: now,
  },
  {
    name: "valuation",
    content: "DCF-based fair value assessment.",
    citations: [],
    lastUpdatedAt: now,
  },
];

describe("ComplianceAgent disclosure ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateSebiDisclaimers.mockReturnValue(
      "SEBI Registration Number: INH000000123\nConflict of Interest Disclosure: none.",
    );
    auditReportAsync.mockImplementation(async (text: string) => {
      // Mirror the real rule-based behaviour: a critical violation when the
      // registration number or conflict disclosure is missing from the text.
      const hasRegNo = /INH\d{9}/i.test(text);
      const hasConflict = /conflict of interest/i.test(text);
      const violations = [
        ...(hasRegNo
          ? []
          : [
              {
                ruleId: "SEBI_RA_REG_NO",
                ruleName: "SEBI Registration Number Missing/Invalid",
                severity: "critical" as const,
                description: "reg no missing",
                recommendation: "add it",
              },
            ]),
        ...(hasConflict
          ? []
          : [
              {
                ruleId: "SEBI_CONFLICT_DISCLOSURE",
                ruleName: "Conflict of Interest Disclosure Missing",
                severity: "critical" as const,
                description: "conflict disclosure missing",
                recommendation: "add it",
              },
            ]),
      ];
      return {
        isCompliant: violations.length === 0,
        score: violations.length === 0 ? 100 : 30,
        violations,
        mandatoryDisclaimersPresent: [],
        missingDisclaimers: violations.map((v) => v.ruleName),
        auditMode: "rule_based_fallback" as const,
      };
    });
  });

  it("audits the document AFTER appending the statutory disclosures", async () => {
    await new ComplianceAgent().run({
      planId: "plan_1",
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      sections: SECTIONS,
      analystName: "Pallavi Kumari",
      sebiRegNo: "INH000000123",
      orgName: "EquiGen Research",
    });

    expect(generateSebiDisclaimers).toHaveBeenCalledTimes(1);
    expect(auditReportAsync).toHaveBeenCalledTimes(1);

    // The audited text must already contain the appended disclosures.
    const auditedText = auditReportAsync.mock.calls[0][0] as string;
    expect(auditedText).toContain("INH000000123");
    expect(auditedText).toMatch(/conflict of interest/i);
    expect(auditedText).toContain("disclosures:");
  });

  it("does not report a critical violation for disclosures it just appended", async () => {
    const out = await new ComplianceAgent().run({
      planId: "plan_1",
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      sections: SECTIONS,
      analystName: "Pallavi Kumari",
      sebiRegNo: "INH000000123",
      orgName: "EquiGen Research",
    });

    const critical = out.auditResult.violations.filter((v) => v.severity === "critical");
    expect(critical).toHaveLength(0);
    expect(out.auditResult.isCompliant).toBe(true);
    expect(out.disclosuresAdded).toBe(true);
  });

  it("still surfaces critical violations that the disclosures do not fix", async () => {
    auditReportAsync.mockResolvedValue({
      isCompliant: false,
      score: 30,
      violations: [
        {
          ruleId: "X",
          ruleName: "Unrealised performance claim",
          severity: "critical" as const,
          description: "Guaranteed returns language",
          recommendation: "remove",
        },
      ],
      mandatoryDisclaimersPresent: [],
      missingDisclaimers: [],
      auditMode: "rule_based_fallback" as const,
    });

    const out = await new ComplianceAgent().run({
      planId: "plan_1",
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      sections: SECTIONS,
      analystName: "Pallavi Kumari",
      sebiRegNo: "INH000000123",
      orgName: "EquiGen Research",
    });

    expect(out.auditResult.isCompliant).toBe(false);
    expect(out.auditResult.violations[0].severity).toBe("critical");
  });

  it("does not append a duplicate disclosures section when one already exists", async () => {
    const out = await new ComplianceAgent().run({
      planId: "plan_1",
      ticker: "TCS",
      companyName: "Tata Consultancy Services",
      sections: [
        ...SECTIONS,
        {
          name: "disclosures",
          content: "SEBI Registration Number: INH000000123\nConflict of Interest Disclosure: none.",
          citations: [],
          lastUpdatedAt: now,
        },
      ],
      analystName: "Pallavi Kumari",
      sebiRegNo: "INH000000123",
      orgName: "EquiGen Research",
    });

    expect(generateSebiDisclaimers).not.toHaveBeenCalled();
    expect(out.disclosuresAdded).toBe(false);
    expect(out.updatedSections.filter((s) => s.name === "disclosures")).toHaveLength(1);
  });
});
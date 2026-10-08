/**
 * Unit tests for the report publication state machine's quality and authenticity gates.
 *
 * These gates are the last line of defence before a research note carrying a
 * SEBI (Research Analysts) Regulations, 2014 certification reaches a client, so
 * they are tested explicitly rather than inferred from integration tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    reportHistory: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import {
  transitionReportStatus,
  isValidTransition,
  isQualityAckRequired,
  VALID_STATUS_TRANSITIONS,
  type ReportStatus,
} from "@/lib/report/state-machine";

const mockReport = {
  id: "rep_test",
  status: "pending_review",
  dataQuality: "ok",
  reviewerName: "Pallavi Kumari",
  sebiRegNo: "INH000000123",
  reportData: {
    financialAudit: {
      verdict: "CERTIFIED_AUTHENTIC",
      overallScore: 92,
      criticalFailures: [],
      warnings: [],
      evaluatedAt: "2026-03-12T10:00:00.000Z",
    },
  },
};

function arrangeReport(overrides: Record<string, unknown> = {}) {
  const report = { ...mockReport, ...overrides };
  vi.mocked(prisma.reportHistory.findUnique).mockResolvedValue(report as never);
  vi.mocked(prisma.reportHistory.update).mockResolvedValue({
    ...report,
    status: "approved",
  } as never);
  vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);
  return report;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("transition validity table", () => {
  it("treats published as terminal", () => {
    expect(VALID_STATUS_TRANSITIONS.published).toEqual([]);
    expect(isValidTransition("published", "draft")).toBe(false);
  });

  it("requires approval before publication", () => {
    expect(isValidTransition("pending_review", "published")).toBe(false);
    expect(isValidTransition("approved", "published")).toBe(true);
  });
});

describe("degraded-quality gate", () => {
  it.each([
    ["degraded", true],
    ["advisory", true],
    ["blocked", true],
    ["ok", false],
  ] as const)("dataQuality '%s' requires acknowledgement = %s", (dataQuality, expected) => {
    expect(isQualityAckRequired({ dataQuality })).toBe(expected);
  });

  it("refuses to approve a degraded report without an explicit acknowledgement", async () => {
    arrangeReport({ dataQuality: "degraded" });

    await expect(
      transitionReportStatus("rep_test", "approved", {
        actorId: "user-1",
        actorType: "human",
      }),
    ).rejects.toThrow(/degraded data quality/i);

    expect(prisma.reportHistory.update).not.toHaveBeenCalled();
  });

  it("allows approval of a degraded report once the reviewer acknowledges", async () => {
    arrangeReport({ dataQuality: "degraded" });

    await expect(
      transitionReportStatus("rep_test", "approved", {
        actorId: "user-1",
        actorType: "human",
        metadata: { qualityAck: true },
      }),
    ).resolves.toBeDefined();
  });
});

describe("financial authenticity gate", () => {
  it("refuses to approve a report certified FAILED_UNRELIABLE", async () => {
    arrangeReport({
      reportData: {
        financialAudit: {
          verdict: "FAILED_UNRELIABLE",
          overallScore: 38,
          criticalFailures: ["VAL_01: WACC <= terminal growth"],
          warnings: [],
          evaluatedAt: "2026-03-12T10:00:00.000Z",
        },
      },
    });

    await expect(
      transitionReportStatus("rep_test", "approved", {
        actorId: "user-1",
        actorType: "human",
      }),
    ).rejects.toThrow(/WACC <= terminal growth/);

    expect(prisma.reportHistory.update).not.toHaveBeenCalled();
  });

  it("refuses to publish a report that has no authenticity audit at all (fail closed)", async () => {
    arrangeReport({ reportData: { company: { ticker: "TCS" } } });

    await expect(
      transitionReportStatus("rep_test", "approved", {
        actorId: "user-1",
        actorType: "human",
      }),
    ).rejects.toThrow(/no usable financial authenticity audit/i);

    expect(prisma.reportHistory.update).not.toHaveBeenCalled();
  });

  it("writes a separate quality_override audit entry when a failed audit is overridden", async () => {
    arrangeReport({
      reportData: {
        financialAudit: {
          verdict: "FAILED_UNRELIABLE",
          overallScore: 38,
          criticalFailures: ["VAL_01: WACC <= terminal growth"],
          warnings: [],
          evaluatedAt: "2026-03-12T10:00:00.000Z",
        },
      },
    });

    await transitionReportStatus("rep_test", "approved", {
      actorId: "user-1",
      actorType: "human",
      metadata: { qualityAck: true, reviewerName: "Pallavi Kumari" },
    });

    const calls = vi.mocked(prisma.auditLog.create).mock.calls.map((c) => c[0].data);
    const stateChange = calls.find((c) => c.action === "state_change");
    const override = calls.find((c) => c.action === "quality_override");

    expect(stateChange).toBeDefined();
    expect(override).toBeDefined();
    expect(override?.metadata).toMatchObject({
      gate: "financial_authenticity",
      auditState: "FAILED_UNRELIABLE",
      acknowledgedBy: "Pallavi Kumari",
    });
  });

  it("does not record an override when the audit passed cleanly", async () => {
    arrangeReport();

    await transitionReportStatus("rep_test", "approved", {
      actorId: "user-1",
      actorType: "human",
    });

    const calls = vi.mocked(prisma.auditLog.create).mock.calls.map((c) => c[0].data);
    expect(calls.some((c) => c.action === "quality_override")).toBe(false);
    expect(calls.some((c) => c.action === "state_change")).toBe(true);
  });

  it("allows a VALIDATED_WITH_WARNINGS report to be approved without an override", async () => {
    arrangeReport({
      reportData: {
        financialAudit: {
          verdict: "VALIDATED_WITH_WARNINGS",
          overallScore: 71,
          criticalFailures: [],
          warnings: ["AUTH_02: freshness advisory"],
          evaluatedAt: "2026-03-12T10:00:00.000Z",
        },
      },
    });

    await expect(
      transitionReportStatus("rep_test", "approved", {
        actorId: "user-1",
        actorType: "human",
      }),
    ).resolves.toBeDefined();
  });

  it("does not apply the authenticity gate to a non-terminal transition", async () => {
    arrangeReport({
      status: "pending_review",
      reportData: { financialAudit: { verdict: "FAILED_UNRELIABLE", overallScore: 10 } },
    });

    await expect(
      transitionReportStatus("rep_test", "under_review", {
        actorId: "user-1",
        actorType: "human",
      }),
    ).resolves.toBeDefined();
  });
});

describe("SEBI credential requirement", () => {
  it("refuses approval without a reviewer name and registration number", async () => {
    arrangeReport({ reviewerName: null, sebiRegNo: null });

    await expect(
      transitionReportStatus("rep_test", "approved", {
        actorId: "user-1",
        actorType: "human",
      }),
    ).rejects.toThrow(/SEBI Registration Number and Reviewer Name are required/i);
  });

  it("rejects an invalid status transition", async () => {
    arrangeReport({ status: "draft" });

    await expect(
      transitionReportStatus("rep_test", "published" as ReportStatus, {
        actorId: "user-1",
        actorType: "human",
      }),
    ).rejects.toThrow(/Invalid status transition/i);
  });
});

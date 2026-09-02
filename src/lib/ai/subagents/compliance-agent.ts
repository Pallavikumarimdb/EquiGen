/**
 * Automated Compliance & SEBI Rule Checking Subagent (Phase 15)
 * Audits synthesized research report drafts against SEBI (Research Analysts) Regulations, 2014,
 * enforces mandatory disclaimers, appends statutory disclosures, and computes a Compliance Score.
 */

import { ReportSection } from "@/types/plan4";
import { SebiComplianceTool, SebiAuditResult } from "../tools/sebi-compliance-tool";
import { trajectoryBus } from "../trajectory-emitter";
import { prisma } from "@/lib/db";

export interface ComplianceInput {
  planId: string;
  runId?: string;
  ticker: string;
  companyName: string;
  sections: ReportSection[];
  analystName?: string;
  sebiRegNo?: string;
  orgName?: string;
}

export interface ComplianceOutput {
  runId: string;
  planId: string;
  auditResult: SebiAuditResult;
  updatedSections: ReportSection[];
  disclosuresAdded: boolean;
  completedAt: string;
}

export class ComplianceAgent {
  /**
   * Main entry point for Compliance Subagent execution
   */
  public async run(input: ComplianceInput): Promise<ComplianceOutput> {
    const runId = input.runId ?? `comp_${Date.now()}`;
    const startTime = Date.now();

    // 1. Log subagent start event
    trajectoryBus.emitEvent(
      input.planId,
      "subagent_start",
      { agent: "compliance", summary: `Auditing report draft for ${input.companyName} against SEBI RA Regulations 2014...` }
    );

    // Combine all sections text for audit
    const fullText = input.sections.map((s) => `${s.name}: ${s.content}`).join("\n\n");

    // 2. Perform SEBI Compliance Audit
    const auditResult = SebiComplianceTool.auditReport(
      fullText,
      input.sebiRegNo ?? "INH000012345",
      input.analystName ?? "Certified Analyst"
    );

    // 3. Append statutory disclosures section if missing
    const updatedSections = [...input.sections];
    let disclosuresAdded = false;

    const hasDisclosuresSection = updatedSections.some((s) => s.name === "disclosures");

    if (!hasDisclosuresSection) {
      const disclaimersText = SebiComplianceTool.generateSebiDisclaimers(
        input.analystName ?? "Pallavi Kumari",
        input.sebiRegNo ?? "INH000012345",
        input.orgName ?? "Pallavi's org"
      );

      updatedSections.push({
        name: "disclosures",
        content: disclaimersText,
        citations: ["sebi_ra_regulations_2014"],
        lastUpdatedAt: new Date().toISOString(),
      });
      disclosuresAdded = true;
    }

    // 4. Emit milestone done event & broadcast trajectory
    trajectoryBus.emitEvent(
      input.planId,
      "milestone_done",
      {
        milestoneRef: "compliance_audit",
        summary: `Compliance Audit Complete: Score ${auditResult.score}/100. ${auditResult.violations.length} violations flagged. ${disclosuresAdded ? "Statutory disclosures appended." : ""}`,
      },
      "compliance_audit"
    );

    // 5. DB record update (graceful for offline/demo tests)
    const runExists = await prisma.subagentRun.findUnique({ where: { id: runId } }).catch(() => null);
    if (runExists) {
      await prisma.subagentRun.update({
        where: { id: runId },
        data: {
          status: "completed",
          outputJson: { auditResult, disclosuresAdded } as unknown as import("@prisma/client").Prisma.JsonObject,
          latencyMs: Date.now() - startTime,
        },
      }).catch(() => {});
    }

    return {
      runId,
      planId: input.planId,
      auditResult,
      updatedSections,
      disclosuresAdded,
      completedAt: new Date().toISOString(),
    };
  }
}

export const complianceAgent = new ComplianceAgent();

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
    // Resolve real analyst name if input is a UUID or undefined
    let resolvedAnalyst = input.analystName;
    let resolvedSebiReg = input.sebiRegNo;
    let resolvedOrg = input.orgName;

    const isUuid = (str?: string | null) =>
      Boolean(str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str));

    if (!resolvedAnalyst || isUuid(resolvedAnalyst)) {
      try {
        const user = isUuid(resolvedAnalyst)
          ? await prisma.user.findUnique({ where: { id: resolvedAnalyst! }, include: { org: true } }).catch(() => null)
          : null;
        if (user) {
          resolvedAnalyst = user.name || user.email || "";
          if (!resolvedSebiReg && user.sebiRegNo) resolvedSebiReg = user.sebiRegNo;
          if (!resolvedOrg && user.org?.name) resolvedOrg = user.org.name;
        }
      } catch {
        // preserve existing
      }
    }

    if (isUuid(resolvedAnalyst)) resolvedAnalyst = "";
    if (isUuid(resolvedOrg)) resolvedOrg = "";

    // Ensure SEBI disclosure fields are never empty strings — Reg 18 requires
    // the analyst name to be stated; if genuinely missing, use explicit labels.
    if (!resolvedAnalyst || resolvedAnalyst.trim() === "") {
      resolvedAnalyst = "Analyst Name Pending Registration";
    }
    if (!resolvedSebiReg || resolvedSebiReg.trim() === "") {
      resolvedSebiReg = "Registration Pending — SEBI INH Format Required";
    }
    if (!resolvedOrg || resolvedOrg.trim() === "") {
      resolvedOrg = "Organisation Pending";
    }

    // 2. Append statutory disclosures section if missing
    //
    // This must happen BEFORE the audit. The disclosures carry the SEBI
    // registration number and the conflict-of-interest statement, and the rule-based
    // audit raises a *critical* violation when either is absent. Auditing first meant
    // the agent flagged its own not-yet-appended disclosures, so every run reported
    // `isCompliant: false`. Now that the verdict is enforced by the publication gate,
    // that ordering bug would have blocked every report.
    const updatedSections = [...input.sections];
    let disclosuresAdded = false;

    const hasDisclosuresSection = updatedSections.some((s) => s.name === "disclosures");

    if (!hasDisclosuresSection) {
      const disclaimersText = SebiComplianceTool.generateSebiDisclaimers(
        resolvedAnalyst,
        resolvedSebiReg,
        resolvedOrg
      );

      updatedSections.push({
        name: "disclosures",
        content: disclaimersText,
        citations: ["sebi_ra_regulations_2014"],
        lastUpdatedAt: new Date().toISOString(),
      });
      disclosuresAdded = true;
    }

    // 3. Perform SEBI Compliance Audit against the document as it will ship
    //    (Async semantic evaluation)
    const fullText = updatedSections.map((s) => `${s.name}: ${s.content}`).join("\n\n");
    const auditResult = await SebiComplianceTool.auditReportAsync(
      fullText,
      resolvedSebiReg,
      resolvedAnalyst
    );

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

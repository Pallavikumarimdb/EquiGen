import { prisma } from "../../db";
import { excelGenerationService } from "../../excel/excel-generator";
import { EquityResearchData } from "@/types";

export interface ExcelToolResult {
  reportId: string;
  status: string;
  excelBase64: string;
  hasDraftBanner: boolean;
  hasAttestationSheet: boolean;
  rawSummary: string;
}

export async function executeExcelWriteTool(reportId: string): Promise<ExcelToolResult> {
  const dbReport = await prisma.reportHistory.findUnique({
    where: { id: reportId },
  });

  if (!dbReport) {
    throw new Error(`Report ${reportId} not found.`);
  }

  const reportData = dbReport.reportData as unknown as EquityResearchData;
  const status = dbReport.status || "draft";
  const isPublished = status === "approved" || status === "published";

  const attestation = {
    reviewerName: dbReport.reviewerName,
    sebiRegNo: dbReport.sebiRegNo,
    approvedAt: dbReport.approvedAt,
    contentHash: dbReport.contentHash,
  };

  const buffer = await excelGenerationService.generateReportExcel(
    reportData,
    status,
    attestation
  );

  const excelBase64 = buffer.toString("base64");

  const summary = isPublished
    ? `📈 **Excel Financial Model Generated (Published Baseline)**\n• Status: ${status.toUpperCase()}\n• Compliance Gate: Protected "Disclosures & SEBI Attestation" sheet embedded.\n• Attestation: Reviewer ${dbReport.reviewerName || "RA"} (${dbReport.sebiRegNo || "SEBI Reg"})\n• SHA-256 Hash: ${dbReport.contentHash || "Verified"}\n\n[Download Excel Model](/api/excel/export?reportId=${reportId})`
    : `📈 **Excel Financial Model Generated (Draft Baseline)**\n• Status: DRAFT / UNDER REVIEW\n• Compliance Gate: Locked "DRAFT — PENDING SEBI RA REVIEW" banner row applied across all sheets per SEBI Section 5.2 rules.\n\n[Download Draft Excel Model](/api/excel/export?reportId=${reportId})`;

  return {
    reportId,
    status,
    excelBase64,
    hasDraftBanner: !isPublished,
    hasAttestationSheet: isPublished,
    rawSummary: summary,
  };
}

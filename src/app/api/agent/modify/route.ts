import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";
import { EquityResearchData } from "@/types";

interface ModifyRequestBody {
  reportId?: string;
  sessionId?: string;
  prompt: string;
  currentReport: EquityResearchData;
  requestedModifications?: Partial<EquityResearchData>;
}

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const sessionUser = getAuthSession(req);
    const userId = sessionUser?.userId || "analyst";
    const orgId = sessionUser?.orgId || "default-org";

    const body: ModifyRequestBody = await req.json();
    const { reportId, prompt, currentReport, requestedModifications } = body;

    if (!prompt || !currentReport) {
      return NextResponse.json(
        { message: "Missing required prompt or report context." },
        { status: 400 },
      );
    }

    // Clone report to mutate safely
    const updated: EquityResearchData = JSON.parse(JSON.stringify(currentReport));
    const appliedChanges: { field: string; from: unknown; to: unknown; reason: string }[] = [];

    const lowerPrompt = prompt.toLowerCase();

    // 1. Target Price updates (e.g. "target price to 1250", "tp to 1100", "target 1300")
    const tpMatch = prompt.match(/(?:target(?:\s+price)?|tp)\s*(?:to|=|is)?\s*₹?\s*([0-9,]+(?:\.[0-9]+)?)/i);
    if (tpMatch) {
      const newTp = parseFloat(tpMatch[1].replace(/,/g, ""));
      if (!isNaN(newTp) && newTp > 0) {
        const oldTp = updated.recommendation?.targetPrice;
        if (!updated.recommendation) {
          updated.recommendation = { rating: "BUY", targetPrice: newTp, currentPrice: null, upsidePotential: null, rationale: [] };
        }
        updated.recommendation.targetPrice = newTp;
        const cmp = updated.recommendation.currentPrice;
        const newUpside = cmp != null && cmp > 0 ? parseFloat((((newTp - cmp) / cmp) * 100).toFixed(1)) : null;
        updated.recommendation.upsidePotential = newUpside;

        appliedChanges.push({
          field: "recommendation.targetPrice",
          from: oldTp ? `₹${oldTp}` : "None",
          to: `₹${newTp}${newUpside != null ? ` (${newUpside >= 0 ? `+${newUpside}%` : `${newUpside}%`} upside)` : ""}`,
          reason: `Target price adjusted per user request "${prompt}"`,
        });
      }
    }

    // 2. Rating updates (e.g. "change rating to BUY", "rating to ACCUMULATE", "rating SELL")
    const ratingMatch = prompt.match(/\b(?:rating\s*(?:to|=|is)?\s*)?(BUY|ACCUMULATE|HOLD|REDUCE|SELL)\b/i);
    if (ratingMatch && (lowerPrompt.includes("rating") || lowerPrompt.includes("recommendation") || lowerPrompt.includes("downgrade") || lowerPrompt.includes("upgrade"))) {
      const newRating = ratingMatch[1].toUpperCase() as "BUY" | "ACCUMULATE" | "HOLD" | "REDUCE" | "SELL";
      const oldRating = updated.recommendation?.rating;
      if (!updated.recommendation) {
        updated.recommendation = { rating: newRating, targetPrice: null, currentPrice: null, upsidePotential: null, rationale: [] };
      }
      updated.recommendation.rating = newRating;

      appliedChanges.push({
        field: "recommendation.rating",
        from: oldRating || "None",
        to: newRating,
        reason: `Rating revised to ${newRating}`,
      });
    }

    // 3. Investment Risk addition
    if (lowerPrompt.includes("risk") || lowerPrompt.includes("headwind") || lowerPrompt.includes("threat")) {
      // Extract the risk phrase
      const riskSentence = prompt.replace(/^.*?(?:add\s+(?:a\s+)?risk(?:\s+about|\s+that|\s*:)?)\s*/i, "").trim();
      if (riskSentence && riskSentence.length > 5 && !riskSentence.toLowerCase().startsWith("what")) {
        if (!Array.isArray(updated.investmentRisks)) {
          updated.investmentRisks = [];
        }
        updated.investmentRisks.push(riskSentence);

        if (!updated.swotAnalysis) {
          updated.swotAnalysis = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
        }
        if (!Array.isArray(updated.swotAnalysis.threats)) {
          updated.swotAnalysis.threats = [];
        }
        updated.swotAnalysis.threats.push(riskSentence);

        appliedChanges.push({
          field: "investmentRisks",
          from: "Risks list",
          to: `+ "${riskSentence}"`,
          reason: "Added new risk factor to risk profile and SWOT threats matrix",
        });
      }
    }

    // 4. Executive Summary enrichment
    if (lowerPrompt.includes("summary") || lowerPrompt.includes("thesis")) {
      const summaryAddition = prompt.replace(/^.*?(?:mention|include|highlight|add to summary)\s*/i, "").trim();
      if (summaryAddition && summaryAddition.length > 5) {
        const enhancedSummary = `${updated.executiveSummary || ""}\n\nNote: ${summaryAddition}`;
        updated.executiveSummary = enhancedSummary;
        appliedChanges.push({
          field: "executiveSummary",
          from: "Previous summary",
          to: `Appended: "${summaryAddition}"`,
          reason: "Executive summary enhanced with analyst perspective",
        });
      }
    }

    // 5. Apply any explicit requested modifications passed in body (with prototype pollution guard)
    if (requestedModifications && typeof requestedModifications === "object" && !Array.isArray(requestedModifications)) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(requestedModifications)) {
        if (key !== "__proto__" && key !== "constructor" && key !== "prototype") {
          sanitized[key] = value;
        }
      }
      Object.assign(updated, sanitized);
      appliedChanges.push({
        field: "custom_patch",
        from: "Previous version",
        to: "Custom modifications applied",
        reason: "Direct patch applied",
      });
    }

    // If database report exists, enforce multi-tenant authorization before updating
    if (reportId && !reportId.startsWith("rep_default_sample") && !reportId.startsWith("demo_")) {
      try {
        const existingReport = await prisma.reportHistory.findUnique({
          where: { id: reportId },
          select: { id: true, orgId: true },
        });

        if (
          existingReport &&
          existingReport.orgId &&
          existingReport.orgId !== orgId &&
          orgId !== "default-org"
        ) {
          return NextResponse.json(
            { message: "Forbidden: Access denied to update this report." },
            { status: 403 },
          );
        }

        await prisma.reportHistory.update({
          where: { id: reportId },
          data: {
            reportData: updated as unknown as object,
            versionNo: { increment: 1 },
          },
        });

        await prisma.auditLog.create({
          data: {
            reportId,
            userId,
            actorType: "agent",
            action: "copilot_report_modified",
            metadata: JSON.parse(JSON.stringify({
              prompt,
              changes: appliedChanges,
              timestamp: new Date().toISOString(),
            })),
          },
        });
      } catch (dbErr) {
        console.warn("Could not persist report modification to database:", dbErr);
      }
    }

    // Build intelligent conversational reply
    let replyMessage = "";
    if (appliedChanges.length > 0) {
      replyMessage = `I have updated your research report for **${updated.company?.name || "the target company"}**:\n\n` +
        appliedChanges.map((c) => `• **${c.field}**: ${c.to} (${c.reason})`).join("\n") +
        `\n\nThe changes are now live on your active reading canvas.`;
    } else {
      replyMessage = `I've reviewed your request regarding **${updated.company?.name || "the equity report"}**. To update specific report values, you can give instructions like *"Update target price to 1250"*, *"Change rating to ACCUMULATE"*, or *"Add a risk regarding export tariffs"*.`;
    }

    return NextResponse.json({
      success: true,
      updatedReport: updated,
      appliedChanges,
      reply: replyMessage,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Report modification failed";
    console.error("POST /api/agent/modify error:", errorMsg);
    return NextResponse.json({ message: errorMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

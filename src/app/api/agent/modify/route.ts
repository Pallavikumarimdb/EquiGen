import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { EquityResearchData } from "@/types";
import { runThreeStatementModel, ThreeStatementDrivers } from "@/lib/financial-modeling/three-statement-engine";
import { executeCentralizedAIChat } from "@/lib/ai/central-client";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

interface ModifyRequestBody {
  reportId?: string;
  sessionId?: string;
  prompt: string;
  currentReport: EquityResearchData;
  requestedModifications?: Partial<EquityResearchData>;
}

export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    const userId = session.userId || "analyst";
    const orgId = session.orgId || "default-org";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawUpdated = updated as any;
    rawUpdated.modelingData = rawUpdated.modelingData || {};
    rawUpdated.modelingData.assumptions = rawUpdated.modelingData.assumptions || {};
    let modelDriversUpdated = false;

    // 1. Target Price updates (e.g. "target price to 1250", "tp to 1100", "target 1300", "set target price to 1450")
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

    // 3. WACC / Discount Rate updates (e.g. "set WACC to 10.5%", "update discount rate to 11%")
    const waccMatch = prompt.match(/(?:wacc|discount\s+rate|cost\s+of\s+capital)\s*(?:to|=|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
    if (waccMatch) {
      const val = parseFloat(waccMatch[1]);
      if (!isNaN(val) && val > 0 && val < 100) {
        const decimalVal = val > 1 ? val / 100 : val;
        const pctVal = val > 1 ? val : val * 100;
        const oldWacc = rawUpdated.modelingData.assumptions.wacc;
        rawUpdated.modelingData.assumptions.wacc = decimalVal;
        modelDriversUpdated = true;

        appliedChanges.push({
          field: "modelingData.assumptions.wacc",
          from: oldWacc != null ? `${oldWacc > 1 ? oldWacc : (oldWacc * 100).toFixed(1)}%` : "11.5%",
          to: `${pctVal.toFixed(1)}%`,
          reason: `WACC discount rate revised per user request "${prompt}"`,
        });
      }
    }

    // 4. Terminal Growth Rate updates (e.g. "terminal growth to 4.5%", "set terminal growth rate to 4%")
    const tgMatch = prompt.match(/(?:terminal\s+growth(?:\s+rate)?|terminal\s+g|long[- ]term\s+growth)\s*(?:to|=|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
    if (tgMatch) {
      const val = parseFloat(tgMatch[1]);
      if (!isNaN(val) && val >= 0 && val < 20) {
        const decimalVal = val > 1 ? val / 100 : val;
        const pctVal = val > 1 ? val : val * 100;
        const oldTg = rawUpdated.modelingData.assumptions.terminalGrowth;
        rawUpdated.modelingData.assumptions.terminalGrowth = decimalVal;
        modelDriversUpdated = true;

        appliedChanges.push({
          field: "modelingData.assumptions.terminalGrowth",
          from: oldTg != null ? `${oldTg > 1 ? oldTg : (oldTg * 100).toFixed(1)}%` : "4.0%",
          to: `${pctVal.toFixed(1)}%`,
          reason: `Terminal growth rate adjusted to ${pctVal.toFixed(1)}%`,
        });
      }
    }

    // 5. EBITDA Margin updates (e.g. "set EBITDA margin to 22%", "margin to 19.5%")
    const marginMatch = prompt.match(/(?:ebitda\s+margin|operating\s+margin|operating\s+margin\s*\(?ebitda\)?|margin)\s*(?:to|=|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
    if (marginMatch && (lowerPrompt.includes("margin") || lowerPrompt.includes("ebitda"))) {
      const val = parseFloat(marginMatch[1]);
      if (!isNaN(val) && val > 0 && val < 100) {
        const decimalVal = val > 1 ? val / 100 : val;
        const pctVal = val > 1 ? val : val * 100;
        const oldMargin = rawUpdated.modelingData.assumptions.ebitdaMargin;
        rawUpdated.modelingData.assumptions.ebitdaMargin = decimalVal;
        modelDriversUpdated = true;

        appliedChanges.push({
          field: "modelingData.assumptions.ebitdaMargin",
          from: oldMargin != null ? `${oldMargin > 1 ? oldMargin : (oldMargin * 100).toFixed(1)}%` : "18.0%",
          to: `${pctVal.toFixed(1)}%`,
          reason: `Target operating EBITDA margin set to ${pctVal.toFixed(1)}%`,
        });
      }
    }

    // 6. Revenue Growth Rate updates (e.g. "set revenue growth to 15%", "revenue growth rate to 14%")
    const growthMatch = prompt.match(/(?:revenue\s+growth(?:\s+rate)?|sales\s+growth(?:\s+rate)?|topline\s+growth|growth\s+rate)\s*(?:to|=|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
    if (growthMatch) {
      const val = parseFloat(growthMatch[1]);
      if (!isNaN(val) && val > -50 && val < 200) {
        const decimalVal = val > 1 ? val / 100 : val;
        const pctVal = val > 1 ? val : val * 100;
        const oldGrowth = rawUpdated.modelingData.assumptions.revenueGrowthRate;
        rawUpdated.modelingData.assumptions.revenueGrowthRate = decimalVal;
        modelDriversUpdated = true;

        appliedChanges.push({
          field: "modelingData.assumptions.revenueGrowthRate",
          from: oldGrowth != null ? `${oldGrowth > 1 ? oldGrowth : (oldGrowth * 100).toFixed(1)}%` : "12.0%",
          to: `${pctVal.toFixed(1)}%`,
          reason: `Projected annual revenue growth adjusted to ${pctVal.toFixed(1)}%`,
        });
      }
    }

    // 7. Working Capital Days updates (DSO, DIO, DPO)
    const dsoMatch = prompt.match(/(?:dso|receivables?\s+days?|debtor\s+days?|days\s+sales\s+outstanding)\s*(?:to|=|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:days?)?/i);
    if (dsoMatch) {
      const val = Math.round(parseFloat(dsoMatch[1]));
      if (!isNaN(val) && val >= 0 && val <= 365) {
        const oldDso = rawUpdated.modelingData.assumptions.dso;
        rawUpdated.modelingData.assumptions.dso = val;
        modelDriversUpdated = true;

        appliedChanges.push({
          field: "modelingData.assumptions.dso",
          from: oldDso != null ? `${oldDso} days` : "55 days",
          to: `${val} days`,
          reason: `Receivables collection cycle updated to ${val} days`,
        });
      }
    }

    const dioMatch = prompt.match(/(?:dio|inventory\s+days?|days\s+inventory\s+outstanding)\s*(?:to|=|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:days?)?/i);
    if (dioMatch) {
      const val = Math.round(parseFloat(dioMatch[1]));
      if (!isNaN(val) && val >= 0 && val <= 365) {
        const oldDio = rawUpdated.modelingData.assumptions.dio;
        rawUpdated.modelingData.assumptions.dio = val;
        modelDriversUpdated = true;

        appliedChanges.push({
          field: "modelingData.assumptions.dio",
          from: oldDio != null ? `${oldDio} days` : "45 days",
          to: `${val} days`,
          reason: `Inventory holding period updated to ${val} days`,
        });
      }
    }

    const dpoMatch = prompt.match(/(?:dpo|payables?\s+days?|creditor\s+days?|days\s+payables?\s+outstanding)\s*(?:to|=|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:days?)?/i);
    if (dpoMatch) {
      const val = Math.round(parseFloat(dpoMatch[1]));
      if (!isNaN(val) && val >= 0 && val <= 365) {
        const oldDpo = rawUpdated.modelingData.assumptions.dpo;
        rawUpdated.modelingData.assumptions.dpo = val;
        modelDriversUpdated = true;

        appliedChanges.push({
          field: "modelingData.assumptions.dpo",
          from: oldDpo != null ? `${oldDpo} days` : "40 days",
          to: `${val} days`,
          reason: `Payables credit period updated to ${val} days`,
        });
      }
    }

    // 8. Capex Intensity updates
    const capexMatch = prompt.match(/(?:capex(?:\s+as\s+%|\s+intensity|\s+percent|\s+percentage)?)\s*(?:to|=|is)?\s*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
    if (capexMatch && (lowerPrompt.includes("capex") || lowerPrompt.includes("capital expenditure"))) {
      const val = parseFloat(capexMatch[1]);
      if (!isNaN(val) && val >= 0 && val < 50) {
        const decimalVal = val > 1 ? val / 100 : val;
        const pctVal = val > 1 ? val : val * 100;
        const oldCapex = rawUpdated.modelingData.assumptions.capexAsPercentRevenue;
        rawUpdated.modelingData.assumptions.capexAsPercentRevenue = decimalVal;
        modelDriversUpdated = true;

        appliedChanges.push({
          field: "modelingData.assumptions.capexAsPercentRevenue",
          from: oldCapex != null ? `${oldCapex > 1 ? oldCapex : (oldCapex * 100).toFixed(1)}%` : "5.0%",
          to: `${pctVal.toFixed(1)}%`,
          reason: `Capex reinvestment rate updated to ${pctVal.toFixed(1)}% of revenue`,
        });
      }
    }

    // 9. Investment Risk addition
    if (lowerPrompt.includes("risk") || lowerPrompt.includes("headwind") || lowerPrompt.includes("threat")) {
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

    // 10. Executive Summary & Thesis enrichment
    if (lowerPrompt.includes("summary") || lowerPrompt.includes("thesis")) {
      const summaryAddition = prompt.replace(/^.*?(?:mention|include|highlight|add to summary|update summary to|update thesis to)\s*/i, "").trim();
      if (summaryAddition && summaryAddition.length > 5 && !summaryAddition.toLowerCase().startsWith("what")) {
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

    // 11. If model drivers were updated, run the linked 3-statement model to recalculate DCF
    if (modelDriversUpdated) {
      const curAssump = rawUpdated.modelingData.assumptions || {};

      const baseRev = typeof curAssump.baseRevenue === "number" && curAssump.baseRevenue > 0
        ? curAssump.baseRevenue
        : typeof curAssump.revenue === "number" && curAssump.revenue > 0
        ? curAssump.revenue
        : typeof updated.fiveYearSummary?.[updated.fiveYearSummary.length - 1]?.sales === "number"
        ? (updated.fiveYearSummary[updated.fiveYearSummary.length - 1].sales as number)
        : 10000;

      const sharesCr = typeof updated.companyData?.outstandingShares === "number" && updated.companyData.outstandingShares > 0
        ? updated.companyData.outstandingShares
        : typeof curAssump.sharesCr === "number" && curAssump.sharesCr > 0
        ? curAssump.sharesCr
        : 50;

      const drivers: ThreeStatementDrivers = {
        baseRevenue: baseRev,
        sharesOutstandingCr: sharesCr,
        revenueGrowthRate: typeof curAssump.revenueGrowthRate === "number"
          ? (curAssump.revenueGrowthRate > 1 ? curAssump.revenueGrowthRate / 100 : curAssump.revenueGrowthRate)
          : 0.12,
        ebitdaMargin: typeof curAssump.ebitdaMargin === "number"
          ? (curAssump.ebitdaMargin > 1 ? curAssump.ebitdaMargin / 100 : curAssump.ebitdaMargin)
          : 0.18,
        taxRate: 0.25,
        dso: typeof curAssump.dso === "number" ? curAssump.dso : 55,
        dio: typeof curAssump.dio === "number" ? curAssump.dio : 45,
        dpo: typeof curAssump.dpo === "number" ? curAssump.dpo : 40,
        capexAsPercentRevenue: typeof curAssump.capexAsPercentRevenue === "number"
          ? (curAssump.capexAsPercentRevenue > 1 ? curAssump.capexAsPercentRevenue / 100 : curAssump.capexAsPercentRevenue)
          : 0.05,
        depreciationRate: 0.09,
        interestRateOnDebt: 0.085,
        dividendPayoutRatio: 0.15,
        debtRepaymentRate: 0.10,
        wacc: typeof curAssump.wacc === "number"
          ? (curAssump.wacc > 1 ? curAssump.wacc / 100 : curAssump.wacc)
          : 0.115,
        terminalGrowth: typeof curAssump.terminalGrowth === "number"
          ? (curAssump.terminalGrowth > 1 ? curAssump.terminalGrowth / 100 : curAssump.terminalGrowth)
          : 0.04,
        projectionYears: 5,
      };

      try {
        const modelOut = runThreeStatementModel(drivers);
        rawUpdated.modelingData.baseTargetPrice = modelOut.targetPrice;
        rawUpdated.modelingData.bullTargetPrice = modelOut.bullCasePrice;
        rawUpdated.modelingData.bearTargetPrice = modelOut.bearCasePrice;
        rawUpdated.modelingData.projections = modelOut.projections;

        // If the user did not explicitly override the target price in this prompt,
        // sync recommendation target price with the newly derived DCF target price
        if (!tpMatch) {
          const oldTp = updated.recommendation?.targetPrice;
          if (!updated.recommendation) {
            updated.recommendation = { rating: "BUY", targetPrice: modelOut.targetPrice, currentPrice: null, upsidePotential: null, rationale: [] };
          }
          updated.recommendation.targetPrice = modelOut.targetPrice;
          const cmp = updated.recommendation.currentPrice;
          const newUpside = cmp != null && cmp > 0 ? parseFloat((((modelOut.targetPrice - cmp) / cmp) * 100).toFixed(1)) : null;
          updated.recommendation.upsidePotential = newUpside;

          appliedChanges.push({
            field: "recommendation.targetPrice (DCF Model)",
            from: oldTp != null ? `₹${oldTp}` : "Previous",
            to: `₹${modelOut.targetPrice}${newUpside != null ? ` (${newUpside >= 0 ? `+${newUpside}%` : `${newUpside}%`} upside)` : ""}`,
            reason: "Target price dynamically recalculated via linked 3-statement DCF model",
          });
        }
      } catch (calcErr) {
        console.warn("[Modify API] DCF recalculation failed:", calcErr);
      }
    }

    // 12. Apply any explicit requested modifications passed in body (with prototype pollution guard)
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

    // 13. Fallback LLM-Assisted Patch for natural language modifications if regexes did not match
    if (appliedChanges.length === 0) {
      const hasModifyKeywords =
        lowerPrompt.includes("modify") ||
        lowerPrompt.includes("update") ||
        lowerPrompt.includes("change") ||
        lowerPrompt.includes("set") ||
        lowerPrompt.includes("revise") ||
        lowerPrompt.includes("adjust") ||
        lowerPrompt.includes("add") ||
        lowerPrompt.includes("rewrite");

      if (hasModifyKeywords) {
        try {
          const systemPatchPrompt = `You are a financial data patch assistant for equity research reports.
Analyze the user's modification request and output ONLY a JSON object with this shape:
{
  "changes": [
    {
      "path": "recommendation.rating" | "recommendation.targetPrice" | "executiveSummary" | "investmentRisks" | "modelingData.assumptions.wacc" | "modelingData.assumptions.terminalGrowth" | "modelingData.assumptions.ebitdaMargin" | "modelingData.assumptions.revenueGrowthRate" | "modelingData.assumptions.dso",
      "value": <the extracted new value>,
      "reason": "<short explanation>"
    }
  ]
}
If no explicit modification is requested, return {"changes": []}. Do not output any markdown formatting or commentary outside the JSON.`;

          const patchRes = await executeCentralizedAIChat({
            prompt: `User instruction: "${prompt}"`,
            systemPrompt: systemPatchPrompt,
            companyName: updated.company?.name,
            ticker: updated.company?.ticker,
            cmp: updated.recommendation?.currentPrice ?? undefined,
            tp: updated.recommendation?.targetPrice ?? undefined,
            rating: updated.recommendation?.rating ?? undefined,
          });

          if (patchRes?.content) {
            const cleanJson = patchRes.content.replace(/```json/g, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleanJson);
            if (Array.isArray(parsed?.changes)) {
              for (const c of parsed.changes) {
                if (typeof c.path === "string" && c.value !== undefined) {
                  if (c.path === "recommendation.rating" && typeof c.value === "string") {
                    updated.recommendation.rating = c.value as "BUY" | "ACCUMULATE" | "HOLD" | "REDUCE" | "SELL";
                    appliedChanges.push({ field: c.path, from: "Prior Rating", to: c.value, reason: c.reason || "AI patch" });
                  } else if (c.path === "recommendation.targetPrice" && typeof c.value === "number") {
                    updated.recommendation.targetPrice = c.value;
                    const cmp = updated.recommendation.currentPrice;
                    const newUpside = cmp != null && cmp > 0 ? parseFloat((((c.value - cmp) / cmp) * 100).toFixed(1)) : null;
                    updated.recommendation.upsidePotential = newUpside;
                    appliedChanges.push({ field: c.path, from: "Prior TP", to: `₹${c.value}`, reason: c.reason || "AI patch" });
                  } else if (c.path === "executiveSummary" && typeof c.value === "string") {
                    updated.executiveSummary = c.value;
                    appliedChanges.push({ field: c.path, from: "Prior Summary", to: c.value.slice(0, 50) + "...", reason: c.reason || "AI patch" });
                  } else if (c.path === "investmentRisks") {
                    if (!Array.isArray(updated.investmentRisks)) updated.investmentRisks = [];
                    if (typeof c.value === "string") updated.investmentRisks.push(c.value);
                    else if (Array.isArray(c.value)) updated.investmentRisks.push(...c.value);
                    appliedChanges.push({ field: c.path, from: "Risks", to: `Added risk`, reason: c.reason || "AI patch" });
                  }
                }
              }
            }
          }
        } catch (llmPatchErr) {
          console.warn("[Modify API] LLM patcher error:", llmPatchErr);
        }
      }
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
      replyMessage = `I've reviewed your request regarding **${updated.company?.name || "the equity report"}**. To update specific report values, you can give instructions like:\n\n` +
        `• *"Update target price to 1450"*\n` +
        `• *"Change rating to ACCUMULATE"*\n` +
        `• *"Set WACC to 10.5%"*\n` +
        `• *"Update EBITDA margin to 22%"*\n` +
        `• *"Set terminal growth to 4.5%"*\n` +
        `• *"Set DSO to 50 days"*\n` +
        `• *"Add a risk regarding export tariff volatility"*`;
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

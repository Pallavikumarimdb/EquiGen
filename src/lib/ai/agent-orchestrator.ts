import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ReportStatus } from "../report/state-machine";
import { applyFieldUpdates } from "../report/proposal-apply";
import {
  getModelForRequest,
  getFallbackGroqModel,
  recordActualUsage,
} from "./model-router";
import { withRateLimitRetry, RateLimitError } from "./retry-wrapper";
import { EquityResearchData } from "@/types";

export interface AgentChatMessage {
  role: "user" | "agent";
  content: string;
}

/** Exact-match approval/apply intents (normalized: lowercased, trimmed, trailing punctuation stripped). */
const APPROVAL_INTENTS = new Set([
  "approved",
  "approve",
  "approve it",
  "approve all",
  "approve them",
  "approve these",
  "accepted",
  "accept",
  "accept all",
  "accept it",
  "accept them",
  "apply",
  "apply it",
  "apply all",
  "apply them",
  "apply the changes",
  "add them to the report",
  "add it to the report",
  "add them",
  "add it",
  "add these to the report",
  "add to the report",
  "add to report",
  "update the report",
  "update the report now",
  "go ahead",
  "go ahead with it",
  "yes",
  "yeah",
  "yep",
  "ok",
  "okay",
  "sure",
  "sounds good",
]);

function normalizeIntent(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[.!?]+$/, "")
    .trim();
}

export class AgentOrchestrator {
  /**
   * Processes a conversation turn using a lightweight ReAct-like custom parser.
   * Leverages the RecomputeFieldTool internally to alter reportData, enforcing state-gated forking.
   * Routes through the ModelRouter (size + daily-quota pre-flight) and falls back to
   * the 8B model when the primary model is rate-limited for a long cooldown.
   */
  public async handleAgentTurn(
    sessionId: string,
    userPrompt: string,
    options: {
      provider: "groq" | "openai";
      apiKey?: string;
      modelName?: string;
    },
  ): Promise<{
    response: string;
    forkedReportId?: string;
    correctionsApplied?: boolean;
  }> {
    const startTime = Date.now();

    // 1. Fetch ResearchSession & its Report
    const session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      include: { messages: true },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    const reportId = session.reportId;
    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    });

    if (!dbReport) {
      throw new Error(`Report ${reportId} not found.`);
    }

    // Save user message to database
    await prisma.conversationMessage.create({
      data: { sessionId, role: "user", content: userPrompt },
    });

    let forkedReportId: string | undefined;

    // --- INTENT INTERCEPT: "approved" / "add them to the report" etc. ---
    // Rather than trusting the LLM to replay a tool call, apply any pending
    // correction proposals deterministically and reply with a confirmation.
    if (APPROVAL_INTENTS.has(normalizeIntent(userPrompt))) {
      const pendingProposals = await prisma.correctionProposal.findMany({
        where: { reportId, status: "pending" },
        orderBy: { createdAt: "asc" },
      });

      if (pendingProposals.length > 0) {
        const applyResult = await applyFieldUpdates(
          reportId,
          pendingProposals.map((p) => ({
            field: p.field,
            newValue: p.newValue ?? null,
            oldValue: p.oldValue ?? undefined,
            reasoning: p.reasoning,
          })),
          {
            sessionId,
            actorId: "analyst",
            actorType: "human",
          },
        );

        for (const p of pendingProposals) {
          await prisma.correctionProposal.update({
            where: { id: p.id },
            data: {
              status: "approved",
              reviewedBy: "analyst",
              reviewedAt: new Date(),
            },
          });
          await prisma.auditLog.create({
            data: {
              reportId: p.reportId,
              userId: "analyst",
              actorType: "human",
              action: "field_correction_approved",
              metadata: {
                proposalId: p.id,
                field: p.field,
                oldValue: p.oldValue,
                newValue: p.newValue,
              },
            },
          });
        }

        const appliedFields = pendingProposals
          .map((p) => `\`${p.field}\``)
          .join(", ");
        let responseText = `I have applied ${pendingProposals.length} approved correction(s) to the report: ${appliedFields}. The report preview and PDF now reflect the updates.`;
        if (applyResult.forkedReportId) {
          forkedReportId = applyResult.forkedReportId;
          responseText += `\n*Note: Since the report was approved/published, it has been forked to a new draft baseline (ID: ${applyResult.forkedReportId}) in changes_requested status.*`;
        }

        await prisma.conversationMessage.create({
          data: { sessionId, role: "agent", content: responseText },
        });
        return {
          response: responseText,
          forkedReportId,
          correctionsApplied: true,
        };
      }
    }

    // 2. Build system instructions
    const reportData = dbReport.reportData as unknown as EquityResearchData;

    const systemPrompt = `You are EquiGen's AI Co-Pilot. You have access to the current state of the equity research report.
Current report data:
${JSON.stringify(reportData, null, 2)}

You can answer questions or propose field updates.
If you need to search or view the original PDF document source text to answer the user's question, you MUST use one of the search tools.
Available Search Tools:
1. To search pages for specific keywords or text, respond with exactly this JSON block (and nothing else):
{
  "tool": "search_pages",
  "query": "search query here",
  "reasoning": "reasoning here"
}

2. To fetch the full verbatim text of a specific page, respond with exactly this JSON block (and nothing else):
{
  "tool": "fetch_page",
  "pageNumber": 12,
  "reasoning": "reasoning here"
}

If the user wants to change a metric, recommendation, text, or add new sections (e.g. target price, rating, swot, outlook, competitors), output a special command to invoke the RecomputeFieldTool.
To run the RecomputeFieldTool, respond with exactly a JSON block matching this structure (and nothing else — no prose, no explanation, no markdown):
{
  "tool": "RecomputeFieldTool",
  "field": "recommendation.targetPrice", // dot-notated field path to update
  "value": 450, // the new value (number, string, or array)
  "reasoning": "Updating target price per analyst request"
}
CRITICAL RULES:
1. You CANNOT modify the report yourself. Never claim "I have added/updated the report" — you only ever PROPOSE a change via the JSON above.
2. The JSON block above must be your ENTIRE response when proposing a change.
3. If the user confirms a proposal you already made (e.g. "approved", "add them to the report"), those pending proposals are applied automatically by the system — briefly confirm "Approved corrections have been applied." and do NOT emit another tool call for the same field.
4. For questions or analysis, respond with normal conversation text. If you need live data you do not have (e.g. competitor equity analysis), answer from general knowledge and clearly label it as indicative, NOT as report data.
5. Do not dump the entire report JSON back at the user — describe changes briefly in plain text.`;

    const preferredModel =
      options.modelName ||
      (options.provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

    const messages: [string, string][] = [["system", systemPrompt]];
    session.messages.forEach((m) => {
      messages.push([m.role === "user" ? "user" : "assistant", m.content]);
    });
    messages.push(["user", userPrompt]);

    let responseText = "";
    let loopAttempts = 0;

    while (loopAttempts < 5) {
      loopAttempts++;

      const promptString = messages.map((m) => m[1]).join("\n");
      const { model, modelName, downgraded } = await getModelForRequest(
        options,
        promptString,
        preferredModel,
      );

      if (downgraded) {
        console.warn(
          `[AgentOrchestrator] Chat rerouted to ${modelName} (size or daily quota).`,
        );
      }

      let res;
      try {
        res = await withRateLimitRetry(
          () => model.invoke(messages),
          2,
          undefined,
          undefined,
          options.provider === "groq"
            ? () => getFallbackGroqModel(options).invoke(messages)
            : undefined,
        );
      } catch (err) {
        if (err instanceof RateLimitError) throw err;
        throw new Error(
          `AI Co-Pilot request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      recordActualUsage(modelName, promptString, String(res?.content ?? ""));

      const content = String(res.content).trim();

      // Check if LLM requested the RecomputeFieldTool
      if (
        content.includes('"tool"') &&
        content.includes('"RecomputeFieldTool"')
      ) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const toolRequest = JSON.parse(jsonMatch[0]);
            const { field, value, reasoning } = toolRequest;

            const toolResult = await this.executeRecomputeFieldTool(
              sessionId,
              reportId,
              field,
              value,
              reasoning,
              startTime,
            );

            responseText = `I have proposed a correction to update \`${field}\` to \`${JSON.stringify(value)}\`.\nReason: ${reasoning || "Recompute requested"}.`;
            if (toolResult.forkedReportId) {
              forkedReportId = toolResult.forkedReportId;
              responseText += `\n*Note: Since the report was approved/published, it has been forked to a new draft baseline (ID: ${forkedReportId}) in changes_requested status.*`;
            }
          }
        } catch (err) {
          console.error("Failed to parse RecomputeFieldTool JSON:", err);
          responseText = `I attempted to propose a change but encountered a formatting error. Please try again.`;
        }
        break;
      }

      // Check if LLM requested search_pages tool
      if (content.includes('"tool"') && content.includes('"search_pages"')) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const toolRequest = JSON.parse(jsonMatch[0]);
            const { query } = toolRequest;
            const searchResult = await this.executeSearchPagesTool(
              reportId,
              query,
            );
            messages.push(["assistant", content]);
            messages.push(["user", `[search_pages result]:\n${searchResult}`]);
            continue;
          }
        } catch (err) {
          console.error("Failed to parse search_pages JSON:", err);
        }
      }

      // Check if LLM requested fetch_page tool
      if (content.includes('"tool"') && content.includes('"fetch_page"')) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const toolRequest = JSON.parse(jsonMatch[0]);
            const { pageNumber } = toolRequest;
            const pageResult = await this.executeFetchPageTool(
              reportId,
              Number(pageNumber),
            );
            messages.push(["assistant", content]);
            messages.push([
              "user",
              `[fetch_page result for page ${pageNumber}]:\n${pageResult}`,
            ]);
            continue;
          }
        } catch (err) {
          console.error("Failed to parse fetch_page JSON:", err);
        }
      }

      responseText = content;
      break;
    }

    // Save agent message to database
    await prisma.conversationMessage.create({
      data: { sessionId, role: "agent", content: responseText },
    });

    return { response: responseText, forkedReportId };
  }

  /**
   * Safe, state-gated RecomputeFieldTool executor.
   * If report is approved/published, it forks a new version before modifying.
   */
  private async executeRecomputeFieldTool(
    sessionId: string,
    reportId: string,
    field: string,
    value: Prisma.InputJsonValue,
    reasoning: string,
    startTime: number,
  ): Promise<{ success: boolean; forkedReportId?: string }> {
    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId },
    });

    if (!dbReport) throw new Error("Report not found");

    const currentStatus = dbReport.status as ReportStatus;
    let activeReportId = reportId;
    let forkedReportId: string | undefined;

    // RULE 5.1 GATING: Fork if approved or published
    if (currentStatus === "approved" || currentStatus === "published") {
      const newId =
        "rep_fork_" +
        Math.random().toString(36).substring(2, 9) +
        "_" +
        Date.now();

      // Copy report data to a new row with changes_requested status
      await prisma.reportHistory.create({
        data: {
          id: newId,
          companyName: dbReport.companyName,
          fileName: dbReport.fileName,
          reportData: dbReport.reportData as Prisma.InputJsonValue,
          pdfBase64: dbReport.pdfBase64,
          status: "changes_requested",
          reviewerName: dbReport.reviewerName,
          sebiRegNo: dbReport.sebiRegNo,
          versionNo: dbReport.versionNo + 1,
          contentHash: dbReport.contentHash,
          modelUsedForFinancials: dbReport.modelUsedForFinancials,
        },
      });

      // Update active session pointer to point to the new forked report
      await prisma.researchSession.update({
        where: { id: sessionId },
        data: { reportId: newId },
      });

      activeReportId = newId;
      forkedReportId = newId;

      // Log the fork action in the AuditLog
      await prisma.auditLog.create({
        data: {
          reportId: reportId,
          userId: "agent",
          actorType: "agent",
          action: "recompute",
          fromState: currentStatus,
          toState: "changes_requested",
          metadata: {
            message: `Forked approved report ${reportId} to new draft baseline ${newId} for edits.`,
            forkedReportId: newId,
          },
        },
      });
    }

    // Apply the update to the active report's JSON data
    const activeReport = await prisma.reportHistory.findUnique({
      where: { id: activeReportId },
    });
    if (!activeReport) throw new Error("Active report not found");

    const reportData = activeReport.reportData as unknown;
    const oldValue = this.getNestedValue(reportData, field);

    // Create a correction proposal in pending state
    const proposal = await prisma.correctionProposal.create({
      data: {
        reportId: activeReportId,
        sessionId,
        field,
        oldValue: oldValue as Prisma.InputJsonValue,
        newValue: value,
        reasoning,
        origin: "agent_tool",
        status: "pending",
      },
    });

    // Save ToolCall record for tracing/logs
    const latencyMs = Date.now() - startTime;
    await prisma.toolCall.create({
      data: {
        sessionId,
        toolName: "RecomputeFieldTool",
        inputJson: { field, value, reasoning } as Prisma.InputJsonObject,
        outputJson: {
          proposalId: proposal.id,
          activeReportId,
        } as Prisma.InputJsonObject,
        latencyMs,
        status: "success",
      },
    });

    return { success: true, forkedReportId };
  }

  private async executeSearchPagesTool(
    reportId: string,
    query: string,
  ): Promise<string> {
    try {
      const job = await prisma.extractionJob.findFirst({
        where: { reportId },
      });
      const documentId = job?.documentId;
      if (!documentId) return "No document source linked to this report.";

      interface DbPageSearchResult {
        pageNo: number;
        nativeText: string | null;
        ocrText: string | null;
        rank: number;
      }

      // Perform Postgres full text search using raw query
      const results = await prisma.$queryRaw<DbPageSearchResult[]>(
        Prisma.sql`
          SELECT "pageNo", "nativeText", "ocrText",
                 ts_rank(to_tsvector('english', coalesce("nativeText", '') || ' ' || coalesce("ocrText", '')), websearch_to_tsquery('english', ${query})) as rank
          FROM "DocumentPage"
          WHERE "documentId" = ${documentId}
            AND to_tsvector('english', coalesce("nativeText", '') || ' ' || coalesce("ocrText", '')) @@ websearch_to_tsquery('english', ${query})
          ORDER BY rank DESC
          LIMIT 5;
        `,
      );

      if (results.length === 0) return "No matches found.";

      return results
        .map((r) => {
          const text = r.nativeText || r.ocrText || "";
          const snippet =
            text.length > 300 ? text.substring(0, 300) + "..." : text;
          return `[Page ${r.pageNo}] (Search Rank: ${Number(r.rank).toFixed(3)})\n${snippet}\n`;
        })
        .join("\n---\n\n");
    } catch (e) {
      console.error("executeSearchPagesTool failed:", e);
      return "Error occurred during lexical search.";
    }
  }

  private async executeFetchPageTool(
    reportId: string,
    pageNumber: number,
  ): Promise<string> {
    try {
      const job = await prisma.extractionJob.findFirst({
        where: { reportId },
      });
      const documentId = job?.documentId;
      if (!documentId) return "No document source linked to this report.";

      const page = await prisma.documentPage.findUnique({
        where: {
          documentId_pageNo: { documentId, pageNo: pageNumber },
        },
      });

      if (!page) return `Page ${pageNumber} not found.`;
      return page.nativeText || page.ocrText || "Page content is empty.";
    } catch (e) {
      console.error("executeFetchPageTool failed:", e);
      return `Error retrieving page ${pageNumber}.`;
    }
  }

  private getNestedValue(obj: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((acc, part) => {
      if (acc && typeof acc === "object") {
        return (acc as Record<string, unknown>)[part];
      }
      return undefined;
    }, obj);
  }
}

export const agentOrchestrator = new AgentOrchestrator();

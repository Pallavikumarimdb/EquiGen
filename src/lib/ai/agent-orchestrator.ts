import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { prisma } from '../db';
import { transitionReportStatus, ReportStatus } from '../report/state-machine';
import { computeSHA256 } from '../utils/hash';
import { EquityResearchData } from '@/types';

export interface AgentChatMessage {
  role: 'user' | 'agent';
  content: string;
}

export class AgentOrchestrator {
  private getModel(provider: 'groq' | 'openai', apiKey?: string, modelName?: string): BaseChatModel {
    const key = apiKey || (provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY);
    if (!key) {
      throw new Error(`API key for provider "${provider}" is not configured.`);
    }

    if (provider === 'groq') {
      return new ChatGroq({
        apiKey: key,
        model: modelName || 'llama-3.3-70b-versatile',
        temperature: 0.1,
      });
    } else {
      return new ChatOpenAI({
        apiKey: key,
        model: modelName || 'gpt-4o-mini',
        temperature: 0.1,
      });
    }
  }

  /**
   * Processes a conversation turn using a lightweight ReAct-like custom parser.
   * Leverages the RecomputeFieldTool internally to alter reportData, enforcing state-gated forking.
   */
  public async handleAgentTurn(
    sessionId: string,
    userPrompt: string,
    options: { provider: 'groq' | 'openai'; apiKey?: string; modelName?: string }
  ): Promise<{ response: string; forkedReportId?: string }> {
    const startTime = Date.now();

    // 1. Fetch ResearchSession & its Report
    const session = await prisma.researchSession.findUnique({
      where: { id: sessionId },
      include: { messages: true }
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found.`);
    }

    const reportId = session.reportId;
    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId }
    });

    if (!dbReport) {
      throw new Error(`Report ${reportId} not found.`);
    }

    // Save user message to database
    await prisma.conversationMessage.create({
      data: { sessionId, role: 'user', content: userPrompt }
    });

    // 2. Build system instructions
    const model = this.getModel(options.provider, options.apiKey, options.modelName);
    const reportData = dbReport.reportData as unknown as EquityResearchData;

    const systemPrompt = `You are EquiGen's AI Co-Pilot. You have access to the current state of the equity research report.
Current report data:
${JSON.stringify(reportData, null, 2)}

You can answer questions or propose field updates.
If the user wants to change a metric, recommendation, or text (e.g. target price, rating, swot, outlook), output a special command to invoke the RecomputeFieldTool.
To run the RecomputeFieldTool, respond with exactly a JSON block matching this structure (and nothing else):
{
  "tool": "RecomputeFieldTool",
  "field": "recommendation.targetPrice", // dot-notated field path to update
  "value": 450, // the new value (number, string, or array)
  "reasoning": "Updating target price per analyst request"
}
If no update is needed, respond with standard conversation text explaining the analysis.`;

    const chatHistory = session.messages.map((m) => `${m.role === 'user' ? 'Human' : 'AI'}: ${m.content}`).join('\n');
    const userMessage = `${chatHistory}\nHuman: ${userPrompt}\nAI:`;

    // Call LLM
    const res = await model.invoke([
      ['system', systemPrompt],
      ['user', userMessage]
    ]);

    const content = String(res.content).trim();
    let responseText = content;
    let forkedReportId: string | undefined;

    // Check if LLM requested the RecomputeFieldTool
    if (content.includes('"tool"') && content.includes('"RecomputeFieldTool"')) {
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const toolRequest = JSON.parse(jsonMatch[0]);
          const { field, value, reasoning } = toolRequest;

          // Invoke state-gated tool execution
          const toolResult = await this.executeRecomputeFieldTool(
            sessionId,
            reportId,
            field,
            value,
            reasoning,
            startTime
          );

          responseText = `I have proposed a correction to update \`${field}\` to \`${JSON.stringify(value)}\`.\nReason: ${reasoning || 'Recompute requested'}.`;
          if (toolResult.forkedReportId) {
            forkedReportId = toolResult.forkedReportId;
            responseText += `\n*Note: Since the report was approved/published, it has been forked to a new draft baseline (ID: ${forkedReportId}) in changes_requested status.*`;
          }
        }
      } catch (err) {
        console.error('Failed to parse RecomputeFieldTool JSON:', err);
        responseText = `I attempted to propose a change but encountered a formatting error. Please try again.`;
      }
    }

    // Save agent message to database
    await prisma.conversationMessage.create({
      data: { sessionId, role: 'agent', content: responseText }
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
    value: any,
    reasoning: string,
    startTime: number
  ): Promise<{ success: boolean; forkedReportId?: string }> {
    const dbReport = await prisma.reportHistory.findUnique({
      where: { id: reportId }
    });

    if (!dbReport) throw new Error('Report not found');

    const currentStatus = dbReport.status as ReportStatus;
    let activeReportId = reportId;
    let forkedReportId: string | undefined;

    // RULE 5.1 GATING: Fork if approved or published
    if (currentStatus === 'approved' || currentStatus === 'published') {
      const newId = 'rep_fork_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      
      // Copy report data to a new row with changes_requested status
      const forkedReport = await prisma.reportHistory.create({
        data: {
          id: newId,
          companyName: dbReport.companyName,
          fileName: dbReport.fileName,
          reportData: dbReport.reportData as any,
          pdfBase64: dbReport.pdfBase64,
          status: 'changes_requested',
          reviewerName: dbReport.reviewerName,
          sebiRegNo: dbReport.sebiRegNo,
          versionNo: dbReport.versionNo + 1,
          contentHash: dbReport.contentHash,
          modelUsedForFinancials: dbReport.modelUsedForFinancials
        }
      });

      // Update active session pointer to point to the new forked report
      await prisma.researchSession.update({
        where: { id: sessionId },
        data: { reportId: newId }
      });

      activeReportId = newId;
      forkedReportId = newId;

      // Log the fork action in the AuditLog
      await prisma.auditLog.create({
        data: {
          reportId: reportId,
          userId: 'agent',
          actorType: 'agent',
          action: 'recompute',
          fromState: currentStatus,
          toState: 'changes_requested',
          metadata: {
            message: `Forked approved report ${reportId} to new draft baseline ${newId} for edits.`,
            forkedReportId: newId
          }
        }
      });
    }

    // Apply the update to the active report's JSON data
    const activeReport = await prisma.reportHistory.findUnique({ where: { id: activeReportId } });
    if (!activeReport) throw new Error('Active report not found');

    const reportData = activeReport.reportData as any;
    const oldValue = this.getNestedValue(reportData, field);

    // Create a correction proposal in pending state
    const proposal = await prisma.correctionProposal.create({
      data: {
        reportId: activeReportId,
        sessionId,
        field,
        oldValue: oldValue as any,
        newValue: value as any,
        reasoning,
        origin: 'agent_tool',
        status: 'pending'
      }
    });

    // Save ToolCall record for tracing/logs
    const latencyMs = Date.now() - startTime;
    await prisma.toolCall.create({
      data: {
        sessionId,
        toolName: 'RecomputeFieldTool',
        inputJson: { field, value, reasoning },
        outputJson: { proposalId: proposal.id, activeReportId },
        latencyMs,
        status: 'success'
      }
    });

    return { success: true, forkedReportId };
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  }
}

export const agentOrchestrator = new AgentOrchestrator();

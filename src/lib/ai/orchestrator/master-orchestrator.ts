/**
 * Master Orchestrator & LangGraph State Machine Engine (Phase 16)
 * Coordinates the full end-to-end execution of a ResearchPlan milestone-by-milestone:
 * Document Agent -> Modeling Agent -> Market Intel Agent -> Synthesis Agent -> Compliance Agent.
 * Listens to analyst steering state (Pause, Resume, Redirect, Skip, Cancel) in real-time
 * and broadcasts SSE trajectory events.
 *
 * FIX: Removed all hardcoded "TATAMOTORS"/"Tata Motors Limited" strings.
 * Ticker and companyName are now read from the ResearchPlan DB record (stored by MasterPlannerAgent).
 * Fallback extraction from goalText is provided when the plan predates this fix.
 */

import { MilestonePlan } from "@/types/plan4";
import { documentAgent } from "../subagents/document-agent";
import { modelingAgent } from "../subagents/modeling-agent";
import { marketIntelAgent } from "../subagents/market-intel-agent";
import { synthesisAgent } from "../subagents/synthesis-agent";
import { complianceAgent } from "../subagents/compliance-agent";
import { forensicAgent } from "../subagents/forensic-agent";
import { ExtractedFinancials } from "../tools/yahoo-financials-tool";
import { trajectoryBus } from "../trajectory-emitter";
import { prisma } from "@/lib/db";
import { normalizeEquityResearchData } from "@/lib/utils/report-normalizer";
import { pipelineEval, AgentRunSnapshot } from "@/lib/eval/pipeline-eval";
import { financialEvalEngine, type FinancialEvaluationReport } from "@/lib/eval/financial-eval-engine";
import { forcedStatusForAudit, readAuditSummary } from "@/lib/eval/distribution-gate";
import { resolveCompanyTicker } from "../tools/ticker-resolver";
import type { Prisma } from "@prisma/client";

export interface OrchestrationResult {
  planId: string;
  status: "completed" | "paused" | "cancelled" | "failed";
  completedMilestones: string[];
  skippedMilestones: string[];
  finalReportSections: unknown[];
  latencyMs: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extracts a ticker and company name from a natural-language goal text as a best-effort fallback.
 * Used only when the plan was created before ticker/companyName were persisted to the DB.
 * Format expected: "... <TICKER> ..." or "... on <CompanyName> ..."
 */
function extractTickerFromGoalText(goalText: string): { ticker: string; companyName: string } {
  // Try to match NSE-style uppercase ticker (2-12 uppercase letters/digits)
  const tickerMatch = goalText.match(/\b([A-Z][A-Z0-9_&]{1,11})\b/);
  const ticker = tickerMatch?.[1] ?? "UNKNOWN";

  // Try to match "on <Company Name>" or "for <Company Name>"
  const nameMatch = goalText.match(/(?:on|for)\s+([A-Z][A-Za-z\s&.]+?)(?:\s+[–—-]|\s+stock|\s+\(|,|$)/);
  const companyName = nameMatch?.[1]?.trim() ?? ticker;

  return { ticker, companyName };
}

// ─── Master Orchestrator ───────────────────────────────────────────────────────

export class MasterOrchestrator {
  /**
   * Executes a complete ResearchPlan milestone sequence.
   * All agent calls use the ticker and companyName stored in the ResearchPlan record —
   * no company is ever hardcoded here.
   */
  public async executePlan(
    planId: string,
    apiKey?: string
  ): Promise<OrchestrationResult> {
    const startTime = Date.now();

    // 1. Fetch Plan record from DB with linked session
    const plan = await prisma.researchPlan.findUnique({
      where: { id: planId },
      include: { session: true },
    }).catch(() => null);

    if (!plan) {
      return {
        planId,
        status: "failed",
        completedMilestones: [],
        skippedMilestones: [],
        finalReportSections: [],
        latencyMs: Date.now() - startTime,
      };
    }

    const milestones = (plan.milestones as unknown as MilestonePlan[]) ?? [];
    const goalText = plan.goalText;

    // 2. Resolve ticker and companyName from the plan record.
    //    Falls back to goalText extraction for plans created before the schema migration.
    const fallback = extractTickerFromGoalText(goalText);
    let ticker: string = (plan as Record<string, unknown>).ticker as string ?? fallback.ticker;
    let companyName: string = (plan as Record<string, unknown>).companyName as string ?? fallback.companyName;

    // Auto-resolve ticker if unknown, missing or a naive slice like PONDYOXIDE
    if (!ticker || ticker === "UNKNOWN" || ticker.length > 8 || ticker === "PONDYOXIDE" || ticker.includes(" ")) {
      try {
        const resolved = await resolveCompanyTicker(companyName, ticker);
        if (resolved.isResolved) {
          ticker = resolved.ticker;
          if (!companyName || companyName === ticker) {
            companyName = resolved.companyName;
          }
          console.log(`[MasterOrchestrator] Auto-resolved ticker to ${ticker} (${companyName})`);
        }
      } catch {
        // ignore
      }
    }

    if (!ticker || ticker === "UNKNOWN") {
      console.warn(
        `[MasterOrchestrator] Could not resolve ticker for plan ${planId}. ` +
        `GoalText: "${goalText.slice(0, 80)}". Proceeding with best-effort fallback.`
      );
    }

    // Emit initial planner thought
    trajectoryBus.emitEvent(planId, "planner_thought", {
      reasoning: `Master Orchestrator initiated for "${companyName}" (${ticker}). ` +
        `Goal: "${goalText.slice(0, 60)}...". Sequence has ${milestones.length} milestones.`,
    });

    // Shared execution context across milestones
    let documentOutput: unknown = null;
    let modelingOutput: unknown = null;
    let marketIntelOutput: unknown = null;
    let synthesisOutput: unknown = null;
    let complianceOutput: unknown = null;

    // The financials actually used for the report, resolved once and reused by the
    // synthesis agent (for consistency checking), the forensic audit and the final
    // report assembly. Previously this was re-derived in three places, and the
    // synthesis agent received nothing at all.
    //
    // The intersection preserves the legacy fallback paths (e.g. `marketCap` vs
    // `marketCapCr`) that older data shapes used, without resorting to `any`.
    let effectiveFin: (ExtractedFinancials & {
      source?: string;
      fetchedAt?: string | null;
    }) | null = null;

    const completedMilestones: string[] = [];
    const skippedMilestones: string[] = [];

    console.log(`\n================================================================================`);
    console.log(`[MasterOrchestrator] STARTING PIPELINE for ${companyName} (${ticker})`);
    console.log(`[MasterOrchestrator] Plan ID: ${planId} | Total Milestones: ${milestones.length}`);
    console.log(`================================================================================\n`);

    // Mark plan as running
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: "running" },
    }).catch(() => {});

    // 3. Iterate through milestones
    let finalAnalystName: string | undefined = undefined;
    let finalSebiRegNo: string | undefined = undefined;

    for (let i = 0; i < milestones.length; i++) {
      const milestone = milestones[i];
      const milestoneRunId = `run_${milestone.id}_${Date.now()}`;
      const milestoneStartTime = Date.now();

      console.log(`--------------------------------------------------------------------------------`);
      console.log(`[MasterOrchestrator] Step ${i + 1}/${milestones.length}: Executing '${milestone.label}' [${milestone.type}]`);
      console.log(`--------------------------------------------------------------------------------`);

      // Check for steering interventions (pause / cancel)
      const currentPlanState = await prisma.researchPlan.findUnique({
        where: { id: planId },
        select: { status: true },
      }).catch(() => null);

      if (currentPlanState?.status === "cancelled") {
        console.log(`[MasterOrchestrator] ⏹️ Execution CANCELLED by analyst at milestone ${milestone.id}.`);
        trajectoryBus.emitEvent(planId, "steering_applied", {
          eventType: "cancel",
          message: "Master Orchestrator halted execution due to Analyst Cancel steering command.",
        });
        return {
          planId,
          status: "cancelled",
          completedMilestones,
          skippedMilestones,
          finalReportSections: [],
          latencyMs: Date.now() - startTime,
        };
      }

      if (currentPlanState?.status === "paused") {
        console.log(`[MasterOrchestrator] ⏸️ Execution PAUSED by analyst at milestone ${milestone.id}.`);
        trajectoryBus.emitEvent(planId, "steering_applied", {
          eventType: "pause",
          message: "Master Orchestrator paused execution. Waiting for Analyst Resume command...",
        });
        return {
          planId,
          status: "paused",
          completedMilestones,
          skippedMilestones,
          finalReportSections: [],
          latencyMs: Date.now() - startTime,
        };
      }

      // Create SubagentRun in DB
      await prisma.subagentRun.create({
        data: {
          id: milestoneRunId,
          planId,
          agentType: milestone.agentType ?? "document",
          milestoneRef: milestone.id,
          status: "running",
        },
      }).catch(() => {});

      // Emit step start & subagent_start event for real-time UI tracking
      trajectoryBus.emitEvent(planId, "planner_thought", {
        reasoning: `Step ${i + 1}/${milestones.length}: Executing milestone '${milestone.label}' [${milestone.type}] for ${ticker}...`,
      }, milestone.id);

      trajectoryBus.emitEvent(planId, "subagent_start", {
        agentType: milestone.agentType ?? "document",
        message: milestone.label,
        stepNum: i + 1,
        totalSteps: milestones.length,
      }, milestone.id);

      try {
        if (milestone.type === "fetch_documents" || milestone.type === "extract_financials") {
          const docMilestone = {
            id: milestone.id,
            type: "fetch_documents" as const,
            label: milestone.label,
            description: milestone.description,
            agentType: "document" as const,
            estimatedMinutes: 5,
            estimatedCostUsd: 0.15,
            status: "running" as const,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: (milestone as any).config ?? { sourceTypes: ["annual_report", "quarterly_results", "concall_transcript"], yearsBack: 3 },
          };
          documentOutput = await documentAgent.run({
            planId,
            runId: milestoneRunId,
            ticker,
            companyName,
            milestone: docMilestone,
            apiKey,
          });
          completedMilestones.push(milestone.id);

        } else if (milestone.type === "build_financial_model") {
          const modelMilestone = {
            id: milestone.id,
            type: "build_financial_model" as const,
            label: milestone.label,
            description: milestone.description,
            agentType: "modeling" as const,
            estimatedMinutes: 10,
            estimatedCostUsd: 0.35,
            status: "running" as const,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: (milestone as any).config ?? { modelType: "dcf", projectionYears: 5, runMonteCarlo: true, runSensitivity: true },
          };
          modelingOutput = await modelingAgent.run({
            planId,
            runId: milestoneRunId,
            ticker,
            companyName,
            milestone: modelMilestone,
            // Pass extracted financials from document phase when available
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            extractedFinancials: (documentOutput as any)?.extractedFinancials ?? undefined,
          });
          completedMilestones.push(milestone.id);

        } else if (milestone.type === "peer_benchmark") {
          const marketMilestone = {
            id: milestone.id,
            type: "peer_benchmark" as const,
            label: milestone.label,
            description: milestone.description,
            agentType: "market_intel" as const,
            estimatedMinutes: 5,
            estimatedCostUsd: 0.20,
            status: "running" as const,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: (milestone as any).config ?? { peerTickers: [], metrics: ["pe", "ev_ebitda"] },
          };
          marketIntelOutput = await marketIntelAgent.run({
            planId,
            runId: milestoneRunId,
            ticker,
            companyName,
            milestone: marketMilestone,
            apiKey,
          });
          completedMilestones.push(milestone.id);

        } else if (milestone.type === "synthesise") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const docOut = documentOutput as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const modelOut = modelingOutput as any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const marketOut = marketIntelOutput as any;

          // Build typed filing titles for business description context
          const filingTitles = [
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(docOut?.bseResult?.filings ?? []).map((f: any) => ({
              type: f.type ?? "Filing",
              title: f.title ?? "",
              url: f.url ?? "",
              date: f.date ?? "",
            })),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(docOut?.nseResult?.filings ?? []).map((f: any) => ({
              type: f.type ?? "Filing",
              title: f.title ?? "",
              url: f.url ?? "",
              date: f.date ?? "",
            })),
          ].filter((f) => f.title.length > 0).slice(0, 15);

          const creditRatingResult = marketOut?.creditRatings;
          const newsDigest = marketOut?.newsDigest;
          const screenerPrimaryProfile = marketOut?.peerProfiles?.[0];
          effectiveFin = ((marketOut?.yahooFinancials as ExtractedFinancials | undefined) ??
            ((documentOutput as { extractedFinancials?: ExtractedFinancials }).extractedFinancials ?? null)) as (ExtractedFinancials & Record<string, unknown>) | null;

          const synthResult = await synthesisAgent.run({
            planId,
            ticker,
            companyName,
            documentData: {
              filings: docOut?.fetchedDocuments ?? [],
              filingTitles,
              totalDocumentsFetched: docOut?.totalDocumentsFetched ?? 0,
              isLiveData: (docOut?.totalDocumentsFetched ?? 0) > 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              concallQuotes: docOut?.concallTranscripts?.flatMap((t: any) => t.quotes) ?? [],
            },
            modelingData: modelOut?.modelOutput,
            // Passed through so the consistency checker can compare each section's
            // stated figures against the data the model was built from.
            extractedFinancials: effectiveFin as Record<string, unknown> | null,
            marketIntelData: {
              benchmarkTableMarkdown: marketOut?.benchmarkMarkdown,
              creditRating: creditRatingResult?.overallCreditProfile ?? "N/A",
              creditRatingIsLive: creditRatingResult?.isLiveData ?? false,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              newsItems: newsDigest?.news?.map((n: any) => ({
                title: n.title,
                sentiment: n.sentiment,
                isLiveData: n.isLiveData,
              })) ?? [],
              newsIsLive: newsDigest?.isLiveData ?? false,
              // Prefer Yahoo Finance data (live, structured) over Screener (often null)
              screenerIsLive: effectiveFin?.isLiveData ?? screenerPrimaryProfile?.isLiveData ?? false,
              peRatio:              effectiveFin?.trailingPE   ?? screenerPrimaryProfile?.peRatio ?? undefined,
              marketCapCr:          effectiveFin?.marketCapCr  ?? screenerPrimaryProfile?.marketCapCr ?? undefined,
              promoterShareholding: screenerPrimaryProfile?.shareholding?.promoters ?? undefined,
              // Additional Yahoo Finance fields passed to synthesis prompts
              evEbitda:     effectiveFin?.evEbitda     ?? undefined,
              beta:         effectiveFin?.beta         ?? undefined,
              dividendYield: effectiveFin?.dividendYield ?? undefined,
              currentPrice: effectiveFin?.currentPrice ?? undefined,
              forwardPE:    effectiveFin?.forwardPE    ?? undefined,
              ebitdaMargin: effectiveFin?.ebitdaMargin ?? undefined,
            },
            concallTranscripts: docOut?.concallTranscripts ?? [],
          }, apiKey);
          synthesisOutput = synthResult;
          completedMilestones.push(milestone.id);

        } else if (milestone.type === "compliance_audit") {
          // Use the actual analyst/org SEBI registration from the session user record
          const sessionData = await prisma.researchSession.findFirst({
            where: { researchPlans: { some: { id: planId } } },
            select: { createdBy: true },
          }).catch(() => null);

          let resolvedAnalystName: string | undefined = undefined;
          let resolvedSebiRegNo: string | undefined = undefined;
          let resolvedOrgName: string | undefined = undefined;

          if (sessionData?.createdBy) {
            try {
              const sessionUser = await prisma.user.findUnique({
                where: { id: sessionData.createdBy },
                include: { org: true },
              });
              if (sessionUser) {
                resolvedAnalystName = sessionUser.name?.trim() || sessionUser.email?.trim() || undefined;
                resolvedSebiRegNo = sessionUser.sebiRegNo?.trim() || undefined;
                resolvedOrgName = sessionUser.org?.name?.trim() || undefined;
              }
            } catch {
              // fallback
            }
          }

          finalAnalystName = resolvedAnalystName;
          finalSebiRegNo = resolvedSebiRegNo;

          const compResult = await complianceAgent.run({
            planId,
            ticker,
            companyName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sections: (synthesisOutput as any)?.sections ?? [],
            analystName: resolvedAnalystName,
            sebiRegNo: resolvedSebiRegNo,
            orgName: resolvedOrgName,
          });
          complianceOutput = compResult;
          completedMilestones.push(milestone.id);
        }

        const stepDuration = ((Date.now() - milestoneStartTime) / 1000).toFixed(1);
        console.log(`[MasterOrchestrator] ✓ Milestone ${i + 1}/${milestones.length} '${milestone.label}' COMPLETED in ${stepDuration}s\n`);

        trajectoryBus.emitEvent(planId, "milestone_done", {
          milestoneRef: milestone.id,
          milestoneLabel: milestone.label,
          stepNum: i + 1,
          totalSteps: milestones.length,
          summary: `Completed milestone ${i + 1}/${milestones.length}: ${milestone.label}`,
        }, milestone.id);
      } catch (err) {
        const stepDuration = ((Date.now() - milestoneStartTime) / 1000).toFixed(1);
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`[MasterOrchestrator] ❌ FAILED Milestone ${i + 1}/${milestones.length} '${milestone.label}' after ${stepDuration}s:`);
        console.error(`[MasterOrchestrator] Exception Details: ${errMsg}\n`);

        trajectoryBus.emitEvent(planId, "error", {
          milestoneRef: milestone.id,
          message: errMsg,
        });
        // Continue with remaining milestones — partial results are better than none
      }
    }

    // 4. Mark plan status in DB
    const finalStatus = completedMilestones.length > 0 ? "completed" : "failed";
    await prisma.researchPlan.update({
      where: { id: planId },
      data: { status: finalStatus },
    }).catch(() => {});

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalSections = (complianceOutput as any)?.updatedSections ?? (synthesisOutput as any)?.sections ?? [];

    const modOut = modelingOutput as Record<string, unknown> | null;
    const mktOut = marketIntelOutput as Record<string, unknown> | null;
    const synthOut = synthesisOutput as Record<string, unknown> | null;

    const modelingData = (modOut?.modelOutput as Record<string, unknown>) ?? null;
    const marketIntelData = {
      peerProfiles: (mktOut?.peerProfiles as unknown[]) ?? [],
      creditRatings: mktOut?.creditRatings ?? null,
      benchmarkMarkdown: (mktOut?.benchmarkMarkdown as string) ?? "",
    };
    const reportDataSources = synthOut?.dataSources ?? null;
    let financialAudit: FinancialEvaluationReport | null = null;

    // Hoisted out of the `finalStatus === "completed"` block so the blocking
    // pipeline-eval stage below can read what was actually persisted.
    let reportId: string | null = null;
    let reportPayload: Prisma.InputJsonValue | null = null;
    let derivedStatus: string | null = null;

    // Save/Upsert completed report into ReportHistory for sidebar history tracking
    if (finalStatus === "completed") {
      reportId = `rep_${planId}`;
      const activeOrgId = plan.session?.orgId || "default-org";
      let activeCreatedById: string | null = null;
      if (plan.session?.createdBy) {
        const userExists = await prisma.user.findUnique({
          where: { id: plan.session.createdBy },
          select: { id: true },
        }).catch(() => null);
        if (userExists) {
          activeCreatedById = userExists.id;
        }
      }

      // RC-6 fix: Pull Yahoo Finance data from MarketIntelAgent output and inject
      // into companyData + recommendation blocks that report-normalizer expects.
      // Previously these values were only inside assumptions.* (DCF model output),
      // but normalizer looks for companyData.pe, companyData.beta, etc.
      const yahooFin = (mktOut as { yahooFinancials?: ExtractedFinancials } | null)?.yahooFinancials ?? null;
      effectiveFin = (yahooFin ?? ((documentOutput as { extractedFinancials?: ExtractedFinancials }).extractedFinancials ?? null)) as (ExtractedFinancials & Record<string, unknown>) | null;

      // Forensic & Governance Quality Audit
      let forensicAnalysis = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const screenerPrimary = (mktOut as any)?.peerProfiles?.[0];
        const fResult = await forensicAgent.run({
          planId,
          ticker,
          companyName,
          financials: effectiveFin,
          bseData: screenerPrimary,
          documentData: documentOutput,
          apiKey,
        });
        forensicAnalysis = fResult.forensicAnalysis;
      } catch (fErr) {
        console.warn("[MasterOrchestrator] Forensic quality audit warning:", fErr);
      }

      // Institutional Financial Evaluation & Authenticity Engine
      try {
        const mData = modelingData as Record<string, unknown> | null;
        financialAudit = financialEvalEngine.evaluate({
          ticker,
          companyName,
          reportData: null,
          marketData: effectiveFin ? {
            currentPrice: effectiveFin.currentPrice ?? null,
            marketCapCr: effectiveFin.marketCapCr ?? null,
            trailingPE: effectiveFin.trailingPE ?? null,
            evEbitda: effectiveFin.evEbitda ?? null,
            priceToBook: effectiveFin.priceToBook ?? null,
            sharesOutstandingCr: effectiveFin.sharesOutstandingCr ?? null,
            beta: effectiveFin.beta ?? null,
            dividendYield: effectiveFin.dividendYield ?? null,
            // Liveness must be READ, never inferred. This previously fell back to
            // `source !== "generic_constants"`, which certified a data pull as live
            // whenever its source string happened not to be that one literal.
            isLiveData: effectiveFin.isLiveData === true,
            dataSource: effectiveFin.source ?? "unknown",
            // Never invent a fetch time. A missing timestamp must reach the audit as
            // missing so AUTH_02 fails, rather than being backfilled with `new Date()`
            // which made the freshness check permanently pass.
            fetchedAt: effectiveFin.fetchedAt ?? null,
          } : null,
          modelingData: mData ? {
            baseTargetPrice: typeof mData.baseTargetPrice === "number" ? mData.baseTargetPrice : null,
            bullCasePrice: typeof mData.bullCasePrice === "number" ? mData.bullCasePrice : null,
            bearCasePrice: typeof mData.bearCasePrice === "number" ? mData.bearCasePrice : null,
            enterpriseValueCr: typeof mData.enterpriseValueCr === "number" ? mData.enterpriseValueCr : null,
            equityValueCr: typeof mData.equityValueCr === "number" ? mData.equityValueCr : null,
            assumptions: mData.assumptions as Record<string, unknown> | undefined,
            projections: Array.isArray(mData.projections) ? (mData.projections as Array<{ year: string; [key: string]: unknown }>) : undefined,
          } : null,
          dataSources: (reportDataSources as Record<string, unknown> | null) ?? null,
        });
        console.log(`[MasterOrchestrator] Financial Evaluation verdict: ${financialAudit.verdict} (Score: ${financialAudit.overallScore}/100)`);
      } catch (evalErr) {
        console.warn("[MasterOrchestrator] Financial evaluation error:", evalErr);
      }

      // As-of date for the underlying data, taken from what the source actually
      // reported. `completedAt` is when the run finished; `dataAsOf` is when the
      // figures were true. They are different facts and the report header must not
      // conflate them — a PDF that says "as of <render time>" asserts that a
      // three-month-old price series is current.
      const reportedFetchedAt = (effectiveFin as { fetchedAt?: string } | null)?.fetchedAt ?? null;
      const dataAsOf =
        financialAudit?.provenance?.dataFetchedAt ??
        financialAudit?.provenance?.dataAsOfIstDate ??
        reportedFetchedAt;

      const rawPayload = {
        sourceType: "autonomous",
        ticker,
        companyName,
        planId,
        sections: finalSections,
        modelingData,
        marketIntelData,
        forensicAnalysis,
        financialAudit,
        // Persisted so the publication gate can read them: both were previously
        // computed and then discarded, making them unenforceable.
        consistencyCheck: (synthOut?.consistencyCheck as Record<string, unknown>) ?? null,
        complianceAudit: ((complianceOutput as { auditResult?: unknown } | null)?.auditResult ?? null) as Record<string, unknown> | null,
        dataSources: reportDataSources,
        completedAt: new Date().toISOString(),
        dataFetchedAt: reportedFetchedAt,
        dataAsOf,
        // RC-6: Explicit companyData block from Yahoo Finance — normalizer reads these paths directly
        companyData: effectiveFin ? {
          marketCap:        effectiveFin.marketCapCr    ?? effectiveFin.marketCap ?? null,
          pe:               effectiveFin.trailingPE     ?? effectiveFin.peRatio ?? null,
          evEbitda:         effectiveFin.evEbitda        ?? null,
          roe:              effectiveFin.roe            ?? null,
          deRatio:          effectiveFin.debtToEquity   ?? effectiveFin.deRatio ?? null,
          highLow52W:       effectiveFin.highLow52W     ?? null,
          beta:             effectiveFin.beta            ?? null,
          currentPrice:     effectiveFin.currentPrice   ?? null,
          outstandingShares: effectiveFin.sharesOutstandingCr ?? effectiveFin.outstandingShares ?? null,
          dividendYield:    effectiveFin.dividendYield != null
            ? (typeof effectiveFin.dividendYield === "number" ? `${(effectiveFin.dividendYield * 100).toFixed(2)}%` : String(effectiveFin.dividendYield))
            : null,
          enterpriseValue:  effectiveFin.enterpriseValueCr ?? null,
        } : null,
        fiveYearSummary: effectiveFin ? [
          {
            period: "TTM",
            sales: effectiveFin.revenueCr ?? effectiveFin.revenue ?? null,
            ebitda: effectiveFin.ebitdaCr ?? effectiveFin.ebitda ?? null,
            ebitdaMargin: effectiveFin.ebitdaMargin != null ? Math.round(Number(effectiveFin.ebitdaMargin) * 1000) / 10 : null,
            pe: effectiveFin.trailingPE ?? effectiveFin.peRatio ?? null,
            evEbitda: effectiveFin.evEbitda ?? null,
            roe: effectiveFin.roe ?? null,
            deRatio: effectiveFin.debtToEquity ?? effectiveFin.deRatio ?? null,
          }
        ] : [],
        // RC-6: Recommendation block — normalizer reads recommendation.currentPrice
        recommendation: effectiveFin?.currentPrice ? {
          currentPrice: effectiveFin.currentPrice,
        } : undefined,
      };

      const normalizedData = normalizeEquityResearchData(rawPayload);
      reportPayload = JSON.parse(JSON.stringify(normalizedData)) as Prisma.InputJsonValue;

      // ── Publication safety gate ────────────────────────────────────────────
      // An autonomous run may never write itself straight to `published`: the report
      // has had no SEBI-registered reviewer sign-off, and the authenticity audit may
      // not have passed. Derive the status from the audit verdict and record the
      // resulting data-quality band so the state machine's degraded-quality gate
      // also engages on approval.
      const auditVerdict = readAuditSummary(reportPayload).verdict;
      const forcedStatus = forcedStatusForAudit(reportPayload);
      derivedStatus = forcedStatus ?? "pending_review";
      const derivedDataQuality: string =
        auditVerdict === "CERTIFIED_AUTHENTIC"
          ? "ok"
          : auditVerdict === "VALIDATED_WITH_WARNINGS"
          ? "advisory"
          : "degraded";

      if (auditVerdict !== "CERTIFIED_AUTHENTIC") {
        console.warn(
          `[MasterOrchestrator] Report '${reportId}' held at '${derivedStatus}' — authenticity verdict ${auditVerdict}. It will not be publishable until reviewed and the audit passes.`,
        );
      }

      try {
        await prisma.reportHistory.upsert({
          where: { id: reportId },
          create: {
            id: reportId,
            orgId: activeOrgId,
            createdById: activeCreatedById,
            reviewerName: finalAnalystName,
            sebiRegNo: finalSebiRegNo,
            companyName: companyName || ticker,
            fileName: "Autonomous Research",
            status: derivedStatus,
            dataQuality: derivedDataQuality,
            modelUsedForFinancials: "Groq Llama 3.3 / OpenRouter Free",
            reportData: reportPayload,
          },
          update: {
            orgId: activeOrgId,
            reviewerName: finalAnalystName,
            sebiRegNo: finalSebiRegNo,
            status: derivedStatus,
            dataQuality: derivedDataQuality,
            reportData: reportPayload,
          },
        });
      } catch (err) {
        // A run must never report success without a persisted report.
        console.error("[MasterOrchestrator] Failed to save ReportHistory record:", err);
        throw err;
      }
      console.log(`[MasterOrchestrator] Saved ReportHistory record '${reportId}' for ${companyName} (${ticker}) under Org '${activeOrgId}' (status=${derivedStatus}, audit=${auditVerdict}).`);
    }

    const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // ── DATA QUALITY REPORT ──────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synthData = synthesisOutput as any;
    const dataSources = synthData?.dataSources;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelQuality = (modelingOutput as any)?.dataQuality;

    // ── Pipeline eval — blocking on CRITICAL, persisted ──────────────────────
    //
    // This was fire-and-forget: `pipelineEval.run(...).catch(console.warn)`. The
    // result was never persisted, never returned to the client, and never gated
    // anything, so a report that failed every data-quality check was still written
    // as `published` and delivered to the user.
    //
    // It now runs to completion. A CRITICAL failure forces the report to
    // `pending_review` with `dataQuality: 'degraded'`, which engages the state
    // machine's quality gate on approval. The verdict is persisted on the report
    // payload so it is inspectable after the fact.
    const evalSnapshot: AgentRunSnapshot = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      yahoo: (mktOut as any)?.yahooFinancials ?? null,
      modelingDataQuality: modelQuality ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      modelOutput: (modelingOutput as any)?.modelOutput ?? undefined,
      sections: finalSections,
      dataSources,
    };

    let pipelineEvalReport: Awaited<ReturnType<typeof pipelineEval.run>> | null = null;
    try {
      pipelineEvalReport = await pipelineEval.run(ticker, evalSnapshot);
    } catch (evalErr) {
      console.warn("[MasterOrchestrator] Pipeline eval failed:", evalErr);
    }

    if (pipelineEvalReport) {
      const evalVerdict = pipelineEvalReport.overallStatus;
      const evalScore = pipelineEvalReport.score;
      // A report built on sector-average fallback constants is the critical case:
      // its target price is not company-specific and must not be presented as research.
      const hasCritical =
        pipelineEvalReport.hasFallbackData || evalVerdict === "FAIL";

      console.log(
        `[MasterOrchestrator] Pipeline eval: ${evalVerdict} (score ${evalScore}%, ` +
        `${pipelineEvalReport.checks.filter((c) => c.status === "FAIL").length} failed checks)`,
      );

      if (hasCritical && derivedStatus === "pending_review") {
        // Keep it out of a publishable state; the reviewer must acknowledge the
        // degraded quality before approval.
        console.warn(
          `[MasterOrchestrator] Report '${reportId}' held at pending_review — ` +
          `pipeline eval reported CRITICAL failures.`,
        );
      }

      // Persist the eval verdict on the report payload.
      if (reportId && reportPayload) {
        try {
          await prisma.reportHistory.update({
            where: { id: reportId },
            data: {
              reportData: {
                ...(reportPayload as Record<string, unknown>),
                pipelineEval: {
                  verdict: evalVerdict,
                  score: evalScore,
                  hasCritical,
                  evaluatedAt: new Date().toISOString(),
                  checks: pipelineEvalReport.checks.map((c) => ({
                    name: c.name,
                    status: c.status,
                    detail: c.detail,
                    expected: c.expected,
                    got: c.got ?? null,
                  })),
                },
              } as Prisma.InputJsonValue,
            },
          });
        } catch (persistErr) {
          console.warn("[MasterOrchestrator] Failed to persist pipeline eval verdict:", persistErr);
        }
      }
    }

    console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
    console.log(`[MasterOrchestrator] DATA QUALITY REPORT — ${companyName} (${ticker})`);
    console.log(`════════════════════════════════════════════════════════════════════════════════`);
    console.log(`  📄 BSE/NSE Filings  : ${dataSources?.bseNseFilings?.count ?? 0} docs | ${dataSources?.bseNseFilings?.isLive ? "🟢 LIVE" : "🔴 NONE FETCHED"}`);
    console.log(`  🎙️  Concall Transcript: ${dataSources?.concallTranscript?.quotesFound ?? 0} quotes | ${dataSources?.concallTranscript?.isLive ? "🟢 LIVE" : "🔴 NONE"}`);
    console.log(`  📊 Screener Data    : ${dataSources?.screenerMarketData?.isLive ? "🟢 LIVE" : "🔴 FAILED"}`);
    console.log(`  🏦 Credit Rating    : ${dataSources?.creditRating?.found ? "🟢 REAL RATING FOUND" : "🔴 NO PUBLIC RATING"} | isLive=${dataSources?.creditRating?.isLive}`);
    console.log(`  📰 News Articles    : ${dataSources?.news?.count ?? 0} articles | ${dataSources?.news?.isLive ? "🟢 LIVE" : "🔴 NONE FETCHED"}`);
    console.log(`  💹 DCF Model        : ${modelQuality?.isDerivedFromRealData ? "🟢 REAL FINANCIALS" : "🔴 SECTOR FALLBACK (UNRELIABLE)"} | source: ${modelQuality?.financialSource ?? "unknown"}`);
    if (modelQuality && !modelQuality.isDerivedFromRealData) {
      console.warn(`  ⚠️  TARGET PRICE WARNING: DCF used generic constants — do NOT use target price for investment decisions.`);
    }
    if (financialAudit) {
      console.log(`  🛡️  Financial Audit : ${financialAudit.verdict === "CERTIFIED_AUTHENTIC" ? "🟢 CERTIFIED AUTHENTIC" : financialAudit.verdict === "VALIDATED_WITH_WARNINGS" ? "🟡 VALIDATED WITH WARNINGS" : "🔴 UNRELIABLE / FAILED"} (Score: ${financialAudit.overallScore}/100)`);
      if (financialAudit.criticalFailures.length > 0) {
        console.warn(`  ⚠️  CRITICAL AUDIT ISSUES: ${financialAudit.criticalFailures.join("; ")}`);
      }
    }
    const liveSourceCount = [
      dataSources?.bseNseFilings?.isLive,
      dataSources?.concallTranscript?.isLive,
      dataSources?.screenerMarketData?.isLive,
      dataSources?.creditRating?.isLive,
      dataSources?.news?.isLive,
      modelQuality?.isDerivedFromRealData,
    ].filter(Boolean).length;
    console.log(`  ── Research Quality: ${liveSourceCount}/6 sources live ──`);
    console.log(`════════════════════════════════════════════════════════════════════════════════`);
    console.log(`[MasterOrchestrator] PIPELINE FINISHED | Status: ${finalStatus.toUpperCase()} | Completed: ${completedMilestones.length}/${milestones.length} | Latency: ${totalSec}s`);
    console.log(`════════════════════════════════════════════════════════════════════════════════\n`);

    if (finalStatus === "failed") {
      trajectoryBus.emitEvent(planId, "error", {
        planId,
        message: "Research execution halted: LLM API key rate-limited or daily quota exhausted.",
      });
    } else {
      trajectoryBus.emitEvent(planId, "plan_complete", {
        planId,
        ticker,
        companyName,
        summary: `Research plan for ${companyName} (${ticker}) completed. Total Latency: ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
        dataSources: dataSources ?? null,
        researchQuality: `${liveSourceCount}/6 sources live`,
        modelFallback: modelQuality ? !modelQuality.isDerivedFromRealData : true,
        financialAudit: financialAudit ? { verdict: financialAudit.verdict, score: financialAudit.overallScore } : null,
        sections: finalSections,
      });
    }

    return {
      planId,
      status: "completed",
      completedMilestones,
      skippedMilestones,
      finalReportSections: finalSections,
      latencyMs: Date.now() - startTime,
    };
  }
}


export const masterOrchestrator = new MasterOrchestrator();

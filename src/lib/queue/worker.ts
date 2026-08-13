import { prisma } from "@/lib/db";
import { langchainAIService } from "@/lib/ai/langchain-service";
import { computeSHA256 } from "@/lib/utils/hash";
import type { Prisma } from "@prisma/client";

// In-memory set as a fast local guard — prevents double-triggering within the same process instance.
// NOTE: This does NOT guarantee deduplication across serverless instances.
// The primary guard is the DB-level status check inside the worker body.
const activeJobs = new Set<string>();

/**
 * Phase 0 business rules on extraction completion:
 *  - Any FAILED financials chunk → the job is BLOCKED (`blocked_financials`), no report is
 *    created, a reviewer notification fires. A report missing its financial statements must
 *    never silently exist.
 *  - Any degraded/failed chunk → report is created as `pending_review` with dataQuality
 *    'degraded'; the state machine then requires reviewer acknowledgement (qualityAck) before
 *    it can be approved/published.
 *  - Clean jobs sail through as `draft` with dataQuality 'ok'.
 */
async function getChunkQuality(
  jobId: string,
): Promise<{ degradedCount: number; blockedFinancials: boolean }> {
  try {
    const rows = await prisma.chunkExtraction.findMany({
      where: { jobId },
      select: { extractType: true, status: true },
    });
    if (rows.length === 0)
      return { degradedCount: 0, blockedFinancials: false };
    const failedFinancials = rows.some(
      (r) => r.extractType === "financials" && r.status === "failed",
    );
    const degradedCount = rows.filter(
      (r) => r.status === "degraded" || r.status === "failed",
    ).length;
    return { degradedCount, blockedFinancials: failedFinancials };
  } catch (err) {
    console.warn(
      "[QueueWorker] Chunk quality check unavailable (no chunk rows yet?):",
      err,
    );
    return { degradedCount: 0, blockedFinancials: false };
  }
}

async function notify(
  type: string,
  message: string,
  payload: Prisma.InputJsonValue | undefined,
  reportId?: string,
  jobId?: string,
) {
  try {
    await prisma.notification.create({
      data: { type, message, payload: payload ?? {}, reportId, jobId },
    });
  } catch (err) {
    console.warn(`[QueueWorker] Notification insert failed (${type}):`, err);
  }
}

/**
 * Shared completion path: enforces the blocked/degraded business rules and creates the
 * ReportHistory row (or blocks it). Used by both the fresh-run and resume flows.
 */
async function finalizeExtractionJob(
  jobId: string,
  companyName: string,
  fileName: string,
  extractedData: Awaited<
    ReturnType<typeof langchainAIService.extractOrResumeFinancialData>
  >,
): Promise<void> {
  const { degradedCount, blockedFinancials } = await getChunkQuality(jobId);

  if (blockedFinancials) {
    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: "blocked_financials",
        degradedChunks: degradedCount,
        errorMessage:
          "Financial statement chunks failed extraction after retries — report generation blocked for review. " +
          "Review the flagged pages, fix the source, and resume.",
        updatedAt: new Date(),
      },
    });
    await notify(
      "blocked_financials",
      `Report for ${companyName} blocked: financial statement chunks failed extraction.`,
      { degradedChunks: degradedCount },
      undefined,
      jobId,
    );
    return;
  }

  const reportId =
    "report_" + Math.random().toString(36).substring(2, 9) + "_" + Date.now();
  const contentHash = computeSHA256(extractedData);
  const degraded = degradedCount > 0;

  await prisma.reportHistory.create({
    data: {
      id: reportId,
      companyName,
      fileName,
      status: degraded ? "pending_review" : "draft",
      reportData: extractedData as unknown as Prisma.InputJsonValue,
      modelUsedForFinancials: extractedData.modelUsedForFinancials || null,
      contentHash,
      dataQuality: degraded ? "degraded" : "ok",
      versionNo: 1,
    },
  });

  await prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      reportId,
      degradedChunks: degradedCount,
      updatedAt: new Date(),
    },
  });

  if (degraded) {
    await notify(
      "pending_review",
      `${degradedCount} chunk(s) degraded in report for ${companyName} — reviewer acknowledgement required before approval.`,
      { reportId },
      reportId,
      jobId,
    );
  }

  console.log(
    `[QueueWorker] Job ${jobId} ${degraded ? "completed with degraded chunks" : "successfully completed"}. Created report: ${reportId} (dataQuality: ${degraded ? "degraded" : "ok"})`,
  );
}

/**
 * Triggers background processing of a stateful extraction job.
 * Runs asynchronously without blocking the API response thread.
 */
export function triggerBackgroundJob(
  jobId: string,
  companyName: string,
  rawText: string,
  options: { provider: "groq" | "openai"; modelName?: string; apiKey?: string },
): void {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);

  // Execute job asynchronously in the background
  (async () => {
    try {
      console.log(`[QueueWorker] Starting job: ${jobId}`);

      // DB-level guard: abort if another instance already picked up this job
      const currentJob = await prisma.extractionJob.findUnique({
        where: { id: jobId },
      });
      if (!currentJob) {
        console.warn(`[QueueWorker] Job ${jobId} not found in DB. Aborting.`);
        return;
      }
      if (currentJob.status === "completed") {
        console.warn(`[QueueWorker] Job ${jobId} already completed. Skipping.`);
        return;
      }

      // Update state in database to running
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { status: "running", stepIndex: 1 },
      });

      // Run pipeline
      const extractedData =
        await langchainAIService.extractOrResumeFinancialData(
          jobId,
          companyName,
          rawText,
          options,
          false,
        );

      // Extraction phase done — UI moves to formatting/compile locally
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { stepIndex: 2 },
      });

      await finalizeExtractionJob(
        jobId,
        companyName,
        currentJob.fileName,
        extractedData,
      );

      console.log(`[QueueWorker] Job ${jobId} finalized.`);
    } catch (error: unknown) {
      console.error(`[QueueWorker] Job ${jobId} failed:`, error);

      const errMsg = error instanceof Error ? error.message : String(error);
      const isThrottled =
        (error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "RateLimitError") ||
        errMsg.toLowerCase().includes("rate limit") ||
        errMsg.toLowerCase().includes("rate_limit") ||
        (error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 429);

      let waitSecs =
        error && typeof error === "object" && "retryAfterSeconds" in error
          ? (error as { retryAfterSeconds: number }).retryAfterSeconds
          : null;
      if (isThrottled && !waitSecs) {
        const match = errMsg.match(/(?:try again in|in|wait)\s+([\d.]+)\s*s/i);
        if (match) {
          waitSecs = Math.ceil(parseFloat(match[1]));
        } else {
          waitSecs = 30;
        }
      }

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: isThrottled ? "throttled" : "failed",
          errorMessage: errMsg,
          retryAfterSeconds: waitSecs,
          updatedAt: new Date(),
        },
      });
    } finally {
      activeJobs.delete(jobId);
    }
  })();
}

/**
 * Resumes a throttled or failed background extraction job.
 */
export function resumeBackgroundJob(
  jobId: string,
  options: { provider: "groq" | "openai"; modelName?: string; apiKey?: string },
): void {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);

  (async () => {
    try {
      console.log(`[QueueWorker] Resuming job: ${jobId}`);

      const job = await prisma.extractionJob.findUnique({
        where: { id: jobId },
      });
      if (!job) throw new Error(`Job ${jobId} not found in DB`);

      // DB-level guard: don't resume an already-completed or already-running job
      if (job.status === "completed") {
        console.warn(
          `[QueueWorker] Resume skipped — job ${jobId} already completed.`,
        );
        return;
      }
      if (job.status === "running") {
        console.warn(
          `[QueueWorker] Resume skipped — job ${jobId} is already running.`,
        );
        return;
      }

      // A blocked_financials job must re-run the chunk phase from scratch: stale failed
      // financials chunk rows would re-trigger the block even after a successful re-extraction.
      const isBlockedResume = job.status === "blocked_financials";
      if (isBlockedResume) {
        console.log(
          `[QueueWorker] Resume from blocked_financials — clearing chunk rows and re-running the extraction phase.`,
        );
        await prisma.chunkExtraction.deleteMany({ where: { jobId } });
      }

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: "running",
          stepIndex: isBlockedResume ? 0 : 1,
          errorMessage: null,
          retryAfterSeconds: null,
        },
      });

      const extractedData =
        await langchainAIService.extractOrResumeFinancialData(
          jobId,
          undefined,
          undefined,
          options,
          true,
        );

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { stepIndex: 2 },
      });

      await finalizeExtractionJob(
        jobId,
        job.companyName,
        job.fileName,
        extractedData,
      );

      console.log(`[QueueWorker] Job ${jobId} resumed and finalized.`);
    } catch (error: unknown) {
      console.error(`[QueueWorker] Resuming job ${jobId} failed:`, error);

      const errMsg = error instanceof Error ? error.message : String(error);
      const isThrottled =
        (error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "RateLimitError") ||
        errMsg.toLowerCase().includes("rate limit") ||
        errMsg.toLowerCase().includes("rate_limit") ||
        (error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 429);

      let waitSecs =
        error && typeof error === "object" && "retryAfterSeconds" in error
          ? (error as { retryAfterSeconds: number }).retryAfterSeconds
          : null;
      if (isThrottled && !waitSecs) {
        const match = errMsg.match(/(?:try again in|in|wait)\s+([\d.]+)\s*s/i);
        if (match) {
          waitSecs = Math.ceil(parseFloat(match[1]));
        } else {
          waitSecs = 30;
        }
      }

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: isThrottled ? "throttled" : "failed",
          errorMessage: errMsg,
          retryAfterSeconds: waitSecs,
          updatedAt: new Date(),
        },
      });
    } finally {
      activeJobs.delete(jobId);
    }
  })();
}

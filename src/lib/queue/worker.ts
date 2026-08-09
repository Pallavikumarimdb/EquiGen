import { prisma } from '@/lib/db';
import { langchainAIService } from '@/lib/ai/langchain-service';

// In-memory set as a fast local guard — prevents double-triggering within the same process instance.
// NOTE: This does NOT guarantee deduplication across serverless instances.
// The primary guard is the DB-level status check inside the worker body.
const activeJobs = new Set<string>();

/**
 * Triggers background processing of a stateful extraction job.
 * Runs asynchronously without blocking the API response thread.
 */
export function triggerBackgroundJob(
  jobId: string,
  companyName: string,
  rawText: string,
  options: { provider: 'groq' | 'openai'; modelName?: string; apiKey?: string }
): void {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);

  // Execute job asynchronously in the background
  (async () => {
    try {
      console.log(`[QueueWorker] Starting job: ${jobId}`);

      // DB-level guard: abort if another instance already picked up this job
      const currentJob = await prisma.extractionJob.findUnique({ where: { id: jobId } });
      if (!currentJob) {
        console.warn(`[QueueWorker] Job ${jobId} not found in DB. Aborting.`);
        return;
      }
      if (currentJob.status === 'completed') {
        console.warn(`[QueueWorker] Job ${jobId} already completed. Skipping.`);
        return;
      }

      // Update state in database to running
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { status: 'running' }
      });

      // Run pipeline
      const extractedData = await langchainAIService.extractOrResumeFinancialData(jobId, companyName, rawText, options, false);

      // Save complete result to ReportHistory table automatically
      const reportId = 'report_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      const contentHash = require('@/lib/utils/hash').computeSHA256(extractedData);
      await prisma.reportHistory.create({
        data: {
          id: reportId,
          companyName,
          fileName: currentJob.fileName, // Use actual filename stored in job record
          status: 'draft',
          reportData: extractedData as unknown as import('@prisma/client').Prisma.InputJsonValue,
          modelUsedForFinancials: extractedData.modelUsedForFinancials || null,
          contentHash,
          versionNo: 1
        }
      });

      // Mark job as completed and store the created reportId for the status poller
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          reportId,             // ← link the job to its report (fixes status route lookup)
          updatedAt: new Date()
        }
      });

      console.log(`[QueueWorker] Job ${jobId} successfully completed. Created report: ${reportId}`);
    } catch (error: unknown) {
      console.error(`[QueueWorker] Job ${jobId} failed:`, error);
      
      const isThrottled = error && typeof error === 'object' && ('name' in error) && error.name === 'RateLimitError';
      const waitSecs = (error && typeof error === 'object' && ('retryAfterSeconds' in error)) ? (error as { retryAfterSeconds: number }).retryAfterSeconds : null;

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: isThrottled ? 'throttled' : 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
          retryAfterSeconds: waitSecs,
          updatedAt: new Date()
        }
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
  options: { provider: 'groq' | 'openai'; modelName?: string; apiKey?: string }
): void {
  if (activeJobs.has(jobId)) return;
  activeJobs.add(jobId);

  (async () => {
    try {
      console.log(`[QueueWorker] Resuming job: ${jobId}`);

      const job = await prisma.extractionJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error(`Job ${jobId} not found in DB`);

      // DB-level guard: don't resume an already-completed or already-running job
      if (job.status === 'completed') {
        console.warn(`[QueueWorker] Resume skipped — job ${jobId} already completed.`);
        return;
      }
      if (job.status === 'running') {
        console.warn(`[QueueWorker] Resume skipped — job ${jobId} is already running.`);
        return;
      }

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { status: 'running' }
      });

      const extractedData = await langchainAIService.extractOrResumeFinancialData(jobId, undefined, undefined, options, true);

      // Save complete result to ReportHistory table automatically
      const reportId = 'report_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      const contentHash = require('@/lib/utils/hash').computeSHA256(extractedData);
      await prisma.reportHistory.create({
        data: {
          id: reportId,
          companyName: job.companyName,
          fileName: job.fileName,           // Use actual filename stored in job record
          status: 'draft',
          reportData: extractedData as unknown as import('@prisma/client').Prisma.InputJsonValue,
          modelUsedForFinancials: extractedData.modelUsedForFinancials || null,
          contentHash,
          versionNo: 1
        }
      });

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          reportId,                         // ← link the job to its report
          updatedAt: new Date()
        }
      });

      console.log(`[QueueWorker] Job ${jobId} successfully resumed and completed.`);
    } catch (error: unknown) {
      console.error(`[QueueWorker] Resuming job ${jobId} failed:`, error);
      
      const isThrottled = error && typeof error === 'object' && ('name' in error) && error.name === 'RateLimitError';
      const waitSecs = (error && typeof error === 'object' && ('retryAfterSeconds' in error)) ? (error as { retryAfterSeconds: number }).retryAfterSeconds : null;

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: isThrottled ? 'throttled' : 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
          retryAfterSeconds: waitSecs,
          updatedAt: new Date()
        }
      });
    } finally {
      activeJobs.delete(jobId);
    }
  })();
}

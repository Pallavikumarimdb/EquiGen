import { prisma } from "../db";

export interface BatchItemInput {
  companyName: string;
  fileName: string;
  rawText: string;
}

export interface BatchProgressResult {
  batchId: string;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  runningJobs: number;
  status: "processing" | "completed" | "partial_failure";
  jobIds: string[];
}

export class BatchProcessorService {
  /**
   * Submits a multi-document batch extraction request.
   */
  public async submitBatch(
    items: BatchItemInput[],
    userId?: string,
    orgId?: string
  ): Promise<{ batchId: string; jobIds: string[] }> {
    const batchId = `batch_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const jobIds: string[] = [];

    for (const item of items) {
      const jobId = `job_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
      jobIds.push(jobId);

      await prisma.extractionJob.create({
        data: {
          id: jobId,
          companyName: item.companyName,
          fileName: item.fileName,
          rawText: item.rawText,
          status: "running",
          stepIndex: 0,
          createdById: userId || null,
          orgId: orgId || "default-org",
        },
      });
    }

    return { batchId, jobIds };
  }

  /**
   * Fetches current progress status across all jobs in a batch.
   */
  public async getBatchProgress(jobIds: string[]): Promise<BatchProgressResult> {
    const jobs = await prisma.extractionJob.findMany({
      where: { id: { in: jobIds } },
    });

    const totalJobs = jobIds.length;
    let completedJobs = 0;
    let failedJobs = 0;
    let runningJobs = 0;

    jobs.forEach((j) => {
      if (j.status === "completed") completedJobs++;
      else if (j.status === "failed") failedJobs++;
      else runningJobs++;
    });

    let status: "processing" | "completed" | "partial_failure" = "processing";
    if (runningJobs === 0) {
      status = failedJobs > 0 ? "partial_failure" : "completed";
    }

    return {
      batchId: jobIds[0] ? `batch_${jobIds[0]}` : "batch_unknown",
      totalJobs,
      completedJobs,
      failedJobs,
      runningJobs,
      status,
      jobIds,
    };
  }
}

export const batchProcessorService = new BatchProcessorService();

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { ChatGroq } from '@langchain/groq';
import { prisma } from '@/lib/db';
import { computeSHA256 } from '@/lib/utils/hash';
import { currentSchemaVersion } from '@/lib/ai/versions';
import { recordActualUsage, FALLBACK_GROQ_MODEL } from './model-router';
import { withRateLimitRetry } from './retry-wrapper';
import type { AIServiceOptions } from './langchain-service';

// Free-tier Groq caps TPM per request (~6000): input tokens + max_tokens must fit.
// 2800 chars ≈ 700-1000 input tokens, so 4000 max tokens stays under the cap while
// leaving enough output room for dense financial JSON (default ~1024 truncated it).
const CHUNK_TARGET_CHARS = 2800;
const CHUNK_CONCURRENCY = 2;
const WORKHORSE_MAX_TOKENS = 4000;

// Free-tier Groq allows ~6000 TPM. Concurrent chunk calls can burn the budget
// faster than it refills (retries can't outwait a sustained overshoot), so gate
// every request through a token bucket that refills at the TPM rate.
const TPM_LIMIT = 6000;
const REFILL_MS_PER_TOKEN = 60000 / TPM_LIMIT;
let bucketTokens = TPM_LIMIT;
let bucketRefilledAt = Date.now();
let bucketTail: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireTokens(estimatedTokens: number): Promise<void> {
  const prev = bucketTail;
  const acquire = prev.then(async () => {
    const now = Date.now();
    bucketTokens = Math.min(TPM_LIMIT, bucketTokens + (now - bucketRefilledAt) / REFILL_MS_PER_TOKEN);
    bucketRefilledAt = now;
    if (bucketTokens >= estimatedTokens) {
      bucketTokens -= estimatedTokens;
      return;
    }
    const deficit = estimatedTokens - bucketTokens;
    bucketTokens = 0;
    await sleep(deficit * REFILL_MS_PER_TOKEN + 300);
    bucketRefilledAt = Date.now();
  });
  bucketTail = acquire.catch(() => {});
  return acquire;
}

interface ChunkPage {
  pageNo: number;
  text: string;
  isFinancial: boolean;
}

interface ChunkGroup {
  key: string;
  pages: ChunkPage[];
  charCount: number;
}

const ParallelChunkSchema = z.object({
  narrative: z.array(z.string()).describe('Key operational facts, business details, and figures found in this section (empty if none)'),
  swot: z.array(z.string()).describe('SWOT strengths, weaknesses, risks, or growth drivers found in this section (empty if none)'),
  financials: z.array(z.object({
    text: z.string().describe('A specific financial figure, statement line, or target with its period and unit'),
    page: z.number().describe('The exact page number the figure appears on'),
    metric: z.string().optional().describe('E.g. Revenue, EBITDA, PAT, EPS, Market Cap, or null'),
    period: z.string().optional().describe('E.g. Q1FY26, FY25, Q2FY26, or null'),
    value: z.number().optional().describe('Numeric value extracted, or null'),
    unit: z.string().optional().describe('E.g. Cr, Mn, Rs., %, or null'),
  })).describe('Financial figures found in this section (empty if none)'),
});

type ParallelChunkOutput = z.infer<typeof ParallelChunkSchema>;

function setJobWait(jobId: string, waitMs: number): void {
  if (!jobId || waitMs <= 0) return;
  prisma.extractionJob
    .update({
      where: { id: jobId },
      data: {
        waitMessage: 'AI model at capacity — resuming automatically',
        waitUntil: new Date(Date.now() + waitMs),
        updatedAt: new Date(),
      },
    })
    .catch(() => {});
}

function clearJobWait(jobId: string): void {
  if (!jobId) return;
  prisma.extractionJob
    .update({
      where: { id: jobId },
      data: { waitMessage: null, waitUntil: null, updatedAt: new Date() },
    })
    .catch(() => {});
}

export async function runParallelChunkExtraction(params: {
  jobId: string;
  documentId: string;
  companyName: string;
  options: AIServiceOptions;
}): Promise<{ mergedContext: string; degradedCount: number }> {
  const { jobId, documentId, companyName, options } = params;
  const empty = { mergedContext: '', degradedCount: 0 };
  if (options.provider !== 'groq') return empty;

  const pageRecords = await prisma.documentPage.findMany({
    where: { documentId },
    orderBy: { pageNo: 'asc' },
    select: { pageNo: true, nativeText: true, ocrText: true, annotations: true },
  });

  const pages: ChunkPage[] = pageRecords
    .map((p) => ({
      pageNo: p.pageNo,
      text: (p.nativeText || p.ocrText || '').trim(),
      isFinancial: Boolean(p.annotations && (p.annotations as { financials?: boolean }).financials),
    }))
    .filter((p) => p.text.length > 0);

  if (pages.length === 0) return empty;

  // Re-runs must start clean: stale rows from a previous attempt (e.g. a chunk key
  // that no longer exists after re-chunking) would otherwise pollute the quality gate.
  await prisma.chunkExtraction.deleteMany({ where: { jobId } });

  const chunks: ChunkGroup[] = [];
  let current: ChunkGroup = { key: '', pages: [], charCount: 0 };
  for (const page of pages) {
    if (page.text.length > CHUNK_TARGET_CHARS) {
      // Oversized single page: split into sub-chunks (e.g. p3.1, p3.2) so the
      // request stays under the free-tier token budget.
      if (current.pages.length > 0) {
        chunks.push(current);
        current = { key: '', pages: [], charCount: 0 };
      }
      const parts = Math.ceil(page.text.length / CHUNK_TARGET_CHARS);
      for (let i = 0; i < parts; i++) {
        chunks.push({
          key: `p${page.pageNo}.${i + 1}`,
          pages: [{ ...page, text: page.text.slice(i * CHUNK_TARGET_CHARS, (i + 1) * CHUNK_TARGET_CHARS) }],
          charCount: Math.min(CHUNK_TARGET_CHARS, page.text.length - i * CHUNK_TARGET_CHARS),
        });
      }
      continue;
    }
    if (current.pages.length > 0 && current.charCount + page.text.length > CHUNK_TARGET_CHARS) {
      chunks.push(current);
      current = { key: '', pages: [], charCount: 0 };
    }
    current.pages.push(page);
    current.charCount += page.text.length;
  }
  if (current.pages.length > 0) chunks.push(current);

  for (const chunk of chunks) {
    if (chunk.key) continue;
    const first = chunk.pages[0].pageNo;
    const last = chunk.pages[chunk.pages.length - 1].pageNo;
    chunk.key = first === last ? `p${first}` : `p${first}-${last}`;
  }

  const apiKey = options.apiKey || process.env.GROQ_API_KEY || '';
  if (!apiKey) throw new Error('Groq API key not configured for parallel extraction.');
  const model = new ChatGroq({
    apiKey,
    model: FALLBACK_GROQ_MODEL,
    temperature: 0.1,
    maxRetries: 3,
    maxTokens: WORKHORSE_MAX_TOKENS,
  });

  let degradedCount = 0;
  const merged: string[] = [];
  let cursor = 0;

  const extractChunk = async () => {
    while (cursor < chunks.length) {
      const chunk = chunks[cursor++];
      const chunkText = chunk.pages.map((p) => `[Page ${p.pageNo}]\n${p.text}`).join('\n\n');
      const systemPrompt = 'You are a corporate data extraction analyst. Read the annual report / prospectus pages below and extract narrative facts, SWOT factors, and financial figures. Respond with a single JSON object exactly matching this shape (no markdown, no commentary, empty arrays when a section has nothing):\n{"narrative": ["key fact", ...], "swot": ["strength/weakness/risk", ...], "financials": [{"text": "specific figure, statement line, or target with its period and unit", "page": 3, "metric": "Revenue", "period": "Q1FY26", "value": 1250, "unit": "Cr"}, ...]}\nDo not invent figures — "page" must be the exact page number from the [Page N] headers. Always populate metric, period, value, and unit fields when possible for numeric financial data.';
      const userPrompt = `Company: ${companyName}\n\nPages ${chunk.key}:\n\n${chunkText}`;

      const startedAt = Date.now();
      let res: ParallelChunkOutput | null = null;
      let error: unknown = null;
      // Rough token estimate (chars/3 for input + JSON schema overhead for output);
      // slightly conservative so bursts stay under the TPM bucket.
      const estimate = Math.min(WORKHORSE_MAX_TOKENS, Math.max(1500, Math.ceil(chunkText.length / 3) + 1200));
      for (let attempt = 0; attempt < 2 && !res; attempt++) {
        try {
          await acquireTokens(estimate);
          const messages: [['system', string], ['user', string]] = [
            ['system', systemPrompt],
            ['user', userPrompt],
          ];
          const raw = await withRateLimitRetry(
            () => model.invoke(messages, { response_format: { type: 'json_object' } }),
            2,
            (waitSeconds) => setJobWait(jobId, waitSeconds * 1000),
            () => clearJobWait(jobId)
          );
          const text = typeof raw.content === 'string' ? raw.content : JSON.stringify(raw.content);
          const parsed = JSON.parse(text) as Partial<ParallelChunkOutput>;
          res = ParallelChunkSchema.safeParse(parsed).success ? (parsed as ParallelChunkOutput) : null;
          if (!res) error = new Error(`Output did not match extraction schema: ${text.slice(0, 300)}`);
        } catch (err) {
          error = err;
          await new Promise((r) => setTimeout(r, 800));
        }
      }
      clearJobWait(jobId);
      const latencyMs = Date.now() - startedAt;

      const chunkPages = chunk.pages.map((p) => p.pageNo);
      const rows: { extractType: string; content: string; extractionJson: Prisma.InputJsonValue | typeof Prisma.JsonNull; citePages: number[]; status: string }[] = [];

      if (res) {
        if (res.narrative.length > 0) {
          rows.push({ extractType: 'narrative', content: res.narrative.join('\n'), extractionJson: res.narrative, citePages: chunkPages, status: 'ok' });
        }
        if (res.swot.length > 0) {
          rows.push({ extractType: 'swot', content: res.swot.join('\n'), extractionJson: res.swot, citePages: chunkPages, status: 'ok' });
        }
        const hasFinancialPages = chunk.pages.some((p) => p.isFinancial);
        if (res.financials.length > 0) {
          rows.push({
            extractType: 'financials',
            content: res.financials.map((f) => f.text).join('\n'),
            extractionJson: res.financials,
            citePages: res.financials.map((f) => f.page),
            status: 'ok',
          });
        } else if (hasFinancialPages) {
          rows.push({ extractType: 'financials', content: '', extractionJson: [], citePages: chunkPages, status: 'degraded' });
        }
      } else {
        const failType = chunk.pages.some((p) => p.isFinancial) ? 'financials' : 'narrative';
        rows.push({ extractType: failType, content: '', extractionJson: Prisma.JsonNull, citePages: chunkPages, status: 'failed' });
      }

      for (const row of rows) {
        const inputHash = computeSHA256(chunkText + row.extractType + currentSchemaVersion());
        const rowData = {
          extractionJson: row.extractionJson,
          citePages: row.citePages,
          status: row.status,
          retries: res ? 0 : 2,
          error: res ? null : error instanceof Error ? error.message : String(error),
          latencyMs,
          modelUsed: FALLBACK_GROQ_MODEL,
          updatedAt: new Date(),
        };
        await prisma.chunkExtraction.upsert({
          where: { jobId_chunkKey_extractType: { jobId, chunkKey: chunk.key, extractType: row.extractType } },
          update: rowData,
          create: {
            jobId,
            chunkKey: chunk.key,
            extractType: row.extractType,
            inputHash,
            ...rowData,
          },
        });
        if (row.status === 'degraded' || row.status === 'failed') degradedCount++;
      }

      const lines: string[] = [];
      if (res) {
        if (res.narrative.length > 0) lines.push(`(Narrative) ${res.narrative.join(' | ')}`);
        if (res.swot.length > 0) lines.push(`(SWOT) ${res.swot.join(' | ')}`);
        if (res.financials.length > 0) lines.push(`(Financials) ${res.financials.map((f) => `${f.text} [p.${f.page}]`).join(' | ')}`);
      }
      if (lines.length === 0) lines.push(`(No structured content extracted from pages ${chunk.key}.)`);
      merged.push(`[Extract ${chunk.key}]\n${lines.join('\n')}`);

      recordActualUsage(FALLBACK_GROQ_MODEL, systemPrompt + userPrompt, res ? JSON.stringify(res) : '');
    }
  };

  await Promise.all(Array.from({ length: CHUNK_CONCURRENCY }, () => extractChunk()));

  console.log(`[Parallel Extract] ${chunks.length} chunk(s) extracted on ${FALLBACK_GROQ_MODEL} for job ${jobId} (${degradedCount} degraded/failed).`);
  return { mergedContext: merged.join('\n\n---\n\n'), degradedCount };
}

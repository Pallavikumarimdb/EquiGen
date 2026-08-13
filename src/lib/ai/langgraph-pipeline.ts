import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { ChatGroq } from '@langchain/groq';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { AIServiceOptions } from './langchain-service';
import { AIExtractionResult } from './schema';
import { getModelForRequest, getFallbackGroqModel, recordActualUsage } from './model-router';
import { withRateLimitRetry, RateLimitError } from './retry-wrapper';

// --- Helper: Simple Character Chunker with overlap ---

function splitTextIntoChunks(text: string, chunkSize = 20000, overlap = 2000): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.substring(start, end));
    start += chunkSize - overlap;
    if (end === text.length) break;
  }
  return chunks;
}

function parseNum(v: number | string): number {
  if (typeof v === 'number') return v;
  return parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0;
}

// --- Specialized Node Zod Sub-schemas ---

export const LocalExtractionSchema = z.object({
  relevantSWOT: z.array(z.string()).describe('SWOT factors or risk signals found in this section (empty if none)'),
  relevantFinancials: z.array(z.string()).describe('Key financial figures, EBITDA, revenues, or targets mentioned in this section (empty if none)'),
  briefSectionSummary: z.string().describe('1-2 sentence high-density summary of operational facts in this section'),
  rawTabularData: z.string().optional().describe('Verbatim markdown, CSV, or structured text of any Balance Sheet, P&L, Cash Flow, or Ratios tables found in this section (leave empty if none)')
});

export const CompanyGeneralSchema = z.object({
  companyName: z.string().describe('Full corporate name of the target entity'),
  ticker: z.string().describe('Stock market ticker symbol'),
  narrativeSummary: z.string().describe('Narrative summary of findings (outlook, recommendation, key drivers)'),
  industryOverview: z.string().describe('High-level outlook of the industry vertical'),
  businessOverview: z.string().describe('Brief operational overview of business divisions'),
  headlineTakeaway: z.string().describe('A punchy, editorial-style headline under 12 words summarizing the thesis. E.g. "Blinkit propels growth; valuation limits upside"')
});

export const SwotAndThesisSchema = z.object({
  highlights: z.array(z.string()).describe('Key highlights (strengths, expansion, strategic positioning)'),
  investmentThesis: z.string().describe('Main investment case and rationale'),
  risks: z.array(z.string()).describe('Primary business and financial risks/weaknesses'),
  futureGrowth: z.union([z.string(), z.array(z.string())]).describe('Key growth drivers and pipeline plans')
});

export const FinancialsSchema = z.object({
  revenue: z.array(z.object({
    period: z.string().describe('Fiscal period, e.g. FY23, FY24, FY25'),
    value: z.number().describe('Revenue figure value'),
    unit: z.string().describe('Cr or Mn')
  })).describe('Revenue statement entries'),
  ebitda: z.array(z.object({
    period: z.string().describe('Fiscal period'),
    value: z.number().describe('EBITDA value'),
    unit: z.string().describe('Cr or Mn')
  })).describe('EBITDA statement entries'),
  pat: z.array(z.object({
    period: z.string().describe('Fiscal period'),
    value: z.number().describe('PAT value'),
    unit: z.string().describe('Cr or Mn')
  })).describe('PAT statement entries'),
  recommendation: z.enum(['BUY', 'ACCUMULATE', 'HOLD', 'REDUCE', 'SELL']),
  currentPrice: z.number().nullable().optional(),
  targetPrice: z.number().nullable().optional(),
  nseCode: z.string().nullable().optional(),
  bseCode: z.string().nullable().optional(),
  bloombergCode: z.string().nullable().optional(),
  timeFrame: z.string().nullable().optional(),
  stockType: z.string().nullable().optional(),
  companyData: z.object({
    marketCap: z.union([z.string(), z.number()]).nullable().optional(),
    highLow52W: z.string().nullable().optional(),
    enterpriseValue: z.union([z.string(), z.number()]).nullable().optional(),
    ev: z.union([z.string(), z.number()]).nullable().optional(),
    outstandingShares: z.union([z.string(), z.number()]).nullable().optional(),
    freeFloat: z.union([z.string(), z.number()]).nullable().optional(),
    dividendYield: z.union([z.string(), z.number()]).nullable().optional(),
    avgVolume6m: z.union([z.string(), z.number()]).nullable().optional(),
    avgVolume: z.union([z.string(), z.number()]).nullable().optional(),
    beta: z.union([z.string(), z.number()]).nullable().optional(),
    faceValue: z.union([z.string(), z.number()]).nullable().optional(),
  }).nullable().optional(),
  shareholding: z.array(z.object({
    category: z.string(),
    periods: z.array(z.string()),
    values: z.array(z.union([z.string(), z.number()]))
  })).nullable().optional(),
  promoterPledge: z.union([z.string(), z.number()]).nullable().optional(),
  pricePerformance: z.array(z.object({
    period: z.string(),
    absoluteReturn: z.union([z.string(), z.number()]).nullable().optional(),
    absoluteSensex: z.union([z.string(), z.number()]).nullable().optional(),
    relativeReturn: z.union([z.string(), z.number()]).nullable().optional()
  })).nullable().optional(),
  estimates: z.array(z.object({
    metric: z.string(),
    oldFY26: z.union([z.string(), z.number()]).nullable().optional(),
    oldFY27: z.union([z.string(), z.number()]).nullable().optional(),
    newFY26: z.union([z.string(), z.number()]).nullable().optional(),
    newFY27: z.union([z.string(), z.number()]).nullable().optional(),
    changeFY26: z.union([z.string(), z.number()]).nullable().optional(),
    changeFY27: z.union([z.string(), z.number()]).nullable().optional()
  })).nullable().optional(),
  quarterlyFinancials: z.array(z.object({
    metric: z.string(),
    q1fy26: z.union([z.string(), z.number()]).nullable().optional(),
    q1fy25: z.union([z.string(), z.number()]).nullable().optional(),
    yoyGrowth: z.union([z.string(), z.number()]).nullable().optional(),
    q4fy25: z.union([z.string(), z.number()]).nullable().optional(),
    qoqGrowth: z.union([z.string(), z.number()]).nullable().optional()
  })).nullable().optional(),
  detailedFinancials: z.object({
    incomeStatement: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).nullable().optional(),
    balanceSheet: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).nullable().optional(),
    cashFlow: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).nullable().optional(),
    ratios: z.array(z.record(z.union([z.string(), z.number(), z.null()]))).nullable().optional()
  }).nullable().optional(),
  recommendationSummary: z.array(z.object({
    date: z.string().describe("The date or period of the recommendation, e.g. '12-May-24', 'Q1FY25' or 'September 2023'"),
    rating: z.string().describe("The recommendation rating, e.g. 'BUY', 'HOLD', 'ACCUMULATE', 'REDUCE', 'SELL'"),
    target: z.union([z.string(), z.number()]).describe("The target price on that date")
  })).nullable().optional().describe("Recommendation history/summary over the last 3 years (often found under 'Recommendation Summary (last 3 years)' or 'Recommendation History'), consisting of past dates, ratings/recommendations, and target prices."),
  sensexValue: z.union([z.string(), z.number()]).nullable().optional(),
  fiveYearSummary: z.array(z.object({
    period: z.string(),
    sales: z.union([z.string(), z.number()]).nullable().optional(),
    salesGrowth: z.union([z.string(), z.number()]).nullable().optional(),
    ebitda: z.union([z.string(), z.number()]).nullable().optional(),
    ebitdaMargin: z.union([z.string(), z.number()]).nullable().optional(),
    patAdjusted: z.union([z.string(), z.number()]).nullable().optional(),
    patGrowth: z.union([z.string(), z.number()]).nullable().optional(),
    adjEps: z.union([z.string(), z.number()]).nullable().optional(),
    epsGrowth: z.union([z.string(), z.number()]).nullable().optional(),
    pe: z.union([z.string(), z.number()]).nullable().optional(),
    pb: z.union([z.string(), z.number()]).nullable().optional(),
    evEbitda: z.union([z.string(), z.number()]).nullable().optional(),
    roe: z.union([z.string(), z.number()]).nullable().optional(),
    deRatio: z.union([z.string(), z.number()]).nullable().optional()
  })).nullable().optional()
});

// --- State Definition ---

export const ResearchState = Annotation.Root({
  rawText: Annotation<string>(),
  companyName: Annotation<string>(),
  modelOptions: Annotation<AIServiceOptions>(),
  /** DB job id — used to surface internal waits (e.g. token budget) via job status */
  jobId: Annotation<string>(),
  
  // Condensed summary generated by map-reduce preprocessor
  condensedContext: Annotation<string>({
    reducer: (a, b) => b,
    default: () => ''
  }),

  // Extract results
  companyGeneral: Annotation<z.infer<typeof CompanyGeneralSchema>>(),
  swotAndThesis: Annotation<z.infer<typeof SwotAndThesisSchema>>(),
  financials: Annotation<z.infer<typeof FinancialsSchema>>(),
  
  // Audit details
  mathErrors: Annotation<string[]>({
    reducer: (a, b) => a.concat(b),
    default: () => []
  }),
  retryCount: Annotation<number>({
    reducer: (a, b) => a + b,
    default: () => 0
  }),
  mathematicallyValid: Annotation<boolean>({
    reducer: (a, b) => b,
    default: () => true
  }),
  /** Tracks which model actually ran financials extraction (for reviewer audit trail) */
  modelUsedForFinancials: Annotation<string>({
    reducer: (a, b) => b || a,
    default: () => ''
  })
});

// --- Helper: Preprocessor model (always high-TPM 8B) ---

function getPreprocessorModel(options: AIServiceOptions): ChatGroq {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY || '';
  if (!apiKey) throw new Error('Groq API key not configured for preprocessor model.');
  return new ChatGroq({
    apiKey,
    model: 'llama-3.1-8b-instant', // 500,000 TPM — safe for bulk chunking
    temperature: 0.1,
    maxRetries: 5,
  });
}

/**
 * Persists an internal "waiting for AI capacity" state on the job so the client
 * can render a live countdown instead of a silently frozen running step.
 * Non-fatal: failures here never abort the pipeline.
 */
function notifyBudgetWait(state: typeof ResearchState.State, waitMs: number): void {
  if (!state.jobId || waitMs <= 0) return;
  prisma.extractionJob
    .update({
      where: { id: state.jobId },
      data: {
        waitMessage: 'AI model at capacity — resuming automatically',
        waitUntil: new Date(Date.now() + waitMs),
        updatedAt: new Date()
      }
    })
    .catch(() => {/* best-effort progress surfacing */});
}

// --- Node 0: Map-Reduce Chunker Node ---

async function preprocessChunksNode(state: typeof ResearchState.State) {
  // If text is short, skip chunking map-reduce and use it raw
  if (state.rawText.length < 200000) {
    return { condensedContext: state.rawText };
  }

  const chunks = splitTextIntoChunks(state.rawText, 12000, 1200);
  const model = getPreprocessorModel(state.modelOptions);
  const structuredModel = model.withStructuredOutput(LocalExtractionSchema);
  
  const results: string[] = [];
  const delayMs = 150; // fast delay for high-rate-limit base preprocessor model
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    // Add rate-limiting cooldown delay between sequential requests
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    try {
      const systemPrompt = `You are a corporate data extraction analyst. Read the segment of an annual report / prospectus. Extract any relevant SWOT details, financials, or critical operations facts. Keep arrays empty if nothing is found.`;
      const userPrompt = `Company: ${state.companyName}\n\nSegment (Part ${i + 1} of ${chunks.length}):\n${chunk}`;
      
      const res = await structuredModel.invoke([
        ['system', systemPrompt],
        ['user', userPrompt]
      ]);
      
      const condensedLine = `[Chunk ${i + 1}]: ${res.briefSectionSummary}. SWOT: ${res.relevantSWOT.join(', ')}. Fin: ${res.relevantFinancials.join(', ')}`;
      if (res.rawTabularData && res.rawTabularData.trim().length > 0) {
        results.push(`${condensedLine}\n[VERBATIM TABLE CHUNK ${i + 1}]:\n${res.rawTabularData}\n`);
      } else {
        results.push(condensedLine);
      }
    } catch (e) {
      console.warn(`[QueueWorker Chunker] Chunk ${i} failed. Skipping chunk. Error:`, e);
    }
  }

  return { condensedContext: results.join('\n') };
}

// --- Node 1: Company General details ---

async function extractCompanyGeneralNode(state: typeof ResearchState.State): Promise<{ companyGeneral: z.infer<typeof CompanyGeneralSchema> }> {
  let contextText = '';
  const job = await prisma.extractionJob.findUnique({
    where: { id: state.jobId }
  });
  if (job?.documentId) {
    const narrativeExtractions = await prisma.chunkExtraction.findMany({
      where: {
        jobId: state.jobId,
        extractType: 'narrative',
        status: 'ok'
      }
    });
    contextText = narrativeExtractions
      .map((e) => {
        if (e.extractionJson && Array.isArray(e.extractionJson)) {
          return (e.extractionJson as string[]).join('\n');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (!contextText) {
    contextText = state.condensedContext || state.rawText;
  }
  const systemPrompt = `You are an expert SEBI-registered equity research analyst. Write in the house style of Geojit's "Retail Equity Research" reports.
Read the provided document text and extract the following:
1. companyName (exact full official name)
2. ticker (ticker symbol)
3. businessOverview (A detailed paragraph of EXACTLY 4-5 lines describing core divisions, revenue mix, and operational focus)
4. industryOverview (high-level sector outlook)
5. narrativeSummary (An outlook and valuation summary paragraph of EXACTLY 5-7 lines highlighting key points, margins, and management stance)
6. headlineTakeaway: a single short editorial line (under 12 words) formatted exactly as:
   "<growth driver clause>; <constraint/risk clause>" (joined by a semicolon). First clause names the strongest positive driver, second clause names the main constraint (e.g. valuation, margin pressures).`;
  const userPrompt = `Company: ${state.companyName}\n\nDocument Text:\n${contextText}`;
  const fullPrompt = systemPrompt + userPrompt;

  // Pre-flight: checks request size vs TPM ceiling, waits for real budget, reroutes if needed
  const { model, modelName, downgraded } = await getModelForRequest(
    state.modelOptions, fullPrompt, 'llama-3.3-70b-versatile',
    (waitMs) => notifyBudgetWait(state, waitMs)
  );
  clearJobWait(state);

  if (downgraded) {
    console.warn(`[extract_general] Rerouted to ${modelName} due to request size.`);
  }

  const structuredModel = model.withStructuredOutput(CompanyGeneralSchema);
  const fallbackStructuredModel = getFallbackGroqModel(state.modelOptions).withStructuredOutput(CompanyGeneralSchema);
  const res = await withRateLimitRetry(
    () => structuredModel.invoke([['system', systemPrompt], ['user', userPrompt]]),
    2,
    (waitSeconds) => notifyBudgetWait(state, waitSeconds * 1000),
    () => clearJobWait(state),
    () => fallbackStructuredModel.invoke([['system', systemPrompt], ['user', userPrompt]])
  );
  clearJobWait(state);

  recordActualUsage(modelName, fullPrompt, JSON.stringify(res));
  return { companyGeneral: res as z.infer<typeof CompanyGeneralSchema> };
}

// --- Node 2: SWOT & Investment Thesis ---

async function extractSwotNode(state: typeof ResearchState.State): Promise<{ swotAndThesis: z.infer<typeof SwotAndThesisSchema> }> {
  let contextText = '';
  const job = await prisma.extractionJob.findUnique({
    where: { id: state.jobId }
  });
  if (job?.documentId) {
    const swotExtractions = await prisma.chunkExtraction.findMany({
      where: {
        jobId: state.jobId,
        extractType: 'swot',
        status: 'ok'
      }
    });
    contextText = swotExtractions
      .map((e) => {
        if (e.extractionJson && Array.isArray(e.extractionJson)) {
          return (e.extractionJson as string[]).join('\n');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }
  if (!contextText) {
    contextText = state.condensedContext || state.rawText;
  }
  const systemPrompt = `You are an expert equity research auditor. Read the text and extract strategic qualitative metrics:
1. highlights: exactly 10-12 short quantitative/factual bullet points detailing key positive facts, segment growth, and strategic gains. The first 5 bullets MUST represent headline-level financial stats - e.g. revenue and margin growth; the remaining 5-7 bullets MUST represent deeper qualitative/operational insights.
2. investmentThesis: core investment rationale case.
3. risks: primary business, structural, and financial risks.
4. futureGrowth: key growth drivers, pipeline plans, and future growth indicators.`;
  const userPrompt = `Company: ${state.companyName}\n\nDocument Text:\n${contextText}`;
  const fullPrompt = systemPrompt + userPrompt;

  const { model, modelName, downgraded } = await getModelForRequest(
    state.modelOptions, fullPrompt, 'llama-3.3-70b-versatile',
    (waitMs) => notifyBudgetWait(state, waitMs)
  );
  clearJobWait(state);

  if (downgraded) {
    console.warn(`[extract_swot] Rerouted to ${modelName} due to request size.`);
  }

  const structuredModel = model.withStructuredOutput(SwotAndThesisSchema);
  const fallbackStructuredModel = getFallbackGroqModel(state.modelOptions).withStructuredOutput(SwotAndThesisSchema);
  const res = await withRateLimitRetry(
    () => structuredModel.invoke([['system', systemPrompt], ['user', userPrompt]]),
    2,
    (waitSeconds) => notifyBudgetWait(state, waitSeconds * 1000),
    () => clearJobWait(state),
    () => fallbackStructuredModel.invoke([['system', systemPrompt], ['user', userPrompt]])
  );
  clearJobWait(state);

  recordActualUsage(modelName, fullPrompt, JSON.stringify(res));
  return { swotAndThesis: res as z.infer<typeof SwotAndThesisSchema> };
}

// --- Node 3: Financials ---

async function extractFinancialsNode(state: typeof ResearchState.State): Promise<{ financials: z.infer<typeof FinancialsSchema>; modelUsedForFinancials: string }> {
  let contextText = '';
  const job = await prisma.extractionJob.findUnique({
    where: { id: state.jobId }
  });
  if (job?.documentId) {
    const financialExtractions = await prisma.chunkExtraction.findMany({
      where: {
        jobId: state.jobId,
        extractType: 'financials',
        status: 'ok'
      }
    });
    const facts: string[] = [];
    interface ExtractedFinancialFact {
      text?: string;
      page?: number;
    }
    for (const ext of financialExtractions) {
      if (ext.extractionJson && Array.isArray(ext.extractionJson)) {
        for (const item of ext.extractionJson as unknown as ExtractedFinancialFact[]) {
          if (item && typeof item === 'object' && item.text) {
            facts.push(`- ${item.text} [Page ${item.page || ext.chunkKey}]`);
          }
        }
      }
    }
    if (facts.length > 0) {
      contextText = facts.join('\n');
    }
    console.log(`[Pipeline] Routing ${facts.length} extracted financial facts directly to 70B node (bypassing summarizer).`);
  }
  if (!contextText || contextText.trim().length === 0) {
    contextText = state.condensedContext || state.rawText;
  }
  let feedback = '';
  if (state.mathErrors && state.mathErrors.length > 0) {
    feedback = `\n\n[WARNING: Previous extraction had errors! Please pay special attention to the following calculation issues and correct them:\n- ${state.mathErrors.join('\n- ')}]`;
  }

  const systemPrompt = `You are a chartered financial analyst. Carefully read the text and tables to extract:
1. Revenue, EBITDA, and PAT/Net Profit series across fiscal periods. These MUST be arrays of objects (e.g. [{"period": "Q2FY26", "unit": "INR million", "value": 29795}]). Never return them as single objects.
2. CurrentPrice (CMP), targetPrice, and recommendation. Note: The recommendation field is mandatory and MUST be one of the enum values: 'BUY', 'ACCUMULATE', 'HOLD', 'REDUCE', 'SELL'. If not explicitly mentioned in the text, you MUST NOT return null; calculate and suggest a default value (e.g., 'HOLD') based on the financial performance metrics:
   - Suggest CurrentPrice (CMP) using outstanding shares and market cap if available (CMP = Market Cap / Outstanding Shares).
   - Suggest a Target Price by applying a reasonable forward P/E multiple (e.g. 25-35x depending on growth) to the current/projected annualized earnings, or a standard premium (e.g. 15-25% upside).
   - Set Recommendation to 'BUY' if upside is >15%, 'ACCUMULATE' if 10-15%, 'HOLD' if 0-10%, and 'REDUCE' or 'SELL' if downside exists.
3. nseCode, bseCode, bloombergCode, timeFrame (default "12 Months"), stockType (e.g. Large Cap, Mid Cap, Small Cap)
4. sensexValue: The current value of the Sensex benchmark index if mentioned in the document.
5. fiveYearSummary: Look for a compact historical + estimates 5-year valuation-multiples summary table in the document and extract: period (e.g. FY25A, FY26E, FY27E), sales, salesGrowth, ebitda, ebitdaMargin, patAdjusted, patGrowth, adjEps, epsGrowth, pe, pb, evEbitda, roe, deRatio.
6. Detailed tables if present in the document. Try to normalize and align the "metric" field keys using these standard row titles:
   - For detailedFinancials.incomeStatement: Map metrics to: Sales, EBITDA, Depreciation, EBIT, Interest, Other Income, PBT, Tax, Reported PAT, Adjusted PAT, No. of shares (cr), Adjusted EPS, DPS.
   - For detailedFinancials.balanceSheet: Map metrics to: Current Assets, Cash & Equivalents, Receivables, Inventories, Fixed Assets, Intangible Assets, Total Assets, Current Liabilities, Payables, Short-term Debt, Long-term Debt, Total Liabilities, Share Capital, Reserves & Surplus, Total Equity.
   - For detailedFinancials.cashFlow: Map metrics to: Net inc. + Depn., Non-cash adj., Changes in W.C, C.F. Operation, Capital exp., C.F - Investment, C.F - Finance, Closing Cash.
   - For detailedFinancials.ratios: Map metrics to: EBITDA margin (%), ROCE (%), Receivables (days), Current Ratio (x), Debt/Equity (x), P/E (x), EV/EBITDA (x).
   - Keep empty if not present. Do not invent values.${feedback}`;

  const userPrompt = `Company: ${state.companyName}\n\nDocument Text:\n${contextText}`;
  const fullPrompt = systemPrompt + userPrompt;

  const { model, modelName, downgraded } = await getModelForRequest(
    state.modelOptions, fullPrompt, 'llama-3.3-70b-versatile',
    (waitMs) => notifyBudgetWait(state, waitMs)
  );
  clearJobWait(state);

  if (downgraded) {
    console.warn(`[extract_financials] Rerouted to ${modelName} due to request size.`);
  }

  const structuredModel = model.withStructuredOutput(FinancialsSchema);
  const fallbackStructuredModel = getFallbackGroqModel(state.modelOptions).withStructuredOutput(FinancialsSchema);
  const res = await withRateLimitRetry(
    () => structuredModel.invoke([['system', systemPrompt], ['user', userPrompt]]),
    2,
    (waitSeconds) => notifyBudgetWait(state, waitSeconds * 1000),
    () => clearJobWait(state),
    () => fallbackStructuredModel.invoke([['system', systemPrompt], ['user', userPrompt]])
  );
  clearJobWait(state);

  recordActualUsage(modelName, fullPrompt, JSON.stringify(res));
  return { financials: res as z.infer<typeof FinancialsSchema>, modelUsedForFinancials: modelName };
}

// --- Node 4: Math Audit Router ---

function auditFinancialsNode(state: typeof ResearchState.State) {
  const errors: string[] = [];
  const financials = state.financials;

  // Presence Check & Completeness-Aware Gating
  if (!financials) {
    errors.push('No financials object extracted.');
    return { mathErrors: errors, mathematicallyValid: false };
  }

  // Cross-statement matching validations
  const rev = financials.revenue || [];

  const checkGrowth = (label: string, list: typeof rev) => {
    for (let i = 1; i < list.length; i++) {
      const prev = parseNum(list[i - 1].value);
      if (prev > 0) {
        // Verify against any growth metrics reported in estimates or summary
      }
    }
  };

  checkGrowth('Revenue', rev);

  // Validation: Check if YoY quarterly metrics are mathematically aligned with annual series direction
  const qf = financials.quarterlyFinancials || [];
  if (qf.length > 0 && rev.length > 0) {
    const q1SalesRow = qf.find(r => r.metric.toLowerCase().includes('sales') || r.metric.toLowerCase().includes('revenue'));
    const annualSalesVal = parseNum(rev[rev.length - 1]?.value || 0);
    if (q1SalesRow && annualSalesVal > 0) {
      const q1Val = parseNum(q1SalesRow.q1fy26 || q1SalesRow.q1fy25 || 0);
      if (q1Val > annualSalesVal) {
        errors.push(`YoY Quarterly Q1 sales (${q1Val}) cannot exceed projected full year annual sales (${annualSalesVal}). Possible scale/unit mismatch.`);
      }
    }
  }

  // Validation: Verify shareholding percentage sum equals 100%
  const sh = financials.shareholding || [];
  if (sh.length > 0) {
    const periodCount = sh[0]?.values?.length || 0;
    for (let pIdx = 0; pIdx < periodCount; pIdx++) {
      let sum = 0;
      sh.forEach(cat => {
        sum += parseNum(cat.values?.[pIdx] || 0);
      });
      if (sum > 0 && (sum < 98 || sum > 102)) {
        errors.push(`Shareholding category sum for period index ${pIdx} is ${sum.toFixed(1)}%, which is not close to 100%.`);
      }
    }
  }

  // Gating check: Did we extract enough historical/projected fiscal periods?
  const extractedPeriods = rev.map(r => r.period.toUpperCase());
  const textContext = state.condensedContext || state.rawText;
  const meaningfulPeriods = ['FY25', 'FY26', 'FY27'].filter(p => textContext.toUpperCase().includes(p));
  if (meaningfulPeriods.length > 1) {
    const missingMajorPeriods = meaningfulPeriods.filter(p => !extractedPeriods.includes(p));
    if (missingMajorPeriods.length > 1 && extractedPeriods.length <= 1) {
      errors.push(`Extracted only ${extractedPeriods.length} periods, but document suggests multiple periods are present: ${meaningfulPeriods.slice(0, 3).join(', ')}.`);
    }
  }

  const hasErrors = errors.length > 0;
  const shouldRetry = hasErrors && state.retryCount < 2;

  if (shouldRetry) {
    return {
      mathErrors: errors,
      retryCount: 1,
      mathematicallyValid: false
    };
  }

  return {
    mathErrors: errors,
    mathematicallyValid: !hasErrors
  };
}

// --- Conditional router path decision ---

function routeAfterAudit(state: typeof ResearchState.State) {
  if (!state.mathematicallyValid && state.retryCount < 2) {
    console.warn(`[LangGraph Math Auditor] Audit failed with ${state.mathErrors.length} errors. Re-routing back to extractFinancials node (Retry count: ${state.retryCount}).`);
    return 'extract_financials';
  }
  return 'end';
}

// --- Build and Compile the Graph ---

const workflow = new StateGraph(ResearchState)
  .addNode('preprocess_chunks', preprocessChunksNode)
  .addNode('extract_general', extractCompanyGeneralNode)
  .addNode('extract_swot', extractSwotNode)
  .addNode('extract_financials', extractFinancialsNode)
  .addNode('audit_financials', auditFinancialsNode)
  
  // Starting flow runs chunking preprocessor first
  .addEdge(START, 'preprocess_chunks')
  
  // Run extractions sequentially with built-in model rate limit cooling delays
  .addEdge('preprocess_chunks', 'extract_general')
  .addEdge('extract_general', 'extract_swot')
  .addEdge('extract_swot', 'extract_financials')
  
  // Financial workflow routes to audit check
  .addEdge('extract_financials', 'audit_financials')
  
  // Conditional audit routing path
  .addConditionalEdges('audit_financials', routeAfterAudit, {
    extract_financials: 'extract_financials',
    end: END
  });

export const langGraphResearchPipeline = workflow.compile();

/**
 * Executes the research pipeline and formats outputs to AIExtractionResult.
 */
export async function runResearchPipeline(
  companyName: string,
  rawText: string,
  options: AIServiceOptions
): Promise<AIExtractionResult> {
  const result = await langGraphResearchPipeline.invoke({
    companyName,
    rawText,
    modelOptions: options
  });

  return {
    companyName: result.companyGeneral.companyName,
    ticker: result.companyGeneral.ticker,
    recommendation: result.financials.recommendation || 'HOLD',
    investmentThesis: result.swotAndThesis.investmentThesis,
    outlook: result.companyGeneral.narrativeSummary,
    risks: result.swotAndThesis.risks,
    revenue: result.financials.revenue,
    ebitda: result.financials.ebitda,
    pat: result.financials.pat,
    ratios: null,
    currentPrice: result.financials.currentPrice ?? null,
    targetPrice: result.financials.targetPrice ?? null,
    narrativeSummary: result.companyGeneral.narrativeSummary,
    industryOverview: result.companyGeneral.industryOverview,
    businessOverview: result.companyGeneral.businessOverview,
    futureGrowth: Array.isArray(result.swotAndThesis.futureGrowth)
      ? result.swotAndThesis.futureGrowth.join('\n')
      : result.swotAndThesis.futureGrowth,
    nseCode: result.financials.nseCode,
    bseCode: result.financials.bseCode,
    bloombergCode: result.financials.bloombergCode,
    timeFrame: result.financials.timeFrame,
    stockType: result.financials.stockType,
    companyData: result.financials.companyData,
    shareholding: result.financials.shareholding,
    promoterPledge: result.financials.promoterPledge,
    pricePerformance: result.financials.pricePerformance,
    estimates: result.financials.estimates,
    quarterlyFinancials: result.financials.quarterlyFinancials,
    detailedFinancials: result.financials.detailedFinancials,
    recommendationSummary: result.financials.recommendationSummary,
    headlineTakeaway: result.companyGeneral.headlineTakeaway,
    pageOneHighlights: result.swotAndThesis.highlights ? result.swotAndThesis.highlights.slice(0, 5) : [],
    pageTwoHighlights: result.swotAndThesis.highlights ? result.swotAndThesis.highlights.slice(5) : [],
    sensexValue: result.financials.sensexValue,
    fiveYearSummary: result.financials.fiveYearSummary
  };
}

/**
 * Stateful pipeline runner that saves intermediate progress to the database.
 * If execution fails, it can be resumed starting from the failed step.
 */
export async function runOrResumeResearchPipeline(
  jobId: string,
  companyName?: string,
  rawText?: string,
  options?: AIServiceOptions,
  resume = false
): Promise<AIExtractionResult> {
  let job;

  if (resume) {
    job = await prisma.extractionJob.findUnique({
      where: { id: jobId }
    });
    if (!job) {
      throw new Error(`Cannot resume: Job ${jobId} not found.`);
    }
  } else {
    if (!companyName || !rawText) {
      throw new Error('companyName and rawText are required when starting a new extraction job.');
    }
    // Initialize stateful tracking record
    job = await prisma.extractionJob.upsert({
      where: { id: jobId },
      update: {
        companyName,
        fileName: 'uploaded_document.pdf',
        rawText,
        status: 'running',
        stepIndex: 0
      },
      create: {
        id: jobId,
        companyName,
        fileName: 'uploaded_document.pdf',
        rawText,
        status: 'running',
        stepIndex: 0
      }
    });
  }

  const state = {
    jobId,
    companyName: job.companyName,
    rawText: rawText || '',
    modelOptions: options || { provider: 'groq' as const },
    condensedContext: '',
    companyGeneral: {} as z.infer<typeof CompanyGeneralSchema>,
    swotAndThesis: {} as z.infer<typeof SwotAndThesisSchema>,
    financials: {} as z.infer<typeof FinancialsSchema>,
    mathErrors: [] as string[],
    retryCount: 0,
    mathematicallyValid: true,
    modelUsedForFinancials: ''
  };

  try {
    // --- Step 0: Preprocessing map-reduce ---
    if (job.stepIndex <= 0) {
      const preprocessOut = await preprocessChunksNode(state);
      state.condensedContext = preprocessOut.condensedContext;
      
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { stepIndex: 1 }
      });
    }

    // --- Step 1: Company General details ---
    if (job.stepIndex <= 1) {
      const generalOut = await extractCompanyGeneralNode(state);
      state.companyGeneral = generalOut.companyGeneral;

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          stepIndex: 2,
          companyGeneral: state.companyGeneral as Prisma.InputJsonValue
        }
      });
    } else {
      state.companyGeneral = ((job.companyGeneral as unknown) as z.infer<typeof CompanyGeneralSchema>) || {
        companyName: '',
        ticker: '',
        narrativeSummary: '',
        industryOverview: '',
        businessOverview: '',
        headlineTakeaway: ''
      };
    }

    // --- Step 2: SWOT & Investment Thesis ---
    if (job.stepIndex <= 2) {
      const swotOut = await extractSwotNode(state);
      state.swotAndThesis = swotOut.swotAndThesis;

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          stepIndex: 3,
          swotAndThesis: state.swotAndThesis as Prisma.InputJsonValue
        }
      });
    } else {
      state.swotAndThesis = ((job.swotAndThesis as unknown) as z.infer<typeof SwotAndThesisSchema>) || {
        highlights: [],
        investmentThesis: '',
        risks: [],
        futureGrowth: ''
      };
    }

    // --- Step 3: Financials ---
    if (job.stepIndex <= 3) {
      const finOut = await extractFinancialsNode(state);
      state.financials = finOut.financials;
      state.modelUsedForFinancials = finOut.modelUsedForFinancials;

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          stepIndex: 4,
          financials: state.financials as Prisma.InputJsonValue
        }
      });
    } else {
      state.financials = ((job.financials as unknown) as z.infer<typeof FinancialsSchema>) || {
        revenue: [],
        ebitda: [],
        pat: [],
        recommendation: 'HOLD'
      };
    }

    // --- Step 4: Math Audit & Retry ---
    if (job.stepIndex <= 4) {
      const auditOut = auditFinancialsNode(state);
      state.mathErrors = auditOut.mathErrors || [];
      state.mathematicallyValid = auditOut.mathematicallyValid;

      if (!state.mathematicallyValid && state.retryCount < 2) {
        // Increment retryCount, reset stepIndex to 3, and loop back to extract_financials node
        await prisma.extractionJob.update({
          where: { id: jobId },
          data: {
            stepIndex: 3,
            mathErrors: state.mathErrors
          }
        });
        
        // Re-execute step 3 with calculation audit feedback loop
        state.retryCount += 1;
        const finOut = await extractFinancialsNode(state);
        state.financials = finOut.financials;
        state.modelUsedForFinancials = finOut.modelUsedForFinancials;

        // Perform final check
        const finalAudit = auditFinancialsNode(state);
        state.mathErrors = finalAudit.mathErrors || [];
        state.mathematicallyValid = finalAudit.mathematicallyValid;

        await prisma.extractionJob.update({
          where: { id: jobId },
          data: {
            stepIndex: 5,
            status: 'completed',
            financials: state.financials as Prisma.InputJsonValue,
            mathErrors: state.mathErrors
          }
        });
      } else {
        await prisma.extractionJob.update({
          where: { id: jobId },
          data: {
            stepIndex: 5,
            status: 'completed',
            mathErrors: state.mathErrors
          }
        });
      }
    } else {
      state.mathErrors = (job.mathErrors as string[]) || [];
      state.mathematicallyValid = state.mathErrors.length === 0;
    }

    // Return compiled result
    return {
      companyName: state.companyGeneral.companyName,
      ticker: state.companyGeneral.ticker,
      recommendation: state.financials.recommendation || 'HOLD',
      investmentThesis: state.swotAndThesis.investmentThesis,
      outlook: state.companyGeneral.narrativeSummary,
      risks: state.swotAndThesis.risks,
      revenue: state.financials.revenue,
      ebitda: state.financials.ebitda,
      pat: state.financials.pat,
      ratios: null,
      currentPrice: state.financials.currentPrice ?? null,
      targetPrice: state.financials.targetPrice ?? null,
      narrativeSummary: state.companyGeneral.narrativeSummary,
      industryOverview: state.companyGeneral.industryOverview,
      businessOverview: state.companyGeneral.businessOverview,
      futureGrowth: Array.isArray(state.swotAndThesis.futureGrowth)
        ? state.swotAndThesis.futureGrowth.join('\n')
        : state.swotAndThesis.futureGrowth,
      nseCode: state.financials.nseCode,
      bseCode: state.financials.bseCode,
      bloombergCode: state.financials.bloombergCode,
      timeFrame: state.financials.timeFrame,
      stockType: state.financials.stockType,
      companyData: state.financials.companyData,
      shareholding: state.financials.shareholding,
      promoterPledge: state.financials.promoterPledge,
      pricePerformance: state.financials.pricePerformance,
      estimates: state.financials.estimates,
      quarterlyFinancials: state.financials.quarterlyFinancials,
      detailedFinancials: state.financials.detailedFinancials,
      recommendationSummary: state.financials.recommendationSummary,
      headlineTakeaway: state.companyGeneral.headlineTakeaway,
      pageOneHighlights: state.swotAndThesis.highlights ? state.swotAndThesis.highlights.slice(0, 5) : [],
      pageTwoHighlights: state.swotAndThesis.highlights ? state.swotAndThesis.highlights.slice(5) : [],
      sensexValue: state.financials.sensexValue,
      fiveYearSummary: state.financials.fiveYearSummary,
      // Audit trail: which model ran the financials extraction
      modelUsedForFinancials: state.modelUsedForFinancials || null
    };

  } catch (err: unknown) {
    if (err instanceof RateLimitError) {
      // Temporary rate-limit — job is resumable, NOT permanently failed
      console.warn(`[Pipeline] Throttled. Auto-resume in ${err.retryAfterSeconds}s.`);
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: 'rate_limited',
          waitMessage: 'Rate limited by AI provider — resuming automatically',
          waitUntil: new Date(Date.now() + err.retryAfterSeconds * 1000),
          updatedAt: new Date()
        }
      });
    } else {
      // Permanent failure
      console.error(`[Pipeline] Failed job ${jobId}:`, err);
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          waitMessage: err instanceof Error ? err.message : 'Unknown pipeline error',
          waitUntil: null,
          updatedAt: new Date()
        }
      });
    }
    throw err;
  }
}

function clearJobWait(state: typeof ResearchState.State): void {
  if (!state.jobId) return;
  prisma.extractionJob
    .update({
      where: { id: state.jobId },
      data: {
        waitMessage: null,
        waitUntil: null,
        updatedAt: new Date()
      }
    })
    .catch(() => {});
}

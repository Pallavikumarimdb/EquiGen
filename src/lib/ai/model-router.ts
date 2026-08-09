/**
 * Model Router — Pre-flight size/TPD check + fallback ladder.
 *
 * Picks the right model for a request:
 *  - If the estimated request size would EXCEED the primary model's TPM ceiling outright,
 *    reroutes to a higher-TPM fallback model immediately (fixes 413).
 *  - If the primary model's tokens-per-day (TPD) quota is nearly exhausted, reroutes to the
 *    fallback model which has its own separate daily quota (fixes repeated 429 TPD blocks).
 *  - Otherwise waits for real budget headroom on the preferred model (fixes repeated 429s).
 */

import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { tokenBudgetManager, estimateTokens } from './rate-limiter';
import { AIServiceOptions } from './langchain-service';

export interface ModelChoice {
  model: BaseChatModel;
  modelName: string;
  /** true if we rerouted away from the requested model due to size or quota */
  downgraded: boolean;
}

// Groq free-tier TPM ceilings (verify at https://console.groq.com/settings/limits)
const GROQ_MODEL_LIMITS: Record<string, number> = {
  'llama-3.3-70b-versatile': 12000,
  'llama-3.1-8b-instant': 500000,
};

/** The always-available fallback model — high TPM and its own daily quota. */
export const FALLBACK_GROQ_MODEL = 'llama-3.1-8b-instant';

// Completion token buffer: don't consume the entire window on a single request
const COMPLETION_TOKEN_BUFFER = 1500;

/** Builds a ChatGroq wrapper for the fallback (8B) model. */
export function getFallbackGroqModel(options: AIServiceOptions): ChatGroq {
  const apiKey = options.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error(`API key for provider "groq" is not configured.`);
  return new ChatGroq({
    apiKey,
    model: FALLBACK_GROQ_MODEL,
    temperature: 0.1,
    maxRetries: 3,
  });
}

/**
 * Picks the right model for a request, rerouting BEFORE sending if the
 * estimated size would exceed the primary model's ceiling outright (fixes the 413 case),
 * if the primary model's daily quota is exhausted (fixes TPD 429s), and waiting for
 * real budget if there's just temporary contention (fixes the 429 case).
 * `onWaitStart` fires with the wait duration whenever budget contention forces a delay,
 * so callers can surface a live countdown to the user.
 */
export async function getModelForRequest(
  options: AIServiceOptions,
  promptText: string,
  preferredModel = 'llama-3.3-70b-versatile',
  onWaitStart?: (waitMs: number) => void
): Promise<ModelChoice> {
  const estimated = estimateTokens(promptText) + COMPLETION_TOKEN_BUFFER;
  const provider = options.provider;
  const apiKey = options.apiKey ||
    (provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY);

  if (!apiKey) throw new Error(`API key for provider "${provider}" is not configured.`);

  // Determine the effective TPM limit for the preferred model
  const primaryLimit = provider === 'groq'
    ? (GROQ_MODEL_LIMITS[preferredModel] ?? 12000)
    : 200000;

  // --- Pre-flight: request itself too large for the model, no waiting will help ---
  if (estimated > primaryLimit) {
    console.warn(
      `[ModelRouter] Request (~${estimated} tokens) exceeds ${preferredModel}'s ${primaryLimit} TPM ceiling. ` +
      `Rerouting to ${FALLBACK_GROQ_MODEL}.`
    );
    return {
      model: getFallbackGroqModel(options),
      modelName: FALLBACK_GROQ_MODEL,
      downgraded: true,
    };
  }

  // --- Pre-flight: primary model's daily quota exhausted → use the fallback's separate quota ---
  if (provider === 'groq' && !tokenBudgetManager.hasDailyBudget(preferredModel, estimated)) {
    console.warn(
      `[ModelRouter] ${preferredModel} TPD budget nearly exhausted ` +
      `(${tokenBudgetManager.dailyUsedToday(preferredModel)} tokens used today). ` +
      `Rerouting to ${FALLBACK_GROQ_MODEL}.`
    );
    return {
      model: getFallbackGroqModel(options),
      modelName: FALLBACK_GROQ_MODEL,
      downgraded: true,
    };
  }

  // --- Normal path: wait for real budget, then return preferred model ---
  const waitedMs = await tokenBudgetManager.waitForBudget(preferredModel, estimated, onWaitStart);
  if (waitedMs > 0) {
    console.log(`[ModelRouter] Waited ${waitedMs}ms for budget headroom on ${preferredModel}.`);
  }

  if (provider === 'openai') {
    return {
      model: new ChatOpenAI({
        apiKey,
        model: options.modelName || 'gpt-4o-mini',
        temperature: 0.1,
        maxRetries: 3,
      }),
      modelName: options.modelName || 'gpt-4o-mini',
      downgraded: false,
    };
  }

  return {
    model: new ChatGroq({
      apiKey,
      model: preferredModel,
      temperature: 0.1,
      maxRetries: 3,
    }),
    modelName: preferredModel,
    downgraded: false,
  };
}

/** Records actual usage after a call completes, so future budget checks are accurate. */
export function recordActualUsage(modelName: string, inputText: string, outputText: string) {
  const total = estimateTokens(inputText) + estimateTokens(outputText);
  tokenBudgetManager.recordUsage(modelName, total);
  tokenBudgetManager.recordDailyUsage(modelName, total);
  console.log(`[ModelRouter] Recorded ${total} tokens for ${modelName}. Available budget: ${tokenBudgetManager.availableBudget(modelName)}`);
}

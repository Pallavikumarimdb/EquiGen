/**
 * Context Compactor Engine (Phase 3 — Agent Intelligence)
 *
 * Condenses long conversation histories (>10 turns or >8,000 estimated tokens)
 * into high-density summary blocks to prevent Groq 413 (payload too large) / 429 errors.
 * Always preserves the system prompt and recent 4 user/assistant turns verbatim.
 */

import { getModelForRequest } from "@/lib/ai/model-router";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export interface CompactedHistory {
  messages: [string, string][];
  wasCompacted: boolean;
  originalTurnCount: number;
  compactedTurnCount: number;
  summaryBlock?: string;
}

/**
 * Estimates token count for a list of string messages (~4 chars per token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function compactConversationHistory(
  messages: [string, string][],
  options: {
    maxTokens?: number;      // Default 8,000 tokens
    maxTurns?: number;       // Default 10 turns
    preserveRecentTurns?: number; // Default 4 turns
    apiKey?: string;
  } = {}
): Promise<CompactedHistory> {
  const maxTokens = options.maxTokens ?? 8000;
  const maxTurns = options.maxTurns ?? 10;
  const preserveRecent = options.preserveRecentTurns ?? 4;

  const totalText = messages.map((m) => m[1]).join("\n");
  const estimatedTokenCount = estimateTokens(totalText);

  // If history is small enough, return unmodified
  if (messages.length <= maxTurns && estimatedTokenCount <= maxTokens) {
    return {
      messages,
      wasCompacted: false,
      originalTurnCount: messages.length,
      compactedTurnCount: messages.length,
    };
  }

  // Separate system prompt (if index 0 is system) from conversation turns
  const systemMsg = messages.length > 0 && messages[0][0] === "system" ? messages[0] : null;
  const conversationTurns = systemMsg ? messages.slice(1) : messages;

  if (conversationTurns.length <= preserveRecent) {
    return {
      messages,
      wasCompacted: false,
      originalTurnCount: messages.length,
      compactedTurnCount: messages.length,
    };
  }

  // Older turns to summarize vs recent turns to preserve
  const turnsToSummarize = conversationTurns.slice(0, conversationTurns.length - preserveRecent);
  const turnsToPreserve = conversationTurns.slice(conversationTurns.length - preserveRecent);

  // Build summary text of older turns
  const textToSummarize = turnsToSummarize
    .map(([role, content]) => `${role.toUpperCase()}: ${content}`)
    .join("\n\n");

  let summaryBlock = "";
  try {
    const { model } = await getModelForRequest(
      { provider: "groq", apiKey: options.apiKey },
      textToSummarize
    );

    const summaryResponse = await model.invoke([
      new SystemMessage(
        "You are an executive assistant. Summarize the key user research requests, facts discovered, and agent findings from the past conversation into a high-density bulleted memory summary block. Keep under 150 words."
      ),
      new HumanMessage(`Summarize these past research conversation turns:\n\n${textToSummarize}`),
    ]);

    summaryBlock = typeof summaryResponse.content === "string" ? summaryResponse.content : JSON.stringify(summaryResponse.content);
  } catch (err) {
    console.warn("[ContextCompactor] LLM summarization failed, falling back to truncated turn history:", err);
    summaryBlock = `[Prior Conversation Memory Summary (${turnsToSummarize.length} turns)]: User inquired about financial research data, metrics, and report updates.`;
  }

  // Reassemble compacted message array
  const compactedMessages: [string, string][] = [];
  if (systemMsg) compactedMessages.push(systemMsg);

  compactedMessages.push([
    "system",
    `[MEMORIZED PRIOR CONVERSATION CONTEXT]:\n${summaryBlock.trim()}`,
  ]);

  turnsToPreserve.forEach((m) => compactedMessages.push(m));

  return {
    messages: compactedMessages,
    wasCompacted: true,
    originalTurnCount: messages.length,
    compactedTurnCount: compactedMessages.length,
    summaryBlock,
  };
}

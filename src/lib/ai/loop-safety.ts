/**
 * Loop Safety Guard & Repetition Detector (Phase 3 — Agent Intelligence)
 *
 * Prevents autonomous agent loops from hanging, repeating identical tool calls,
 * or burning API token quotas uncontrollably.
 *
 * Features:
 * 1. Tool Call Hash Tracking: SHA256(toolName + JSON.stringify(args))
 * 2. Repetitive Loop Interception: Max N consecutive identical tool calls
 * 3. Step Ceiling Enforcement: Max steps per turn/session
 * 4. Token Budget Guard: Max tokens per turn
 */

import { computeSHA256 } from "@/lib/utils/hash";

export class RepetitiveToolCallError extends Error {
  constructor(public toolName: string, public toolHash: string) {
    super(
      `Repetitive tool call loop detected for tool '${toolName}'. Halted execution to prevent token burn.`
    );
    this.name = "RepetitiveToolCallError";
  }
}

export class StepLimitExceededError extends Error {
  constructor(public maxSteps: number) {
    super(`Agent step limit of ${maxSteps} steps exceeded in a single turn.`);
    this.name = "StepLimitExceededError";
  }
}

export class LoopSafetyGuard {
  private toolHashes: string[] = [];
  private stepCount = 0;
  private cumulativeTokens = 0;

  constructor(
    public maxSteps: number = 5,
    public maxRepetitions: number = 2,
    public maxTokensPerTurn: number = 25000
  ) {}

  /**
   * Records a tool call and checks for repetitive loops or step limit violations.
   * Throws typed errors if safety thresholds are breached.
   */
  public recordAndValidateToolCall(toolName: string, args: Record<string, unknown>): {
    stepCount: number;
    hash: string;
    isRepetitive: boolean;
  } {
    this.stepCount++;

    if (this.stepCount > this.maxSteps) {
      throw new StepLimitExceededError(this.maxSteps);
    }

    const argsString = JSON.stringify(args ?? {});
    const hash = computeSHA256(`${toolName}:${argsString}`);

    // Check recent hash history for consecutive repetitions
    const recentHashes = this.toolHashes.slice(-this.maxRepetitions);
    const isRepetitive =
      recentHashes.length >= this.maxRepetitions &&
      recentHashes.every((h) => h === hash);

    this.toolHashes.push(hash);

    if (isRepetitive) {
      throw new RepetitiveToolCallError(toolName, hash);
    }

    return {
      stepCount: this.stepCount,
      hash,
      isRepetitive: false,
    };
  }

  /**
   * Tracks token usage for the current turn
   */
  public trackTokenUsage(tokens: number): void {
    this.cumulativeTokens += tokens;
    if (this.cumulativeTokens > this.maxTokensPerTurn) {
      console.warn(
        `[LoopSafetyGuard] High token consumption detected: ${this.cumulativeTokens}/${this.maxTokensPerTurn} tokens.`
      );
    }
  }

  /**
   * Resets guard state for a new turn
   */
  public reset(): void {
    this.toolHashes = [];
    this.stepCount = 0;
    this.cumulativeTokens = 0;
  }

  public getStepCount(): number {
    return this.stepCount;
  }

  public getCumulativeTokens(): number {
    return this.cumulativeTokens;
  }
}

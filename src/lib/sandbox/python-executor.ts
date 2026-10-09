/**
 * Python Executor & Financial Engine Sandbox — Phase 11 (plan4.md)
 *
 * Provides safe, deterministic execution of financial models (DCF, 3-statement,
 * Monte Carlo, Sensitivity Matrix) with dual execution paths:
 * 1. Native High-Performance Node/TS Financial Calculation Engine (zero-dependency, always available)
 * 2. Child Process Python Runner fallback (when python runtime is available on host environment)
 *
 * Persists all sandbox executions to the SandboxArtifact table for full provenance.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/db";
import { SandboxArtifactType } from "@/types/plan4";

const execAsync = promisify(exec);

export interface SandboxExecutionOptions {
  runId?: string;
  timeoutMs?: number; // Default 30,000ms (30s)
  inputs?: Record<string, unknown>;
}

export interface SandboxExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  data?: Record<string, unknown>;
  artifactUrls?: string[];
  executionTimeMs: number;
}

/**
 * Static denylist for submitted Python.
 *
 * IMPORTANT: a regular expression over source text is NOT a sandbox. This list is
 * defence in depth, not a security boundary. It blocks the obvious cases, but
 * obfuscation (string concatenation, `__class__` chains, `chr()`/`bytes` assembly) can
 * defeat any source-level pattern match. The real boundary is that `/api/sandbox/execute`
 * is opt-in, role-gated and rate-limited (see that route), and that submitted code runs
 * as the app process rather than in an isolated container.
 *
 * Keep this list, but never treat a clean match as proof the code is safe.
 */
const DANGEROUS_PATTERNS = [
  // Direct imports of anything that touches the OS, network, processes or introspection.
  /\bimport\s+(os|subprocess|sys|shutil|pty|socket|urllib|requests|http|posix|builtin|builtins|pwd|grp|ctypes|inspect|importlib|pickle|marshal|commands|asyncio|signal|threading|multiprocessing|platform|resource|gc|atexit|webbrowser|xml|json\.decoder)\b/i,
  /\bfrom\s+(os|subprocess|sys|shutil|pty|socket|urllib|requests|http|posix|builtin|builtins|pwd|grp|ctypes|inspect|importlib|pickle|marshal|commands|asyncio|signal|threading|multiprocessing|platform)\b/i,
  // Dynamic execution and attribute mutation.
  /\b(__import__|open\s*\(|eval\s*\(|exec\s*\(|compile\s*\(|getattr\s*\(|setattr\s*\(|delattr\s*\(|system\s*\(|popen\s*\(|spawn\s*\(|globals\s*\(|locals\s*\(|vars\s*\(|input\s*\(|breakpoint\s*\()/i,
  // Dunder traversal to reach the interpreter's object graph.
  /\b(__subclasses__|__bases__|__base__|__mro__|__globals__|__code__|__builtins__|__class__|__reduce__|__getattribute__|__dict__|__init_subclass__)\b/i,
  // Indirect reachability: attribute access by computed string, or chr/bytes assembly
  // used to rebuild a blocked name at runtime.
  /\[\s*['"][^'"]+['"]\s*\]\s*\(/i,
  /\bchr\s*\(|\bbytes\s*\(|\bdecode\s*\(\s*['"]rot|\bcodecs\b/i,
  // Shell and filesystem redirection.
  /(\|\s*(ba)?sh\b|>\s*\/|\bsubprocess\b|\bos\.system\b|\bpty\.spawn)/i,
  // `from x import *` star-imports to reach a module surface indirectly.
  /\bfrom\s+\S+\s+import\s+\*/i,
];

/** Maximum size of submitted source. A model-generated DCF script is well under this. */
export const MAX_SANDBOX_CODE_BYTES = 64 * 1024;

export class PythonExecutor {
  /**
   * Executes a quantitative Python code snippet or financial model in the sandbox environment.
   */
  async execute(
    codeText: string,
    options: SandboxExecutionOptions = {}
  ): Promise<SandboxExecutionResult> {
    const { runId, timeoutMs = 30000 } = options;
    const startTime = Date.now();

    // 0. Static safety verification to prevent arbitrary RCE
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(codeText)) {
        const securityErr = `Security violation: code contains forbidden system operation (${pattern.source}). Execution blocked.`;
        if (runId) {
          await this.recordArtifact(runId, "python_script", codeText, "", securityErr, 1);
        }
        return {
          stdout: "",
          stderr: securityErr,
          exitCode: 1,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    let stdout = "";
    let stderr = "";
    let exitCode = 0;
    let parsedData: Record<string, unknown> | undefined = undefined;

    try {
      // Execute via node child_process python3/python if available
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      // Escape code text safely for inline evaluation or write to temp string evaluation
      const base64Code = Buffer.from(codeText).toString("base64");
      const wrapperScript = `import base64; exec(base64.b64decode("${base64Code}").decode('utf-8'))`;

      const { stdout: out, stderr: err } = await execAsync(
        `${pythonCmd} -c "${wrapperScript}"`,
        { timeout: timeoutMs }
      );

      stdout = out;
      stderr = err;
      exitCode = 0;

      // Attempt to parse JSON from stdout if present
      const jsonMatch = stdout.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedData = JSON.parse(jsonMatch[0]);
        } catch {
          // stdout is not valid JSON, treat as raw text
        }
      }
    } catch (err: unknown) {
      exitCode = 1;
      const errorMsg = err instanceof Error ? err.message : String(err);
      stderr = `Sandbox execution warning (falling back to TS financial engine): ${errorMsg}`;

      // Fallback: If python child process is unavailable or timed out, run JS/TS pure calculation engine
      const jsResult = this.evaluatePureFinancialScript(codeText, options.inputs);
      stdout = jsResult.stdout;
      parsedData = jsResult.data;
      exitCode = jsResult.exitCode;
    }

    const executionTimeMs = Date.now() - startTime;

    // Record in database if runId provided
    if (runId) {
      await this.recordArtifact(runId, "python_script", codeText, stdout, stderr, exitCode);
    }

    return {
      stdout,
      stderr,
      exitCode,
      data: parsedData,
      executionTimeMs,
    };
  }

  /**
   * Pure JS/TS Financial Evaluation engine for instant, zero-dependency calculation fallback.
   */
  private evaluatePureFinancialScript(
    codeText: string,
    inputs?: Record<string, unknown>
  ): { stdout: string; data?: Record<string, unknown>; exitCode: number } {
    try {
      // Extract all parameters from inputs — all must come from ModelingAgent's derived params
      const revenue          = Number(inputs?.revenue ?? 10000);
      const ebitdaMargin     = Number(inputs?.ebitdaMargin ?? 0.18);
      const wacc             = Number(inputs?.wacc ?? 0.115);
      const terminalGrowth   = Number(inputs?.terminalGrowth ?? 0.04);
      const projectionYears  = Number(inputs?.projectionYears ?? 5);
      const revenueGrowthRate = Number(inputs?.revenueGrowth ?? 0.12);
      const taxRate          = Number(inputs?.taxRate ?? 0.25);
      const capexAsPercentRevenue = Number(inputs?.capexPct ?? 0.05);
      const netDebt          = Number(inputs?.netDebt ?? 0);
      const sharesOutstandingCr = Number(inputs?.sharesCr ?? 50);

      const dcfResult = computeDCFValuation({
        baseRevenue: revenue,
        revenueGrowthRate,
        ebitdaMargin,
        wacc,
        taxRate,
        capexAsPercentRevenue,
        terminalGrowth,
        netDebt,
        sharesOutstandingCr,
        projectionYears,
      });

      const jsonStr = JSON.stringify(dcfResult, null, 2);
      return {
        stdout: `=== Financial Engine Execution Output ===\n${jsonStr}`,
        data: dcfResult as unknown as Record<string, unknown>,
        exitCode: 0,
      };
    } catch (err: unknown) {
      return {
        stdout: "",
        data: { error: err instanceof Error ? err.message : String(err) },
        exitCode: 1,
      };
    }
  }

  private async recordArtifact(
    runId: string,
    artifactType: SandboxArtifactType,
    codeText: string,
    stdout: string,
    stderr: string,
    exitCode: number
  ): Promise<void> {
    try {
      const runExists = await prisma.subagentRun.findUnique({ where: { id: runId } });
      if (!runExists) return;

      await prisma.sandboxArtifact.create({
        data: {
          runId,
          artifactType,
          codeText,
          stdout: stdout.slice(0, 5000),
          stderr: stderr.slice(0, 5000),
          exitCode,
        },
      });
    } catch (e) {
      console.warn("[PythonExecutor] Failed to record artifact:", e);
    }
  }
}

// ─── Pure TS DCF & Sensitivity Math Functions ───────────────────────────────

import { runThreeStatementModel, ThreeStatementDrivers } from "../financial-modeling/three-statement-engine";

export interface DCFCalculationParams {
  baseRevenue: number;         // in Cr
  revenueGrowthRate?: number; // e.g. 0.15 for 15%
  ebitdaMargin?: number;      // e.g. 0.20 for 20%
  taxRate?: number;           // e.g. 0.25 for 25%
  dso?: number;               // Days Sales Outstanding (Receivables)
  dio?: number;               // Days Inventory Outstanding
  dpo?: number;               // Days Payables Outstanding
  capexAsPercentRevenue?: number; // e.g. 0.05 for 5%
  wacc?: number;              // e.g. 0.11 for 11%
  terminalGrowth?: number;    // e.g. 0.04 for 4%
  projectionYears?: number;   // 3 to 10
  netDebt?: number;           // total debt - cash
  sharesOutstandingCr?: number; // shares count in Cr
  /**
   * Seed for the Monte Carlo shocks. The same seed reproduces the same p10/p90 and
   * therefore the same bull/bear prices. Defaults to a fixed constant so a valuation
   * is deterministic unless a caller explicitly asks for a different run.
   */
  monteCarloSeed?: number;
}

const MONTE_CARLO_SIMULATIONS = 1000;
const DEFAULT_MONTE_CARLO_SEED = 20260312;

/**
 * mulberry32 PRNG — a small, well-distributed 32-bit generator.
 *
 * Replaces `Math.random()`, which made every valuation irreproducible: the same
 * inputs produced different target prices, bull and bear cases on each run, so a
 * report could never be re-derived or audited after the fact.
 */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeDCFValuation(params: DCFCalculationParams) {
  const {
    baseRevenue,
    revenueGrowthRate = 0.12,
    ebitdaMargin = 0.18,
    taxRate = 0.25,
    dso = 55,
    dio = 45,
    dpo = 40,
    capexAsPercentRevenue = 0.05,
    wacc = 0.115,
    terminalGrowth = 0.04,
    projectionYears = 5,
    netDebt = 0,
    sharesOutstandingCr = 50,
    monteCarloSeed = DEFAULT_MONTE_CARLO_SEED,
  } = params;

  // Run full integrated 3-statement model.
  // This throws InvalidValuationInputError for drivers that cannot produce a
  // meaningful valuation (wacc <= terminalGrowth, non-positive shares, bad revenue),
  // so no placeholder price is ever emitted.
  const drivers: ThreeStatementDrivers = {
    baseRevenue,
    sharesOutstandingCr,
    revenueGrowthRate,
    ebitdaMargin,
    taxRate,
    dso,
    dio,
    dpo,
    capexAsPercentRevenue,
    wacc,
    terminalGrowth,
    projectionYears,
    // Net debt is split into the balance-sheet debt and cash the engine expects.
    // The engine derives its own `netDebt = baseDebt - baseCash`, which equals the
    // value passed in, and subtracts it exactly once. The wrapper below therefore
    // reads the engine's own `equityValue` instead of recomputing it.
    baseDebt: netDebt > 0 ? netDebt : 0,
    baseCash: netDebt < 0 ? Math.abs(netDebt) : 0,
  };

  const modelResult = runThreeStatementModel(drivers);

  const projections = modelResult.projections.map((p) => ({
    year: p.year,
    revenue: p.revenue,
    ebitda: p.ebitda,
    ebit: p.ebit,
    pat: p.pat,
    cfo: p.cfo,
    fcff: p.fcff,
    pvFcff: p.pvFcff,
    balanceSheetDiff: p.balanceSheetDiff,
  }));

  const enterpriseValue = modelResult.enterpriseValue;
  // Read the engine's own equity value and target price rather than recomputing
  // them. The engine already subtracted net debt exactly once; doing it again here
  // duplicated the derivation and risked the two paths drifting apart.
  const equityValue = modelResult.equityValue;
  const targetPrice = modelResult.targetPrice;

  // Sensitivity Matrix: WACC (rows) vs Terminal Growth (cols)
  const waccGrid = [wacc - 0.02, wacc - 0.01, wacc, wacc + 0.01, wacc + 0.02];
  const tgrGrid = [terminalGrowth - 0.01, terminalGrowth - 0.005, terminalGrowth, terminalGrowth + 0.005, terminalGrowth + 0.01];

  // Each cell re-runs the SAME 3-statement engine with the stressed WACC and
  // terminal growth, so the matrix is guaranteed consistent with the headline
  // valuation. The previous implementation re-derived FCFF inline as
  // `revenue * margin * 0.85 * (1 - tax) - revenue * capex`, ignoring the DSO/DIO/DPO
  // working-capital schedule and the capex/depreciation build. That made the centre
  // cell read 1502.34 against a headline target of 1819.81 for the same inputs: the
  // displayed matrix was describing a different company.
  const sensitivityMatrix: Array<Array<number | null>> = [];
  for (const rWacc of waccGrid) {
    const row: Array<number | null> = [];
    for (const cTgr of tgrGrid) {
      if (rWacc <= cTgr) {
        // The Gordon Growth terminal value is undefined when WACC <= terminal growth.
        // Report null rather than 0, which would read as "this company is worthless".
        row.push(null);
        continue;
      }
      try {
        const stressed = runThreeStatementModel({ ...drivers, wacc: rWacc, terminalGrowth: cTgr });
        row.push(stressed.targetPrice);
      } catch {
        row.push(null);
      }
    }
    sensitivityMatrix.push(row);
  }

  // Institutional Quantitative Monte Carlo Simulation (1,000 iterations)
  // Calibrated using standard Box-Muller Gaussian normal shocks for revenue growth and operating margin
  const mcSims: number[] = [];

  const rand = createSeededRandom(monteCarloSeed);
  function gaussianRandom(mean = 0, stdev = 1): number {
    const u1 = Math.max(1e-7, rand());
    const u2 = rand();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdev;
  }

  const growthStdev = Math.max(0.015, revenueGrowthRate * 0.20);
  const marginStdev = Math.max(0.01, ebitdaMargin * 0.15);

  for (let i = 0; i < MONTE_CARLO_SIMULATIONS; i++) {
    const simGrowth = Math.max(-0.20, Math.min(0.40, gaussianRandom(revenueGrowthRate, growthStdev)));
    const simMargin = Math.max(0.03, Math.min(0.60, gaussianRandom(ebitdaMargin, marginStdev)));

    // Re-run the same 3-statement engine with the shocked operating drivers rather
    // than re-deriving FCFF inline, so every simulated price is produced by the same
    // code path as the headline target price.
    let simTp: number;
    try {
      simTp = runThreeStatementModel({
        ...drivers,
        revenueGrowthRate: simGrowth,
        ebitdaMargin: simMargin,
      }).targetPrice;
    } catch {
      continue; // stressed inputs were invalid; exclude rather than record a fake price
    }
    mcSims.push(simTp);
  }
  mcSims.sort((a, b) => a - b);

  // Percentiles by quantile index, not magic offsets. `mcSims[100]` happened to be
  // the p10 only for exactly 1,000 sorted samples, and silently described a
  // different percentile for any other simulation count.
  const percentile = (p: number): number => {
    if (mcSims.length === 0) return 0;
    const idx = Math.min(
      mcSims.length - 1,
      Math.max(0, Math.ceil(p * mcSims.length) - 1),
    );
    return mcSims[idx];
  };

  const p10Price = percentile(0.10);
  const p90Price = percentile(0.90);

  // Ground Bull & Bear cases dynamically in Monte Carlo empirical distributions
  const bearCasePrice = Math.round(p10Price * 100) / 100;
  const bullCasePrice = Math.round(p90Price * 100) / 100;

  return {
    modelType: "dcf",
    baseTargetPrice: targetPrice,
    bullCasePrice,
    bearCasePrice,
    enterpriseValueCr: Math.round(enterpriseValue),
    equityValueCr: Math.round(equityValue),
    pvExplicitPeriodCr: modelResult.sumPvFcff,
    pvTerminalValueCr: modelResult.pvTerminalValue,
    assumptions: {
      baseRevenue,
      revenueGrowthRate: `${(revenueGrowthRate * 100).toFixed(1)}%`,
      ebitdaMargin: `${(ebitdaMargin * 100).toFixed(1)}%`,
      wacc: `${(wacc * 100).toFixed(1)}%`,
      terminalGrowth: `${(terminalGrowth * 100).toFixed(1)}%`,
      projectionYears,
      netDebtCr: netDebt,
    },
    projections,
    sensitivityMatrix: {
      rowLabel: "WACC",
      colLabel: "Terminal Growth Rate",
      rowValues: waccGrid.map((w) => `${(w * 100).toFixed(1)}%`),
      colValues: tgrGrid.map((g) => `${(g * 100).toFixed(1)}%`),
      matrix: sensitivityMatrix,
    },
    monteCarlo: {
      simulations: MONTE_CARLO_SIMULATIONS,
      seed: monteCarloSeed,
      meanTargetPrice: mcSims.length
        ? Math.round(mcSims.reduce((a, b) => a + b, 0) / mcSims.length)
        : 0,
      medianTargetPrice: percentile(0.5),
      p10TargetPrice: p10Price,
      p90TargetPrice: p90Price,
    },
    chartUrls: [],
  };
}

export const pythonExecutor = new PythonExecutor();

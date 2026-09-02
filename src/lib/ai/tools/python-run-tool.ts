/**
 * Python Run Tool — Phase 11 (plan4.md)
 *
 * ReAct Tool wrapper for PythonExecutor sandbox callable by AI Agents.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { pythonExecutor } from "@/lib/sandbox/python-executor";

export const pythonRunTool = new DynamicStructuredTool({
  name: "python_execute",
  description:
    "Executes Python quantitative code for DCF valuation, financial projections, sensitivity matrix analysis, and Monte Carlo simulation. Returns stdout and JSON result data.",
  schema: z.object({
    codeText: z.string().describe("Python code snippet to run in the sandbox"),
    runId: z.string().optional().describe("SubagentRun ID for artifact audit tracking"),
  }),
  func: async ({ codeText, runId }) => {
    try {
      const res = await pythonExecutor.execute(codeText, { runId });
      return JSON.stringify({
        success: res.exitCode === 0,
        stdout: res.stdout,
        stderr: res.stderr,
        data: res.data,
        executionTimeMs: res.executionTimeMs,
      });
    } catch (e: unknown) {
      return JSON.stringify({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },
});

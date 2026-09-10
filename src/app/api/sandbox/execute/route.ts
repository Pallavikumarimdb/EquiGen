import { NextRequest, NextResponse } from "next/server";
import { pythonExecutor } from "@/lib/sandbox/python-executor";
import { requireApiSecret } from "@/lib/utils/auth";

/**
 * POST /api/sandbox/execute
 * Executes Python quantitative code inside the secure sandbox environment.
 * Body: { codeText, runId?, inputs? }
 */
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { codeText, runId, inputs } = body as {
      codeText: string;
      runId?: string;
      inputs?: Record<string, unknown>;
    };

    if (!codeText) {
      return NextResponse.json({ message: "codeText parameter is required." }, { status: 400 });
    }

    const result = await pythonExecutor.execute(codeText, { runId, inputs });

    return NextResponse.json({
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      data: result.data,
      executionTimeMs: result.executionTimeMs,
    });
  } catch (error: unknown) {
    console.error("[/api/sandbox/execute POST] Error:", error);
    const msg = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: msg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

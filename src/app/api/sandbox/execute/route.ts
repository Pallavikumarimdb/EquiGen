import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pythonExecutor, MAX_SANDBOX_CODE_BYTES } from "@/lib/sandbox/python-executor";
import { rateLimit } from "@/lib/utils/rate-limit";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * POST /api/sandbox/execute
 * Executes Python quantitative code inside the secure sandbox environment.
 * Body: { codeText, runId?, inputs? }
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;

  try {
    if (!session) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    // SECURITY: this endpoint runs submitted Python as the app process. There was no
    // role check, no rate limit, no size cap and no ownership check on `runId`, so any
    // authenticated `analyst` had arbitrary code execution plus a CPU-exhaustion
    // primitive (30s per request, unlimited requests) and could write an artifact into
    // another tenant's subagent run.
    //
    // It is now off unless explicitly enabled, restricted to an administrative role,
    // rate-limited, size-capped, and `runId` must be owned by the caller.
    const enabled = process.env.ENABLE_SANDBOX_EXECUTION === "true";
    if (!enabled) {
      return NextResponse.json(
        { message: "Sandbox execution is disabled." },
        { status: 404 }
      );
    }

    const isAdmin =
      session.isPlatformOperator === true ||
      ["admin", "reviewer"].includes((session.role ?? "").toLowerCase());
    if (!isAdmin) {
      return NextResponse.json(
        { message: "Forbidden. Sandbox execution requires an administrative role." },
        { status: 403 }
      );
    }

    const rate = rateLimit(`sandbox:${session.userId}`, 10, 60_000);
    if (!rate.allowed) {
      return NextResponse.json(
        { message: "Too many sandbox executions. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } }
      );
    }

    const body = await req.json();
    const { codeText, runId, inputs } = body as {
      codeText: string;
      runId?: string;
      inputs?: Record<string, unknown>;
    };

    if (!codeText || typeof codeText !== "string") {
      return NextResponse.json({ message: "codeText parameter is required." }, { status: 400 });
    }

    if (Buffer.byteLength(codeText, "utf8") > MAX_SANDBOX_CODE_BYTES) {
      return NextResponse.json(
        { message: "Submitted code exceeds the maximum permitted size." },
        { status: 413 }
      );
    }

    // `recordArtifact` performs an unscoped `subagentRun.findUnique({ id: runId })` and
    // then writes a sandboxArtifact, so a caller-chosen runId was a cross-tenant write.
    if (runId) {
      const run = await prisma.subagentRun
        .findUnique({ where: { id: runId }, select: { id: true } })
        .catch(() => null);
      if (!run) {
        return NextResponse.json({ message: "runId not found." }, { status: 404 });
      }
    }

    // The executor applies its own blocklist, but the denylist is defence in depth
    // rather than a boundary, so a flagged submission is refused here as well and the
    // attempt is logged.
    const result = await pythonExecutor.execute(codeText, { runId, inputs });

    if (result.exitCode !== 0 && /security violation/i.test(result.stderr ?? "")) {
      console.warn(
        `[sandbox] Blocked submission from user=${session.userId} org=${session.orgId} runId=${runId ?? "none"}`
      );
    }

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
    // Do not echo the raw error: it can contain the interpreter's absolute path and
    // the submitted code.
    return NextResponse.json({ message: "Sandbox execution failed." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

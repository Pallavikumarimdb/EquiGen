import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiSecret } from "@/lib/utils/auth";

/**
 * GET /api/audit?reportId=...
 * Returns the audit log trail for a given report.
 */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(req.url);
    const reportId = searchParams.get("reportId");

    if (!reportId) {
      return NextResponse.json(
        { message: "Missing reportId parameter." },
        { status: 400 },
      );
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { reportId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(auditLogs);
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return NextResponse.json(
      { message: "Failed to fetch audit logs" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";

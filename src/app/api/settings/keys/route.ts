import { NextRequest, NextResponse } from "next/server";
import { getDecryptedApiKey, saveEncryptedApiKey } from "@/lib/utils/api-keys";
import { isTenantFailure, requireTenantSession } from "@/lib/utils/tenant";

/**
 * GET /api/settings/keys?provider=groq
 * Returns whether a key is configured for the given provider (does not return the raw key).
 */
export async function GET(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");

    const allowedProviders = ["groq", "openai", "openrouter", "anthropic", "deepseek"];
    if (!provider || !allowedProviders.includes(provider)) {
      return NextResponse.json(
        { message: `Invalid provider. Allowed: ${allowedProviders.join(", ")}` },
        { status: 400 },
      );
    }

    // The tenant guard guarantees a concrete orgId; tenancy fails closed rather than defaulting.
    const orgId = session.orgId;

    const key = await getDecryptedApiKey(orgId, provider);
    return NextResponse.json(
      {
        configured: !!key,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("API Error: GET /api/settings/keys failed:", error);
    return NextResponse.json(
      { message: "Failed to fetch key status." },
      { status: 500 },
    );
  }
}

/**
 * POST /api/settings/keys
 * Receives key payload and encrypts it in database.
 */
export async function POST(req: NextRequest) {
  const guard = await requireTenantSession(req);
  if (isTenantFailure(guard)) return guard.response;
  const session = guard;
  try {
    const body = await req.json();
    const { provider, apiKey } = body;

    const allowedProviders = ["groq", "openai", "openrouter", "anthropic", "deepseek"];
    if (!provider || !allowedProviders.includes(provider)) {
      return NextResponse.json(
        { message: `Invalid provider. Allowed: ${allowedProviders.join(", ")}` },
        { status: 400 },
      );
    }

    // The tenant guard guarantees a concrete orgId; tenancy fails closed rather than defaulting.
    const orgId = session.orgId;

    await saveEncryptedApiKey(orgId, provider, apiKey || "");

    return NextResponse.json(
      {
        success: true,
        message: `${provider} key updated securely.`,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("API Error: POST /api/settings/keys failed:", error);
    // Log the raw cause for operators; return a generic message so Prisma/PDFKit
    // internals (schema names, filesystem paths) are not disclosed to the client.
    return NextResponse.json({ message: "Internal Server Error." }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

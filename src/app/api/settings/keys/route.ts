import { NextRequest, NextResponse } from "next/server";
import { getDecryptedApiKey, saveEncryptedApiKey } from "@/lib/utils/api-keys";
import { getAuthSession, requireApiSecret } from "@/lib/utils/auth";

/**
 * GET /api/settings/keys?provider=groq
 * Returns whether a key is configured for the given provider (does not return the raw key).
 */
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");

    if (!provider || (provider !== "groq" && provider !== "openai")) {
      return NextResponse.json(
        { message: "Invalid or missing provider parameter." },
        { status: 400 },
      );
    }

    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";

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
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const { provider, apiKey } = body;

    if (!provider || (provider !== "groq" && provider !== "openai")) {
      return NextResponse.json(
        { message: "Invalid provider." },
        { status: 400 },
      );
    }

    const session = getAuthSession(req);
    const orgId = session?.orgId || "default-org";

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
    const errMsg =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ message: errMsg }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";

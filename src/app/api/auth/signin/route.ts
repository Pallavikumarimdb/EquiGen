import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signJWT } from "@/lib/utils/jwt";
import { comparePassword } from "@/lib/utils/password";
import { rateLimit } from "@/lib/utils/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { message: "Missing email or password." },
        { status: 400 }
      );
    }

    const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    // SECURITY: there was no rate limit and no lockout, so this endpoint was a free
    // oracle for credential stuffing. Two buckets: a coarse one per client address to
    // stop volume, and a tight one per account so a single account cannot be sprayed
    // from a botnet.
    const perIp = rateLimit(`signin:ip:${req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"}`, 20, 15 * 60_000);
    if (!perIp.allowed) {
      return NextResponse.json(
        { message: "Too many sign-in attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(perIp.retryAfterMs / 1000)) } }
      );
    }

    const perAccount = rateLimit(`signin:acct:${cleanEmail}`, 8, 15 * 60_000);
    if (!perAccount.allowed) {
      return NextResponse.json(
        { message: "Too many sign-in attempts for this account. Try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(perAccount.retryAfterMs / 1000)) } }
      );
    }

    // 1. Fetch user by email
    const user = await prisma.user.findUnique({
      where: { email: cleanEmail },
      include: { org: true },
    });

    if (!user) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      );
    }

    // 2. Validate password hash
    const isMatch = await comparePassword(password, user.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        { message: "Invalid email or password." },
        { status: 401 }
      );
    }

    // 3. Generate session JWT
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiration
    const token = await signJWT(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        sebiRegNo: user.sebiRegNo,
      },
      expiresAt
    );

    // 4. Save session token in the database
    await prisma.userSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const response = NextResponse.json({
      message: "Signin successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        orgName: user.org.name,
      },
    });

    // 5. Set cookie
    response.cookies.set({
      name: "session_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("Signin API error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { message: "Internal server error.", error: message },
      { status: 500 }
    );
  }
}

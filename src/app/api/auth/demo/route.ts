import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signJWT } from "@/lib/utils/jwt";

/**
 * Demo login.
 *
 * SECURITY: this endpoint minted a fully valid 7-day session for an anonymous caller
 * with no environment gate. The session's org was `default-org` — the very tenant that
 * several routes historically treated as a wildcard — so it converted latent
 * tenant-isolation bugs into an *unauthenticated* attack path.
 *
 * It is now disabled unless explicitly opted in, and is hard-refused in production.
 */
export async function POST() {
  try {
    if (process.env.NODE_ENV === "production") {
      console.warn("[auth/demo] Demo login refused in production.");
      return NextResponse.json(
        { message: "Demo login is not available in production." },
        { status: 404 }
      );
    }

    const demoEnabled = process.env.ENABLE_DEMO_LOGIN === "true";
    if (!demoEnabled) {
      return NextResponse.json(
        { message: "Demo login is disabled. Set ENABLE_DEMO_LOGIN=true to enable it." },
        { status: 404 }
      );
    }

    if (!process.env.DATABASE_URL) {
      return NextResponse.json(
        { message: "Database not configured." },
        { status: 500 }
      );
    }

    // 1. Ensure the default organization exists
    await prisma.organization.upsert({
      where: { id: "default-org" },
      update: {},
      create: {
        id: "default-org",
        name: "Default Organization",
      },
    });

    // 2. Ensure the demo user exists in the database
    const user = await prisma.user.upsert({
      where: { email: "demo@equigen.com" },
      update: {
        role: "research_analyst",
        sebiRegNo: "INH000012345",
      },
      create: {
        id: "demo-guest-user",
        email: "demo@equigen.com",
        name: "Demo Guest",
        passwordHash: "demo-guest-hash-unused",
        role: "research_analyst",
        sebiRegNo: "INH000012345",
        orgId: "default-org",
      },
    });

    // 3. Generate session JWT (expires in 7 days)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
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
      message: "Demo login successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        orgName: "Default Organization",
      },
    });

    // 5. Set session cookie
    response.cookies.set({
      name: "session_token",
      value: token,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("Demo login error:", error);
    // Never echo the raw error: it can contain connection strings and query text.
    return NextResponse.json(
      { message: "Failed to initialize demo session." },
      { status: 500 }
    );
  }
}

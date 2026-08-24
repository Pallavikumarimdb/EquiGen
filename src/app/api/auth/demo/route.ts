import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signJWT } from "@/lib/utils/jwt";

export async function POST(req: NextRequest) {
  try {
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
      update: {},
      create: {
        id: "demo-guest-user",
        email: "demo@equigen.com",
        name: "Demo Guest",
        passwordHash: "demo-guest-hash-unused",
        role: "analyst",
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
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      expires: expiresAt,
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("Demo login error:", error);
    return NextResponse.json(
      { message: "Failed to initialize demo session.", error: String(error) },
      { status: 500 }
    );
  }
}

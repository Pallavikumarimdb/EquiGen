import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signJWT } from "@/lib/utils/jwt";
import { comparePassword } from "@/lib/utils/password";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { message: "Missing email or password." },
        { status: 400 }
      );
    }

    // 1. Fetch user by email
    const user = await prisma.user.findUnique({
      where: { email },
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

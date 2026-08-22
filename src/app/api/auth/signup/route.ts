import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signJWT } from "@/lib/utils/jwt";
import { hashPassword } from "@/lib/utils/password";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, role, orgName, sebiRegNo } = await req.json();

    if (!name || !email || !password || !role || !orgName) {
      return NextResponse.json(
        { message: "Missing required fields (name, email, password, role, orgName)." },
        { status: 400 }
      );
    }

    // 1. Verify if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "Email is already registered." },
        { status: 400 }
      );
    }

    // 2. Validate SEBI registration number if reviewer role is selected
    if (role === "reviewer" && (!sebiRegNo || !/^INH[0-9]{9}$/.test(sebiRegNo))) {
      return NextResponse.json(
        { message: "Invalid SEBI Research Analyst registration number. Must follow the format: INHXXXXXXXXX (e.g. INH123456789)." },
        { status: 400 }
      );
    }

    // 3. Find or create the organization
    let org = await prisma.organization.findFirst({
      where: { name: orgName },
    });

    if (!org) {
      org = await prisma.organization.create({
        data: { name: orgName },
      });
    }

    // 4. Hash the password
    const passwordHash = await hashPassword(password);

    // 5. Create the new user record linked to organization
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role,
        sebiRegNo: role === "reviewer" ? sebiRegNo : null,
        orgId: org.id,
      },
    });

    // 6. Generate session JWT
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

    // 7. Persist session token in DB
    await prisma.userSession.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const response = NextResponse.json({
      message: "Signup successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        orgName: org.name,
      },
    });

    // 8. Set session cookie
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
    console.error("Signup API error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { message: "Internal server error.", error: message },
      { status: 500 }
    );
  }
}

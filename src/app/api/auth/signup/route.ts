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

    const cleanEmail = email.trim().toLowerCase();
    const cleanOrgName = orgName.trim();
    const cleanName = name.trim();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        { message: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    // Validate password strength
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { message: "Password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    // Validate role
    const allowedRoles = ["analyst", "reviewer", "admin"];
    const requestedRole = (role as string).toLowerCase();
    if (!allowedRoles.includes(requestedRole)) {
      return NextResponse.json(
        { message: "Invalid role specified." },
        { status: 400 }
      );
    }

    // 1. Verify if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "Email is already registered." },
        { status: 400 }
      );
    }

    // 2. Validate SEBI registration number if reviewer role is selected
    if (requestedRole === "reviewer" && (!sebiRegNo || !/^INH[0-9]{9}$/.test(sebiRegNo.trim()))) {
      return NextResponse.json(
        { message: "Invalid SEBI Research Analyst registration number. Must follow the format: INHXXXXXXXXX (e.g. INH123456789)." },
        { status: 400 }
      );
    }

    // 3. Find or create the organization (prevent tenant hijacking)
    let org = await prisma.organization.findFirst({
      where: { name: cleanOrgName },
      include: { _count: { select: { users: true } } },
    });

    let assignedRole = requestedRole;

    if (org) {
      // If the organization exists and has existing users, block arbitrary strangers from hijacking it
      if (org._count.users > 0 && org.id !== "default-org") {
        return NextResponse.json(
          { message: `Organization "${cleanOrgName}" already exists. Please request an invite from your organization administrator or enter a unique organization name.` },
          { status: 409 }
        );
      }
    } else {
      // New organization creation: creator becomes admin of the new organization
      org = await prisma.organization.create({
        data: { name: cleanOrgName },
        include: { _count: { select: { users: true } } },
      });
      // First user creating an org gets admin privileges
      assignedRole = "admin";
    }

    // 4. Hash the password
    const passwordHash = await hashPassword(password);

    // 5. Create the new user record linked to organization
    const user = await prisma.user.create({
      data: {
        name: cleanName,
        email: cleanEmail,
        passwordHash,
        role: assignedRole,
        sebiRegNo: requestedRole === "reviewer" || sebiRegNo ? sebiRegNo?.trim() || null : null,
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

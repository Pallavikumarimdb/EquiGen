import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession } from "@/lib/utils/auth";
import { hashPassword } from "@/lib/utils/password";

export async function GET(req: NextRequest) {
  try {
    const session = getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    // 1. Fetch organization details
    const org = await prisma.organization.findUnique({
      where: { id: session.orgId },
    });

    if (!org) {
      return NextResponse.json({ message: "Organization not found." }, { status: 404 });
    }

    // 2. Fetch users in this organization
    const users = await prisma.user.findMany({
      where: { orgId: session.orgId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        sebiRegNo: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ org, users });
  } catch (error: unknown) {
    console.error("GET /api/settings/org error:", error);
    return NextResponse.json({ message: "Internal server error." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = getAuthSession(req);
    if (!session) {
      return NextResponse.json({ message: "Unauthorized. Please log in." }, { status: 401 });
    }

    // RBAC: Enforce Admin permission for updating org settings or team management
    if (session.role !== "admin") {
      return NextResponse.json({ message: "Forbidden. Organization Administrator access required." }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    // Action: Update Organization Branding details
    if (action === "updateBranding") {
      const { name, primaryColor, accentColor } = body;
      
      if (!name) {
        return NextResponse.json({ message: "Organization Name is required." }, { status: 400 });
      }

      const updatedOrg = await prisma.organization.update({
        where: { id: session.orgId },
        data: {
          name,
          primaryColor: primaryColor || "#0f172a",
          accentColor: accentColor || "#10b981",
        },
      });

      return NextResponse.json({
        message: "Branding and settings updated successfully",
        org: updatedOrg,
      });
    }

    // Action: Create and add a new user to the organization
    if (action === "addUser") {
      const { name, email, password, role, sebiRegNo } = body;

      if (!name || !email || !password || !role) {
        return NextResponse.json({ message: "Missing required fields for new user." }, { status: 400 });
      }

      // Check if email already registered globally
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return NextResponse.json({ message: "Email is already registered." }, { status: 400 });
      }

      // Validate SEBI registration if reviewer
      if (role === "reviewer" && (!sebiRegNo || !/^INH[0-9]{9}$/.test(sebiRegNo))) {
        return NextResponse.json({
          message: "Invalid SEBI Research Analyst registration number format (Must match: INHXXXXXXXXX).",
        }, { status: 400 });
      }

      // Hash password and save new User
      const passwordHash = await hashPassword(password);
      const newUser = await prisma.user.create({
        data: {
          name,
          email,
          passwordHash,
          role,
          sebiRegNo: role === "reviewer" ? sebiRegNo : null,
          orgId: session.orgId,
        },
      });

      return NextResponse.json({
        message: "User added successfully",
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          sebiRegNo: newUser.sebiRegNo,
        },
      });
    }

    return NextResponse.json({ message: "Invalid action." }, { status: 400 });
  } catch (error: unknown) {
    console.error("POST /api/settings/org error:", error);
    const message = error instanceof Error ? error.message : "Internal server error.";
    return NextResponse.json({ message: "Internal server error.", error: message }, { status: 500 });
  }
}
export const dynamic = "force-dynamic";

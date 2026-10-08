import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession } from "@/lib/utils/auth";
import { getOrgSubscription } from "@/lib/billing/entitlements";
import { getPlan } from "@/lib/billing/plans";

export async function GET(req: NextRequest) {
  try {
    const session = getAuthSession(req);

    if (!session) {
      return NextResponse.json(
        { message: "Not authenticated" },
        { status: 401 }
      );
    }

    // Fetch user details with organization context
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { org: true },
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    // Plan entitlements are per-org, so one lookup covers every seat.
    const subscription = await getOrgSubscription(user.orgId).catch(() => null);
    const plan = getPlan(subscription?.planId);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        sebiRegNo: user.sebiRegNo,
        orgId: user.orgId,
        orgName: user.org.name,
        orgLogoUrl: user.org.logoUrl,
        orgPrimaryColor: user.org.primaryColor,
        orgAccentColor: user.org.accentColor,
      },
      plan: {
        id: plan.id,
        name: plan.name,
        reportsPerMonth: plan.reportsPerMonth,
        status: subscription?.status ?? "none",
      },
    });
  } catch (error: unknown) {
    console.error("Auth me API error:", error);
    try {
      const session = getAuthSession(req);
      if (session?.userId) {
        return NextResponse.json({
          user: {
            id: session.userId,
            name: session.name || "Research Analyst",
            email: "",
            role: session.role || "RESEARCH_ANALYST",
            sebiRegNo: session.sebiRegNo || "",
            orgId: session.orgId || "default-org",
            orgName: "EquiGen Research",
            orgLogoUrl: null,
            orgPrimaryColor: "#1A1917",
            orgAccentColor: "#D97706",
          },
        });
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = getAuthSession(req);

    if (!session || !session.userId) {
      return NextResponse.json(
        { message: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { name, sebiRegNo } = body;

    const dataToUpdate: { name?: string; sebiRegNo?: string | null } = {};

    if (typeof name === "string" && name.trim()) {
      dataToUpdate.name = name.trim();
    }

    if (sebiRegNo !== undefined) {
      const cleanSebi = typeof sebiRegNo === "string" ? sebiRegNo.trim().toUpperCase() : "";
      if (cleanSebi) {
        if (!/^INH[0-9]{9}$/.test(cleanSebi)) {
          return NextResponse.json(
            { message: "Invalid SEBI Research Analyst registration number format (Must match: INHXXXXXXXXX)." },
            { status: 400 }
          );
        }
        dataToUpdate.sebiRegNo = cleanSebi;
      } else {
        dataToUpdate.sebiRegNo = null;
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.userId },
      data: dataToUpdate,
      include: { org: true },
    });

    // Re-issue JWT with refreshed profile information
    const { signJWT } = await import("@/lib/utils/jwt");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = await signJWT(
      {
        userId: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        orgId: updatedUser.orgId,
        sebiRegNo: updatedUser.sebiRegNo,
      },
      expiresAt
    );

    const response = NextResponse.json({
      message: "Profile updated successfully",
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        sebiRegNo: updatedUser.sebiRegNo,
        orgId: updatedUser.orgId,
        orgName: updatedUser.org.name,
      },
    });

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
    console.error("PATCH /api/auth/me error:", error);
    const message = error instanceof Error ? error.message : "Internal server error.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthSession } from "@/lib/utils/auth";

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

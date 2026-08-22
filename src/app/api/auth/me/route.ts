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
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

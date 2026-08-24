import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("session_token")?.value;

    if (token) {
      // 1. Invalidate session in database
      await prisma.userSession.deleteMany({
        where: { token },
      });
    }

    const response = NextResponse.json({ message: "Signout successful" });

    // 2. Clear cookie by setting it with an expired date
    response.cookies.set({
      name: "session_token",
      value: "",
      httpOnly: true,
      expires: new Date(0),
      path: "/",
    });

    return response;
  } catch (error: unknown) {
    console.error("Signout API error:", error);
    return NextResponse.json(
      { message: "Internal server error." },
      { status: 500 }
    );
  }
}

import { cookies } from "next/headers";
import Dashboard from "@/components/Dashboard";
import Landing from "@/components/Landing";
import { verifyJWT } from "@/lib/utils/jwt";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Public entry point. Anonymous visitors get the marketing landing page,
 * authenticated users are handed straight to the research dashboard.
 */
export default async function Home() {
  const token = (await cookies()).get("session_token")?.value;
  let session = token ? await verifyJWT(token) : null;

  // Session verification: Ensure session exists in the database and has not expired
  if (session && token) {
    const sessionRow = await prisma.userSession
      .findUnique({
        where: { token },
        select: { expiresAt: true, userId: true },
      })
      .catch(() => null);

    if (!sessionRow || sessionRow.expiresAt.getTime() <= Date.now()) {
      session = null;
    }
  }

  if (!session) {
    return <Landing />;
  }

  return (
    <main className="min-h-screen">
      <Dashboard />
    </main>
  );
}

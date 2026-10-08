import { cookies } from "next/headers";
import Dashboard from "@/components/Dashboard";
import Landing from "@/components/Landing";
import { verifyJWT } from "@/lib/utils/jwt";

export const dynamic = "force-dynamic";

/**
 * Public entry point. Anonymous visitors get the marketing landing page,
 * authenticated users are handed straight to the research dashboard.
 */
export default async function Home() {
  const token = (await cookies()).get("session_token")?.value;
  const session = token ? await verifyJWT(token) : null;

  if (!session) {
    return <Landing />;
  }

  return (
    <main className="min-h-screen">
      <Dashboard />
    </main>
  );
}

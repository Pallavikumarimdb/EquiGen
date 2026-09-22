import Dashboard from "@/components/Dashboard";

type RouteParams = { params: Promise<{ id: string }> };

export default async function ResearchPage({ params }: RouteParams) {
  const { id } = await params;
  return (
    <main className="min-h-screen bg-background">
      <Dashboard initialReportId={id} initialViewMode="report" />
    </main>
  );
}

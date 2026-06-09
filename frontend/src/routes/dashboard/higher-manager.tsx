import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";

const API = "/api/reports/portfolio?sanitized=true";

interface PortfolioDemand {
  id: string;
  public_id: string;
  stage: string;
  raw_text: string;
  created_at?: string | null;
  completed_at?: string | null;
}

interface PortfolioData {
  demands: PortfolioDemand[];
  closed_swons_count: number;
  active_swons_count: number;
  total_demands: number;
}

export default function HigherManagerDashboard() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading portfolio...</div>;
  }

  const liveDeliveries =
    data?.demands?.filter((d) => d.stage === "executing" || d.stage === "monitoring") ?? [];
  const recentlyShipped =
    data?.demands?.filter((d) => d.stage === "completed")?.slice(0, 10) ?? [];

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Portfolio Overview</h1>
      <PersonaHeader />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Delivered This Quarter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.closed_swons_count ?? 0}</div>
            <p className="text-xs text-muted-foreground">completed SWONs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Live Deliveries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{liveDeliveries.length}</div>
            <p className="text-xs text-muted-foreground">active right now</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active SWONs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{data?.active_swons_count ?? 0}</div>
            <p className="text-xs text-muted-foreground">in progress</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live Deliveries</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {liveDeliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active deliveries</p>
            ) : (
              liveDeliveries.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium">{d.public_id}</span>
                    <p className="text-xs text-muted-foreground truncate max-w-[240px]">
                      {d.raw_text}
                    </p>
                  </div>
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                    In progress
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recently Shipped</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentlyShipped.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet</p>
            ) : (
              recentlyShipped.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium">{d.public_id}</span>
                    <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {d.raw_text}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                      Shipped
                    </span>
                    {d.completed_at && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(d.completed_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

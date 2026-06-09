import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";
import type { Demand } from "../../types";

export default function MiddlewareDashboard() {
  const [demands, setDemands] = useState<Demand[]>([]);

  useEffect(() => {
    fetch("/api/demands")
      .then((r) => r.json())
      .then((data) => setDemands(Array.isArray(data) ? data : data.items ?? []))
      .catch(console.error);
  }, []);

  const awaitingApproval = demands.filter((d) => d.stage === "awaiting_approval");
  const active = demands.filter((d) =>
    ["executing", "monitoring", "explaining"].includes(d.stage)
  );

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Middleware — Intake & Handoffs</h1>
      <PersonaHeader />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting Intake Approval ({awaitingApproval.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {awaitingApproval.length === 0 ? (
              <p className="text-sm text-muted-foreground">Queue empty</p>
            ) : (
              awaitingApproval.map((d) => (
                <a
                  key={d.id}
                  href={`/demand/${d.public_id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50"
                >
                  <div>
                    <span className="text-sm font-medium">{d.public_id}</span>
                    <p className="text-xs text-muted-foreground truncate max-w-[250px]">{d.raw_text}</p>
                  </div>
                  <button className="text-xs rounded bg-forge px-2 py-1 text-white hover:opacity-80">
                    Approve
                  </button>
                </a>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Demands ({active.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">None active</p>
            ) : (
              active.map((d) => (
                <a
                  key={d.id}
                  href={`/demand/${d.public_id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50"
                >
                  <span className="text-sm font-medium">{d.public_id}</span>
                  <span className="capitalize text-xs text-muted-foreground">{d.stage}</span>
                </a>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

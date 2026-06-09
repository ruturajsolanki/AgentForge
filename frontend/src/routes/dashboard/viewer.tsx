import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";
import type { AuditEventItem } from "../../types";

interface Portfolio {
  delivered_this_quarter?: number;
  active_swons?: number;
  live_deliveries?: { public_id: string; stage?: string }[];
  recently_shipped?: { public_id: string }[];
}

export default function ViewerDashboard() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [audit, setAudit] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/reports/portfolio?sanitized=true").then((r) => r.json()).catch(() => ({})),
      fetch("/api/audit?limit=20").then((r) => r.json()).then((d) => d.items ?? d).catch(() => []),
    ])
      .then(([p, a]) => {
        setPortfolio(p);
        setAudit(Array.isArray(a) ? a : []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading read-only view...</div>;

  const live = portfolio?.live_deliveries ?? [];

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Portfolio (Read-only)</h1>
      <PersonaHeader role="viewer" />

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="Delivered This Quarter" value={portfolio?.delivered_this_quarter ?? 0} />
        <Kpi label="Active SWONs" value={portfolio?.active_swons ?? 0} />
        <Kpi label="Live Deliveries" value={live.length} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Live Deliveries</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {live.length === 0 ? (
            <p className="text-sm text-muted-foreground">No live deliveries.</p>
          ) : (
            live.map((d) => (
              <div key={d.public_id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm font-medium">{d.public_id}</span>
                {d.stage && <span className="text-xs capitalize text-muted-foreground">{d.stage.replace("_", " ")}</span>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          ) : (
            audit.slice(0, 12).map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b border-hairline py-1.5 text-xs last:border-0">
                <span className="font-medium text-fg-strong">{e.entity_kind} · {e.action}</span>
                <span className="text-muted-foreground">{e.created_at ? new Date(e.created_at).toLocaleDateString() : ""}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

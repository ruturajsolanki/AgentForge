import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import type {
  DeliveryReport,
  TeamPerformanceReport,
  DemandAgingReport,
  SlaComplianceReport,
} from "../types";

type ReportTab = "delivery" | "team" | "aging" | "sla" | "swon";
type Period = "week" | "month" | "quarter";

export default function ReportsRoute() {
  const [tab, setTab] = useState<ReportTab>("delivery");
  const [period, setPeriod] = useState<Period>("month");
  const [delivery, setDelivery] = useState<DeliveryReport | null>(null);
  const [team, setTeam] = useState<TeamPerformanceReport | null>(null);
  const [aging, setAging] = useState<DemandAgingReport | null>(null);
  const [sla, setSla] = useState<SlaComplianceReport | null>(null);
  const [swonData, setSwonData] = useState<{ swons: Record<string, unknown>[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    let url = "";
    switch (tab) {
      case "delivery":
        url = `/api/reports/delivery?period=${period}`;
        break;
      case "team":
        url = "/api/reports/team-performance";
        break;
      case "aging":
        url = "/api/reports/demand-aging";
        break;
      case "sla":
        url = "/api/reports/sla-compliance";
        break;
      case "swon":
        url = "/api/reports/swon-detail";
        break;
    }
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        switch (tab) {
          case "delivery": setDelivery(d); break;
          case "team": setTeam(d); break;
          case "aging": setAging(d); break;
          case "sla": setSla(d); break;
          case "swon": setSwonData(d); break;
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tab, period]);

  const exportUrl = (fmt: string) => {
    const urls: Record<string, string> = {
      delivery: `/api/reports/delivery?format=${fmt}&period=${period}`,
      team: `/api/reports/team-performance?format=${fmt}`,
      aging: `/api/reports/demand-aging?format=${fmt}`,
      sla: `/api/reports/sla-compliance?format=${fmt}`,
      swon: `/api/reports/swon-detail?format=${fmt}`,
    };
    return urls[tab] || "";
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="flex gap-2">
          <button
            onClick={() => window.open(exportUrl("csv"))}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Export CSV
          </button>
          <button
            onClick={() => window.open(exportUrl("excel"))}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* Report tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {([
          ["delivery", "Delivery"],
          ["team", "Team Performance"],
          ["aging", "Demand Aging"],
          ["sla", "SLA Compliance"],
          ["swon", "SWON Detail"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading...</p>}

      {/* Delivery Report */}
      {tab === "delivery" && delivery && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["week", "month", "quarter"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1 text-sm capitalize ${
                  period === p ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="SWONs" value={delivery.swon_count} />
            <MetricCard label="WONs" value={delivery.won_count} />
            <MetricCard label="Total Tasks" value={delivery.task_total} />
            <MetricCard label="Tasks Done" value={delivery.tasks_done} />
            <MetricCard label="Demands" value={delivery.demands_total} />
          </div>
        </div>
      )}

      {/* Team Performance */}
      {tab === "team" && team && (
        <Card>
          <CardHeader><CardTitle className="text-base">Team Performance ({team.total_members} members)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Name</th>
                    <th className="pb-2 pr-3 font-medium">Role</th>
                    <th className="pb-2 pr-3 font-medium text-center">Tasks</th>
                    <th className="pb-2 pr-3 font-medium text-center">Done</th>
                    <th className="pb-2 pr-3 font-medium text-center">In Progress</th>
                    <th className="pb-2 pr-3 font-medium text-center">Blocked</th>
                    <th className="pb-2 pr-3 font-medium text-center">Hours</th>
                    <th className="pb-2 pr-3 font-medium">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {team.members.map((m) => (
                    <tr key={m.name} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{m.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{m.role}</td>
                      <td className="py-2 pr-3 text-center">{m.total_tasks}</td>
                      <td className="py-2 pr-3 text-center text-green-600">{m.done}</td>
                      <td className="py-2 pr-3 text-center text-blue-600">{m.in_progress}</td>
                      <td className="py-2 pr-3 text-center text-red-600">{m.blocked}</td>
                      <td className="py-2 pr-3 text-center">{m.hours_logged}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full ${m.completion_rate >= 70 ? "bg-green-500" : m.completion_rate >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                              style={{ width: `${m.completion_rate}%` }}
                            />
                          </div>
                          <span className="text-xs">{m.completion_rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Demand Aging */}
      {tab === "aging" && aging && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(aging.buckets).map(([bucket, count]) => (
              <MetricCard
                key={bucket}
                label={bucket}
                value={count}
                accent={bucket === "30+ days" ? "red" : bucket === "15-30 days" ? "amber" : undefined}
              />
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Demand Details ({aging.total} total)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">ID</th>
                      <th className="pb-2 pr-3 font-medium">Stage</th>
                      <th className="pb-2 pr-3 font-medium">Age (days)</th>
                      <th className="pb-2 pr-3 font-medium">Bucket</th>
                      <th className="pb-2 pr-3 font-medium">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aging.demands.map((d) => (
                      <tr key={d.public_id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{d.public_id}</td>
                        <td className="py-2 pr-3 capitalize">{d.stage.replace("_", " ")}</td>
                        <td className="py-2 pr-3">
                          <span className={d.age_days > 30 ? "text-red-600 font-medium" : d.age_days > 14 ? "text-amber-600" : ""}>
                            {d.age_days}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">{d.bucket}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{d.created_at ? new Date(d.created_at).toLocaleDateString() : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SLA Compliance */}
      {tab === "sla" && sla && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Compliance Rate" value={`${sla.summary.compliance_rate}%`} accent={sla.summary.compliance_rate >= 80 ? "green" : "red"} />
            <MetricCard label="On Track" value={sla.summary.on_track} accent="green" />
            <MetricCard label="At Risk" value={sla.summary.at_risk} accent="amber" />
            <MetricCard label="Breached" value={sla.summary.breached} accent={sla.summary.breached > 0 ? "red" : undefined} />
            <MetricCard label="No SLA" value={sla.summary.no_sla} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Task SLA Status</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-3 font-medium">Task</th>
                      <th className="pb-2 pr-3 font-medium">Title</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 pr-3 font-medium">SLA Due</th>
                      <th className="pb-2 pr-3 font-medium">SLA Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sla.tasks.map((t) => (
                      <tr key={t.public_id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{t.public_id}</td>
                        <td className="py-2 pr-3 truncate max-w-[200px]">{t.title}</td>
                        <td className="py-2 pr-3">{t.status}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{t.sla_due_at ? new Date(t.sla_due_at).toLocaleDateString() : "—"}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            t.sla_status === "Breached" ? "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400"
                            : t.sla_status === "At Risk" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                            : t.sla_status === "Met" || t.sla_status === "On Track" ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-600"
                          }`}>
                            {t.sla_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* SWON Detail */}
      {tab === "swon" && swonData && (
        <Card>
          <CardHeader><CardTitle className="text-base">SWON Records ({swonData.total})</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">SWON ID</th>
                    <th className="pb-2 pr-3 font-medium">State</th>
                    <th className="pb-2 pr-3 font-medium">LOA Ref</th>
                    <th className="pb-2 pr-3 font-medium">Value (INR)</th>
                    <th className="pb-2 pr-3 font-medium">WONs</th>
                    <th className="pb-2 pr-3 font-medium">Monthly Value</th>
                    <th className="pb-2 pr-3 font-medium">Opened</th>
                    <th className="pb-2 pr-3 font-medium">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {(swonData.swons as Record<string, unknown>[]).map((s) => (
                    <tr key={String(s.public_id)} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{String(s.public_id)}</td>
                      <td className="py-2 pr-3 capitalize">{String(s.lifecycle_state)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{String(s.customer_loa_ref || "—")}</td>
                      <td className="py-2 pr-3">{Number(s.total_value_inr || 0).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-center">{String(s.won_count)}</td>
                      <td className="py-2 pr-3">{Number(s.total_monthly_value || 0).toLocaleString()}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{s.opened_at ? new Date(String(s.opened_at)).toLocaleDateString() : "—"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{s.closed_at ? new Date(String(s.closed_at)).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "green" | "amber" | "red";
}) {
  const colors = {
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${accent ? colors[accent] : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";
import type { ExecutiveDashboard as ExecData } from "../../types";

export default function ExecutiveDashboard() {
  const [data, setData] = useState<ExecData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard/executive")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading executive dashboard...</div>;
  }
  if (!data) {
    return <div className="p-6 text-destructive">Failed to load dashboard data.</div>;
  }

  const stageOrder = [
    "ingested", "understanding", "deciding", "allocating",
    "awaiting_approval", "executing", "monitoring", "explaining",
    "completed", "failed", "cancelled",
  ];

  const stageColors: Record<string, string> = {
    ingested: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    understanding: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    deciding: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    allocating: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
    awaiting_approval: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    executing: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
    monitoring: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
    explaining: "bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300",
    completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
    failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Executive Dashboard</h1>
        <div className="flex gap-2">
          <Link to="/reports" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            View Reports
          </Link>
        </div>
      </div>
      <PersonaHeader />

      {/* KPI Row 1 — Demand overview */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Total Demands" value={data.total_demands} />
        <KpiCard label="Active Demands" value={data.active_demands} accent="blue" />
        <KpiCard label="Closed Demands" value={data.closed_demands} accent="green" />
        <KpiCard label="Delayed Demands" value={data.delayed_demands} accent="amber" />
        <KpiCard label="Failed Demands" value={data.failed_demands} accent="red" />
      </div>

      {/* KPI Row 2 — Performance */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Delivery Rate" value={`${data.delivery_rate}%`} accent="green" />
        <KpiCard label="Task Completion" value={`${data.task_completion_rate}%`} accent="blue" />
        <KpiCard label="Resource Utilization" value={`${data.resource_utilization}%`} accent="purple" />
        <KpiCard label="SLA Breaches" value={data.sla_breaches} accent={data.sla_breaches > 0 ? "red" : "green"} />
      </div>

      {/* KPI Row 3 — Work items */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Tasks" value={data.task_total} />
        <KpiCard label="Tasks Done" value={data.tasks_done} accent="green" />
        <KpiCard label="Tasks Blocked" value={data.tasks_blocked} accent="red" />
        <KpiCard label="Team Members" value={`${data.assigned_team}/${data.total_team}`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Demand trend chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Demand Trend (7 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-32">
              {data.demand_trend.map((t, i) => {
                const max = Math.max(...data.demand_trend.map((d) => d.count), 1);
                const pct = (t.count / max) * 100;
                return (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{t.count}</span>
                    <div
                      className="w-full rounded-t bg-primary/80 transition-all"
                      style={{ height: `${Math.max(pct, 4)}%` }}
                    />
                    <span className="text-[10px] text-muted-foreground">{t.day}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Stage breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stage Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {stageOrder
                .filter((s) => (data.stage_breakdown[s] ?? 0) > 0)
                .map((s) => (
                  <span
                    key={s}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${stageColors[s] ?? "bg-gray-100 text-gray-700"}`}
                  >
                    <span className="capitalize">{s.replace("_", " ")}</span>
                    <span className="font-bold">{data.stage_breakdown[s]}</span>
                  </span>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recently completed */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently Completed</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_completed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed demands yet.</p>
          ) : (
            <div className="space-y-2">
              {data.recent_completed.map((d) => (
                <Link
                  key={d.id}
                  to={`/demand/${d.public_id}/plan`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{d.public_id}</span>
                    <p className="truncate text-xs text-muted-foreground max-w-[400px]">{d.raw_text}</p>
                  </div>
                  <span className="shrink-0 rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/30 dark:text-green-400">
                    {d.completed_at ? new Date(d.completed_at).toLocaleDateString() : "Completed"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "blue" | "green" | "amber" | "red" | "purple";
}) {
  const colorMap = {
    blue: "text-blue-600 dark:text-blue-400",
    green: "text-green-600 dark:text-green-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    purple: "text-purple-600 dark:text-purple-400",
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-bold ${accent ? colorMap[accent] : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

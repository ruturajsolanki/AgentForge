import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";
import ActivityTimeline from "../../components/delivery/ActivityTimeline";
import type { ManagerDashboardData, AuditEventItem } from "../../types";

export default function ManagerDashboard() {
  const [data, setData] = useState<ManagerDashboardData | null>(null);
  const [audit, setAudit] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "approvals" | "sla" | "workload">("overview");

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/manager").then((r) => r.json()),
      fetch("/api/audit?limit=30").then((r) => r.json()),
    ])
      .then(([d, a]) => {
        setData(d);
        setAudit(a.items ?? a);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading manager dashboard...</div>;
  if (!data) return <div className="p-6 text-destructive">Failed to load data.</div>;

  const s = data.summary;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manager Console</h1>
        <Link to="/reports" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          Reports
        </Link>
      </div>
      <PersonaHeader />

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Demands" value={s.active_demands} accent="blue" />
        <KpiCard label="Pending Approvals" value={s.pending_approval_count} accent={s.pending_approval_count > 0 ? "amber" : undefined} />
        <KpiCard label="SLA Breaches" value={s.total_sla_breaches} accent={s.total_sla_breaches > 0 ? "red" : "green"} />
        <KpiCard label="Blocked Tasks" value={s.total_blocked} accent={s.total_blocked > 0 ? "red" : undefined} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Demands" value={s.total_demands} />
        <KpiCard label="Total Tasks" value={s.total_tasks} />
        <KpiCard label="Tasks Done" value={s.tasks_done} accent="green" />
        <KpiCard label="In Progress" value={s.tasks_in_progress} accent="blue" />
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 border-b">
        {(["overview", "approvals", "sla", "workload"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "sla" ? "SLA & Blocks" : t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Stage Breakdown</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.stage_breakdown).map(([stage, count]) => (
                  <span
                    key={stage}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium"
                  >
                    <span className="capitalize">{stage.replace("_", " ")}</span>
                    <span className="font-bold">{count}</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
            <CardContent className="max-h-[400px] overflow-y-auto">
              <ActivityTimeline events={audit} />
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Recent Demands</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">ID</th>
                      <th className="pb-2 pr-4 font-medium">Stage</th>
                      <th className="pb-2 pr-4 font-medium">Description</th>
                      <th className="pb-2 pr-4 font-medium">Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.demands.slice(0, 15).map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <Link to={`/demand/${d.public_id}/plan`} className="text-primary hover:underline font-medium">
                            {d.public_id}
                          </Link>
                        </td>
                        <td className="py-2 pr-4 capitalize">{d.stage.replace("_", " ")}</td>
                        <td className="py-2 pr-4 truncate max-w-[300px] text-muted-foreground">{d.raw_text}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{d.age_days}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "approvals" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Pending Approvals</CardTitle></CardHeader>
          <CardContent>
            {data.pending_approvals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending approvals.</p>
            ) : (
              <div className="space-y-2">
                {data.pending_approvals.map((d) => (
                  <Link
                    key={d.id}
                    to={`/demand/${d.public_id}/plan`}
                    className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium">{d.public_id}</span>
                      <p className="truncate text-xs text-muted-foreground max-w-[400px]">{d.raw_text}</p>
                    </div>
                    <span className="shrink-0 rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
                      Awaiting
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "sla" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">SLA Breaches ({data.sla_breaches.length})</CardTitle></CardHeader>
            <CardContent>
              {data.sla_breaches.length === 0 ? (
                <p className="text-sm text-green-600">All tasks within SLA.</p>
              ) : (
                <div className="space-y-2">
                  {data.sla_breaches.map((t) => (
                    <div key={t.id} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t.public_id}</span>
                        <span className="text-xs text-red-600 dark:text-red-400">
                          Due: {t.sla_due_at ? new Date(t.sla_due_at).toLocaleDateString() : "N/A"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{t.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Blocked Tasks ({data.blocked_tasks.length})</CardTitle></CardHeader>
            <CardContent>
              {data.blocked_tasks.length === 0 ? (
                <p className="text-sm text-green-600">No blocked tasks.</p>
              ) : (
                <div className="space-y-2">
                  {data.blocked_tasks.map((t) => (
                    <div key={t.id} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/20">
                      <span className="text-sm font-medium">{t.public_id}</span>
                      <p className="text-xs text-muted-foreground">{t.title}</p>
                      {t.blocked_reason && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Reason: {t.blocked_reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "workload" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Team Allocation</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Name</th>
                      <th className="pb-2 pr-4 font-medium">Role</th>
                      <th className="pb-2 pr-4 font-medium">Availability</th>
                      <th className="pb-2 pr-4 font-medium">Project</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.team_allocation.map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium">{m.name}</td>
                        <td className="py-2 pr-4">{m.role}</td>
                        <td className="py-2 pr-4">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${
                            m.availability === "full-time"
                              ? "bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                              : "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                          }`}>
                            {m.availability}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{m.current_project}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Workload Distribution</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(data.team_workload).length === 0 ? (
                <p className="text-sm text-muted-foreground">No task data.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(data.team_workload).slice(0, 10).map(([ownerId, wl]) => (
                    <div key={ownerId}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium truncate max-w-[150px]">{ownerId.substring(0, 8)}</span>
                        <span className="text-muted-foreground">{wl.done}/{wl.total} done</span>
                      </div>
                      <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                        {wl.done > 0 && (
                          <div className="bg-green-500" style={{ width: `${(wl.done / wl.total) * 100}%` }} />
                        )}
                        {wl.in_progress > 0 && (
                          <div className="bg-blue-500" style={{ width: `${(wl.in_progress / wl.total) * 100}%` }} />
                        )}
                        {wl.blocked > 0 && (
                          <div className="bg-red-500" style={{ width: `${(wl.blocked / wl.total) * 100}%` }} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
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
  accent?: "blue" | "green" | "amber" | "red";
}) {
  const colorMap = {
    blue: "text-blue-600 dark:text-blue-400",
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
        <div className={`text-3xl font-bold ${accent ? colorMap[accent] : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

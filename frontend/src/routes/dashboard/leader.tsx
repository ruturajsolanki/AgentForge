import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";
import TaskBoard from "../../components/delivery/TaskBoard";
import type { LeaderDashboardData, TaskItem } from "../../types";

export default function LeaderDashboard() {
  const [data, setData] = useState<LeaderDashboardData | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"board" | "progress" | "blocked" | "demands">("board");

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/leader").then((r) => r.json()),
      fetch("/api/tasks").then((r) => r.json()),
    ])
      .then(([d, t]) => {
        setData(d);
        setTasks(Array.isArray(t) ? t : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading leader dashboard...</div>;
  if (!data) return <div className="p-6 text-destructive">Failed to load.</div>;

  const s = data.summary;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Team Execution</h1>
      <PersonaHeader />

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Active Demands" value={s.active_demand_count} accent="blue" />
        <KpiCard label="Total Tasks" value={s.total_tasks} />
        <KpiCard label="Done" value={s.tasks_done} accent="green" />
        <KpiCard label="Blocked" value={s.tasks_blocked} accent={s.tasks_blocked > 0 ? "red" : undefined} />
        <KpiCard
          label="Health Score"
          value={`${s.health_score}%`}
          accent={s.health_score >= 70 ? "green" : s.health_score >= 40 ? "amber" : "red"}
        />
      </div>

      {/* Work distribution bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Work Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-6 rounded-full overflow-hidden bg-muted">
            {(["Done", "InProgress", "Review", "Todo", "Blocked"] as const).map((status) => {
              const count = data.work_distribution[status] || 0;
              if (count === 0) return null;
              const pct = (count / s.total_tasks) * 100;
              const colors: Record<string, string> = {
                Done: "bg-green-500",
                InProgress: "bg-blue-500",
                Review: "bg-purple-500",
                Todo: "bg-slate-400",
                Blocked: "bg-red-500",
              };
              return (
                <div
                  key={status}
                  className={`${colors[status]} relative group`}
                  style={{ width: `${pct}%` }}
                  title={`${status}: ${count}`}
                >
                  {pct > 12 && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white">
                      {status} ({count})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {Object.entries(data.work_distribution).map(([status, count]) => (
              <span key={status} className="flex items-center gap-1">
                <span className={`inline-block h-2 w-2 rounded-full ${
                  { Done: "bg-green-500", InProgress: "bg-blue-500", Review: "bg-purple-500", Todo: "bg-slate-400", Blocked: "bg-red-500" }[status] ?? "bg-gray-400"
                }`} />
                {status}: {count}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["board", "progress", "blocked", "demands"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "board" ? "Task Board" : t === "progress" ? "Member Progress" : t === "blocked" ? "Blocked & SLA" : "Active Demands"}
          </button>
        ))}
      </div>

      {tab === "board" && (
        <div className="overflow-x-auto">
          <TaskBoard tasks={tasks} />
        </div>
      )}

      {tab === "progress" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Individual Progress</CardTitle></CardHeader>
          <CardContent>
            {Object.keys(data.member_progress).length === 0 ? (
              <p className="text-sm text-muted-foreground">No member data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 pr-4 font-medium">Member</th>
                      <th className="pb-2 pr-4 font-medium text-center">Total</th>
                      <th className="pb-2 pr-4 font-medium text-center">Done</th>
                      <th className="pb-2 pr-4 font-medium text-center">In Progress</th>
                      <th className="pb-2 pr-4 font-medium text-center">Blocked</th>
                      <th className="pb-2 pr-4 font-medium">Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.member_progress).map(([id, p]) => {
                      const rate = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                      return (
                        <tr key={id} className="border-b last:border-0">
                          <td className="py-2 pr-4 font-medium">{id === "unassigned" ? "Unassigned" : id.substring(0, 8)}</td>
                          <td className="py-2 pr-4 text-center">{p.total}</td>
                          <td className="py-2 pr-4 text-center text-green-600">{p.done}</td>
                          <td className="py-2 pr-4 text-center text-blue-600">{p.in_progress}</td>
                          <td className="py-2 pr-4 text-center text-red-600">{p.blocked}</td>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${rate >= 70 ? "bg-green-500" : rate >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${rate}%` }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground">{rate}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "blocked" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Blocked Tasks ({data.blocked_tasks.length})</CardTitle></CardHeader>
            <CardContent>
              {data.blocked_tasks.length === 0 ? (
                <p className="text-sm text-green-600">No blocked tasks.</p>
              ) : (
                <div className="space-y-2">
                  {data.blocked_tasks.map((t) => (
                    <div key={t.id} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/20">
                      <span className="text-sm font-medium">{t.public_id}</span>
                      <p className="text-xs text-muted-foreground">{t.title}</p>
                      {t.blocked_reason && (
                        <p className="mt-1 text-xs text-red-700 dark:text-red-400">{t.blocked_reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">SLA At Risk ({data.sla_at_risk.length})</CardTitle></CardHeader>
            <CardContent>
              {data.sla_at_risk.length === 0 ? (
                <p className="text-sm text-green-600">All tasks on track.</p>
              ) : (
                <div className="space-y-2">
                  {data.sla_at_risk.map((t) => (
                    <div key={t.id} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/20">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{t.public_id}</span>
                        <span className="text-xs text-amber-700 dark:text-amber-400">
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
        </div>
      )}

      {tab === "demands" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Active Demands</CardTitle></CardHeader>
          <CardContent>
            {data.active_demands.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active demands.</p>
            ) : (
              <div className="space-y-3">
                {data.active_demands.map((d) => {
                  const progress = d.task_count > 0 ? Math.round((d.tasks_done / d.task_count) * 100) : 0;
                  return (
                    <Link
                      key={d.id}
                      to={`/demand/${d.public_id}/plan`}
                      className="block rounded-md border px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{d.public_id}</span>
                        <span className="text-xs capitalize text-muted-foreground">{d.stage}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mb-2">{d.raw_text}</p>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {d.tasks_done}/{d.task_count} tasks ({progress}%)
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
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

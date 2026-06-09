import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";
import TaskBoard from "../../components/delivery/TaskBoard";
import type { Demand, TaskItem } from "../../types";

export default function DeliveryTeamDashboard() {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/demands").then((r) => r.json()).then((d) => (Array.isArray(d) ? d : d.items ?? [])),
      fetch("/api/tasks").then((r) => r.json()).then((t) => (Array.isArray(t) ? t : t.items ?? [])),
    ])
      .then(([d, t]) => {
        setDemands(d);
        setTasks(t);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading squad view...</div>;

  const active = demands.filter((d) => ["executing", "monitoring", "explaining"].includes(d.stage));
  const done = tasks.filter((t) => t.status === "Done").length;
  const throughput = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Delivery Squad</h1>
      <PersonaHeader role="delivery_team" />

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="Active Demands" value={active.length} />
        <Kpi label="Tasks In Flight" value={tasks.filter((t) => t.status !== "Done").length} />
        <Kpi label="Throughput" value={`${throughput}%`} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Squad Task Board</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <TaskBoard tasks={tasks} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Active Demands ({active.length})</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active demands assigned.</p>
          ) : (
            active.map((d) => (
              <a key={d.id} href={`/demand/${d.public_id}/delivery`} className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/50">
                <span className="text-sm font-medium">{d.public_id}</span>
                <span className="truncate text-xs text-muted-foreground max-w-[320px]">{d.raw_text}</span>
              </a>
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

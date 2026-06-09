import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";
import TaskCard from "../../components/delivery/TaskCard";
import type { TaskItem } from "../../types";

interface CommitItem {
  id: string;
  sha: string;
  author: string;
  message: string;
  files_changed: number;
  branch: string;
  is_agent: boolean;
  created_at?: string | null;
}

export default function ContributorDashboard() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((t) => (Array.isArray(t) ? t : t.items ?? []))
      .then(async (ts: TaskItem[]) => {
        setTasks(ts);
        // Gather commits across the demands this contributor has tasks on.
        const demandIds = Array.from(new Set(ts.map((t) => t.demand_id))).slice(0, 5);
        const all: CommitItem[] = [];
        for (const did of demandIds) {
          try {
            const res = await fetch(`/api/demands/${did}/commits`).then((r) => r.json());
            if (res?.items) all.push(...res.items);
          } catch {
            // best-effort
          }
        }
        setCommits(all);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading contributions...</div>;

  const open = tasks.filter((t) => t.status !== "Done");

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Contributions</h1>
      <PersonaHeader role="contributor" />

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi label="Open Tasks" value={open.length} />
        <Kpi label="Completed" value={tasks.filter((t) => t.status === "Done").length} />
        <Kpi label="Commits" value={commits.length} />
      </div>

      <h2 className="text-lg font-semibold">Open Tasks</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {open.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">No open tasks.</p>
        ) : (
          open.map((t) => <TaskCard key={t.id} task={t} />)
        )}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recent Commits ({commits.length})</CardTitle></CardHeader>
        <CardContent>
          {commits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commits recorded yet.</p>
          ) : (
            <div className="space-y-2" data-testid="contributor-commits">
              {commits.slice(0, 10).map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{c.sha.slice(0, 7)}</code>
                      <span className="truncate text-sm font-medium">{c.message}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{c.author} · {c.files_changed} file(s) · {c.branch}</p>
                  </div>
                </div>
              ))}
            </div>
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

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { PersonaHeader } from "../../components/shell/PersonaHeader";
import TaskCard from "../../components/delivery/TaskCard";
import type { TaskItem } from "../../types";

export default function MemberDashboard() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const openTasks = tasks.filter((t) => t.status !== "Done");
  const doneTasks = tasks.filter((t) => t.status === "Done");

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading tasks...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">My Work</h1>
      <PersonaHeader role="member" />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Open</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{openTasks.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Completed</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{doneTasks.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Blocked</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{tasks.filter((t) => t.status === "Blocked").length}</div></CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-semibold">Open Tasks</h2>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {openTasks.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground">No open tasks</p>
        ) : (
          openTasks.map((t) => <TaskCard key={t.id} task={t} />)
        )}
      </div>

      {doneTasks.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">Recently Completed</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {doneTasks.slice(0, 6).map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useSession } from "../hooks/useSession";
import { roleMeta, topRole } from "../lib/roles";
import type { Demand, TaskItem } from "../types";

export default function ProfileRoute() {
  const session = useSession();
  const role = topRole(session);
  const meta = roleMeta(role);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [demands, setDemands] = useState<Demand[]>([]);

  const showTasks = ["member", "contributor", "leader", "delivery_team"].includes(role);
  const showDemands = ["manager", "higher_manager", "executive", "middleware"].includes(role);

  useEffect(() => {
    if (showTasks) {
      fetch("/api/tasks")
        .then((r) => r.json())
        .then((t) => setTasks(Array.isArray(t) ? t : t.items ?? []))
        .catch(() => undefined);
    }
    if (showDemands) {
      fetch("/api/demands")
        .then((r) => r.json())
        .then((d) => setDemands(Array.isArray(d) ? d : d.items ?? []))
        .catch(() => undefined);
    }
  }, [showTasks, showDemands]);

  if (!session) {
    return <div className="p-6 text-muted-foreground">Not signed in.</div>;
  }

  const initials = session.name.split(" ").map((p) => p[0]).join("").slice(0, 2);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-6">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-xl font-bold text-accent-fg">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold text-fg-strong">{session.name}</div>
            <div className="text-sm text-fg-muted">{session.email}</div>
            <div className="text-sm text-fg-muted">{session.company}</div>
          </div>
          <div className="ml-auto text-right">
            <Badge variant="outline" className="uppercase tracking-wide" data-testid="profile-role">
              {meta.label}
            </Badge>
            <div className="mt-1 text-xs text-fg-muted">Hierarchy level {meta.hierarchy}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Role</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-fg-muted">{meta.description}</p>
            {session.roles.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {session.roles.map((r) => (
                  <Badge key={r} variant="secondary">{roleMeta(r).label}</Badge>
                ))}
              </div>
            )}
            <Link to={meta.landing} className="inline-block pt-2 text-sm font-medium text-accent hover:underline">
              Go to my workspace →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Capabilities</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {meta.capabilities.map((c) => (
                <li key={c} className="flex items-center gap-2 text-fg">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {c}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {showTasks && (
        <Card>
          <CardHeader><CardTitle className="text-base">My Tasks ({tasks.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks assigned.</p>
            ) : (
              tasks.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="truncate">{t.title}</span>
                  <Badge variant="secondary">{t.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {showDemands && (
        <Card>
          <CardHeader><CardTitle className="text-base">Demands In View ({demands.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {demands.length === 0 ? (
              <p className="text-sm text-muted-foreground">No demands.</p>
            ) : (
              demands.slice(0, 8).map((d) => (
                <Link key={d.id} to={`/demand/${d.public_id}/plan`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50">
                  <span className="font-medium">{d.public_id}</span>
                  <Badge variant="secondary">{d.stage}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

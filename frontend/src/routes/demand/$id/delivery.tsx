import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import ActivityTimeline from "../../../components/delivery/ActivityTimeline";
import TaskBoard from "../../../components/delivery/TaskBoard";
import SwonBadge from "../../../components/delivery/SwonBadge";
import WonBadge from "../../../components/delivery/WonBadge";
import { forgeApi, type CommitItem } from "../../../services/forgeApi";
import type { AuditEventItem, Demand, SwonRecord, TaskItem, WonRecord } from "../../../types";

type DeliveryTab = "overview" | "tasks" | "swon" | "commits" | "timeline";

export default function DemandDeliveryRoute() {
  const { id } = useParams<{ id: string }>();
  const [demand, setDemand] = useState<Demand | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [swon, setSwon] = useState<SwonRecord | null>(null);
  const [wons, setWons] = useState<WonRecord[]>([]);
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [commits, setCommits] = useState<CommitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DeliveryTab>("overview");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    fetch(`/api/demands/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setDemand(d);
        const did = d.id;

        const fetches = [
          fetch(`/api/tasks?demand_id=${did}`).then((r) => r.json()).then(setTasks),
          fetch(`/api/audit?entity_kind=demand&entity_id=${did}&limit=100`)
            .then((r) => r.json())
            .then((data) => setEvents(data.items ?? data)),
        ];

        forgeApi.listCommits(d.public_id).then((res) => setCommits(res.items)).catch(() => undefined);

        fetch("/api/swon").then((r) => r.json()).then((swons: SwonRecord[]) => {
          const match = swons.find((s) => s.demand_id === did);
          if (match) {
            setSwon(match);
            fetch(`/api/won?swon_id=${match.id}`).then((r) => r.json()).then(setWons);
          }
        });

        return Promise.all(fetches);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  async function shareLink() {
    if (!demand || !shareEmail.trim()) return;
    setSharing(true);
    try {
      const res = await forgeApi.shareLiveLink(demand.public_id, { client_email: shareEmail.trim() });
      toast.success(`Live link sent to ${res.email.to}`);
      setShareOpen(false);
      setShareEmail("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to share link");
    } finally {
      setSharing(false);
    }
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading delivery details...</div>;
  if (!demand) return <div className="p-6 text-destructive">Demand not found.</div>;

  const stageIndex = [
    "ingested", "understanding", "deciding", "allocating",
    "awaiting_approval", "executing", "monitoring", "explaining", "completed",
  ].indexOf(demand.stage);

  const tasksDone = tasks.filter((t) => t.status === "Done").length;
  const taskProgress = tasks.length > 0 ? Math.round((tasksDone / tasks.length) * 100) : 0;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{demand.public_id}</h1>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium capitalize text-primary">
              {demand.stage.replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground truncate max-w-[600px]">{demand.raw_text}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="share-live-link"
            onClick={() => setShareOpen(true)}
            className="rounded-md border border-hairline px-4 py-2 text-sm font-medium hover:bg-surface-2"
          >
            Share live link
          </button>
          <Link to={`/demand/${id}/plan`} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            View Plan
          </Link>
        </div>
      </div>

      {shareOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setShareOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-hairline bg-canvas p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-fg-strong">Share live progress link</h3>
            <p className="mt-1 text-sm text-fg-muted">Email the client a link to follow {demand.public_id} live.</p>
            <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="client@company.com"
              data-testid="share-email-input"
              className="mt-3 w-full rounded-md border border-hairline bg-surface-1 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShareOpen(false)} className="rounded-md border border-hairline px-3 py-1.5 text-sm">
                Cancel
              </button>
              <button
                type="button"
                disabled={!shareEmail.trim() || sharing}
                onClick={() => void shareLink()}
                data-testid="share-send"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {sharing ? "Sending..." : "Send link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pipeline progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Delivery Pipeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1">
            {["Ingested", "Understanding", "Deciding", "Allocating", "Approval", "Executing", "Monitoring", "Explaining", "Completed"].map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-2 rounded-full ${i <= stageIndex ? "bg-primary" : "bg-muted"}`} />
                <p className="mt-1 text-[10px] text-center text-muted-foreground">{s}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tasks</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{tasks.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Task Completion</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{taskProgress}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">SWON</CardTitle></CardHeader>
          <CardContent>{swon ? <SwonBadge publicId={swon.public_id} state={swon.lifecycle_state} /> : <span className="text-sm text-muted-foreground">None</span>}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">WON Records</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{wons.length}</div></CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["overview", "tasks", "swon", "commits", "timeline"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "swon" ? "SWON / WON" : t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {demand.understanding && (
            <Card>
              <CardHeader><CardTitle className="text-base">Understanding</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Problem Type" value={demand.understanding.problem_type} />
                <Row label="Domain" value={demand.understanding.domain} />
                <Row label="Complexity" value={demand.understanding.complexity} />
                <Row label="Urgency" value={demand.understanding.urgency} />
                <Row label="Scope" value={`${demand.understanding.estimated_scope_days} days`} />
                <p className="text-muted-foreground">{demand.understanding.summary}</p>
              </CardContent>
            </Card>
          )}
          {demand.decision && (
            <Card>
              <CardHeader><CardTitle className="text-base">Decision</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Execution Mode" value={demand.decision.execution_mode} />
                <Row label="Project Type" value={demand.decision.project_type} />
                <Row label="Confidence" value={`${(demand.decision.confidence_score * 100).toFixed(0)}%`} />
                <Row label="Est. Cost" value={`$${demand.decision.estimated_cost_usd.toLocaleString()}`} />
                <Row label="Est. Time" value={`${demand.decision.estimated_time_days} days`} />
                {demand.decision.risk_factors.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs font-medium text-muted-foreground">Risks:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {demand.decision.risk_factors.map((r: string) => (
                        <span key={r} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600 dark:bg-red-950/30 dark:text-red-400">{r}</span>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {demand.allocation && (
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base">Resource Allocation</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">Name</th>
                        <th className="pb-2 pr-3 font-medium">Role</th>
                        <th className="pb-2 pr-3 font-medium">Allocation</th>
                        <th className="pb-2 pr-3 font-medium">Skills</th>
                      </tr>
                    </thead>
                    <tbody>
                      {demand.allocation.team.map((m: { name: string; title?: string | null; resource_type: string; allocation_percentage: number; skills: string[] }) => (
                        <tr key={m.name} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-medium">{m.name}</td>
                          <td className="py-2 pr-3">{m.title || m.resource_type}</td>
                          <td className="py-2 pr-3">{m.allocation_percentage}%</td>
                          <td className="py-2 pr-3 text-muted-foreground">{m.skills.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="overflow-x-auto">
          <TaskBoard tasks={tasks} />
        </div>
      )}

      {tab === "swon" && (
        <div className="space-y-4">
          {swon ? (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">SWON: {swon.public_id}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Row label="State" value={swon.lifecycle_state} />
                  <Row label="LOA Ref" value={swon.customer_loa_ref || "—"} />
                  <Row label="SOW Summary" value={swon.sow_summary || "—"} />
                  <Row label="Total Value" value={`${swon.billing_currency} ${(swon.total_value_inr || 0).toLocaleString()}`} />
                  <Row label="Opened" value={swon.opened_at ? new Date(swon.opened_at).toLocaleDateString() : "—"} />
                  <Row label="Closed" value={swon.closed_at ? new Date(swon.closed_at).toLocaleDateString() : "—"} />
                </CardContent>
              </Card>
              {wons.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">WON Records ({wons.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {wons.map((w) => (
                        <div key={w.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                          <WonBadge publicId={w.public_id} state={w.state} billable={w.billable} />
                          <span className="text-sm text-muted-foreground">
                            {w.allocation_pct}% alloc · INR {(w.monthly_value_inr || 0).toLocaleString()}/mo
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No SWON associated with this demand.</p>
          )}
        </div>
      )}

      {tab === "commits" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Commit History ({commits.length})</CardTitle></CardHeader>
          <CardContent>
            {commits.length === 0 ? (
              <p className="text-sm text-muted-foreground">No commits recorded yet. Commits appear here as agents scaffold and the team pushes changes.</p>
            ) : (
              <div className="space-y-2" data-testid="commit-list">
                {commits.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 rounded-md border px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{c.sha.slice(0, 7)}</code>
                        <span className="truncate text-sm font-medium">{c.message}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.author} · {c.files_changed} file(s) · {c.branch}
                        {c.is_agent ? " · AI agent" : ""}
                      </p>
                    </div>
                    {c.created_at && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "timeline" && (
        <Card>
          <CardHeader><CardTitle className="text-base">Activity Timeline</CardTitle></CardHeader>
          <CardContent>
            <ActivityTimeline events={events} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock3, Inbox, Plus, Search, Workflow } from "lucide-react";
import { DemandCard } from "../../components/demand/DemandCard";
import { useShell } from "../../components/shell/ShellContext";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../lib/cn";
import { forgeApi } from "../../services/forgeApi";
import type { Demand, DemandStage } from "../../types";
import type { PlanShape } from "../../components/demand/PlanCard";
import { Filters } from "./Filters";

const ACTION_STAGES = new Set<DemandStage>(["awaiting_approval", "failed"]);
const ACTIVE_STAGES = new Set<DemandStage>([
  "ingested",
  "understanding",
  "deciding",
  "allocating",
  "executing",
  "monitoring",
  "explaining",
]);
const DONE_STAGES = new Set<DemandStage>(["completed", "cancelled"]);

function isActionNeeded(demand: Demand) {
  return ACTION_STAGES.has(demand.stage);
}

function isActive(demand: Demand) {
  return ACTIVE_STAGES.has(demand.stage);
}

function isDone(demand: Demand) {
  return DONE_STAGES.has(demand.stage);
}

function isHighPriority(demand: Demand) {
  return demand.understanding?.urgency === "high";
}

function matchesSearch(demand: Demand, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    demand.public_id,
    demand.raw_text,
    demand.stage,
    demand.understanding?.domain,
    demand.understanding?.problem_type,
    demand.understanding?.urgency,
    demand.decision?.project_type,
    demand.decision?.execution_mode,
  ].filter(Boolean).join(" ").toLowerCase().includes(q);
}

function filterDemands(demands: Demand[], filter: string, query: string) {
  return demands
    .filter((demand) => matchesSearch(demand, query))
    .filter((demand) => {
      if (filter === "Action needed") return isActionNeeded(demand);
      if (filter === "Active") return isActive(demand) || demand.stage === "awaiting_approval";
      if (filter === "High priority") return isHighPriority(demand);
      if (filter === "Completed") return demand.stage === "completed";
      if (filter === "Failed") return demand.stage === "failed";
      return true;
    })
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

function demandStats(demands: Demand[]) {
  return {
    action: demands.filter(isActionNeeded).length,
    active: demands.filter((demand) => isActive(demand) || demand.stage === "awaiting_approval").length,
    completed: demands.filter((demand) => demand.stage === "completed").length,
    failed: demands.filter((demand) => demand.stage === "failed").length,
  };
}

export default function DemandsRoute() {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const { events } = useShell();

  useEffect(() => {
    setLoading(true);
    forgeApi.listDemands()
      .then((rows) => {
        setDemands(mergeLocalDemands(rows));
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load demands");
        setDemands(readLocalDemands());
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const latest = events[events.length - 1];
    if (!latest || latest.type !== "pipeline.stage" || !latest.demand_id || !latest.stage) return;
    setDemands((prev) => prev.map((demand) => (
      demand.public_id === latest.demand_id ? { ...demand, stage: latest.stage as DemandStage } : demand
    )));
  }, [events]);

  const visible = useMemo(() => filterDemands(demands, filter, query), [demands, filter, query]);
  const stats = useMemo(() => demandStats(demands), [demands]);
  const grouped = useMemo(() => [
    {
      key: "action",
      title: "Action needed",
      description: "Approvals, failed runs, and items that need a manager decision.",
      rows: visible.filter(isActionNeeded),
      tone: "accent",
    },
    {
      key: "active",
      title: "In progress",
      description: "Planning, execution, monitoring, and explanation work currently moving.",
      rows: visible.filter((demand) => !isActionNeeded(demand) && isActive(demand)),
      tone: "neutral",
    },
    {
      key: "completed",
      title: "Recently completed",
      description: "Finished or closed demands kept for reference.",
      rows: visible.filter(isDone),
      tone: "success",
    },
  ], [visible]);

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Demands</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg-strong">Demand review</h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-fg-muted">
            Read client requests, see what needs action, and open the plan when a demand is ready to review.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/requests">
              <Inbox className="h-4 w-4" />
              Client requests
            </Link>
          </Button>
          <Button asChild variant="primary">
            <Link to="/demand/new">
              <Plus className="h-4 w-4" />
              New demand
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={AlertTriangle} label="Action needed" value={stats.action} tone="accent" />
        <StatCard icon={Workflow} label="Active work" value={stats.active} tone="neutral" />
        <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} tone="success" />
        <StatCard icon={Clock3} label="Failed" value={stats.failed} tone="danger" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-fg-muted" />
            <Input
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search demand, ID, domain, priority, stage"
            />
          </div>
          <Filters active={filter} onChange={setFilter} />
          <select
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
            onChange={(e) => {
              const val = e.target.value;
              setDemands((prev) => [...prev].sort((a, b) => {
                if (val === "newest") return String(b.created_at || "").localeCompare(String(a.created_at || ""));
                if (val === "oldest") return String(a.created_at || "").localeCompare(String(b.created_at || ""));
                if (val === "stage") return (a.stage || "").localeCompare(b.stage || "");
                return 0;
              }));
            }}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="stage">By stage</option>
          </select>
          <div className="text-sm text-fg-muted">
            <span className="font-mono text-fg">{visible.length}</span> shown
          </div>
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <LoadingRows />
      ) : visible.length === 0 ? (
        <EmptyDemands query={query} filter={filter} />
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            group.rows.length ? (
              <DemandSection
                key={group.key}
                title={group.title}
                description={group.description}
                count={group.rows.length}
                tone={group.tone}
                rows={group.rows}
              />
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}

function DemandSection({
  title,
  description,
  count,
  tone,
  rows,
}: {
  title: string;
  description: string;
  count: number;
  tone: string;
  rows: Demand[];
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface-1 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-fg-strong">{title}</h2>
          <p className="mt-1 text-sm text-fg-muted">{description}</p>
        </div>
        <Badge className={cn(
          tone === "accent" && "border-accent/30 text-accent",
          tone === "success" && "border-success/30 text-success",
        )}>
          {count} demands
        </Badge>
      </div>
      <div className="space-y-3">
        {rows.map((demand) => <DemandCard key={demand.id} demand={demand} />)}
      </div>
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof AlertTriangle;
  label: string;
  value: number;
  tone: "accent" | "neutral" | "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-fg-muted">{label}</div>
        <Icon className={cn(
          "h-4 w-4",
          tone === "accent" && "text-accent",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "neutral" && "text-fg-muted",
        )} />
      </div>
      <div className="mt-3 font-mono text-3xl font-semibold text-fg-strong">{value}</div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-xl border border-hairline bg-surface-1 p-4">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
          <Skeleton className="mt-4 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-4/5" />
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-7 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyDemands({ query, filter }: { query: string; filter: string }) {
  const filtered = Boolean(query.trim()) || filter !== "All";
  return (
    <div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-hairline bg-surface-1 p-8 text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-hairline bg-surface-2">
          <Inbox className="h-7 w-7 text-accent" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-fg-strong">
          {filtered ? "No matching demands" : "No demands need review yet"}
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          {filtered ? "Try a different search or clear the active filter." : "New client and manager demands will appear here."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild variant="primary"><Link to="/demand/new">New demand</Link></Button>
          <Button asChild variant="secondary"><Link to="/requests">Client requests</Link></Button>
        </div>
      </div>
    </div>
  );
}

function mergeLocalDemands(rows: Demand[]) {
  const local = readLocalDemands();
  const seen = new Set(rows.map((demand) => demand.public_id));
  return [...local.filter((demand) => !seen.has(demand.public_id)), ...rows];
}

function readLocalDemands(): Demand[] {
  const demands: Demand[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith("forgeos.localDemand.")) continue;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || "") as { plan: PlanShape; rawText?: string; savedAt?: string };
      demands.push({
        id: parsed.plan.publicId,
        public_id: parsed.plan.publicId,
        stage: "awaiting_approval",
        raw_text: parsed.rawText || parsed.plan.understanding.summary,
        understanding: parsed.plan.understanding,
        decision: parsed.plan.decision,
        allocation: parsed.plan.allocation,
        similar_projects: { matches: [] },
        reuse_score: parsed.plan.reuseScore,
        created_at: parsed.savedAt || new Date().toISOString(),
      });
    } catch {
      // Ignore stale local drafts.
    }
  }
  return demands.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

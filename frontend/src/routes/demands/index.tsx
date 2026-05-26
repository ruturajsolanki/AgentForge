import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { DemandCard } from "../../components/demand/DemandCard";
import { STAGE_LABELS } from "../../components/demand/StageChip";
import { useShell } from "../../components/shell/ShellContext";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { forgeApi } from "../../services/forgeApi";
import type { Demand, DemandStage } from "../../types";
import { Filters } from "./Filters";

const STAGES: DemandStage[] = [
  "ingested",
  "understanding",
  "deciding",
  "allocating",
  "awaiting_approval",
  "executing",
  "monitoring",
  "explaining",
  "completed",
  "failed",
];

function estimateTokens(demands: Demand[]) {
  return demands.reduce((sum, demand) => sum + Math.max(120, Math.round(demand.raw_text.length / 4)), 0);
}

function filterDemands(demands: Demand[], filter: string) {
  if (filter === "High") return demands.filter((demand) => demand.understanding?.urgency === "high");
  if (filter === "Active") return demands.filter((demand) => !["completed", "failed", "cancelled"].includes(demand.stage));
  if (filter === "Completed") return demands.filter((demand) => demand.stage === "completed");
  return demands;
}

export default function DemandsRoute() {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const { events } = useShell();

  useEffect(() => {
    setLoading(true);
    forgeApi.listDemands()
      .then((rows) => {
        setDemands(rows);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load demands");
        setDemands([]);
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

  const visible = useMemo(() => filterDemands(demands, filter), [demands, filter]);
  const columns = useMemo(() => {
    const grouped = new Map<DemandStage, Demand[]>();
    for (const stage of STAGES) grouped.set(stage, []);
    for (const demand of visible) {
      const list = grouped.get(demand.stage) || grouped.get("ingested")!;
      list.push(demand);
    }
    return grouped;
  }, [visible]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Demands</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg-strong">Agentic operations board</h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-fg-muted">Every AI demand is tracked by pipeline stage, live agent activity, and approval state.</p>
        </div>
        <Button asChild variant="primary"><Link to="/demand/new"><Plus /> New demand</Link></Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filters active={filter} onChange={setFilter} />
        <div className="text-sm text-fg-muted"><span className="font-mono text-fg">{visible.length}</span> demands · <span className="font-mono text-fg">{estimateTokens(visible).toLocaleString()}</span> est. tokens</div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="grid gap-3 overflow-x-auto pb-3 xl:grid-cols-5">
          {STAGES.slice(0, 5).map((stage) => (
            <div key={stage} className="min-w-72 rounded-xl border border-hairline bg-surface-1 p-3">
              <Skeleton className="h-4 w-28" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-32" />)}
              </div>
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="grid min-h-[420px] place-items-center rounded-xl border border-dashed border-hairline bg-surface-1 p-8 text-center">
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-hairline bg-surface-2">
              <span className="font-mono text-2xl text-accent">F</span>
            </div>
            <h2 className="mt-5 text-xl font-semibold text-fg-strong">The forge is cold</h2>
            <p className="mt-2 text-sm text-fg-muted">Start a demand to see it ship.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {["Build a sales dashboard", "Automate claims intake", "Create a portfolio"].map((seed) => (
                <Button key={seed} asChild variant="secondary" size="sm">
                  <Link to={`/demand/new?seed=${encodeURIComponent(seed)}`}>{seed}</Link>
                </Button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 overflow-x-auto pb-3 xl:grid-cols-5">
          {STAGES.map((stage) => {
            const rows = columns.get(stage) || [];
            return (
              <section key={stage} className="min-w-72 rounded-xl border border-hairline bg-surface-1 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-muted">{STAGE_LABELS[stage]}</div>
                    <div className="mt-1 text-xs text-fg-faint">{estimateTokens(rows).toLocaleString()} tokens</div>
                  </div>
                  <span className="grid h-7 min-w-7 place-items-center rounded-full border border-hairline bg-surface-2 px-2 text-xs font-medium text-fg">{rows.length}</span>
                </div>
                <div className="mt-3 space-y-3">
                  {rows.map((demand) => <DemandCard key={demand.id} demand={demand} />)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

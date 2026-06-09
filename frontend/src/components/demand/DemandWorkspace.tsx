import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Activity, Code2, Eye, FileText, Network, Package, Terminal, UserRound } from "lucide-react";
import { forgeApi } from "../../services/forgeApi";
import type { Demand } from "../../types";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import type { PlanShape } from "./PlanCard";

type WorkspaceTab = "plan" | "agents" | "files" | "preview" | "terminal" | "activity" | "delivery";

interface DemandResource {
  demand: Demand | null;
  plan: PlanShape | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const tabs: Array<{ id: WorkspaceTab; label: string; icon: ComponentType<{ className?: string }> }> = [
  { id: "plan", label: "Plan", icon: FileText },
  { id: "agents", label: "Agents", icon: Network },
  { id: "files", label: "Files", icon: Code2 },
  { id: "preview", label: "Preview", icon: Eye },
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "delivery", label: "Delivery", icon: Package },
];

export function DemandWorkspace({
  publicId,
  active,
  children,
}: {
  publicId: string;
  active: WorkspaceTab;
  children: (resource: DemandResource) => ReactNode;
}) {
  const resource = useDemandResource(publicId);
  const title = resource.demand?.raw_text || resource.plan?.understanding.summary || publicId;

  return (
    <div className="min-h-full">
      <div className="border-b border-hairline bg-canvas/95 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-fg-muted">{publicId}</span>
              <span className="text-xs text-fg-faint">{resource.demand?.created_at ? age(resource.demand.created_at) : "draft"}</span>
            </div>
            <h1 className="mt-2 max-w-4xl truncate text-2xl font-semibold tracking-[-0.02em] text-fg-strong">
              {title.slice(0, 96)}
            </h1>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-1 px-2.5 py-1 text-xs text-fg-muted">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-surface-2 text-fg">
                <UserRound className="h-3.5 w-3.5" />
              </span>
              Manager review
            </div>
          </div>
          <Button asChild variant={active === "plan" ? "primary" : "secondary"}>
            <Link to={`/demand/${publicId}/${active === "plan" ? "files" : "plan"}`}>
              {active === "plan" ? "Open IDE" : "Open plan"}
            </Link>
          </Button>
        </div>
        <nav className="mt-5 flex gap-1 overflow-x-auto" aria-label="Demand workspace">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = active === tab.id;
            return (
              <Link
                key={tab.id}
                to={`/demand/${publicId}/${tab.id}`}
                className={cn(
                  "relative inline-flex h-10 shrink-0 items-center gap-2 px-3 text-sm text-fg-muted transition hover:text-fg-strong",
                  selected && "text-fg-strong",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {selected && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />}
              </Link>
            );
          })}
        </nav>
      </div>
      {resource.loading ? (
        <div className="grid gap-4 p-4 sm:p-6">
          <Skeleton className="h-28" />
          <Skeleton className="h-80" />
        </div>
      ) : (
        children(resource)
      )}
    </div>
  );
}

function useDemandResource(publicId: string): DemandResource {
  const [demand, setDemand] = useState<Demand | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    forgeApi.getDemand(publicId)
      .then((result) => {
        if (cancelled) return;
        setDemand(result);
      })
      .catch((err) => {
        if (cancelled) return;
        const local = readLocalDemand(publicId);
        if (local) {
          setDemand(local);
          setError(null);
        } else {
          setDemand(null);
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [publicId, version]);

  const plan = useMemo(() => demandToPlan(demand), [demand]);

  return {
    demand,
    plan,
    loading,
    error,
    refresh: () => setVersion((value) => value + 1),
  };
}

function demandToPlan(demand: Demand | null): PlanShape | null {
  if (!demand?.understanding || !demand.decision || !demand.allocation) return null;
  return {
    publicId: demand.public_id,
    understanding: demand.understanding,
    decision: demand.decision,
    allocation: demand.allocation,
    reuseScore: demand.reuse_score,
  };
}

function readLocalDemand(publicId: string): Demand | null {
  try {
    const raw = window.localStorage.getItem(`forgeos.localDemand.${publicId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { plan: PlanShape; rawText?: string; savedAt?: string };
    return {
      id: publicId,
      public_id: parsed.plan.publicId,
      stage: "awaiting_approval",
      raw_text: parsed.rawText || parsed.plan.understanding.summary,
      understanding: parsed.plan.understanding,
      decision: parsed.plan.decision,
      allocation: parsed.plan.allocation,
      reuse_score: parsed.plan.reuseScore,
      similar_projects: { matches: [] },
      created_at: parsed.savedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function age(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

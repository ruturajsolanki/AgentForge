import { Link } from "react-router-dom";
import { ArrowRight, Bot, CalendarClock, DollarSign, UsersRound } from "lucide-react";
import type { Demand } from "../../types";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { StageChip } from "./StageChip";

function age(value?: string | null) {
  if (!value) return "new";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function formatLabel(value?: string | null) {
  return value ? value.replace(/_/g, " ") : "Not classified";
}

function urgencyClass(urgency?: string | null) {
  if (urgency === "high") return "border-danger/30 bg-danger/10 text-danger";
  if (urgency === "low") return "border-hairline bg-surface-2 text-fg-muted";
  return "border-accent/30 bg-accent-soft text-accent";
}

function estimateCost(demand: Demand) {
  if (!demand.decision || !demand.allocation) return null;
  return Math.round(demand.decision.estimated_cost_usd || demand.allocation.total_daily_cost * demand.decision.estimated_time_days);
}

function nextAction(demand: Demand) {
  if (demand.stage === "awaiting_approval") return "Review and approve";
  if (demand.stage === "failed") return "Needs attention";
  if (["executing", "monitoring", "explaining"].includes(demand.stage)) return "Track delivery";
  if (demand.stage === "completed") return "View delivery";
  return "Open plan";
}

function actionLink(demand: Demand) {
  if (["executing", "monitoring", "explaining", "completed"].includes(demand.stage)) {
    return `/demand/${demand.public_id}/delivery`;
  }
  return `/demand/${demand.public_id}/plan`;
}

export function DemandCard({ demand }: { demand: Demand }) {
  const urgency = demand.understanding?.urgency;
  const cost = estimateCost(demand);
  const teamCount = demand.allocation?.team?.length || 0;
  const eta = demand.decision?.estimated_time_days || demand.understanding?.estimated_scope_days || null;
  const problem = demand.understanding?.problem_type || demand.decision?.project_type;
  const domain = demand.understanding?.domain;
  const isAttention = demand.stage === "awaiting_approval" || demand.stage === "failed";

  return (
    <article
      className={cn(
        "rounded-xl border bg-surface-1 p-4 transition hover:border-hairline-hi hover:bg-surface-2",
        isAttention ? "border-accent/35" : "border-hairline",
      )}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-muted">{demand.public_id}</span>
            <StageChip stage={demand.stage} />
            {urgency && <Badge className={cn("capitalize", urgencyClass(urgency))}>{urgency} priority</Badge>}
            {domain && <Badge>{formatLabel(domain)}</Badge>}
            {problem && <Badge>{formatLabel(problem)}</Badge>}
          </div>

          <Link to={`/demand/${demand.public_id}/plan`} className="group mt-3 block">
            <p className="line-clamp-4 whitespace-pre-wrap text-base leading-7 text-fg-strong group-hover:text-accent">
              {demand.raw_text}
            </p>
          </Link>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {age(demand.created_at)}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-1">
              <UsersRound className="h-3.5 w-3.5" />
              {teamCount || "No"} resources
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-surface-2 px-2 py-1">
              <Bot className="h-3.5 w-3.5" />
              {demand.decision ? formatLabel(demand.decision.execution_mode) : "Planning"}
            </span>
          </div>
        </div>

        <div className="grid content-between gap-3 rounded-lg border border-hairline bg-canvas p-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="ETA" value={eta ? `${eta}d` : "Pending"} />
            <MiniMetric label="Estimate" value={cost ? `$${cost.toLocaleString()}` : "Pending"} />
          </div>
          <Button asChild variant={isAttention ? "primary" : "secondary"} className="w-full">
            <Link to={actionLink(demand)}>
              {nextAction(demand)}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-hairline bg-surface-1 p-2">
      <div className="flex items-center gap-1 text-[11px] text-fg-muted">
        {label === "Estimate" && <DollarSign className="h-3 w-3" />}
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-fg-strong">{value}</div>
    </div>
  );
}

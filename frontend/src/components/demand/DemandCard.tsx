import { Link } from "react-router-dom";
import { Bot, Coins } from "lucide-react";
import type { Demand } from "../../types";
import { cn } from "../../lib/cn";
import { Badge } from "../ui/badge";
import { StageChip } from "./StageChip";

function age(value?: string | null) {
  if (!value) return "new";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function priority(demand: Demand) {
  const urgency = demand.understanding?.urgency;
  return urgency === "high" || urgency === "low" ? urgency : null;
}

function tokenEstimate(demand: Demand) {
  return Math.max(120, Math.round((demand.raw_text.length + JSON.stringify(demand.decision || {}).length) / 4));
}

export function DemandCard({ demand }: { demand: Demand }) {
  const p = priority(demand);
  return (
    <Link
      to={`/demand/${demand.public_id}/plan`}
      className="group relative block rounded-xl border border-hairline bg-surface-1 p-3 transition duration-150 hover:-translate-y-px hover:border-hairline-hi hover:bg-surface-2"
    >
      <span className="absolute inset-y-3 left-0 w-0.5 rounded-full bg-accent opacity-0 transition group-hover:opacity-100" />
      <div className="flex items-center justify-between gap-3 text-xs text-fg-muted">
        <span className="font-mono text-fg">{demand.public_id}</span>
        <span>{age(demand.created_at)}</span>
        {p && <Badge className={cn("ml-auto capitalize", p === "high" ? "border-danger/30 text-danger" : "border-hairline text-fg-muted")}>{p}</Badge>}
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 text-sm leading-5 text-fg-strong">{demand.raw_text}</p>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex -space-x-2">
          {(demand.allocation?.team || []).slice(0, 3).map((resource) => (
            <span key={resource.name} className="grid h-6 w-6 place-items-center rounded-full border border-surface-1 bg-surface-2 text-[10px] text-fg-muted" title={resource.name}>
              <Bot className="h-3 w-3" />
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <Coins className="h-3.5 w-3.5" />
          <span className="font-mono">{tokenEstimate(demand).toLocaleString()}</span>
        </div>
        <StageChip stage={demand.stage} />
      </div>
    </Link>
  );
}

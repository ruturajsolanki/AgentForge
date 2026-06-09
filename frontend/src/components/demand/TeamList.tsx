import type { AllocatedResource } from "../../types";

const KIND_LABEL: Record<string, string> = {
  trainer: "Trainer",
  learner: "AI Learner",
};

const IMPORTANCE_CLASS: Record<string, string> = {
  high: "border-danger/40 bg-danger/10 text-danger",
  medium: "border-warning/40 bg-warning/10 text-warning",
  low: "border-hairline bg-surface-2 text-fg-muted",
};

export function TeamList({ team, compact = false }: { team: AllocatedResource[]; compact?: boolean }) {
  const visible = compact ? team.slice(0, 3) : team;
  return (
    <div className="grid gap-2">
      {visible.map((resource) => (
        <div key={`${resource.name}-${resource.resource_type}`} className="rounded-lg border border-hairline bg-surface-2 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-fg-strong">{resource.name}</span>
                {resource.kind && resource.kind !== "member" && (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                    {KIND_LABEL[resource.kind] || resource.kind}
                  </span>
                )}
              </div>
              <div className="mt-1 truncate text-xs text-fg-muted">{resource.title || resource.resource_type.replace(/_/g, " ")}</div>
            </div>
            <span className="font-mono text-xs text-accent">{Math.round(resource.allocation_percentage * 100)}%</span>
          </div>
          {resource.move_recommended && (
            <div className={`mt-2 rounded-md border px-2.5 py-2 text-xs ${IMPORTANCE_CLASS[resource.move_importance || "low"] || IMPORTANCE_CLASS.low}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  On &ldquo;{resource.currently_allocated_to}&rdquo; &mdash; move?
                </span>
                <span className="font-mono">
                  {Math.round((resource.move_probability || 0) * 100)}% fit &middot; {resource.move_importance}
                </span>
              </div>
              {resource.move_rationale && <p className="mt-1 opacity-90">{resource.move_rationale}</p>}
            </div>
          )}
        </div>
      ))}
      {compact && team.length > visible.length && (
        <div className="rounded-lg border border-dashed border-hairline p-3 text-sm text-fg-muted">Show {team.length - visible.length} more in plan</div>
      )}
    </div>
  );
}

import type { AllocatedResource } from "../../types";

export function TeamList({ team, compact = false }: { team: AllocatedResource[]; compact?: boolean }) {
  const visible = compact ? team.slice(0, 3) : team;
  return (
    <div className="grid gap-2">
      {visible.map((resource) => (
        <div key={`${resource.name}-${resource.resource_type}`} className="rounded-lg border border-hairline bg-surface-2 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg-strong">{resource.name}</div>
              <div className="mt-1 truncate text-xs text-fg-muted">{resource.title || resource.resource_type.replace(/_/g, " ")}</div>
            </div>
            <span className="font-mono text-xs text-accent">{Math.round(resource.allocation_percentage * 100)}%</span>
          </div>
        </div>
      ))}
      {compact && team.length > visible.length && (
        <div className="rounded-lg border border-dashed border-hairline p-3 text-sm text-fg-muted">Show {team.length - visible.length} more in plan</div>
      )}
    </div>
  );
}

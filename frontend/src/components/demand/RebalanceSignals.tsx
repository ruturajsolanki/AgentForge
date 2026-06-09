import type { Allocation } from "../../types";
import { Badge } from "../ui/badge";

export function RebalanceSignals({ allocation }: { allocation?: Allocation | null }) {
  const gaps = allocation?.uncovered_skills || [];
  const coverage = Math.round((allocation?.coverage_score ?? (gaps.length ? 0.68 : 0.9)) * 100);
  const moves = (allocation?.team || []).filter((r) => r.move_recommended);
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg-strong">Rebalance signals</h3>
        <Badge>{coverage}% coverage</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {gaps.length ? gaps.map((gap) => <Badge key={gap}>{gap.replace(/_/g, " ")}</Badge>) : <span className="text-sm text-fg-muted">No major gaps detected.</span>}
      </div>
      {moves.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">Reallocation suggestions</p>
          <div className="mt-2 grid gap-2">
            {moves.map((m) => (
              <div key={m.name} className="rounded-lg border border-hairline bg-surface-2 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-fg-strong">{m.name}</span>
                  <span className="font-mono text-accent">
                    {Math.round((m.move_probability || 0) * 100)}% &middot; {m.move_importance}
                  </span>
                </div>
                <p className="mt-0.5 text-fg-muted">
                  Currently on &ldquo;{m.currently_allocated_to}&rdquo;. Recommend moving to this demand.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

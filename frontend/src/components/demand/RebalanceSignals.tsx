import type { Allocation } from "../../types";
import { Badge } from "../ui/badge";

export function RebalanceSignals({ allocation }: { allocation?: Allocation | null }) {
  const gaps = allocation?.uncovered_skills || [];
  const coverage = Math.round((allocation?.coverage_score ?? (gaps.length ? 0.68 : 0.9)) * 100);
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-fg-strong">Rebalance signals</h3>
        <Badge>{coverage}% coverage</Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {gaps.length ? gaps.map((gap) => <Badge key={gap}>{gap.replace(/_/g, " ")}</Badge>) : <span className="text-sm text-fg-muted">No major gaps detected.</span>}
      </div>
    </div>
  );
}

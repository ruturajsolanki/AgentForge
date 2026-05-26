import type { DemandStage } from "../../types";
import { cn } from "../../lib/cn";

const LABELS: Record<DemandStage, string> = {
  ingested: "Ingested",
  understanding: "Understanding",
  deciding: "Deciding",
  allocating: "Allocating",
  awaiting_approval: "Approval",
  executing: "Executing",
  monitoring: "Monitoring",
  explaining: "Explaining",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export function StageChip({ stage, className }: { stage: DemandStage; className?: string }) {
  const danger = stage === "failed" || stage === "cancelled";
  const done = stage === "completed";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        danger ? "border-danger/30 bg-danger/10 text-danger" : done ? "border-success/30 bg-success/10 text-success" : "border-hairline bg-surface-2 text-fg-muted",
        className,
      )}
    >
      {LABELS[stage] || stage}
    </span>
  );
}

export { LABELS as STAGE_LABELS };

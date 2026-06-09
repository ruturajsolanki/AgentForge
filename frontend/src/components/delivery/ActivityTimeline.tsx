import type { AuditEventItem } from "../../types";

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-500",
  updated: "bg-blue-500",
  approved: "bg-emerald-500",
  state_changed: "bg-amber-500",
  handoff: "bg-purple-500",
  deleted: "bg-red-500",
  status_change: "bg-cyan-500",
};

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  approved: "Approved",
  state_changed: "State changed",
  handoff: "Handoff",
  deleted: "Deleted",
  status_change: "Status change",
};

interface Props {
  events: AuditEventItem[];
  className?: string;
}

export default function ActivityTimeline({ events, className = "" }: Props) {
  if (!events.length) {
    return (
      <div className={`py-8 text-center text-sm text-muted-foreground ${className}`}>
        No activity yet
      </div>
    );
  }

  return (
    <div className={`relative space-y-0 ${className}`}>
      <div className="absolute left-3 top-2 bottom-2 w-px bg-border" />
      {events.map((ev) => (
        <div key={ev.id} className="relative flex gap-3 py-2 pl-8">
          <div
            className={`absolute left-2 top-3.5 h-2.5 w-2.5 rounded-full border-2 border-background ${
              ACTION_COLORS[ev.action] ?? "bg-gray-400"
            }`}
          />
          <div className="flex-1 space-y-0.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">
                {ACTION_LABELS[ev.action] ?? ev.action}
              </span>
              <span className="text-muted-foreground">
                {ev.entity_kind}:{ev.entity_id.slice(0, 8)}
              </span>
              <span className="ml-auto text-muted-foreground">
                {ev.created_at
                  ? new Date(ev.created_at).toLocaleString()
                  : ""}
              </span>
            </div>
            {ev.diff && (
              <pre className="max-h-20 overflow-auto rounded bg-muted/50 p-1.5 text-[10px] text-muted-foreground">
                {JSON.stringify(ev.diff, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

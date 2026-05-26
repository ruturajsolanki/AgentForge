import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { TerminalSquare } from "lucide-react";
import { DemandWorkspace } from "../../../components/demand/DemandWorkspace";
import { useShell } from "../../../components/shell/ShellContext";
import { Badge } from "../../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";

export default function DemandTerminalRoute() {
  const { id = "" } = useParams();
  const { events, connected } = useShell();
  const [verbosity, setVerbosity] = useState(6);

  const logs = useMemo(() => {
    return events
      .filter((event) => !event.demand_id || event.demand_id === id)
      .filter((event) => event.type === "agent.log" || event.type === "agent.code" || event.type === "pipeline.error")
      .slice(-120);
  }, [events, id]);

  const visible = logs.slice(-Math.max(12, verbosity * 12));

  return (
    <DemandWorkspace publicId={id} active="terminal">
      {() => (
        <div className="grid gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-1 p-3">
            <div className="flex items-center gap-2">
              <span className={connected ? "h-2 w-2 rounded-full bg-success" : "h-2 w-2 rounded-full bg-danger"} />
              <span className="text-sm text-fg">{connected ? "WebSocket connected" : "WebSocket offline"}</span>
            </div>
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Verbosity
              <input
                type="range"
                min={1}
                max={10}
                value={verbosity}
                onChange={(event) => setVerbosity(Number(event.target.value))}
                className="accent-accent"
              />
              <span className="font-mono text-fg">{verbosity}</span>
            </label>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Execution terminal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="min-h-[260px] rounded-xl border border-hairline bg-canvas p-4 font-mono text-xs leading-6 text-fg">
                <div className="flex items-center gap-2 text-fg-muted">
                  <TerminalSquare className="h-4 w-4" />
                  xterm bridge is ready for project process output.
                </div>
                <div className="mt-4 text-fg-faint">$ forge run {id}</div>
                <div className="text-fg-muted">Waiting for command output...</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Agent log stream</CardTitle>
                <Badge>{visible.length} lines</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[360px] overflow-auto rounded-xl border border-hairline bg-canvas p-3 font-mono text-xs leading-6" aria-live="polite">
                {visible.length ? visible.map((event, index) => (
                  <div key={`${event.type}-${event.seq ?? index}-${event.timestamp ?? index}`} className="grid gap-2 border-b border-hairline/60 py-2 last:border-0 sm:grid-cols-[140px_minmax(0,1fr)]">
                    <span className="truncate text-fg-faint">{event.agent_name || event.type}</span>
                    <span className="min-w-0 break-words text-fg">
                      {event.message || event.delta || event.stage || event.task || "event received"}
                    </span>
                  </div>
                )) : (
                  <div className="text-fg-muted">No agent logs for this demand yet.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </DemandWorkspace>
  );
}

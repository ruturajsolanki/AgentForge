import { useMemo, useState } from "react";
import { Bot, FileCode2, Hammer, SlidersHorizontal } from "lucide-react";
import type { WSEvent } from "../../types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import type { AgentNodeData } from "./AgentNode";
import { StreamView } from "./StreamView";

export function AgentPane({
  agent,
  events,
  verbosity,
  onVerbosityChange,
}: {
  agent: AgentNodeData | null;
  events: WSEvent[];
  verbosity: number;
  onVerbosityChange: (value: number) => void;
}) {
  const [tab, setTab] = useState<"stream" | "tools" | "artifacts" | "logs">("stream");
  const agentEvents = useMemo(() => {
    if (!agent) return [];
    return events
      .filter((event) => event.agent_name === agent.name || event.agent_id === agent.id || event.task === agent.task)
      .slice(-Math.max(12, verbosity * 12));
  }, [agent, events, verbosity]);

  if (!agent) {
    return (
      <Card className="h-full">
        <CardContent className="grid h-full min-h-64 place-items-center p-6 text-center">
          <div>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-xl border border-hairline bg-surface-2 text-fg-muted">
              <Bot className="h-5 w-5" />
            </div>
            <h2 className="mt-3 text-lg font-semibold text-fg-strong">Select an agent</h2>
            <p className="mt-1 text-sm text-fg-muted">Streams, tool calls, artifacts, and logs appear here.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardContent className="flex h-full min-h-72 flex-col p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-fg-strong">{agent.role}</h2>
              <Badge>{agent.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-fg-muted">{agent.task}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <SlidersHorizontal className="h-4 w-4" />
            Verbosity
            <input
              type="range"
              min={1}
              max={10}
              value={verbosity}
              onChange={(event) => onVerbosityChange(Number(event.target.value))}
              className="accent-accent"
            />
            <span className="font-mono text-fg">{verbosity}</span>
          </label>
        </div>

        <Tabs className="flex min-h-0 flex-1 flex-col">
          <TabsList className="px-4 pt-3">
            <TabsTrigger active={tab === "stream"} onClick={() => setTab("stream")}>Stream</TabsTrigger>
            <TabsTrigger active={tab === "tools"} onClick={() => setTab("tools")}>Tools</TabsTrigger>
            <TabsTrigger active={tab === "artifacts"} onClick={() => setTab("artifacts")}>Artifacts</TabsTrigger>
            <TabsTrigger active={tab === "logs"} onClick={() => setTab("logs")}>Logs</TabsTrigger>
          </TabsList>
          {tab === "stream" && (
            <TabsContent className="min-h-0 flex-1 overflow-auto p-4">
              <StreamView key={agent.id} agent={agent} events={agentEvents} />
            </TabsContent>
          )}
          {tab === "tools" && (
            <TabsContent className="min-h-0 flex-1 overflow-auto p-4">
              <div className="rounded-xl border border-hairline">
                {["plan", "generate", "validate"].map((tool, index) => (
                  <div key={tool} className="grid gap-2 border-b border-hairline p-3 text-sm last:border-0 sm:grid-cols-[120px_minmax(0,1fr)_90px]">
                    <span className="font-medium text-fg-strong">{tool}</span>
                    <span className="text-fg-muted">{index === 0 ? "args derived from manager plan" : "pending execution result"}</span>
                    <span className="font-mono text-xs text-fg-faint">{index ? "-" : "42 ms"}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
          {tab === "artifacts" && (
            <TabsContent className="min-h-0 flex-1 overflow-auto p-4">
              <div className="grid gap-2">
                {["src/App.tsx", "src/index.css", "README.md"].map((path) => (
                  <div key={path} className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2 p-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileCode2 className="h-4 w-4 text-fg-muted" />
                      <span className="truncate font-mono text-xs text-fg">{path}</span>
                    </div>
                    <Button size="sm" variant="ghost">Open</Button>
                  </div>
                ))}
              </div>
            </TabsContent>
          )}
          {tab === "logs" && (
            <TabsContent className="min-h-0 flex-1 overflow-auto p-4">
              <div className="rounded-xl border border-hairline bg-canvas p-3 font-mono text-xs leading-6">
                {agentEvents.filter((event) => event.type === "agent.log").length ? (
                  agentEvents.filter((event) => event.type === "agent.log").map((event, index) => (
                    <div key={`${event.timestamp ?? index}-${event.message ?? index}`} className="border-b border-hairline/60 py-1 last:border-0">
                      <span className="text-fg-faint">{event.level || "info"}</span>{" "}
                      <span className="text-fg">{event.message}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-fg-muted">No logs for this agent yet.</span>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>

        <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 text-xs text-fg-muted">
          <span>{agent.provider} / {agent.model}</span>
          <span>{agent.tokens.toLocaleString()} tokens</span>
          <span className="inline-flex items-center gap-1"><Hammer className="h-3.5 w-3.5" /> tool-safe</span>
        </div>
      </CardContent>
    </Card>
  );
}

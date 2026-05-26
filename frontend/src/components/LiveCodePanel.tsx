import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Code2, Loader2, Square } from "lucide-react";
import { toast } from "sonner";
import { useStreamBuffer } from "../hooks/useStreamBuffer";
import type { WSEvent } from "../types";
import { Button } from "./ui/button";

interface AgentStream {
  agent_id: string;
  agent_name: string;
  model?: string;
  provider?: string;
  task?: string;
  text: string;
  chunks: number;
  chars: number;
  status: "streaming" | "done" | "error" | "interrupted";
  error?: string;
  started_at: number;
  first_token_at?: number;
  ended_at?: number;
}

interface Props {
  events: WSEvent[];
  publicId: string;
}

export default function LiveCodePanel({ events, publicId }: Props) {
  const [streams, setStreams] = useState<Record<string, AgentStream>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const interrupted = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const stickRef = useRef(true);
  const lastSeenRef = useRef(0);

  const onFlush = useCallback((batch: WSEvent[]) => {
    setStreams((prev) => {
      const next: Record<string, AgentStream> = { ...prev };
      for (const event of batch) {
        if (event.demand_id && publicId && event.demand_id !== publicId) continue;
        if (event.type !== "agent.code") continue;
        const id = event.agent_id || event.agent_name || "unknown";
        if (interrupted.current.has(id)) continue;
        const name = event.agent_name || id;
        const existing = next[id];
        if (event.phase === "start") {
          next[id] = {
            agent_id: id,
            agent_name: name,
            model: event.model,
            provider: event.provider,
            task: event.task,
            text: existing?.text || "",
            chunks: existing?.chunks || 0,
            chars: existing?.chars || 0,
            status: "streaming",
            started_at: existing?.started_at || Date.now(),
            first_token_at: existing?.first_token_at,
          };
          setActiveId(id);
          continue;
        }
        if (event.phase === "chunk" && event.delta) {
          const current = existing || {
            agent_id: id,
            agent_name: name,
            text: "",
            chunks: 0,
            chars: 0,
            status: "streaming" as const,
            started_at: Date.now(),
          };
          next[id] = {
            ...current,
            text: current.text + event.delta,
            chunks: current.chunks + 1,
            chars: current.chars + event.delta.length,
            first_token_at: current.first_token_at || Date.now(),
            model: event.model || current.model,
            provider: event.provider || current.provider,
            task: event.task || current.task,
          };
          setActiveId(id);
          continue;
        }
        if (event.phase === "end" && existing) next[id] = { ...existing, status: "done", ended_at: Date.now() };
        if (event.phase === "error" && existing) next[id] = { ...existing, status: "error", error: event.message, ended_at: Date.now() };
      }
      return next;
    });
  }, [publicId]);

  const push = useStreamBuffer<WSEvent>(onFlush, 40);

  useEffect(() => {
    const fresh = events.slice(lastSeenRef.current);
    lastSeenRef.current = events.length;
    fresh.forEach(push);
  }, [events, push]);

  useEffect(() => {
    if (scrollRef.current && stickRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  const agents = useMemo(() => Object.values(streams), [streams]);
  const active = activeId ? streams[activeId] : agents[0];

  const stop = () => {
    if (!active) return;
    interrupted.current.add(active.agent_id);
    setStreams((prev) => ({
      ...prev,
      [active.agent_id]: { ...active, status: "interrupted", ended_at: Date.now() },
    }));
    toast.info(`${active.agent_name} stream interrupted locally`);
  };

  if (!agents.length) {
    return (
      <div className="rounded-xl border border-hairline bg-surface-1 p-6 text-center text-sm text-fg-muted">
        <Code2 className="mx-auto mb-2 h-5 w-5 text-fg-faint" />
        Live code will stream here once an agent starts generating.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-surface-2 px-5 py-3">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-accent" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-fg">Live code stream</h3>
          {active?.status === "streaming" && (
            <span className="flex items-center gap-1 text-xs text-fg-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              {active.agent_name} is writing
            </span>
          )}
        </div>
        <div className="font-mono text-xs text-fg-muted">{agents.length} agents</div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-hairline bg-surface-1 px-3 py-2">
        {agents.map((agent) => (
          <button
            key={agent.agent_id}
            onClick={() => setActiveId(agent.agent_id)}
            className={agent.agent_id === activeId ? "flex items-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-2.5 py-1 text-xs text-fg-strong" : "flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-2 px-2.5 py-1 text-xs text-fg-muted hover:text-fg"}
          >
            <StreamStatusIcon status={agent.status} />
            <span>{agent.agent_name}</span>
            <span className="font-mono text-fg-faint">{agent.chars ? `${agent.chars}c` : ""}</span>
          </button>
        ))}
      </div>

      {active && (
        <div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline bg-surface-2 px-4 py-2 text-xs text-fg-muted">
            <span>provider <span className="font-mono text-fg">{active.provider || "unknown"}</span></span>
            <span>model <span className="font-mono text-fg">{active.model || "unknown"}</span></span>
            <span>chunks <span className="font-mono text-fg">{active.chunks}</span></span>
            <span>TTFT <span className="font-mono text-fg">{active.first_token_at ? active.first_token_at - active.started_at : 0} ms</span></span>
            {active.status === "error" && active.error && <span className="text-danger">{active.error}</span>}
          </div>
          <div className="relative">
            <div className="sticky top-0 z-10 flex justify-end bg-canvas px-3 py-2">
              <Button size="sm" variant="ghost" onClick={stop} disabled={active.status !== "streaming"}>
                <Square className="h-4 w-4" />
                Stop
              </Button>
            </div>
            <pre
              ref={scrollRef}
              className="max-h-[480px] overflow-auto whitespace-pre-wrap bg-canvas px-4 py-3 font-mono text-xs leading-6 text-fg"
              style={{ contentVisibility: "auto" }}
              aria-live="polite"
              onScroll={(event) => {
                const node = event.currentTarget;
                const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= 24;
                stickRef.current = atBottom;
                setShowJump(!atBottom);
              }}
            >
              {active.text || "Waiting for first token..."}
              {active.status === "streaming" && <span className="ml-0.5 inline-block h-3.5 w-2 animate-pulse bg-accent align-middle" />}
            </pre>
            {showJump && (
              <Button
                size="sm"
                variant="secondary"
                className="absolute bottom-3 right-3"
                onClick={() => {
                  if (!scrollRef.current) return;
                  scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  stickRef.current = true;
                  setShowJump(false);
                }}
              >
                Jump to live
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StreamStatusIcon({ status }: { status: AgentStream["status"] }) {
  if (status === "error") return <AlertCircle className="h-3 w-3 text-danger" />;
  if (status === "done") return <CheckCircle2 className="h-3 w-3 text-success" />;
  return <Loader2 className={status === "streaming" ? "h-3 w-3 animate-spin text-accent" : "h-3 w-3 text-fg-muted"} />;
}

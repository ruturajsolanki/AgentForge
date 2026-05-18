import { useEffect, useMemo, useRef, useState } from "react";
import { Code2, Loader2, CheckCircle2, AlertCircle, ChevronDown } from "lucide-react";
import type { WSEvent } from "../types";

/** A single agent's streaming buffer. */
interface AgentStream {
  agent_id: string;
  agent_name: string;
  model?: string;
  provider?: string;
  task?: string;
  text: string;
  chunks: number;
  status: "streaming" | "done" | "error";
  error?: string;
  started_at: number;
  ended_at?: number;
}

interface Props {
  events: WSEvent[];
  publicId: string;
}

/**
 * Renders a real-time view of every agent's LLM output as it streams in.
 * One pane per agent; auto-scrolls; highlights the currently-active stream.
 */
export default function LiveCodePanel({ events, publicId }: Props) {
  const [streams, setStreams] = useState<Record<string, AgentStream>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLPreElement | null>(null);
  const lastSeenRef = useRef<number>(0);

  useEffect(() => {
    // Only process events we haven't ingested yet.
    const fresh = events.slice(lastSeenRef.current);
    lastSeenRef.current = events.length;
    if (!fresh.length) return;

    setStreams((prev) => {
      const next: Record<string, AgentStream> = { ...prev };
      for (const e of fresh) {
        if (e.demand_id && publicId && e.demand_id !== publicId) continue;
        if (e.type !== "agent.code") continue;
        const id = e.agent_id || "unknown";
        const name = e.agent_name || id;
        const existing = next[id];
        if (e.phase === "start") {
          next[id] = {
            agent_id: id,
            agent_name: name,
            model: e.model,
            provider: e.provider,
            task: e.task,
            text: "",
            chunks: 0,
            status: "streaming",
            started_at: Date.now(),
          };
          setActiveId(id);
        } else if (e.phase === "chunk" && e.delta) {
          if (!existing) {
            next[id] = {
              agent_id: id,
              agent_name: name,
              text: e.delta,
              chunks: 1,
              status: "streaming",
              started_at: Date.now(),
            };
          } else {
            next[id] = {
              ...existing,
              text: existing.text + e.delta,
              chunks: existing.chunks + 1,
            };
          }
          setActiveId(id);
        } else if (e.phase === "end") {
          if (existing) {
            next[id] = { ...existing, status: "done", ended_at: Date.now() };
          }
        } else if (e.phase === "error") {
          if (existing) {
            next[id] = {
              ...existing,
              status: "error",
              error: e.message,
              ended_at: Date.now(),
            };
          }
        }
      }
      return next;
    });
  }, [events, publicId]);

  // Auto-scroll the active pane.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  const agents = useMemo(() => Object.values(streams), [streams]);
  const active = activeId ? streams[activeId] : null;

  if (!agents.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-500">
        <Code2 className="w-5 h-5 mx-auto mb-2 text-slate-600" />
        Live code will stream here once an agent starts generating.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-violet-400" />
          <h3 className="text-xs uppercase tracking-wider text-slate-300 font-semibold">
            Live code stream
          </h3>
          {active?.status === "streaming" && (
            <span className="flex items-center gap-1 text-[11px] text-violet-300">
              <Loader2 className="w-3 h-3 animate-spin" />
              {active.agent_name} is writing…
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          {agents.length} agent{agents.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Agent tabs */}
      <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-800 bg-slate-900/40">
        {agents.map((a) => {
          const isActive = a.agent_id === activeId;
          const icon =
            a.status === "streaming" ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : a.status === "error" ? (
              <AlertCircle className="w-3 h-3 text-red-400" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            );
          return (
            <button
              key={a.agent_id}
              onClick={() => setActiveId(a.agent_id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all ${
                isActive
                  ? "border-violet-500/60 bg-violet-500/10 text-violet-200"
                  : "border-slate-700/40 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {icon}
              <span>{a.agent_name}</span>
              <span className="text-slate-500 font-mono">
                {a.text.length > 0 ? `${a.text.length}c` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active stream */}
      {active && (
        <div>
          <div className="px-4 py-2 border-b border-slate-800 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 bg-slate-900/40">
            {active.provider && (
              <span>
                <span className="text-slate-600">provider:</span>{" "}
                <span className="text-slate-300 font-mono">{active.provider}</span>
              </span>
            )}
            {active.model && (
              <span>
                <span className="text-slate-600">model:</span>{" "}
                <span className="text-slate-300 font-mono">{active.model}</span>
              </span>
            )}
            {active.task && (
              <span>
                <span className="text-slate-600">task:</span>{" "}
                <span className="text-slate-300">{active.task}</span>
              </span>
            )}
            <span>
              <span className="text-slate-600">chunks:</span>{" "}
              <span className="text-slate-300 font-mono">{active.chunks}</span>
            </span>
            {active.status === "error" && active.error && (
              <span className="text-red-400">{active.error}</span>
            )}
          </div>
          <pre
            ref={scrollRef}
            className="px-4 py-3 bg-slate-950/60 text-[12px] text-emerald-200 font-mono overflow-auto max-h-[480px] whitespace-pre-wrap leading-relaxed"
          >
            {active.text || "Waiting for first token…"}
            {active.status === "streaming" && (
              <span className="inline-block w-2 h-3.5 ml-0.5 bg-emerald-400 animate-pulse align-middle" />
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

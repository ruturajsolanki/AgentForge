import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { ArrowDown, Pause, Square } from "lucide-react";
import { toast } from "sonner";
import { useStreamBuffer } from "../../hooks/useStreamBuffer";
import type { WSEvent } from "../../types";
import { Button } from "../ui/button";
import { ArtifactCard } from "./ArtifactCard";
import type { AgentNodeData } from "./AgentNode";

interface StreamState {
  text: string;
  chunks: number;
  chars: number;
  startedAt: number | null;
  firstTokenAt: number | null;
  completedAt: number | null;
  model?: string;
  provider?: string;
}

const initialState: StreamState = {
  text: "",
  chunks: 0,
  chars: 0,
  startedAt: null,
  firstTokenAt: null,
  completedAt: null,
};

export function StreamView({
  agent,
  events,
}: {
  agent: AgentNodeData;
  events: WSEvent[];
}) {
  const [state, setState] = useState<StreamState>(initialState);
  const [interrupted, setInterrupted] = useState(false);
  const [showJump, setShowJump] = useState(false);
  const [artifactFiles, setArtifactFiles] = useState<string[]>([]);
  const lastSeen = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const interruptedRef = useRef(false);

  const onFlush = useCallback((batch: WSEvent[]) => {
    if (interruptedRef.current) return;
    const now = Date.now();
    setState((current) => {
      let next = { ...current };
      for (const event of batch) {
        if (event.phase === "start") {
          next = {
            ...next,
            startedAt: next.startedAt ?? now,
            model: event.model || next.model,
            provider: event.provider || next.provider,
          };
          continue;
        }
        if (event.phase === "chunk" && event.delta) {
          next = {
            ...next,
            text: next.text + event.delta,
            chunks: next.chunks + 1,
            chars: next.chars + event.delta.length,
            firstTokenAt: next.firstTokenAt ?? now,
            startedAt: next.startedAt ?? now,
            model: event.model || next.model,
            provider: event.provider || next.provider,
          };
          continue;
        }
        if (event.phase === "end") next = { ...next, completedAt: now };
        if (event.phase === "error") next = { ...next, completedAt: now, text: `${next.text}\n\n${event.message || "Stream error"}` };
      }
      return next;
    });
  }, []);

  const push = useStreamBuffer<WSEvent>(onFlush, 40);

  useEffect(() => {
    const fresh = events.slice(lastSeen.current);
    lastSeen.current = events.length;
    for (const event of fresh) {
      if (event.type === "agent.code") push(event);
      if (event.type === "agent.complete") {
        setState((current) => ({ ...current, completedAt: current.completedAt ?? Date.now() }));
        setArtifactFiles((current) => current.length ? current : ["src/App.tsx", "src/index.css", "README.md"]);
      }
    }
  }, [events, push]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !stickRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [state.text]);

  const openFence = useMemo(() => {
    const matches = state.text.match(/```/g);
    return Boolean(matches && matches.length % 2 === 1);
  }, [state.text]);

  const telemetry = useMemo(() => {
    const ttft = state.startedAt && state.firstTokenAt ? state.firstTokenAt - state.startedAt : 0;
    const elapsed = ((state.completedAt || Date.now()) - (state.firstTokenAt || state.startedAt || Date.now())) / 1000;
    const tokens = Math.round(state.chars / 4);
    const tokensPerSecond = elapsed > 0 ? tokens / elapsed : 0;
    return { ttft, tokens, tokensPerSecond };
  }, [state]);

  const stop = () => {
    interruptedRef.current = true;
    setInterrupted(true);
    toast.info("Agent stream interrupted locally");
  };

  return (
    <div className="relative grid gap-3">
      {artifactFiles.length > 0 && <ArtifactCard files={artifactFiles} />}
      <div
        ref={scrollRef}
        className={state.completedAt ? "relative h-56 overflow-auto rounded-xl border border-hairline bg-canvas p-4 opacity-60" : "relative h-56 overflow-auto rounded-xl border border-hairline bg-canvas p-4"}
        style={{ contentVisibility: "auto" }}
        aria-live="polite"
        onScroll={(event) => {
          const node = event.currentTarget;
          const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight <= 24;
          stickRef.current = atBottom;
          setShowJump(!atBottom);
        }}
      >
        <div className="sticky top-0 z-10 flex justify-end">
          <Button size="sm" variant={interrupted ? "secondary" : "ghost"} onClick={stop} disabled={interrupted || Boolean(state.completedAt)}>
            {interrupted ? <Pause className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            {interrupted ? "Stopped" : "Stop"}
          </Button>
        </div>
        {state.text ? (
          <ReactMarkdown
            components={{
              code({ children, className }) {
                const language = /language-(\w+)/.exec(className || "")?.[1];
                return (
                  <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-xs text-fg">
                    {language ? `${language}: ` : null}
                    {children}
                  </code>
                );
              },
              pre({ children }) {
                return <pre className="my-3 overflow-auto rounded-xl border border-hairline bg-surface-1 p-3 font-mono text-xs leading-6 text-fg">{children}</pre>;
              },
            }}
          >
            {state.text}
          </ReactMarkdown>
        ) : (
          <div className="font-mono text-xs text-fg-muted">Waiting for {agent.name} to stream...</div>
        )}
        {openFence && (
          <div className="mt-3 rounded-xl border border-dashed border-hairline bg-surface-1 p-3 font-mono text-xs text-fg-muted">
            Code frame reserved while the current block streams.
          </div>
        )}
      </div>
      {showJump && (
        <Button
          size="sm"
          variant="secondary"
          className="justify-self-end"
          onClick={() => {
            const node = scrollRef.current;
            if (!node) return;
            node.scrollTop = node.scrollHeight;
            stickRef.current = true;
            setShowJump(false);
          }}
        >
          <ArrowDown className="h-4 w-4" />
          Jump to live
        </Button>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
        <span>TTFT <span className="font-mono text-fg">{telemetry.ttft} ms</span></span>
        <span>chars <span className="font-mono text-fg">{state.chars.toLocaleString()}</span></span>
        <span>tokens/s <span className="font-mono text-fg">{telemetry.tokensPerSecond.toFixed(1)}</span></span>
        <span>model <span className="font-mono text-fg">{state.model || agent.model}</span></span>
        <span>provider <span className="font-mono text-fg">{state.provider || agent.provider}</span></span>
      </div>
    </div>
  );
}

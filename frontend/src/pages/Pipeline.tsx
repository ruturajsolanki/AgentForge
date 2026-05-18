import { useEffect, useMemo, useState } from "react";
import AgentFactoryScene from "../components/AgentFactoryScene";
import LiveCodePanel from "../components/LiveCodePanel";
import { forgeApi } from "../services/forgeApi";
import type { Agent, DemandStage, WSEvent } from "../types";

const STAGES: { id: DemandStage; label: string }[] = [
  { id: "ingested", label: "Ingested" },
  { id: "understanding", label: "Understanding" },
  { id: "deciding", label: "Decision" },
  { id: "allocating", label: "Allocation" },
  { id: "awaiting_approval", label: "Awaiting approval" },
  { id: "executing", label: "Executing" },
  { id: "monitoring", label: "Monitoring" },
  { id: "explaining", label: "Explanation" },
  { id: "completed", label: "Completed" },
];

interface PipelinePageProps {
  publicId: string;
  events: WSEvent[];
  onBack: () => void;
  onOpenIDE: (publicId: string) => void;
}

export default function PipelinePage({
  publicId,
  events,
  onBack,
  onOpenIDE,
}: PipelinePageProps) {
  const [stage, setStage] = useState<DemandStage>("executing");
  const [explanation, setExplanation] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ ts: string; line: string }[]>([]);

  // Pull initial state once.
  useEffect(() => {
    forgeApi
      .getDemand(publicId)
      .then((d) => {
        setStage(d.stage);
        setExplanation(d.explanation ?? null);
      })
      .catch(() => {});
  }, [publicId]);

  // Reduce live events.
  useEffect(() => {
    for (const e of events) {
      if (e.demand_id && e.demand_id !== publicId) continue;
      const ts = e.timestamp || new Date().toISOString();
      if (e.type === "pipeline.stage" && e.stage) setStage(e.stage as DemandStage);
      else if (e.type === "pipeline.understanding") setStage("deciding");
      else if (e.type === "pipeline.decision") setStage("allocating");
      else if (e.type === "pipeline.allocation") setStage("executing");
      else if (e.type === "pipeline.completed") {
        setStage("completed");
        if (e.explanation) setExplanation(e.explanation);
      } else if (e.type === "pipeline.error") {
        setStage("failed" as DemandStage);
      }
      if (e.type === "agent.log" && e.message) {
        setLogs((prev) => [...prev.slice(-300), { ts, line: `${e.agent_name}: ${e.message}` }]);
      }
    }
  }, [events, publicId]);

  const activeIdx = Math.max(0, STAGES.findIndex((s) => s.id === stage));

  // Derive a live Agent[] list from incoming WebSocket events so the
  // doodle scene shows real activity (which agent is "working" vs idle).
  const agents = useMemo<Agent[]>(() => {
    const NAME_TO_ID: Record<string, string> = {
      "Project Manager": "project_manager",
      "Frontend Developer": "frontend_dev",
      "Backend Developer": "backend_dev",
      "DevOps": "devops",
      "DevOps Engineer": "devops",
      "QA Tester": "devops",
      "Documentation Writer": "documentation",
      "Technical Writer": "documentation",
    };
    const map = new Map<string, Agent>();
    for (const e of events) {
      if (e.demand_id && e.demand_id !== publicId) continue;
      const name = e.agent_name;
      if (!name) continue;
      const id = NAME_TO_ID[name] ?? name.toLowerCase().replace(/\s+/g, "_");
      const existing = map.get(id);
      const next: Agent = existing ?? {
        id, name, role: name, icon: "agent",
        color: "cyan", status: "idle",
        current_task: null, progress: 0,
      };
      if (e.type === "agent.code" && e.phase === "start") {
        next.status = "working";
        if (e.task) next.current_task = e.task;
      } else if (e.type === "agent.code" && e.phase === "end") {
        next.status = "idle";
      } else if (e.type === "agent.log" && e.message) {
        if (next.status !== "completed") next.status = "working";
        next.current_task = e.message.slice(0, 60);
      } else if (e.type === "agent.complete") {
        next.status = "completed";
        next.progress = 100;
      }
      map.set(id, next);
    }
    return [...map.values()];
  }, [events, publicId]);

  // Show the agent factory scene from Understanding onward — the LLM is
  // already at work parsing intent, the doodles should reflect that.
  const showScene =
    stage !== "ingested" && stage !== "awaiting_approval" && stage !== "completed";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-slate-400 hover:text-white text-sm flex items-center gap-2"
        >
          ← Back to demands
        </button>
        <div className="text-xs font-mono text-slate-500">{publicId}</div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-4 font-semibold">
          Pipeline
        </h3>
        <ol className="flex flex-wrap gap-3">
          {STAGES.map((s, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <li
                key={s.id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  done
                    ? "border-emerald-700 bg-emerald-950/60 text-emerald-300"
                    : active
                      ? "border-violet-600 bg-violet-950/60 text-violet-200 animate-pulse"
                      : "border-slate-800 bg-slate-900/40 text-slate-500"
                }`}
              >
                <span className="font-mono">{i + 1}</span>
                <span>{s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {showScene && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3 font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            Live agent factory
          </h3>
          <AgentFactoryScene agents={agents} />
        </div>
      )}

      <LiveCodePanel events={events} publicId={publicId} />

      {logs.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3 font-semibold">
            Agent logs
          </h3>
          <div className="font-mono text-xs space-y-1 max-h-72 overflow-y-auto">
            {logs.map((l, i) => (
              <div key={i} className="text-slate-300">
                <span className="text-slate-600 mr-2">{l.ts.slice(11, 19)}</span>
                {l.line}
              </div>
            ))}
          </div>
        </div>
      )}

      {explanation && (
        <div className="rounded-2xl border border-emerald-800 bg-emerald-950/30 p-5">
          <h3 className="text-xs uppercase tracking-wider text-emerald-300 mb-2 font-semibold">
            Why this worked
          </h3>
          <p className="text-sm text-emerald-100 whitespace-pre-wrap">{explanation}</p>
          <button
            onClick={() => onOpenIDE(publicId)}
            className="mt-4 px-5 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Open in IDE
          </button>
        </div>
      )}
    </div>
  );
}

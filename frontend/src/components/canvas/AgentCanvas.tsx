import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { Maximize2, Play, RotateCw } from "lucide-react";
import { cn } from "../../lib/cn";
import type { DemandStage, WSEvent } from "../../types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import type { PlanShape } from "../demand/PlanCard";
import { AgentNode, type AgentNodeData } from "./AgentNode";
import { AgentPane } from "./AgentPane";

const stages: DemandStage[] = [
  "ingested",
  "understanding",
  "deciding",
  "allocating",
  "awaiting_approval",
  "executing",
  "monitoring",
  "explaining",
  "completed",
];

const nodeTypes = { agent: AgentNode };

export function AgentCanvas({
  publicId,
  plan,
  events,
  stage,
}: {
  publicId: string;
  plan: PlanShape;
  events: WSEvent[];
  stage?: DemandStage;
}) {
  const [agents, setAgents] = useState<AgentNodeData[]>(() => planToAgents(plan));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [verbosity, setVerbosity] = useState(6);
  const [paneHeight, setPaneHeight] = useState(() => Number(window.localStorage.getItem("forgeos.agentPane.height") || 320));
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const resizing = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    setAgents(planToAgents(plan));
  }, [plan]);

  useEffect(() => {
    const event = events[events.length - 1];
    if (!event || (event.demand_id && event.demand_id !== publicId)) return;
    if (!["agent.code", "agent.log", "agent.complete", "pipeline.completed", "pipeline.error"].includes(event.type)) return;

    setAgents((current) => {
      if (event.type === "pipeline.completed") {
        return current.map((agent) => ({ ...agent, status: "completed", progress: 100 }));
      }
      if (event.type === "pipeline.error") {
        return current.map((agent, index) => index === 0 ? { ...agent, status: "error", task: event.message || "Pipeline error" } : agent);
      }
      const id = resolveAgentId(current, event);
      return current.map((agent) => {
        if (agent.id !== id) return agent;
        if (event.type === "agent.complete") return { ...agent, status: "completed", progress: 100 };
        const nextProgress = event.total_chunks && event.seq
          ? Math.min(98, Math.round((event.seq / event.total_chunks) * 100))
          : Math.min(95, agent.progress + 4);
        return {
          ...agent,
          status: "working",
          task: event.task || event.message || agent.task,
          progress: nextProgress,
          model: event.model || agent.model,
          provider: event.provider || agent.provider,
          tokens: Math.max(agent.tokens, event.char_count ? Math.round(event.char_count / 4) : agent.tokens + Math.max(1, Math.round((event.delta || "").length / 4))),
        };
      });
    });
  }, [events, publicId]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!resizing.current) return;
      const next = Math.max(220, Math.min(520, resizing.current.startHeight - (event.clientY - resizing.current.startY)));
      setPaneHeight(next);
    };
    const onUp = () => {
      if (resizing.current) window.localStorage.setItem("forgeos.agentPane.height", String(paneHeight));
      resizing.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [paneHeight]);

  const selected = agents.find((agent) => agent.id === selectedId) || agents[0] || null;
  const nodes = useMemo<Node[]>(() => buildNodes(agents), [agents]);
  const edges = useMemo<Edge[]>(() => buildEdges(agents), [agents]);
  const demandEvents = useMemo(() => events.filter((event) => !event.demand_id || event.demand_id === publicId), [events, publicId]);

  return (
    <div className="grid gap-3">
      <div className="flex gap-2 overflow-x-auto rounded-xl border border-hairline bg-surface-1 p-2">
        {stages.map((item) => {
          const active = item === stage;
          return (
            <span
              key={item}
              className={cn(
                "inline-flex h-8 shrink-0 items-center rounded-full border px-3 text-xs capitalize",
                active ? "animate-pulse border-accent bg-accent-soft text-fg-strong" : "border-hairline bg-surface-2 text-fg-muted",
              )}
            >
              {item.replace(/_/g, " ")}
            </span>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-1 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary">
            <Play className="h-4 w-4" />
            Re-run agent
          </Button>
          <select className="h-8 rounded-lg border border-hairline bg-surface-1 px-2 text-xs text-fg outline-none focus:border-accent">
            <option>role default</option>
            <option>fast planner</option>
            <option>deep builder</option>
          </select>
          <Button size="sm" variant="ghost" onClick={() => flowRef.current?.fitView({ padding: 0.2 })}>
            <Maximize2 className="h-4 w-4" />
            Fit view
          </Button>
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

      <div className="grid min-h-[520px] gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-h-[520px] overflow-hidden rounded-xl border border-hairline bg-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            onInit={(instance) => { flowRef.current = instance; }}
            onNodeClick={(_, node) => setSelectedId(node.id)}
            defaultEdgeOptions={{ style: { stroke: "var(--color-hairline-hi)" }, animated: true }}
          >
            <Background color="var(--color-hairline)" gap={28} />
            <Controls />
          </ReactFlow>
        </div>
        <aside className="hidden rounded-xl border border-hairline bg-surface-1 p-3 xl:block">
          <div className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Plan</div>
          <div className="mt-3 grid gap-2">
            {plan.understanding.required_skills.slice(0, 7).map((skill) => (
              <Badge key={skill}>{skill.replace(/_/g, " ")}</Badge>
            ))}
          </div>
          <div className="mt-5 text-xs text-fg-muted">{plan.allocation.allocation_reasoning}</div>
        </aside>
      </div>

      <div
        className="h-2 cursor-row-resize rounded-full bg-surface-2"
        onMouseDown={(event) => {
          resizing.current = { startY: event.clientY, startHeight: paneHeight };
        }}
      />
      <div style={{ height: paneHeight }}>
        <AgentPane agent={selected} events={demandEvents} verbosity={verbosity} onVerbosityChange={setVerbosity} />
      </div>
    </div>
  );
}

function planToAgents(plan: PlanShape): AgentNodeData[] {
  return plan.allocation.team.map((resource, index) => ({
    id: slug(resource.name || resource.resource_type || `agent-${index}`),
    name: resource.name || `Agent ${index + 1}`,
    role: resource.title || resource.resource_type.replace(/_/g, " "),
    task: resource.reason || plan.allocation.allocation_reasoning || "Awaiting execution task",
    status: index === 0 ? "working" : "idle",
    progress: index === 0 ? 18 : 0,
    model: resource.resource_type.includes("agent") ? "router-default" : "human",
    provider: resource.resource_type.includes("agent") ? "forge" : "team",
    tokens: 0,
  }));
}

function buildNodes(agents: AgentNodeData[]): Node[] {
  const positions = [
    { x: 0, y: 140 },
    { x: 300, y: 40 },
    { x: 300, y: 250 },
    { x: 600, y: 40 },
    { x: 600, y: 250 },
    { x: 900, y: 140 },
  ];
  return agents.map((agent, index) => ({
    id: agent.id,
    type: "agent",
    data: agent as unknown as Record<string, unknown>,
    position: positions[index % positions.length],
  }));
}

function buildEdges(agents: AgentNodeData[]): Edge[] {
  return agents.slice(1).map((agent, index) => ({
    id: `${agents[index].id}-${agent.id}`,
    source: agents[index].id,
    target: agent.id,
    type: "smoothstep",
  }));
}

function resolveAgentId(agents: AgentNodeData[], event: WSEvent) {
  const hint = slug(event.agent_name || event.agent_id || "");
  const exact = agents.find((agent) => hint && (agent.id === hint || slug(agent.name) === hint));
  if (exact) return exact.id;
  const fuzzy = agents.find((agent) => hint && (hint.includes(agent.id) || agent.id.includes(hint)));
  if (fuzzy) return fuzzy.id;
  return agents.find((agent) => agent.status === "working")?.id || agents[0]?.id;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Check, CircleAlert } from "lucide-react";
import AgentFactoryScene from "../AgentFactoryScene";
import { cn } from "../../lib/cn";
import { Progress } from "../ui/progress";
import type { Agent } from "../../types";

export interface AgentNodeData {
  id: string;
  name: string;
  role: string;
  task: string;
  status: "idle" | "working" | "completed" | "error" | "waiting";
  progress: number;
  model: string;
  provider: string;
  tokens: number;
}

const miniAgents: Agent[] = [
  {
    id: "project_manager",
    name: "Forge-PM",
    role: "planner",
    icon: "brain",
    color: "accent",
    status: "working",
    current_task: "Planning",
    progress: 42,
  },
];

function AgentNodeComponent({ data, selected }: NodeProps) {
  const agent = data as unknown as AgentNodeData;
  return (
    <div
      className={cn(
        "relative w-[220px] rounded-xl border bg-surface-1 p-3 text-fg shadow-none transition",
        selected ? "border-accent" : "border-hairline",
        agent.status === "working" && "animate-pulse",
        agent.status === "completed" && "border-success",
        agent.status === "error" && "border-danger",
      )}
    >
      <Handle type="target" position={Position.Left} className="!border-hairline !bg-surface-3" />
      <Handle type="source" position={Position.Right} className="!border-hairline !bg-surface-3" />

      <div className="flex items-start gap-3">
        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-hairline bg-canvas">
          <div className="origin-top-left scale-[0.12]">
            <div className="h-[560px] w-[560px]">
              <AgentFactoryScene agents={miniAgents} />
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate text-sm font-semibold text-fg-strong">{agent.role}</h2>
            <StatusIcon status={agent.status} />
          </div>
          <div className="mt-0.5 truncate text-xs text-fg-muted">{agent.name}</div>
        </div>
      </div>

      <p className="mt-3 line-clamp-2 min-h-10 text-xs leading-5 text-fg-muted">{agent.task}</p>
      <div className="mt-3 space-y-2">
        <Progress value={agent.progress} className="h-1" />
        <div className="flex items-center justify-between gap-2">
          <span className="truncate rounded-full border border-hairline bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-fg-muted">
            {agent.provider}/{agent.model}
          </span>
          <span className="font-mono text-[11px] text-fg">{agent.tokens.toLocaleString()} tok</span>
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: AgentNodeData["status"] }) {
  if (status === "completed") return <Check className="h-4 w-4 text-success" />;
  if (status === "error") return <CircleAlert className="h-4 w-4 text-danger" />;
  return <Bot className={status === "working" ? "h-4 w-4 text-accent" : "h-4 w-4 text-fg-muted"} />;
}

export const AgentNode = memo(AgentNodeComponent);

import type { Agent } from "../types";
import {
  Crown,
  Palette,
  Server,
  Container,
  TestTube,
  FileText,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Crown,
  Palette,
  Server,
  Container,
  TestTube,
  FileText,
};

const STATUS_STYLES: Record<string, string> = {
  idle: "bg-slate-500",
  working: "bg-amber-400 animate-pulse",
  completed: "bg-emerald-400",
  error: "bg-red-400",
  waiting: "bg-sky-400",
};

interface Props {
  agent: Agent;
}

export default function AgentCard({ agent }: Props) {
  const Icon = ICONS[agent.icon] ?? FileText;
  const statusDot = STATUS_STYLES[agent.status] ?? STATUS_STYLES.idle;

  return (
    <div
      className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3 transition-all hover:border-slate-700"
      style={{ borderTopColor: agent.color, borderTopWidth: "3px" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="w-5 h-5" style={{ color: agent.color }} />
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{agent.name}</h3>
            <p className="text-[11px] text-slate-500">{agent.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="text-[11px] text-slate-400 capitalize">{agent.status}</span>
        </div>
      </div>

      {/* Task */}
      {agent.current_task && (
        <p className="text-xs text-slate-400 truncate" title={agent.current_task}>
          {agent.current_task}
        </p>
      )}

      {/* Progress */}
      <div className="w-full bg-slate-800 rounded-full h-1.5">
        <div
          className="progress-bar h-1.5 rounded-full"
          style={{
            width: `${agent.progress}%`,
            backgroundColor: agent.color,
          }}
        />
      </div>
      <span className="text-[11px] text-slate-500 text-right">{agent.progress}%</span>
    </div>
  );
}

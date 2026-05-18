import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import type { LogEntry } from "../types";

const LEVEL_COLORS: Record<string, string> = {
  info: "text-slate-300",
  warning: "text-amber-400",
  error: "text-red-400",
};

interface Props {
  logs: LogEntry[];
}

export default function LogPanel({ logs }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-800/50">
        <Terminal className="w-4 h-4 text-slate-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Live Logs
        </span>
        <span className="ml-auto text-[11px] text-slate-500">{logs.length} entries</span>
      </div>

      <div className="max-h-64 overflow-y-auto p-3 space-y-0.5 font-mono text-xs">
        {logs.map((log, i) => {
          const color = LEVEL_COLORS[log.level] ?? LEVEL_COLORS.info;
          const time = log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "";
          return (
            <div key={i} className={`flex gap-2 ${color}`}>
              <span className="text-slate-600 shrink-0">{time}</span>
              <span className="text-slate-500 shrink-0 w-24 truncate">
                [{log.agent_name}]
              </span>
              <span className="break-all">{log.message}</span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}

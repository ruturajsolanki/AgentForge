import { Hammer, Settings } from "lucide-react";

interface Props {
  connected: boolean;
  demoMode: boolean;
  onOpenSettings: () => void;
}

export default function Header({ connected, demoMode, onOpenSettings }: Props) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Hammer className="w-6 h-6 text-violet-400" />
          <span className="text-lg font-bold tracking-tight">
            Agent<span className="text-violet-400">Forge</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {demoMode && (
            <span className="text-[11px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Demo
            </span>
          )}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,.6)]" : "bg-red-400"}`}
            />
            {connected ? "Connected" : "Disconnected"}
          </div>
          <button
            onClick={onOpenSettings}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-violet-400 transition-colors"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

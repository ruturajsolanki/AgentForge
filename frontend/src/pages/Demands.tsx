import { useEffect, useState } from "react";
import { forgeApi } from "../services/forgeApi";
import type { Demand } from "../types";

interface DemandsListProps {
  onSelect: (publicId: string) => void;
  onNew: () => void;
  refreshKey: number;
}

const STAGE_COLOR: Record<string, string> = {
  ingested: "text-slate-400 bg-slate-800/40",
  understanding: "text-sky-300 bg-sky-900/30",
  deciding: "text-violet-300 bg-violet-900/30",
  allocating: "text-amber-300 bg-amber-900/30",
  awaiting_approval: "text-amber-300 bg-amber-900/30",
  executing: "text-emerald-300 bg-emerald-900/30 animate-pulse",
  monitoring: "text-emerald-300 bg-emerald-900/30",
  explaining: "text-emerald-300 bg-emerald-900/30",
  completed: "text-emerald-300 bg-emerald-900/30",
  failed: "text-rose-300 bg-rose-900/30",
  cancelled: "text-slate-500 bg-slate-800/40",
};

export default function DemandsList({ onSelect, onNew, refreshKey }: DemandsListProps) {
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    forgeApi
      .listDemands()
      .then(setDemands)
      .catch(() => setDemands([]))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Demands</h1>
          <p className="text-sm text-slate-500">
            Every project ForgeOS planned, decided on, and (most of the time) shipped.
          </p>
        </div>
        <button
          onClick={onNew}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white"
        >
          New demand
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Loading…</div>
      ) : demands.length === 0 ? (
        <div className="text-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-2xl">
          No demands yet. Click <span className="text-slate-300">New demand</span> to get started.
        </div>
      ) : (
        <ul className="space-y-2">
          {demands.map((d) => (
            <li key={d.id}>
              <button
                onClick={() => onSelect(d.public_id)}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800/60 hover:border-slate-700 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-100 truncate flex-1">
                    {d.raw_text}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${STAGE_COLOR[d.stage] || ""}`}
                  >
                    {d.stage.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1 flex items-center gap-3">
                  <span className="font-mono">{d.public_id}</span>
                  {d.created_at && <span>{new Date(d.created_at).toLocaleString()}</span>}
                  {d.decision && (
                    <span className="text-violet-400">
                      {d.decision.execution_mode.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

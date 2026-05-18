import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Zap,
  Brain,
  Code2,
  ScrollText,
  Workflow,
  Sparkles,
  ChevronDown,
  Loader2,
  Search,
  Pencil,
  X,
  Check,
  RotateCcw,
} from "lucide-react";

interface RoutingRow {
  role: string;
  kind: string;
  priority: string;
  provider: string;
  model: string;
  overridden?: boolean;
}

interface RoutingResponse {
  primary_provider: string;
  speed_shortcut: string | null;
  catalog: Record<string, Record<string, string>>;
  routing: RoutingRow[];
}

interface ModelEntry {
  id: string;
  context_length?: number;
  owned_by?: string;
}

interface ModelsResponse {
  nim: ModelEntry[];
  groq: ModelEntry[];
  openrouter: ModelEntry[];
  openrouter_free: ModelEntry[];
}

interface SettingsResponse {
  role_overrides?: Record<string, string>;
}

const KIND_META: Record<string, { icon: typeof Brain; cls: string; label: string }> = {
  reasoning: { icon: Brain, cls: "bg-violet-500/10 text-violet-300 border-violet-500/20", label: "Reasoning" },
  code: { icon: Code2, cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", label: "Code" },
  code_deep: { icon: Code2, cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20", label: "Code-deep" },
  structured: { icon: Workflow, cls: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20", label: "Structured" },
  prose: { icon: ScrollText, cls: "bg-amber-500/10 text-amber-300 border-amber-500/20", label: "Prose" },
  embed: { icon: Sparkles, cls: "bg-rose-500/10 text-rose-300 border-rose-500/20", label: "Embed" },
  general: { icon: Activity, cls: "bg-slate-500/10 text-slate-300 border-slate-500/20", label: "General" },
};

const PRIORITY_META: Record<string, { icon: typeof Zap; label: string; cls: string }> = {
  quality: { icon: Sparkles, label: "Quality", cls: "bg-violet-500/10 text-violet-300 border-violet-500/20" },
  balanced: { icon: Activity, label: "Balanced", cls: "bg-slate-500/10 text-slate-300 border-slate-500/20" },
  speed: { icon: Zap, label: "Speed", cls: "bg-amber-500/10 text-amber-300 border-amber-500/20" },
};

// Provider names recognised in "provider/model" override strings.
const PROVIDERS = ["nim", "groq", "openrouter", "vllm", "ollama", "browser", "openai"] as const;
type Provider = (typeof PROVIDERS)[number];

export default function SmartRoutingPanel() {
  const [routing, setRouting] = useState<RoutingResponse | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [browser, setBrowser] = useState<"nim" | "groq" | "openrouter_free">("nim");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editProvider, setEditProvider] = useState<Provider>("nim");
  const [editModel, setEditModel] = useState("");
  const [editFilter, setEditFilter] = useState("");

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [r, m, s] = await Promise.all([
        fetch("/api/llm/routing").then((r) => r.json()),
        fetch("/api/llm/models").then((r) => r.json()),
        fetch("/api/settings").then((r) => r.json()) as Promise<SettingsResponse>,
      ]);
      setRouting(r);
      setModels(m);
      setOverrides(s.role_overrides ?? {});
    } catch {
      // noop
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && !routing) fetchAll();
  }, [open, routing]);

  const filteredModels = useMemo(() => {
    if (!models) return [];
    const list = models[browser] ?? [];
    if (!filter.trim()) return list;
    const q = filter.toLowerCase();
    return list.filter((m) => m.id.toLowerCase().includes(q));
  }, [models, browser, filter]);

  const editableModelList = useMemo(() => {
    if (!models) return [];
    const map: Record<Provider, ModelEntry[]> = {
      nim: models.nim,
      groq: models.groq,
      openrouter: models.openrouter_free,
      vllm: [],
      ollama: [],
      browser: [],
      openai: [],
    };
    const list = map[editProvider] ?? [];
    if (!editFilter.trim()) return list;
    const q = editFilter.toLowerCase();
    return list.filter((m) => m.id.toLowerCase().includes(q));
  }, [models, editProvider, editFilter]);

  const openEditor = (role: string) => {
    const existing = overrides[role];
    if (existing) {
      const slash = existing.indexOf("/");
      const head = slash > 0 ? existing.slice(0, slash) : "";
      if (PROVIDERS.includes(head as Provider)) {
        setEditProvider(head as Provider);
        setEditModel(existing.slice(slash + 1));
      } else {
        setEditProvider((routing?.primary_provider as Provider) ?? "nim");
        setEditModel(existing);
      }
    } else {
      setEditProvider((routing?.primary_provider as Provider) ?? "nim");
      setEditModel("");
    }
    setEditFilter("");
    setEditingRole(role);
  };

  const closeEditor = () => {
    setEditingRole(null);
    setEditModel("");
    setEditFilter("");
  };

  const persistOverrides = async (next: Record<string, string>) => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_overrides: next }),
      });
      setOverrides(next);
      // Re-fetch routing so the table reflects new picks.
      const r = await fetch("/api/llm/routing").then((r) => r.json());
      setRouting(r);
    } finally {
      setSaving(false);
    }
  };

  const applyOverride = async () => {
    if (!editingRole || !editModel.trim()) return;
    const value = `${editProvider}/${editModel.trim()}`;
    await persistOverrides({ ...overrides, [editingRole]: value });
    closeEditor();
  };

  const clearOverride = async (role: string) => {
    const next = { ...overrides };
    delete next[role];
    await persistOverrides(next);
    if (editingRole === role) closeEditor();
  };

  const resetAll = async () => {
    if (!Object.keys(overrides).length) return;
    await persistOverrides({});
  };

  return (
    <div className="border-t border-slate-800 pt-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Workflow className="w-3.5 h-3.5" />
          Smart Routing
          {Object.keys(overrides).length > 0 && (
            <span className="ml-2 chip text-[10px] px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/30 normal-case tracking-normal">
              {Object.keys(overrides).length} override{Object.keys(overrides).length === 1 ? "" : "s"}
            </span>
          )}
        </p>
        <ChevronDown
          className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3 space-y-4">
          {loading && !routing ? (
            <div className="flex items-center justify-center py-8 text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : routing ? (
            <>
              <div className="text-[11px] text-slate-500 leading-relaxed">
                Each agent role is routed to the model that fits it best on your
                <span className="text-slate-300 font-semibold"> {routing.primary_provider.toUpperCase()}</span> primary.
                {routing.speed_shortcut && (
                  <>
                    {" "}Speed-first roles hop directly to
                    <span className="text-amber-400 font-semibold"> {routing.speed_shortcut.toUpperCase()}</span>.
                  </>
                )}
                {" "}Click the pencil to pin a specific model for any role.
              </div>

              <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-900/60">
                    <tr className="text-slate-500 text-left">
                      <th className="py-2 px-3 font-medium">Role</th>
                      <th className="py-2 px-1 font-medium">Kind</th>
                      <th className="py-2 px-1 font-medium">Mode</th>
                      <th className="py-2 px-3 font-medium">Provider · Model</th>
                      <th className="py-2 px-1 font-medium w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {routing.routing.map((row) => {
                      const km = KIND_META[row.kind] ?? KIND_META.general;
                      const pm = PRIORITY_META[row.priority] ?? PRIORITY_META.balanced;
                      const KIcon = km.icon;
                      const PIcon = pm.icon;
                      const speedJump =
                        row.priority === "speed" && row.provider !== routing.primary_provider;
                      return (
                        <tr key={row.role} className="hover:bg-slate-800/40">
                          <td className="py-1.5 px-3 text-slate-200 font-medium">
                            <div className="flex items-center gap-1.5">
                              {row.role}
                              {row.overridden && (
                                <span
                                  className="chip text-[9px] px-1 py-0 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30"
                                  title="Manual override pinned for this role"
                                >
                                  manual
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-1.5 px-1">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border ${km.cls}`}
                            >
                              <KIcon className="w-2.5 h-2.5" />
                              {km.label}
                            </span>
                          </td>
                          <td className="py-1.5 px-1">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] border ${pm.cls}`}
                            >
                              <PIcon className="w-2.5 h-2.5" />
                              {pm.label}
                            </span>
                          </td>
                          <td className="py-1.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                  speedJump
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                    : "bg-slate-700/40 text-slate-300 border border-slate-600/30"
                                }`}
                              >
                                {row.provider}
                              </span>
                              <span className="font-mono text-slate-400 text-[10px] truncate" title={row.model}>
                                {row.model}
                              </span>
                            </div>
                          </td>
                          <td className="py-1.5 px-1 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {row.overridden && (
                                <button
                                  onClick={() => clearOverride(row.role)}
                                  className="p-1 rounded hover:bg-slate-700/40 text-slate-500 hover:text-rose-300"
                                  title="Clear override"
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </button>
                              )}
                              <button
                                onClick={() => openEditor(row.role)}
                                className="p-1 rounded hover:bg-slate-700/40 text-slate-500 hover:text-violet-300"
                                title="Override model for this role"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Inline override editor */}
              {editingRole && (
                <div className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-violet-300">
                      Override model for <span className="font-mono">{editingRole}</span>
                    </p>
                    <button
                      onClick={closeEditor}
                      className="p-0.5 rounded hover:bg-slate-700/40 text-slate-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {(["nim", "groq", "openrouter"] as Provider[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => setEditProvider(p)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                          editProvider === p
                            ? "border-violet-500 bg-violet-500/10 text-violet-300"
                            : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                        }`}
                      >
                        {p.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                    <input
                      value={editFilter}
                      onChange={(e) => setEditFilter(e.target.value)}
                      placeholder="Search models…"
                      className="w-full bg-slate-800/60 border border-slate-700 rounded-md pl-7 pr-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-md border border-slate-700/40 divide-y divide-slate-800/40">
                    {editableModelList.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setEditModel(m.id)}
                        className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-slate-800/60 flex items-center gap-2 ${
                          editModel === m.id ? "bg-violet-500/10 text-violet-200" : "text-slate-300"
                        }`}
                      >
                        <span className="font-mono truncate flex-1">{m.id}</span>
                        {m.context_length && (
                          <span className="text-slate-500 font-mono text-[10px]">
                            ctx={Math.round(m.context_length / 1024)}k
                          </span>
                        )}
                        {editModel === m.id && <Check className="w-3 h-3 text-violet-300" />}
                      </button>
                    ))}
                    {!editableModelList.length && (
                      <div className="px-3 py-3 text-center text-slate-500 text-[11px] italic">
                        No matching models.
                      </div>
                    )}
                  </div>
                  <input
                    value={editModel}
                    onChange={(e) => setEditModel(e.target.value)}
                    placeholder="…or type a model id"
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500 font-mono"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={applyOverride}
                      disabled={!editModel.trim() || saving}
                      className="flex-1 py-1.5 rounded-md text-[11px] font-medium bg-violet-600 text-white hover:bg-violet-500 disabled:opacity-40"
                    >
                      {saving ? "Saving…" : `Pin ${editProvider}/${editModel.trim() || "…"}`}
                    </button>
                    <button
                      onClick={closeEditor}
                      className="px-3 py-1.5 rounded-md text-[11px] font-medium border border-slate-700 text-slate-400 hover:border-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Model browser */}
              {models && (
                <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/60 border-b border-slate-700/40">
                    <p className="text-[11px] font-semibold text-slate-300">Model catalog</p>
                    <div className="flex gap-1 ml-auto">
                      {([
                        ["nim", "NIM", models.nim.length],
                        ["groq", "Groq", models.groq.length],
                        ["openrouter_free", "OpenRouter (free)", models.openrouter_free.length],
                      ] as const).map(([key, label, count]) => (
                        <button
                          key={key}
                          onClick={() => setBrowser(key as typeof browser)}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all ${
                            browser === key
                              ? "border-violet-500 bg-violet-500/10 text-violet-300"
                              : "border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600"
                          }`}
                        >
                          {label}
                          <span className="ml-1 text-slate-500 font-mono">{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="px-3 py-2 border-b border-slate-700/40 bg-slate-900/30">
                    <div className="relative">
                      <Search className="w-3 h-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
                      <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter models…"
                        className="w-full bg-slate-800/60 border border-slate-700 rounded-md pl-7 pr-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-800/40">
                    {filteredModels.map((m) => (
                      <div
                        key={m.id}
                        className="px-3 py-1.5 flex items-center gap-3 text-[11px] hover:bg-slate-800/40"
                      >
                        <span className="font-mono text-slate-300 truncate flex-1" title={m.id}>
                          {m.id}
                        </span>
                        {m.context_length && (
                          <span className="text-slate-500 font-mono">
                            ctx={Math.round(m.context_length / 1024)}k
                          </span>
                        )}
                      </div>
                    ))}
                    {!filteredModels.length && (
                      <div className="px-3 py-4 text-center text-slate-500 text-[11px] italic">
                        No models match.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={fetchAll}
                  disabled={loading}
                  className="flex-1 py-1.5 rounded-md text-[11px] font-medium border border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600 hover:bg-slate-800/60"
                >
                  {loading ? "Refreshing…" : "Refresh"}
                </button>
                {Object.keys(overrides).length > 0 && (
                  <button
                    onClick={resetAll}
                    disabled={saving}
                    className="py-1.5 px-3 rounded-md text-[11px] font-medium border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:border-rose-500/50 hover:bg-rose-500/20"
                  >
                    Reset all overrides
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

import { useEffect, useState, useCallback } from "react";
import {
  X,
  Save,
  RefreshCw,
  Server,
  Cpu,
  Code,
  FileText,
  Database,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
  Globe,
  Eye,
  EyeOff,
  MonitorSmartphone,
  Shield,
} from "lucide-react";
import BrowserModelPanel from "./BrowserModelPanel";
import SmartRoutingPanel from "./SmartRoutingPanel";

interface ProviderPreset {
  base_url: string;
  default_model: string;
}

interface Settings {
  llm_provider: string;
  ollama_url: string;
  api_base_url: string;
  api_key_set: boolean;
  default_model: string;
  code_model: string;
  embed_model: string;
  demo_mode: boolean;
  vector_backend: string;
  supabase_url: string;
  supabase_anon_key_set: boolean;
  available_models: string[];
  provider_connected: boolean;
  provider_presets: Record<string, ProviderPreset>;
  groq_api_base?: string;
  groq_api_key_set?: boolean;
  groq_default_model?: string;
  openrouter_api_base?: string;
  openrouter_api_key_set?: boolean;
  openrouter_default_model?: string;
  fallback_active?: boolean;
  fallback_chain?: string[];
}

interface Draft {
  llm_provider?: string;
  ollama_url?: string;
  api_base_url?: string;
  api_key?: string;
  default_model?: string;
  code_model?: string;
  embed_model?: string;
  demo_mode?: boolean;
  vector_backend?: string;
  supabase_url?: string;
  supabase_anon_key?: string;
  groq_api_base?: string;
  groq_api_key?: string;
  groq_default_model?: string;
  openrouter_api_base?: string;
  openrouter_api_key?: string;
  openrouter_default_model?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onDemoModeChange?: (demo: boolean) => void;
  onBrowserLLMChange?: (active: boolean) => void;
  onProviderChange?: (provider: string) => void;
}

const PROVIDER_LABELS: Record<string, { name: string; hint: string; free: boolean; recommended?: boolean }> = {
  nim: { name: "NVIDIA NIM (NGC)", hint: "Production — Llama 3.3 / Qwen 2.5 Coder / DeepSeek via build.nvidia.com", free: true, recommended: true },
  vllm: { name: "vLLM (Self-hosted)", hint: "GLM 4.5 / 4.6 served from your GPU via vLLM. OpenAI-compatible.", free: false },
  browser: { name: "Browser (WebLLM)", hint: "Runs in your browser — fully offline, no server needed", free: true },
  ollama: { name: "Ollama (Local)", hint: "Run models on your machine via Ollama", free: true },
  groq: { name: "Groq", hint: "Free tier — very fast cloud inference", free: true },
  openai: { name: "OpenAI", hint: "GPT-4o, GPT-4o-mini", free: false },
};

export default function SettingsPanel({ open, onClose, onDemoModeChange, onBrowserLLMChange, onProviderChange }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showOpenRouterKey, setShowOpenRouterKey] = useState(false);
  const [browserModelReady, setBrowserModelReady] = useState(false);

  useEffect(() => {
    const provider = draft.llm_provider || settings?.llm_provider;
    if (provider === "browser") {
      onBrowserLLMChange?.(browserModelReady);
    }
  }, [browserModelReady, draft.llm_provider, settings?.llm_provider, onBrowserLLMChange]);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      const data: Settings = await res.json();
      setSettings(data);
      setDraft({
        llm_provider: data.llm_provider,
        ollama_url: data.ollama_url,
        api_base_url: data.api_base_url,
        default_model: data.default_model,
        code_model: data.code_model,
        embed_model: data.embed_model,
        demo_mode: data.demo_mode,
        vector_backend: data.vector_backend,
        supabase_url: data.supabase_url,
        groq_api_base: data.groq_api_base,
        groq_default_model: data.groq_default_model,
        openrouter_api_base: data.openrouter_api_base,
        openrouter_default_model: data.openrouter_default_model,
      });
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchSettings();
      setShowKey(false);
    }
  }, [open, fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
        if (data.saved) {
        setSettings((prev) => (prev ? { ...prev, ...data } : prev));
        setSaved(true);
        if (onDemoModeChange && draft.demo_mode !== undefined) {
          onDemoModeChange(draft.demo_mode);
        }
        onBrowserLLMChange?.(draft.llm_provider === "browser" && browserModelReady);
        if (draft.llm_provider) onProviderChange?.(draft.llm_provider);
        if (draft.api_key) {
          setDraft((d) => ({ ...d, api_key: undefined }));
        }
        if (draft.groq_api_key) {
          setDraft((d) => ({ ...d, groq_api_key: undefined }));
        }
        if (draft.openrouter_api_key) {
          setDraft((d) => ({ ...d, openrouter_api_key: undefined }));
        }
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      /* noop */
    } finally {
      setSaving(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    const preset = settings?.provider_presets?.[provider];
    setDraft((d) => ({
      ...d,
      llm_provider: provider,
      api_base_url: preset?.base_url ?? d.api_base_url,
      default_model: preset?.default_model ?? d.default_model,
      code_model: preset?.default_model ?? d.code_model,
      api_key: undefined,
      demo_mode: false,
    }));
    if (provider !== "browser") {
      onBrowserLLMChange?.(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      await fetchSettings();
    } catch {
      /* noop */
    }
  };

  if (!open) return null;

  const isBrowser = draft.llm_provider === "browser";
  const isCloud = !isBrowser && draft.llm_provider !== "ollama";
  const isConnected = settings?.provider_connected ?? false;
  const models = settings?.available_models ?? [];

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl overflow-y-auto animate-slide-in">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-violet-400" />
            Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading && !settings ? (
          <div className="flex items-center justify-center h-64 text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : settings ? (
          <div className="p-5 space-y-6">
            {/* Provider Picker */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                LLM Provider
              </p>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(PROVIDER_LABELS).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => handleProviderChange(key)}
                    className={`text-left px-4 py-3 rounded-xl border transition-all ${
                      draft.llm_provider === key
                        ? "border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/5"
                        : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600 hover:bg-slate-800/60"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-semibold ${draft.llm_provider === key ? "text-violet-300" : "text-slate-300"}`}
                      >
                        {info.name}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {info.recommended && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            Recommended
                          </span>
                        )}
                        {key === "browser" && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                            Offline
                          </span>
                        )}
                        {info.free && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                            Free
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">{info.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Browser Model Panel */}
            {draft.llm_provider === "browser" && (
              <BrowserModelPanel onModelReady={setBrowserModelReady} />
            )}

            {/* Connection Status */}
            {draft.llm_provider !== "browser" && (
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {isCloud ? "API Status" : "Ollama Status"}
                </span>
                <div className="flex items-center gap-1.5">
                  {isConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                  <span
                    className={`text-xs font-medium ${isConnected ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {isConnected ? "Connected" : "Not connected"}
                  </span>
                  <button
                    onClick={handleRefresh}
                    disabled={loading}
                    className="ml-2 p-1 rounded hover:bg-slate-700 text-slate-400 transition-colors"
                    title="Test connection"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
              {isConnected && models.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-2">
                  {models.length} model{models.length !== 1 ? "s" : ""} available
                </p>
              )}
              {!isConnected && !isCloud && (
                <p className="text-[11px] text-amber-400/80 mt-2">
                  Start Ollama: <code className="bg-slate-800 px-1 rounded">ollama serve</code>
                </p>
              )}
              {!isConnected && isCloud && !settings.api_key_set && !draft.api_key && (
                <p className="text-[11px] text-amber-400/80 mt-2">
                  Enter your API key below and save to connect
                </p>
              )}
            </div>
            )}

            {/* API Key (cloud providers) */}
            {isCloud && (
              <Field
                icon={<Key className="w-4 h-4" />}
                label="API Key"
                hint={
                  settings.api_key_set
                    ? "Key is saved. Enter a new one to replace it."
                    : `Get a free key from the ${PROVIDER_LABELS[draft.llm_provider ?? "groq"]?.name ?? "provider"} console`
                }
              >
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={draft.api_key ?? (settings.api_key_set ? "••••••••••••••••" : "")}
                    onChange={(e) => setDraft({ ...draft, api_key: e.target.value })}
                    onFocus={() => {
                      if (!draft.api_key && settings.api_key_set) {
                        setDraft({ ...draft, api_key: "" });
                      }
                    }}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-slate-100 font-mono focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    placeholder="sk-... or API key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
            )}

            {/* Ollama URL (only for Ollama) */}
            {!isCloud && !isBrowser && (
              <Field
                icon={<Server className="w-4 h-4" />}
                label="Ollama URL"
                hint="Base URL for your local Ollama instance"
              >
                <input
                  type="text"
                  value={draft.ollama_url ?? ""}
                  onChange={(e) => setDraft({ ...draft, ollama_url: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                  placeholder="http://localhost:11434"
                />
              </Field>
            )}

            {/* API Base URL (cloud providers) */}
            {isCloud && (
              <Field
                icon={<Server className="w-4 h-4" />}
                label="API Base URL"
                hint="Auto-filled from provider preset"
              >
                <input
                  type="text"
                  value={draft.api_base_url ?? ""}
                  onChange={(e) => setDraft({ ...draft, api_base_url: e.target.value })}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono text-[12px] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                />
              </Field>
            )}

            {/* Smart routing table — shows which model serves which role. */}
            {!isBrowser && <SmartRoutingPanel />}

            {/* Fallback chain (auto-engages on rate-limit / 5xx from NIM or vLLM) */}
            {(draft.llm_provider === "nim" || draft.llm_provider === "vllm") && (
              <div className="border-t border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Fallback Chain
                  </p>
                  {settings.fallback_active ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 border border-slate-600/30">
                      Idle
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">
                    {draft.llm_provider === "nim" ? "NIM" : "vLLM"}
                  </span>
                  {(settings.fallback_chain ?? []).map((tier) => (
                    <span key={tier} className="flex items-center gap-1.5">
                      <span className="text-slate-600 text-xs">→</span>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {tier}
                      </span>
                    </span>
                  ))}
                  {!(settings.fallback_chain ?? []).length && (
                    <span className="text-[11px] text-slate-500 italic">Add a key below to enable fallback</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
                  Auto-engages on rate-limits / 5xx / timeouts. The chain is walked in order until a tier succeeds.
                </p>

                {/* Groq tier */}
                <div className="mb-4 p-3 rounded-xl bg-slate-800/30 border border-slate-700/40">
                  <p className="text-[11px] font-semibold text-slate-300 mb-1">Tier 1 — Groq</p>
                  <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                    Same Llama 3.3 70B + Qwen 2.5 Coder 32B at ~1000 RPM.{" "}
                    <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300 underline">Get a free key →</a>
                  </p>
                  <div className="space-y-3">
                    <Field
                      icon={<Key className="w-4 h-4" />}
                      label="Groq API Key"
                      hint={settings.groq_api_key_set ? "Saved." : "Paste your gsk_... key"}
                    >
                      <div className="relative">
                        <input
                          type={showGroqKey ? "text" : "password"}
                          value={draft.groq_api_key ?? (settings.groq_api_key_set ? "••••••••••••••••" : "")}
                          onChange={(e) => setDraft({ ...draft, groq_api_key: e.target.value })}
                          onFocus={() => {
                            if (!draft.groq_api_key && settings.groq_api_key_set) {
                              setDraft({ ...draft, groq_api_key: "" });
                            }
                          }}
                          className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-slate-100 font-mono focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                          placeholder="gsk_..."
                        />
                        <button
                          type="button"
                          onClick={() => setShowGroqKey(!showGroqKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
                        >
                          {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>
                    <Field
                      icon={<Cpu className="w-4 h-4" />}
                      label="Default Model"
                      hint="Coder requests auto-map to qwen-2.5-coder-32b."
                    >
                      <input
                        type="text"
                        value={draft.groq_default_model ?? ""}
                        onChange={(e) => setDraft({ ...draft, groq_default_model: e.target.value })}
                        className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono text-[12px] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                        placeholder="llama-3.3-70b-versatile"
                      />
                    </Field>
                  </div>
                </div>

                {/* OpenRouter tier */}
                <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/40">
                  <p className="text-[11px] font-semibold text-slate-300 mb-1">Tier 2 — OpenRouter (free)</p>
                  <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
                    Last-resort safety net. 25+ free models (Llama 3.3, DeepSeek V3, Qwen Coder, Gemini 2.0 Flash). 20 RPM / 50 req/day on free tier.{" "}
                    <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-violet-400 hover:text-violet-300 underline">Get a free key →</a>
                  </p>
                  <div className="space-y-3">
                    <Field
                      icon={<Key className="w-4 h-4" />}
                      label="OpenRouter API Key"
                      hint={settings.openrouter_api_key_set ? "Saved." : "Paste your sk-or-v1-... key"}
                    >
                      <div className="relative">
                        <input
                          type={showOpenRouterKey ? "text" : "password"}
                          value={draft.openrouter_api_key ?? (settings.openrouter_api_key_set ? "••••••••••••••••" : "")}
                          onChange={(e) => setDraft({ ...draft, openrouter_api_key: e.target.value })}
                          onFocus={() => {
                            if (!draft.openrouter_api_key && settings.openrouter_api_key_set) {
                              setDraft({ ...draft, openrouter_api_key: "" });
                            }
                          }}
                          className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 pr-10 text-sm text-slate-100 font-mono focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                          placeholder="sk-or-v1-..."
                        />
                        <button
                          type="button"
                          onClick={() => setShowOpenRouterKey(!showOpenRouterKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
                        >
                          {showOpenRouterKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </Field>
                    <Field
                      icon={<Cpu className="w-4 h-4" />}
                      label="Default Model"
                      hint="Use any :free model. Coder/DeepSeek auto-map when possible."
                    >
                      <input
                        type="text"
                        value={draft.openrouter_default_model ?? ""}
                        onChange={(e) => setDraft({ ...draft, openrouter_default_model: e.target.value })}
                        className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono text-[12px] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                        placeholder="meta-llama/llama-3.3-70b-instruct:free"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            )}

            {/* Model Selection (not shown for browser — handled by BrowserModelPanel) */}
            {!isBrowser && (
              <>
                <Field
                  icon={<Cpu className="w-4 h-4" />}
                  label="Default Model"
                  hint="Primary model for planning and general tasks"
                >
                  <ModelInput
                    value={draft.default_model ?? ""}
                    onChange={(v) => setDraft({ ...draft, default_model: v })}
                    models={models}
                    placeholder="e.g. mistral, llama3, gpt-4o-mini"
                  />
                </Field>

                <Field
                  icon={<Code className="w-4 h-4" />}
                  label="Code Model"
                  hint="Used for code generation tasks"
                >
                  <ModelInput
                    value={draft.code_model ?? ""}
                    onChange={(v) => setDraft({ ...draft, code_model: v })}
                    models={models}
                    placeholder="e.g. codellama, deepseek-coder"
                  />
                </Field>

                <Field
                  icon={<FileText className="w-4 h-4" />}
                  label="Embedding Model"
                  hint="For vector embeddings (context retrieval)"
                >
                  <ModelInput
                    value={draft.embed_model ?? ""}
                    onChange={(v) => setDraft({ ...draft, embed_model: v })}
                    models={models}
                    placeholder="e.g. nomic-embed-text"
                  />
                </Field>
              </>
            )}

            {/* Supabase Config */}
            <div className="border-t border-slate-800 pt-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                Supabase (Backend)
              </p>
              <div className="space-y-4">
                <Field
                  icon={<Server className="w-4 h-4" />}
                  label="Supabase URL"
                  hint="Your project URL from supabase.com (e.g. https://xxx.supabase.co)"
                >
                  <input
                    type="text"
                    value={draft.supabase_url ?? ""}
                    onChange={(e) => setDraft({ ...draft, supabase_url: e.target.value })}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono text-[12px] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    placeholder="https://your-project.supabase.co"
                  />
                </Field>
                <Field
                  icon={<Key className="w-4 h-4" />}
                  label="Supabase Anon Key"
                  hint={settings.supabase_anon_key_set ? "Key is saved. Enter a new one to replace it." : "Public anon key from your Supabase project settings"}
                >
                  <input
                    type="password"
                    value={draft.supabase_anon_key ?? (settings.supabase_anon_key_set ? "••••••••••••••••" : "")}
                    onChange={(e) => setDraft({ ...draft, supabase_anon_key: e.target.value })}
                    onFocus={() => {
                      if (!draft.supabase_anon_key && settings.supabase_anon_key_set) {
                        setDraft({ ...draft, supabase_anon_key: "" });
                      }
                    }}
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono text-[12px] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
                    placeholder="eyJhbGciOi..."
                  />
                </Field>
              </div>
            </div>

            {/* Vector Backend */}
            <Field
              icon={<Database className="w-4 h-4" />}
              label="Vector Backend"
              hint="ScaNN requires Linux (Docker); NumPy works everywhere"
            >
              <div className="flex gap-2">
                {(["numpy", "scann"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setDraft({ ...draft, vector_backend: opt })}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                      draft.vector_backend === opt
                        ? "bg-violet-600 text-white shadow-lg shadow-violet-600/20"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {opt === "numpy" ? "NumPy" : "ScaNN"}
                  </button>
                ))}
              </div>
            </Field>

            {/* Demo Mode */}
            <Field
              icon={<Zap className="w-4 h-4" />}
              label="Demo Mode"
              hint="Use fake data instead of calling the LLM"
            >
              <button
                onClick={() => setDraft({ ...draft, demo_mode: !draft.demo_mode })}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  draft.demo_mode ? "bg-violet-600" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    draft.demo_mode ? "translate-x-[26px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </Field>

            {/* Save */}
            <div className="pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  saved
                    ? "bg-emerald-600 text-white"
                    : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20"
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saving ? "Saving..." : saved ? "Saved!" : "Save Settings"}
              </button>
            </div>

            {/* Installed Models */}
            {models.length > 0 && (
              <div className="border-t border-slate-800 pt-4">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Available Models
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {models.map((m) => (
                    <button
                      key={m}
                      onClick={() =>
                        setDraft({ ...draft, default_model: m, code_model: m })
                      }
                      className="px-2 py-0.5 rounded-md bg-slate-800 text-[11px] text-slate-400 border border-slate-700/50 hover:border-violet-500/50 hover:text-violet-300 transition-colors cursor-pointer"
                      title={`Click to use ${m}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-sm text-slate-500">
            Failed to load settings
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-slate-300">
        {icon}
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {hint && <p className="text-[11px] text-slate-500 -mt-1">{hint}</p>}
      {children}
    </div>
  );
}

function ModelInput({
  value,
  onChange,
  models,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  models: string[];
  placeholder: string;
}) {
  if (models.length > 0) {
    return (
      <select
        value={models.includes(value) ? value : ""}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 appearance-none cursor-pointer"
      >
        {!models.includes(value) && (
          <option value="" disabled>
            {value || placeholder}
          </option>
        )}
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30"
      placeholder={placeholder}
    />
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, Loader2, Save, Settings, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Gate } from "./gate/Gate";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Switch } from "./ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { forgeApi } from "../services/forgeApi";

interface Props {
  open: boolean;
  onClose: () => void;
  inline?: boolean;
  onDemoModeChange?: (demo: boolean) => void;
  onBrowserLLMChange?: (active: boolean) => void;
  onProviderChange?: (provider: string) => void;
}

type Tab = "providers" | "models" | "data";

const providers = ["nim", "groq", "openrouter", "openai", "ollama", "browser"];

export default function SettingsPanel({
  open,
  onClose,
  inline = false,
  onDemoModeChange,
  onBrowserLLMChange,
  onProviderChange,
}: Props) {
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>(() => readHashTab());

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await forgeApi.getSettings();
      setSettings(data);
      setDraft(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Settings unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void fetchSettings();
  }, [fetchSettings, open]);

  useEffect(() => {
    if (!open) return;
    window.history.replaceState(null, "", `#${tab}`);
  }, [open, tab]);

  const provider = String(draft.llm_provider || draft.provider || "nim");
  const demoMode = Boolean(draft.demo_mode);
  const connected = Boolean(settings?.provider_connected || provider === "browser");

  const save = async () => {
    setSaving(true);
    try {
      const result = await forgeApi.updateSettings(draft);
      setSettings((current) => ({ ...(current || {}), ...result, ...draft }));
      onDemoModeChange?.(Boolean(draft.demo_mode));
      onBrowserLLMChange?.(provider === "browser");
      onProviderChange?.(provider);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const resetRouting = async () => {
    setDraft((current) => ({ ...current, role_overrides: {} }));
    await forgeApi.updateSettings({ role_overrides: {} });
    toast.success("Routing defaults restored");
  };

  const panel = (
    <div className={inline ? "mx-auto max-w-5xl p-4 sm:p-6" : "relative h-full w-full max-w-xl overflow-y-auto border-l border-hairline bg-surface-1 shadow-[0_12px_24px_-16px_rgba(0,0,0,0.6)]"}>
      <div className={inline ? "mb-5 flex items-center justify-between gap-3" : "sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-hairline bg-surface-1/95 px-5 py-4"}>
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-accent" />
          <div>
            <h1 className="text-xl font-semibold text-fg-strong">Settings</h1>
            <p className="text-sm text-fg-muted">Provider, model, and data controls.</p>
          </div>
        </div>
        {!inline && (
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close settings">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {loading && !settings ? (
        <div className="grid h-64 place-items-center text-fg-muted">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className={inline ? "" : "p-5"}>
          <Tabs>
            <TabsList>
              <TabsTrigger active={tab === "providers"} onClick={() => setTab("providers")}>Providers</TabsTrigger>
              <TabsTrigger active={tab === "models"} onClick={() => setTab("models")}>Models</TabsTrigger>
              <TabsTrigger active={tab === "data"} onClick={() => setTab("data")}>Data</TabsTrigger>
            </TabsList>

            {tab === "providers" && (
              <TabsContent className="grid gap-4 pt-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Primary provider</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {providers.map((item) => (
                        <button
                          key={item}
                          className={provider === item ? "rounded-xl border border-accent bg-accent-soft p-3 text-left text-sm font-medium text-fg-strong" : "rounded-xl border border-hairline bg-surface-2 p-3 text-left text-sm text-fg-muted transition hover:border-hairline-hi hover:text-fg"}
                          onClick={() => setDraft((current) => ({ ...current, llm_provider: item }))}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-2 p-3">
                      <div>
                        <div className="text-sm font-medium text-fg-strong">Connection</div>
                        <div className="text-xs text-fg-muted">{connected ? "Provider is reachable" : "Provider needs configuration"}</div>
                      </div>
                      <CheckCircle2 className={connected ? "h-5 w-5 text-success" : "h-5 w-5 text-fg-faint"} />
                    </div>
                    <LabeledInput label="API base URL" value={String(draft.api_base_url || draft.ollama_url || "")} onChange={(value) => setDraft((current) => ({ ...current, api_base_url: value }))} />
                    <LabeledInput label="API key" type="password" value={String(draft.api_key || "")} onChange={(value) => setDraft((current) => ({ ...current, api_key: value }))} placeholder={settings?.api_key_set ? "Stored key is set" : "Paste key"} />
                    <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface-2 p-3">
                      <span className="text-sm text-fg">Demo mode</span>
                      <Switch checked={demoMode} onCheckedChange={(checked) => setDraft((current) => ({ ...current, demo_mode: checked }))} />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {tab === "models" && (
              <TabsContent className="grid gap-4 pt-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Model defaults</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <LabeledInput label="Default model" value={String(draft.default_model || "")} onChange={(value) => setDraft((current) => ({ ...current, default_model: value }))} />
                    <LabeledInput label="Code model" value={String(draft.code_model || "")} onChange={(value) => setDraft((current) => ({ ...current, code_model: value }))} />
                    <LabeledInput label="Embedding model" value={String(draft.embed_model || "")} onChange={(value) => setDraft((current) => ({ ...current, embed_model: value }))} />
                    <Gate mode={{ kind: "modal", title: "Reset routing defaults?", summary: ["clear all role overrides", "keep provider credentials", "manager can override again later"] }} onConfirm={resetRouting}>
                      {(openGate) => (
                        <Button variant="secondary" onClick={openGate}>
                          <SlidersHorizontal className="h-4 w-4" />
                          Reset routing to defaults
                        </Button>
                      )}
                    </Gate>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {tab === "data" && (
              <TabsContent className="grid gap-4 pt-5">
                <Card>
                  <CardHeader>
                    <CardTitle>Data services</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <LabeledInput label="Vector backend" value={String(draft.vector_backend || "")} onChange={(value) => setDraft((current) => ({ ...current, vector_backend: value }))} />
                    <LabeledInput label="Supabase URL" value={String(draft.supabase_url || "")} onChange={(value) => setDraft((current) => ({ ...current, supabase_url: value }))} />
                    <LabeledInput label="Supabase anon key" type="password" value={String(draft.supabase_anon_key || "")} onChange={(value) => setDraft((current) => ({ ...current, supabase_anon_key: value }))} placeholder={settings?.supabase_anon_key_set ? "Stored key is set" : "Paste anon key"} />
                    <div className="rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-fg-muted">
                      <Database className="mb-2 h-4 w-4 text-accent" />
                      Secrets are only sent when saving and are not echoed back by the settings API.
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>

          <div className="mt-5 flex justify-end gap-2 border-t border-hairline pt-4">
            <Button variant="ghost" onClick={inline ? fetchSettings : onClose}>Cancel</Button>
            <Button variant="primary" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (!open) return null;
  if (inline) return panel;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-canvas/70 backdrop-blur-sm" onClick={onClose} />
      {panel}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function readHashTab(): Tab {
  const value = window.location.hash.replace("#", "");
  return value === "models" || value === "data" || value === "providers" ? value : "providers";
}

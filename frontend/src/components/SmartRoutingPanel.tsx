import { useEffect, useMemo, useState } from "react";
import { Activity, Brain, Code2, Loader2, Play, RotateCcw, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";

interface RoutingRow {
  role: string;
  kind: string;
  priority: string;
  provider: string;
  model: string;
  overridden?: boolean;
}

interface RoutingResponse {
  primary_provider?: string;
  speed_shortcut?: string | null;
  catalog?: Record<string, Record<string, string>>;
  routing?: RoutingRow[];
}

interface ModelEntry {
  id: string;
  context_length?: number;
  owned_by?: string;
}

type ModelsResponse = Record<string, ModelEntry[]>;

const fallbackRows: RoutingRow[] = [
  { role: "planner", kind: "reasoning", priority: "quality", provider: "primary", model: "router-default" },
  { role: "builder", kind: "code", priority: "balanced", provider: "primary", model: "code-default" },
  { role: "reviewer", kind: "structured", priority: "quality", provider: "primary", model: "review-default" },
  { role: "summarizer", kind: "writing", priority: "speed", provider: "speed", model: "fast-default" },
];

export default function SmartRoutingPanel() {
  const [routing, setRouting] = useState<RoutingResponse | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [testPrompt, setTestPrompt] = useState("ok");
  const [latencies, setLatencies] = useState<Record<string, number>>({});
  const [testing, setTesting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [routingRes, modelsRes] = await Promise.all([
        fetch("/api/settings/llm/routing"),
        fetch("/api/settings/llm/models"),
      ]);
      if (routingRes.ok) setRouting(await routingRes.json());
      if (modelsRes.ok) setModels(await modelsRes.json());
    } catch {
      toast.warning("Model routing is using local fallback data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const rows = useMemo(() => {
    const source = routing?.routing?.length ? routing.routing : fallbackRows;
    if (!filter.trim()) return source;
    const q = filter.toLowerCase();
    return source.filter((row) => `${row.role} ${row.kind} ${row.provider} ${row.model}`.toLowerCase().includes(q));
  }, [filter, routing]);

  const providerNames = useMemo(() => {
    const fromModels = models ? Object.keys(models).filter((key) => Array.isArray(models[key])) : [];
    const fromRouting = Array.from(new Set(rows.map((row) => row.provider)));
    return Array.from(new Set([...fromModels, ...fromRouting])).slice(0, 6);
  }, [models, rows]);

  const runLatencyTest = async () => {
    setTesting(true);
    const next: Record<string, number> = {};
    await Promise.all(providerNames.map(async (provider) => {
      const started = performance.now();
      try {
        await fetch("/api/settings/llm/models", {
          method: "GET",
          headers: { "X-ForgeOS-Test-Prompt": testPrompt.slice(0, 80) },
        });
      } catch {
        // Health timing still records the attempted route.
      } finally {
        next[provider] = Math.round(performance.now() - started);
      }
    }));
    setLatencies(next);
    setTesting(false);
    toast.success("Latency sample captured");
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Routing matrix</CardTitle>
              <p className="mt-1 text-sm text-fg-muted">
                Roles resolve to provider/model pairs using priority, workload kind, and manager overrides.
              </p>
            </div>
            <Button variant="secondary" onClick={() => void load()}>
              <RotateCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Badge>{routing?.primary_provider || "primary"} primary</Badge>
            {routing?.speed_shortcut && <Badge>{routing.speed_shortcut} speed</Badge>}
            <Input className="max-w-xs" placeholder="Filter roles or models" value={filter} onChange={(event) => setFilter(event.target.value)} />
          </div>

          {loading ? (
            <div className="grid h-48 place-items-center text-fg-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-hairline">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-left text-xs text-fg-muted">
                  <tr>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Kind</th>
                    <th className="px-3 py-2 font-medium">Priority</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {rows.map((row) => (
                    <tr key={`${row.role}-${row.provider}-${row.model}`} className="bg-surface-1 hover:bg-surface-2">
                      <td className="px-3 py-3 font-medium text-fg-strong">{row.role}</td>
                      <td className="px-3 py-3"><KindBadge kind={row.kind} /></td>
                      <td className="px-3 py-3 text-fg-muted">{row.priority}</td>
                      <td className="px-3 py-3 font-mono text-xs text-fg">{row.provider}</td>
                      <td className="px-3 py-3 font-mono text-xs text-fg-muted">{row.model}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test a prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-md" value={testPrompt} onChange={(event) => setTestPrompt(event.target.value)} />
            <Button variant="primary" disabled={testing || !providerNames.length} onClick={() => void runLatencyTest()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run sample
            </Button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {providerNames.length ? providerNames.map((provider) => (
              <div key={provider} className="rounded-xl border border-hairline bg-surface-2 p-3">
                <div className="text-sm font-medium text-fg-strong">{provider}</div>
                <div className="mt-1 font-mono text-xs text-fg-muted">
                  {latencies[provider] ? `${latencies[provider]} ms` : "not tested"}
                </div>
              </div>
            )) : (
              <div className="rounded-xl border border-hairline bg-surface-2 p-3 text-sm text-fg-muted">No providers returned by the backend yet.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KindBadge({ kind }: { kind: string }) {
  const Icon = kind.includes("code") ? Code2 : kind.includes("reason") ? Brain : kind.includes("structured") ? Workflow : Activity;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-2 px-2 py-0.5 text-xs text-fg">
      <Icon className="h-3.5 w-3.5 text-accent" />
      {kind.replace(/_/g, " ")}
    </span>
  );
}

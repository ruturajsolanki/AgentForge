import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { DemandWorkspace } from "../../../components/demand/DemandWorkspace";
import { Gate } from "../../../components/gate/Gate";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";

const devices = [
  { label: "Mobile", width: 390 },
  { label: "Tablet", width: 768 },
  { label: "Desktop", width: 0 },
];

export default function DemandPreviewRoute() {
  const { id = "" } = useParams();
  const [url, setUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const status = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/server/status`);
    if (!res.ok) throw new Error(`Preview status failed (${res.status})`);
    const data = await res.json();
    setRunning(Boolean(data.running));
    setUrl(data.url || null);
    return Boolean(data.running);
  }, [id]);

  const start = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/server/start`, { method: "POST" });
    if (!res.ok) throw new Error(`Preview start failed (${res.status})`);
    const data = await res.json();
    setRunning(Boolean(data.running));
    setUrl(data.url || null);
  }, [id]);

  const restart = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${id}/server/restart`, { method: "POST" });
      if (!res.ok) throw new Error(`Preview restart failed (${res.status})`);
      const data = await res.json();
      setRunning(Boolean(data.running));
      setUrl(data.url || null);
      setReloadKey((value) => value + 1);
      toast.success("Preview restarted");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast.error("Preview restart failed");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    status()
      .then((isRunning) => {
        if (!isRunning) return start();
        return undefined;
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [start, status]);

  return (
    <DemandWorkspace publicId={id} active="preview">
      {() => (
        <div className="grid gap-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-1 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={running ? "h-2 w-2 rounded-full bg-success" : "h-2 w-2 rounded-full bg-fg-faint"} />
              <span className="text-sm text-fg">{loading ? "Starting preview" : running ? "Preview live" : "Preview stopped"}</span>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-fg-muted" />}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {devices.map((device) => (
                <Button
                  key={device.label}
                  size="sm"
                  variant={width === device.width ? "primary" : "secondary"}
                  onClick={() => setWidth(device.width)}
                >
                  {device.label}
                </Button>
              ))}
              <Button size="sm" variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
                <RefreshCw className="h-4 w-4" />
                Reload
              </Button>
              <Gate mode={{ kind: "inline" }} onConfirm={restart}>
                {(open) => (
                  <Button size="sm" variant="secondary" onClick={open}>
                    Restart
                  </Button>
                )}
              </Gate>
              {url && (
                <Button asChild size="sm" variant="ghost">
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    New tab
                  </a>
                </Button>
              )}
            </div>
          </div>

          {error ? (
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-fg-strong">Preview unavailable</h2>
                <p className="mt-2 text-sm text-fg-muted">{error}</p>
                <Button className="mt-4" onClick={() => void start()}>Try start</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid min-h-[640px] place-items-center overflow-hidden rounded-xl border border-hairline bg-surface-1 p-3">
              {url ? (
                <iframe
                  key={reloadKey}
                  title={`${id} preview`}
                  src={url}
                  className="h-[620px] rounded-lg border border-hairline bg-white"
                  style={{ width: width || "100%", maxWidth: "100%" }}
                />
              ) : (
                <div className="text-sm text-fg-muted">Waiting for the project server...</div>
              )}
            </div>
          )}
        </div>
      )}
    </DemandWorkspace>
  );
}

import { useMemo, useState, useRef, useEffect } from "react";
import { RefreshCw, ExternalLink, Monitor, Zap, Loader2, Play } from "lucide-react";

interface Props {
  projectId: string;
  fileContents: Record<string, string>;
  refreshKey: number;
  serverUrl?: string | null;
  serverLoading?: boolean;
  onStartServer?: () => void;
}

export default function LivePreview({ projectId, fileContents, refreshKey, serverUrl, serverLoading, onStartServer }: Props) {
  const [key, setKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setKey((k) => k + 1);
  }, [refreshKey]);

  const isReactProject = useMemo(() => {
    return Object.keys(fileContents).some(
      (p) => p.endsWith(".tsx") || p.endsWith(".jsx") || p === "vite.config.ts" || p === "package.json"
    );
  }, [fileContents]);

  const previewHtml = useMemo(() => {
    if (serverUrl) return null;
    if (isReactProject) return null;

    const htmlFile = Object.entries(fileContents).find(([p]) =>
      p.endsWith("index.html") || p.endsWith(".html")
    );
    if (!htmlFile) return null;

    let html = htmlFile[1];
    const cssFiles = Object.entries(fileContents).filter(([p]) => p.endsWith(".css"));
    const jsFiles = Object.entries(fileContents).filter(([p]) => p.endsWith(".js") && !p.endsWith(".test.js"));

    for (const [path, content] of cssFiles) {
      const linkTag = new RegExp(`<link[^>]+href=["']${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*>`, "g");
      html = html.replace(linkTag, `<style>${content}</style>`);
    }
    for (const [path, content] of jsFiles) {
      const scriptTag = new RegExp(`<script[^>]+src=["']${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]*></script>`, "g");
      html = html.replace(scriptTag, `<script>${content}</script>`);
    }

    return html;
  }, [fileContents, key, serverUrl, isReactProject]);

  const previewUrl = serverUrl || `/preview/${projectId}/index.html`;
  const isLive = Boolean(serverUrl);

  return (
    <div className="flex flex-col h-full bg-canvas">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline bg-surface-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
          <Monitor className="w-3.5 h-3.5" />
          Preview
          {isLive && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-success/20 text-success border border-success/30 text-[9px] font-bold tracking-wider flex items-center gap-0.5">
              <Zap className="w-2.5 h-2.5" />
              LIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setKey((k) => k + 1)}
            className="p-1 rounded hover:bg-surface-2 text-fg-muted hover:text-fg-strong transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {serverUrl && (
            <a
              href={serverUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-surface-2 text-fg-muted hover:text-fg-strong transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 bg-white">
        {serverUrl ? (
          <iframe
            ref={iframeRef}
            key={`live-${key}`}
            src={serverUrl}
            className="w-full h-full border-0"
            title="Live Preview"
          />
        ) : serverLoading ? (
          <div className="flex flex-col items-center justify-center h-full bg-canvas text-fg-muted">
            <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
            <p className="text-sm font-medium">Starting dev server...</p>
            <p className="text-xs text-fg-muted mt-1">Installing dependencies and launching Vite</p>
          </div>
        ) : isReactProject ? (
          <div className="flex flex-col items-center justify-center h-full bg-canvas text-fg-muted">
            <div className="text-center max-w-xs">
              <Play className="w-10 h-10 mx-auto mb-3 text-fg-faint" />
              <p className="text-sm font-medium text-fg mb-1">React project needs a dev server</p>
              <p className="text-xs text-fg-muted mb-4">Click the Run button in the toolbar to start the Vite dev server and see a live preview.</p>
              {onStartServer && (
                <button
                  onClick={onStartServer}
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent text-white text-sm font-medium transition-colors"
                >
                  Start Dev Server
                </button>
              )}
            </div>
          </div>
        ) : previewHtml ? (
          <iframe
            ref={iframeRef}
            key={key}
            srcDoc={previewHtml}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title="Live Preview"
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full bg-canvas text-fg-muted">
            <Monitor className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">No preview available</p>
          </div>
        )}
      </div>
    </div>
  );
}

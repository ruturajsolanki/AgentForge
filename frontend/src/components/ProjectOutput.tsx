import { useState, useMemo } from "react";
import {
  FolderOpen,
  FileCode,
  ChevronRight,
  Eye,
  Code2,
  ExternalLink,
  Download,
} from "lucide-react";
import type { OutputFile } from "../types";

interface Props {
  files: OutputFile[];
  projectId?: string | null;
}

type Tab = "preview" | "code";

export default function ProjectOutput({ files, projectId }: Props) {
  const hasPreview = useMemo(
    () => files.some((f) => f.path.endsWith(".html")),
    [files],
  );
  const [tab, setTab] = useState<Tab>(hasPreview ? "preview" : "code");
  const [selectedFile, setSelectedFile] = useState<OutputFile | null>(files[0] ?? null);

  const previewHtml = useMemo(() => {
    if (!hasPreview) return "";

    const htmlFile = files.find((f) => f.path === "index.html")
      ?? files.find((f) => f.path.endsWith("index.html"))
      ?? files.find((f) => f.path.endsWith(".html"));

    if (!htmlFile) return "";

    let html = htmlFile.content;

    const cssFiles = files.filter((f) => f.path.endsWith(".css"));
    if (cssFiles.length > 0 && !html.includes("<style")) {
      const allCss = cssFiles.map((f) => f.content).join("\n");
      html = html.replace("</head>", `<style>\n${allCss}\n</style>\n</head>`);
    }

    const jsFiles = files.filter(
      (f) => f.path.endsWith(".js") && !f.path.endsWith(".config.js") && !f.path.endsWith(".test.js"),
    );
    if (jsFiles.length > 0 && !html.includes("<script")) {
      const allJs = jsFiles.map((f) => f.content).join("\n");
      html = html.replace("</body>", `<script>\n${allJs}\n</script>\n</body>`);
    }

    return html;
  }, [files, hasPreview]);

  const previewUrl = projectId ? `/preview/${projectId}/index.html` : null;

  const handleDownload = () => {
    const blob = new Blob(
      [files.map((f) => `// ── ${f.path} ──\n${f.content}`).join("\n\n")],
      { type: "text/plain" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `project-${projectId ?? "output"}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header with tabs */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-800/50">
        <FolderOpen className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
          Generated Project
        </span>

        <div className="ml-4 flex items-center gap-1 bg-slate-900/60 rounded-lg p-0.5">
          {hasPreview && (
            <button
              onClick={() => setTab("preview")}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
                tab === "preview"
                  ? "bg-violet-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
          )}
          <button
            onClick={() => setTab("code")}
            className={`flex items-center gap-1 px-3 py-1 rounded-md text-[11px] font-medium transition-all ${
              tab === "code"
                ? "bg-violet-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code2 className="w-3 h-3" />
            Code
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-slate-500">{files.length} files</span>
          {previewUrl && tab === "preview" && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button
            onClick={handleDownload}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title="Download all files"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview Tab */}
      {tab === "preview" && hasPreview && (
        <div className="relative bg-white" style={{ minHeight: 480 }}>
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              title="Project Preview"
              className="w-full border-0"
              style={{ height: 480 }}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : previewUrl ? (
            <iframe
              src={previewUrl}
              title="Project Preview"
              className="w-full border-0"
              style={{ height: 480 }}
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-slate-400">
              No HTML file found for preview
            </div>
          )}
        </div>
      )}

      {/* Code Tab */}
      {tab === "code" && (
        <div className="flex" style={{ minHeight: 400 }}>
          {/* File tree */}
          <div className="w-56 shrink-0 border-r border-slate-800 overflow-y-auto max-h-[480px]">
            {files.map((f) => (
              <button
                key={f.path}
                onClick={() => setSelectedFile(f)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-1.5 hover:bg-slate-800 transition-colors ${
                  selectedFile?.path === f.path
                    ? "bg-slate-800 text-violet-400"
                    : "text-slate-400"
                }`}
              >
                {selectedFile?.path === f.path ? (
                  <ChevronRight className="w-3 h-3 text-violet-400" />
                ) : (
                  <FileCode className="w-3 h-3 text-slate-600" />
                )}
                <span className="truncate">{f.path}</span>
              </button>
            ))}
          </div>

          {/* Code viewer */}
          <div className="flex-1 overflow-auto max-h-[480px]">
            {selectedFile ? (
              <pre className="p-4 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap">
                {selectedFile.content}
              </pre>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-slate-600">
                Select a file to view
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useCallback, useEffect, useRef } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Monitor,
  Terminal,
  ArrowLeft,
  Settings,
  Play,
  Square,
  RotateCw,
  Loader2,
} from "lucide-react";
import FileTree, { type FileNode } from "./FileTree";
import CodeEditor from "./CodeEditor";
import type { TabInfo } from "./EditorTabs";
import AIChat from "./AIChat";
import LivePreview from "./LivePreview";
import IDETerminal from "./IDETerminal";

interface Props {
  projectId: string;
  projectPrompt?: string;
  onBack: () => void;
  onOpenSettings: () => void;
  wsRef: React.RefObject<WebSocket | null>;
}

export default function IDELayout({ projectId, projectPrompt, onBack, onOpenSettings, wsRef }: Props) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set());
  const [previewKey, setPreviewKey] = useState(0);

  const [showTree, setShowTree] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showPreview, setShowPreview] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);

  const [serverRunning, setServerRunning] = useState(false);
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [serverLoading, setServerLoading] = useState(false);

  const [treeWidth, setTreeWidth] = useState(200);
  const [chatWidth, setChatWidth] = useState(340);

  const loadTree = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files`);
      const data = await res.json();
      if (Array.isArray(data)) setTree(data);
    } catch { /* ignore */ }
  }, [projectId]);

  const fetchServerStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}/server/status`);
      const data = await res.json();
      setServerRunning(data.running);
      setServerUrl(data.url || null);
      return data.running;
    } catch { return false; }
  }, [projectId]);

  const handleStartServer = useCallback(async () => {
    setServerLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/server/start`, { method: "POST" });
      const data = await res.json();
      if (data.running) {
        setServerRunning(true);
        setServerUrl(data.url ?? null);
      }
    } catch { /* swallow */ }
    finally { setServerLoading(false); }
  }, [projectId]);

  const handleStopServer = useCallback(async () => {
    setServerLoading(true);
    try {
      await fetch(`/api/projects/${projectId}/server/stop`, { method: "POST" });
      setServerRunning(false);
      setServerUrl(null);
    } catch { /* ignore */ }
    finally { setServerLoading(false); }
  }, [projectId]);

  const handleRestartServer = useCallback(async () => {
    setServerLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/server/restart`, { method: "POST" });
      const data = await res.json();
      if (data.running) {
        setServerRunning(true);
        setServerUrl(data.url);
      }
    } catch { /* ignore */ }
    finally { setServerLoading(false); }
  }, [projectId]);

  useEffect(() => {
    loadTree();
    fetchServerStatus().then((running) => {
      if (!running) {
        setServerLoading(true);
        fetch(`/api/projects/${projectId}/server/start`, { method: "POST" })
          .then((r) => r.json())
          .then((data) => {
            if (data.running) {
              setServerRunning(true);
              setServerUrl(data.url ?? null);
            }
          })
          .catch(() => undefined)
          .finally(() => setServerLoading(false));
      }
    });
  }, [loadTree, fetchServerStatus, projectId]);

  // Poll status every 3s while the server hasn't reached "ready" yet.
  // npm install on a first-time project takes 30-60s; the start request
  // may also have returned before "ready" if upstream changes that contract.
  useEffect(() => {
    if (serverRunning) return;
    const id = window.setInterval(() => {
      fetchServerStatus();
    }, 3000);
    return () => window.clearInterval(id);
  }, [serverRunning, fetchServerStatus]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const handler = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.project_id !== projectId) return;

        if (msg.type === "file.created" || msg.type === "file.updated" || msg.type === "file.deleted" || msg.type === "file.renamed") {
          loadTree();
          if (msg.type === "file.updated" || msg.type === "file.created") {
            const path = msg.path as string;
            if (fileContents[path] !== undefined) {
              fetchFile(path);
            }
            if (path.match(/\.(html|css|js|tsx|ts)$/)) {
              setPreviewKey((k) => k + 1);
            }
          }
        }

        if (msg.type === "project.server.ready") {
          setServerRunning(true);
          setServerUrl(msg.url || `http://localhost:${msg.port}`);
          setServerLoading(false);
          setPreviewKey((k) => k + 1);
        }
        if (msg.type === "project.server.stopped") {
          setServerRunning(false);
          setServerUrl(null);
          setServerLoading(false);
        }
        if (msg.type === "project.server.starting") {
          setServerLoading(true);
        }
      } catch { /* ignore */ }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [wsRef, projectId, loadTree, fileContents]);

  const fetchFile = useCallback(async (path: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/files/${path}`);
      const data = await res.json();
      if (data.content !== undefined) {
        setFileContents((prev) => ({ ...prev, [path]: data.content }));
      }
    } catch { /* ignore */ }
  }, [projectId]);

  const openFile = useCallback(
    async (path: string) => {
      if (!tabs.find((t) => t.path === path)) {
        setTabs((prev) => [...prev, { path, modified: false }]);
      }
      setActiveTab(path);
      if (fileContents[path] === undefined) {
        await fetchFile(path);
      }
    },
    [tabs, fileContents, fetchFile],
  );

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => prev.filter((t) => t.path !== path));
      if (activeTab === path) {
        setActiveTab((prev) => {
          const remaining = tabs.filter((t) => t.path !== path);
          return remaining.length > 0 ? remaining[remaining.length - 1].path : null;
        });
      }
      setFileContents((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      setModifiedFiles((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    },
    [activeTab, tabs],
  );

  const handleContentChange = useCallback((path: string, content: string) => {
    setFileContents((prev) => ({ ...prev, [path]: content }));
    setModifiedFiles((prev) => new Set(prev).add(path));
    setTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, modified: true } : t)),
    );
  }, []);

  const handleSave = useCallback(
    async (path: string, content: string) => {
      try {
        await fetch(`/api/projects/${projectId}/files/${path}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        setModifiedFiles((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        setTabs((prev) =>
          prev.map((t) => (t.path === path ? { ...t, modified: false } : t)),
        );
        if (path.match(/\.(html|css|js)$/)) {
          setPreviewKey((k) => k + 1);
        }
      } catch { /* ignore */ }
    },
    [projectId],
  );

  const handleCreateFile = useCallback(
    async (path: string, isDir: boolean) => {
      try {
        if (isDir) {
          await fetch(`/api/projects/${projectId}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: path + "/.gitkeep", content: "" }),
          });
        } else {
          await fetch(`/api/projects/${projectId}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path, content: "" }),
          });
        }
        await loadTree();
        if (!isDir) openFile(path);
      } catch { /* ignore */ }
    },
    [projectId, loadTree, openFile],
  );

  const handleDeleteFile = useCallback(
    async (path: string) => {
      try {
        await fetch(`/api/projects/${projectId}/files/${path}`, { method: "DELETE" });
        await loadTree();
        closeTab(path);
      } catch { /* ignore */ }
    },
    [projectId, loadTree, closeTab],
  );

  const handleRenameFile = useCallback(
    async (oldPath: string, newPath: string) => {
      try {
        await fetch(`/api/projects/${projectId}/files/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
        });
        await loadTree();
      } catch { /* ignore */ }
    },
    [projectId, loadTree],
  );

  const handleApplyEdit = useCallback(
    async (edit: { path: string; content: string }) => {
      setFileContents((prev) => ({ ...prev, [edit.path]: edit.content }));
      await handleSave(edit.path, edit.content);
      if (!tabs.find((t) => t.path === edit.path)) {
        setTabs((prev) => [...prev, { path: edit.path, modified: false }]);
      }
      setActiveTab(edit.path);
      await loadTree();
    },
    [handleSave, tabs, loadTree],
  );

  // Resize handlers
  const resizingRef = useRef<{ target: "tree" | "chat"; startX: number; startW: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const dx = e.clientX - resizingRef.current.startX;
      if (resizingRef.current.target === "tree") {
        setTreeWidth(Math.max(120, Math.min(400, resizingRef.current.startW + dx)));
      } else {
        setChatWidth(Math.max(250, Math.min(500, resizingRef.current.startW - dx)));
      }
    };
    const onUp = () => { resizingRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-slate-100">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#252526] border-b border-[#333] shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-100 transition-colors px-2 py-1 rounded hover:bg-[#3c3c3c]"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Home
        </button>
        <div className="h-4 w-px bg-[#444]" />
        <span className="text-xs text-slate-400 truncate max-w-[300px]">
          {projectPrompt || projectId}
        </span>
        <div className="flex-1" />
        {/* Server controls */}
        <div className="flex items-center gap-1 mr-2">
          {serverLoading ? (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 px-2 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden lg:inline">Starting...</span>
            </span>
          ) : serverRunning ? (
            <>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
              <button
                onClick={handleRestartServer}
                className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-[#3c3c3c] transition-colors"
                title="Restart dev server"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleStopServer}
                className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-[#3c3c3c] transition-colors"
                title="Stop dev server"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <button
              onClick={handleStartServer}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded text-slate-400 hover:text-emerald-300 hover:bg-[#3c3c3c] transition-colors"
              title="Start dev server"
            >
              <Play className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Run</span>
            </button>
          )}
        </div>
        <div className="h-4 w-px bg-[#444]" />
        <ToggleBtn active={showTree} onClick={() => setShowTree(!showTree)} icon={showTree ? PanelLeftClose : PanelLeftOpen} label="Explorer" />
        <ToggleBtn active={showPreview} onClick={() => setShowPreview(!showPreview)} icon={Monitor} label="Preview" />
        <ToggleBtn active={showTerminal} onClick={() => setShowTerminal(!showTerminal)} icon={Terminal} label="Terminal" />
        <ToggleBtn active={showChat} onClick={() => setShowChat(!showChat)} icon={MessageSquare} label="Chat" />
        <div className="h-4 w-px bg-[#444]" />
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 text-[11px] px-2 py-1 rounded text-slate-500 hover:text-slate-300 hover:bg-[#3c3c3c] transition-colors"
          title="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Settings</span>
        </button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* File Tree */}
        {showTree && (
          <>
            <div style={{ width: treeWidth }} className="shrink-0 overflow-hidden">
              <FileTree
                tree={tree}
                selectedPath={activeTab}
                onSelect={openFile}
                onCreate={handleCreateFile}
                onDelete={handleDeleteFile}
                onRename={handleRenameFile}
              />
            </div>
            <div
              className="w-[3px] cursor-col-resize bg-[#333] hover:bg-violet-500/50 transition-colors shrink-0"
              onMouseDown={(e) => {
                resizingRef.current = { target: "tree", startX: e.clientX, startW: treeWidth };
              }}
            />
          </>
        )}

        {/* Center: Editor + Terminal */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className={`${showTerminal ? "flex-1" : "flex-1"} min-h-0`}>
            <div className="h-full">
              <CodeEditor
                tabs={tabs}
                activeTab={activeTab}
                fileContents={fileContents}
                onSelectTab={setActiveTab}
                onCloseTab={closeTab}
                onSave={handleSave}
                onContentChange={handleContentChange}
              />
            </div>
          </div>
          {showTerminal && (
            <>
              <div className="h-[3px] bg-[#333] shrink-0" />
              <div className="h-[200px] shrink-0">
                <IDETerminal projectId={projectId} wsRef={wsRef} />
              </div>
            </>
          )}
        </div>

        {/* Preview */}
        {showPreview && (
          <>
            <div className="w-[3px] bg-[#333] shrink-0" />
            <div className="w-[40%] min-w-[250px] max-w-[600px] shrink-0">
              <LivePreview
                projectId={projectId}
                fileContents={fileContents}
                refreshKey={previewKey}
                serverUrl={serverUrl}
                serverLoading={serverLoading}
                onStartServer={handleStartServer}
              />
            </div>
          </>
        )}

        {/* Chat Sidebar */}
        {showChat && (
          <>
            <div
              className="w-[3px] cursor-col-resize bg-[#333] hover:bg-violet-500/50 transition-colors shrink-0"
              onMouseDown={(e) => {
                resizingRef.current = { target: "chat", startX: e.clientX, startW: chatWidth };
              }}
            />
            <div style={{ width: chatWidth }} className="shrink-0 overflow-hidden">
              <AIChat projectId={projectId} onApplyEdit={handleApplyEdit} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded transition-colors ${
        active
          ? "bg-violet-600/20 text-violet-300 border border-violet-500/30"
          : "text-slate-500 hover:text-slate-300 hover:bg-[#3c3c3c]"
      }`}
      title={label}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

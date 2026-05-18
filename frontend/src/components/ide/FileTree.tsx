import { useState, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  FilePlus,
  FolderPlus,
  Trash2,
  Pencil,
} from "lucide-react";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  size?: number;
}

interface Props {
  tree: FileNode[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onCreate: (path: string, isDir: boolean) => void;
  onDelete: (path: string) => void;
  onRename: (oldPath: string, newPath: string) => void;
}

const EXT_ICONS: Record<string, string> = {
  html: "text-orange-400",
  css: "text-blue-400",
  js: "text-yellow-400",
  ts: "text-blue-300",
  tsx: "text-blue-300",
  json: "text-green-400",
  md: "text-slate-300",
  py: "text-green-300",
  svg: "text-pink-400",
};

function extColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return EXT_ICONS[ext] || "text-slate-400";
}

export default function FileTree({ tree, selectedPath, onSelect, onCreate, onDelete, onRename }: Props) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; isDir: boolean } | null>(null);
  const [newInput, setNewInput] = useState<{ parentPath: string; isDir: boolean } | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  const handleContextMenu = useCallback((e: React.MouseEvent, path: string, isDir: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path, isDir });
  }, []);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  const startNew = useCallback((parentPath: string, isDir: boolean) => {
    setNewInput({ parentPath, isDir });
    setNewName("");
    closeMenu();
  }, [closeMenu]);

  const commitNew = useCallback(() => {
    if (!newInput || !newName.trim()) {
      setNewInput(null);
      return;
    }
    const fullPath = newInput.parentPath ? `${newInput.parentPath}/${newName.trim()}` : newName.trim();
    onCreate(fullPath, newInput.isDir);
    setNewInput(null);
    setNewName("");
  }, [newInput, newName, onCreate]);

  const startRename = useCallback((path: string) => {
    setRenaming(path);
    setRenameName(path.split("/").pop() || "");
    closeMenu();
  }, [closeMenu]);

  const commitRename = useCallback(() => {
    if (!renaming || !renameName.trim()) {
      setRenaming(null);
      return;
    }
    const parts = renaming.split("/");
    parts[parts.length - 1] = renameName.trim();
    const newPath = parts.join("/");
    if (newPath !== renaming) onRename(renaming, newPath);
    setRenaming(null);
  }, [renaming, renameName, onRename]);

  return (
    <div className="h-full bg-[#252526] text-sm select-none overflow-auto" onClick={closeMenu}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#333] text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        <span>Explorer</span>
        <div className="flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); startNew("", false); }}
            className="p-0.5 hover:bg-[#3c3c3c] rounded"
            title="New File"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); startNew("", true); }}
            className="p-0.5 hover:bg-[#3c3c3c] rounded"
            title="New Folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="py-1">
        {tree.map((node) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onContextMenu={handleContextMenu}
            renaming={renaming}
            renameName={renameName}
            onRenameName={setRenameName}
            onCommitRename={commitRename}
            newInput={newInput}
            newName={newName}
            onNewName={setNewName}
            onCommitNew={commitNew}
          />
        ))}
        {newInput && !newInput.parentPath && (
          <NewInputRow
            depth={0}
            isDir={newInput.isDir}
            value={newName}
            onChange={setNewName}
            onCommit={commitNew}
            onCancel={() => setNewInput(null)}
          />
        )}
      </div>

      {contextMenu && (
        <ContextMenuPopup
          x={contextMenu.x}
          y={contextMenu.y}
          isDir={contextMenu.isDir}
          onNewFile={() => startNew(contextMenu.isDir ? contextMenu.path : contextMenu.path.split("/").slice(0, -1).join("/"), false)}
          onNewFolder={() => startNew(contextMenu.isDir ? contextMenu.path : contextMenu.path.split("/").slice(0, -1).join("/"), true)}
          onRename={() => startRename(contextMenu.path)}
          onDelete={() => { onDelete(contextMenu.path); closeMenu(); }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, isDir: boolean) => void;
  renaming: string | null;
  renameName: string;
  onRenameName: (v: string) => void;
  onCommitRename: () => void;
  newInput: { parentPath: string; isDir: boolean } | null;
  newName: string;
  onNewName: (v: string) => void;
  onCommitNew: () => void;
}

function TreeNode({
  node,
  depth,
  selectedPath,
  onSelect,
  onContextMenu,
  renaming,
  renameName,
  onRenameName,
  onCommitRename,
  newInput,
  newName,
  onNewName,
  onCommitNew,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);
  const isDir = node.type === "directory";
  const isSelected = node.path === selectedPath;
  const isRenaming = renaming === node.path;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-1 py-[2px] cursor-pointer hover:bg-[#2a2d2e] ${
          isSelected ? "bg-[#37373d]" : ""
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isDir) setExpanded(!expanded);
          else onSelect(node.path);
        }}
        onContextMenu={(e) => onContextMenu(e, node.path, isDir)}
      >
        {isDir ? (
          <>
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            {expanded ? (
              <FolderOpen className="w-4 h-4 text-yellow-400 shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-yellow-400 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <File className={`w-4 h-4 shrink-0 ${extColor(node.name)}`} />
          </>
        )}
        {isRenaming ? (
          <input
            autoFocus
            value={renameName}
            onChange={(e) => onRenameName(e.target.value)}
            onBlur={onCommitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitRename();
              if (e.key === "Escape") onCommitRename();
            }}
            className="flex-1 bg-[#3c3c3c] border border-violet-500 rounded px-1 text-xs text-slate-100 outline-none min-w-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-xs text-slate-300 truncate">{node.name}</span>
        )}
      </div>
      {isDir && expanded && (
        <>
          {(node.children || []).map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onContextMenu={onContextMenu}
              renaming={renaming}
              renameName={renameName}
              onRenameName={onRenameName}
              onCommitRename={onCommitRename}
              newInput={newInput}
              newName={newName}
              onNewName={onNewName}
              onCommitNew={onCommitNew}
            />
          ))}
          {newInput && newInput.parentPath === node.path && (
            <NewInputRow
              depth={depth + 1}
              isDir={newInput.isDir}
              value={newName}
              onChange={onNewName}
              onCommit={onCommitNew}
              onCancel={() => onNewName("")}
            />
          )}
        </>
      )}
    </div>
  );
}

function NewInputRow({
  depth,
  isDir,
  value,
  onChange,
  onCommit,
  onCancel,
}: {
  depth: number;
  isDir: boolean;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="flex items-center gap-1 px-1 py-[2px]"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="w-3.5 shrink-0" />
      {isDir ? (
        <Folder className="w-4 h-4 text-yellow-400 shrink-0" />
      ) : (
        <File className="w-4 h-4 text-slate-400 shrink-0" />
      )}
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={isDir ? "folder name" : "file name"}
        className="flex-1 bg-[#3c3c3c] border border-violet-500 rounded px-1 text-xs text-slate-100 outline-none placeholder-slate-600 min-w-0"
      />
    </div>
  );
}

function ContextMenuPopup({
  x,
  y,
  isDir,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  isDir: boolean;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-[200]" onClick={onClose} />
      <div
        className="fixed z-[201] bg-[#2d2d2d] border border-[#454545] rounded-md shadow-xl py-1 min-w-[160px] text-xs"
        style={{ left: x, top: y }}
      >
        <button onClick={onNewFile} className="w-full text-left px-3 py-1.5 hover:bg-[#094771] text-slate-200 flex items-center gap-2">
          <FilePlus className="w-3.5 h-3.5" /> New File
        </button>
        <button onClick={onNewFolder} className="w-full text-left px-3 py-1.5 hover:bg-[#094771] text-slate-200 flex items-center gap-2">
          <FolderPlus className="w-3.5 h-3.5" /> New Folder
        </button>
        <div className="border-t border-[#454545] my-1" />
        <button onClick={onRename} className="w-full text-left px-3 py-1.5 hover:bg-[#094771] text-slate-200 flex items-center gap-2">
          <Pencil className="w-3.5 h-3.5" /> Rename
        </button>
        <button onClick={onDelete} className="w-full text-left px-3 py-1.5 hover:bg-red-700/60 text-red-300 flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>
    </>
  );
}

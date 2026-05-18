import { X } from "lucide-react";

export interface TabInfo {
  path: string;
  modified: boolean;
}

interface Props {
  tabs: TabInfo[];
  activeTab: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

function basename(path: string) {
  return path.split("/").pop() || path;
}

const EXT_COLORS: Record<string, string> = {
  html: "text-orange-400",
  css: "text-blue-400",
  js: "text-yellow-400",
  ts: "text-blue-300",
  tsx: "text-blue-300",
  jsx: "text-yellow-400",
  json: "text-green-400",
  md: "text-slate-400",
  py: "text-green-300",
};

function extColor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return EXT_COLORS[ext] || "text-slate-400";
}

export default function EditorTabs({ tabs, activeTab, onSelect, onClose }: Props) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center bg-[#1e1e1e] border-b border-[#333] overflow-x-auto min-h-[35px]">
      {tabs.map((tab) => {
        const active = tab.path === activeTab;
        return (
          <div
            key={tab.path}
            onClick={() => onSelect(tab.path)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-[#333] min-w-0 shrink-0 select-none ${
              active
                ? "bg-[#1e1e1e] text-slate-100 border-t-2 border-t-violet-500"
                : "bg-[#252526] text-slate-400 hover:bg-[#2d2d2d] border-t-2 border-t-transparent"
            }`}
          >
            <span className={`${extColor(tab.path)} truncate max-w-[120px]`}>
              {basename(tab.path)}
            </span>
            {tab.modified && (
              <span className="w-2 h-2 rounded-full bg-violet-400 shrink-0" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
              className="p-0.5 rounded hover:bg-[#444] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

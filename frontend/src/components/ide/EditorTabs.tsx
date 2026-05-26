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
  md: "text-fg-muted",
  py: "text-green-300",
};

function extColor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return EXT_COLORS[ext] || "text-fg-muted";
}

export default function EditorTabs({ tabs, activeTab, onSelect, onClose }: Props) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center bg-canvas border-b border-hairline overflow-x-auto min-h-[35px]">
      {tabs.map((tab) => {
        const active = tab.path === activeTab;
        return (
          <div
            key={tab.path}
            onClick={() => onSelect(tab.path)}
            className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-r border-hairline min-w-0 shrink-0 select-none ${
              active
                ? "bg-canvas text-fg-strong border-t-2 border-t-accent"
                : "bg-surface-1 text-fg-muted hover:bg-surface-2 border-t-2 border-t-transparent"
            }`}
          >
            <span className={`${extColor(tab.path)} truncate max-w-[120px]`}>
              {basename(tab.path)}
            </span>
            {tab.modified && (
              <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
              className="p-0.5 rounded hover:bg-hairline-hi opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

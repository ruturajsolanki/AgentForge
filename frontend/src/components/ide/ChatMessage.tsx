import { useState } from "react";
import { User, Bot, Copy, Check, Play } from "lucide-react";

interface FileEdit {
  path: string;
  content: string;
}

interface Props {
  role: "user" | "assistant";
  content: string;
  fileEdits?: FileEdit[];
  timestamp?: string;
  onApplyEdit?: (edit: FileEdit) => void;
}

export default function ChatMessage({ role, content, fileEdits, timestamp, onApplyEdit }: Props) {
  const isUser = role === "user";
  const edits = fileEdits || [];
  const displayContent = !isUser && edits.length > 0
    ? stripFileBlocks(content) || `Prepared ${edits.length} file edit${edits.length === 1 ? "" : "s"}.`
    : content;

  return (
    <div className={`flex gap-2.5 px-3 py-3 ${isUser ? "" : "bg-surface-2"}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? "bg-accent" : "bg-success"
      }`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-fg">
            {isUser ? "You" : "AgentForge AI"}
          </span>
          {timestamp && (
            <span className="text-[10px] text-fg-faint">
              {new Date(timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="text-sm text-fg leading-relaxed whitespace-pre-wrap break-words">
          <MessageContent content={displayContent} />
        </div>
        {edits.length > 0 && (
          <div className="mt-2 space-y-2">
            {edits.map((edit, i) => (
              <FileEditBlock key={i} edit={edit} onApply={onApplyEdit} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function stripFileBlocks(content: string) {
  return content
    .replace(/FILE:\s*.+?\n```[\s\S]*?```/g, "")
    .replace(/===FILE:\s*.+?===[\s\S]*?===END FILE===/g, "")
    .trim();
}

function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const lines = part.slice(3, -3).split("\n");
          const lang = lines[0]?.trim() || "";
          const code = (lang ? lines.slice(1) : lines).join("\n");
          return <InlineCodeBlock key={i} code={code} lang={lang} />;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="px-1 py-0.5 bg-surface-2 rounded text-accent text-xs">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function InlineCodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-hairline">
      <div className="flex items-center justify-between px-3 py-1 bg-surface-2 text-[10px] text-fg-muted">
        <span>{lang || "code"}</span>
        <button onClick={copy} className="flex items-center gap-1 hover:text-fg transition-colors">
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 bg-canvas text-xs text-fg overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function FileEditBlock({ edit, onApply }: { edit: FileEdit; onApply?: (e: FileEdit) => void }) {
  const [applied, setApplied] = useState(false);

  const handleApply = () => {
    onApply?.(edit);
    setApplied(true);
  };

  return (
    <div className="rounded-lg border border-success/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-success/20">
        <span className="text-xs text-success font-mono">{edit.path}</span>
        <button
          onClick={handleApply}
          disabled={applied}
          className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded transition-colors ${
            applied
              ? "bg-success text-success"
              : "bg-success hover:bg-success text-white"
          }`}
        >
          {applied ? <Check className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {applied ? "Applied" : "Apply"}
        </button>
      </div>
      <pre className="p-3 bg-canvas text-xs text-fg overflow-x-auto max-h-[200px]">
        <code>{edit.content.slice(0, 2000)}{edit.content.length > 2000 ? "\n..." : ""}</code>
      </pre>
    </div>
  );
}

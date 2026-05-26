import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as TerminalIcon, X } from "lucide-react";

interface Props {
  projectId: string;
  wsRef: React.RefObject<WebSocket | null>;
}

interface TermLine {
  id: number;
  text: string;
  type: "input" | "output" | "error" | "system";
}

export default function IDETerminal({ projectId, wsRef }: Props) {
  const [lines, setLines] = useState<TermLine[]>([
    { id: 0, text: `AgentForge Terminal — project: ${projectId}`, type: "system" },
    { id: 1, text: "Type a command and press Enter.\n", type: "system" },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef<string>("");
  const idCounter = useRef(2);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const handleWsMessage = useCallback((e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.request_id !== reqIdRef.current) return;

      if (msg.type === "terminal.output") {
        setLines((prev) => [
          ...prev,
          { id: idCounter.current++, text: msg.data, type: "output" },
        ]);
      } else if (msg.type === "terminal.exit") {
        setLines((prev) => [
          ...prev,
          {
            id: idCounter.current++,
            text: `\nProcess exited with code ${msg.exit_code}\n`,
            type: msg.exit_code === 0 ? "system" : "error",
          },
        ]);
        setRunning(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    ws.addEventListener("message", handleWsMessage);
    return () => ws.removeEventListener("message", handleWsMessage);
  }, [wsRef, handleWsMessage]);

  const execute = useCallback(() => {
    const cmd = input.trim();
    if (!cmd || running) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setLines((prev) => [
        ...prev,
        { id: idCounter.current++, text: "Error: WebSocket not connected\n", type: "error" },
      ]);
      return;
    }

    const requestId = `term-${Date.now()}`;
    reqIdRef.current = requestId;

    setLines((prev) => [
      ...prev,
      { id: idCounter.current++, text: `$ ${cmd}\n`, type: "input" },
    ]);
    setInput("");
    setRunning(true);

    ws.send(
      JSON.stringify({
        type: "terminal.exec",
        command: cmd,
        project_id: projectId,
        request_id: requestId,
      })
    );
  }, [input, running, projectId, wsRef]);

  return (
    <div className="flex flex-col h-full bg-canvas font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-hairline bg-surface-1">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-wider font-sans">
          <TerminalIcon className="w-3.5 h-3.5" />
          Terminal
        </div>
        <button
          onClick={() => {
            setLines([{ id: idCounter.current++, text: "Terminal cleared.\n", type: "system" }]);
          }}
          className="p-1 rounded hover:bg-surface-2 text-fg-muted hover:text-fg transition-colors"
          title="Clear"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 min-h-0"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((line) => (
          <div
            key={line.id}
            className={`whitespace-pre-wrap break-all ${
              line.type === "input"
                ? "text-green-400"
                : line.type === "error"
                  ? "text-danger"
                  : line.type === "system"
                    ? "text-fg-muted"
                    : "text-fg"
            }`}
          >
            {line.text}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-hairline">
        <span className="text-green-400 shrink-0">$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") execute();
          }}
          disabled={running}
          placeholder={running ? "Running..." : "Enter command..."}
          className="flex-1 bg-transparent text-fg-strong placeholder-fg-faint outline-none disabled:opacity-50"
        />
      </div>
    </div>
  );
}

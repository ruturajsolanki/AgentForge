import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, MessageSquare } from "lucide-react";
import ChatMessage from "./ChatMessage";
import { browserLLM } from "../../services/browserLLM";

interface Message {
  id: number;
  role: "user" | "assistant";
  content: string;
  file_edits?: { path: string; content: string }[];
  timestamp?: string;
}

interface Props {
  projectId: string;
  onApplyEdit: (edit: { path: string; content: string }) => void;
}

export default function AIChat({ projectId, onApplyEdit }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [statusText, setStatusText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!projectId) return;
    setMessages([]);
    setLoaded(false);
    fetch(`/api/projects/${projectId}/chat`)
      .then((r) => r.json())
      .then((data: Message[]) => {
        if (Array.isArray(data)) setMessages(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendViaBrowserLLM = useCallback(async (text: string) => {
    setStatusText("Preparing prompt...");
    const prepRes = await fetch(`/api/projects/${projectId}/chat/prepare`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const { prompt, system } = await prepRes.json();

    setStatusText("Generating with browser LLM...");
    const llmResponse = await browserLLM.generate(prompt, system);

    setStatusText("Applying changes...");
    const completeRes = await fetch(`/api/projects/${projectId}/chat/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, llm_response: llmResponse }),
    });
    return await completeRes.json();
  }, [projectId]);

  const sendViaBackend = useCallback(async (text: string) => {
    setStatusText("Thinking...");
    const res = await fetch(`/api/projects/${projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    return await res.json();
  }, [projectId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setStatusText("");

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const useBrowserDirect = browserLLM.hasModel;
      const data = useBrowserDirect
        ? await sendViaBrowserLLM(text)
        : await sendViaBackend(text);

      const assistantMsg: Message = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.response || "No response",
        file_edits: data.file_edits || [],
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.file_edits?.length) {
        for (const edit of data.file_edits) {
          onApplyEdit(edit);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: "assistant",
          content: `Failed to get response: ${errMsg}\n\nMake sure you have a model loaded in Settings.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setSending(false);
      setStatusText("");
    }
  }, [input, sending, projectId, sendViaBrowserLLM, sendViaBackend, onApplyEdit]);

  return (
    <div className="flex flex-col h-full bg-[#1a1a2e]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#333] bg-[#252526]">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          <MessageSquare className="w-3.5 h-3.5" />
          AI Chat
        </div>
        {browserLLM.hasModel && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            Local LLM
          </span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        {!loaded ? (
          <div className="flex items-center justify-center h-32 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-600/20 flex items-center justify-center">
              <MessageSquare className="w-6 h-6 text-violet-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-300">Start coding with AI</p>
              <p className="text-xs text-slate-500 mt-1">
                Ask me to create, edit, or explain code. I can modify files directly in your project.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <ChatMessage
              key={msg.id}
              role={msg.role}
              content={msg.content}
              fileEdits={msg.file_edits}
              timestamp={msg.timestamp}
              onApplyEdit={onApplyEdit}
            />
          ))
        )}
        {sending && (
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {statusText || "Thinking..."}
          </div>
        )}
      </div>

      <div className="border-t border-[#333] p-2">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask AI to edit code..."
            rows={2}
            disabled={sending}
            className="flex-1 bg-[#2d2d2d] border border-[#444] rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="self-end p-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1 px-1">Enter to send, Shift+Enter for new line</p>
      </div>
    </div>
  );
}

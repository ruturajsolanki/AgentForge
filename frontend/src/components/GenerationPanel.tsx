import { useEffect, useRef, useState } from "react";
import { X, Code2, Loader2, CheckCircle2, Cpu } from "lucide-react";
import { browserLLM, type TokenEvent } from "../services/browserLLM";

interface GenerationBlock {
  agent: string;
  text: string;
  done: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function GenerationPanel({ open, onClose }: Props) {
  const [blocks, setBlocks] = useState<GenerationBlock[]>([]);
  const [currentAgent, setCurrentAgent] = useState("");
  const [generating, setGenerating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleToken = (e: TokenEvent) => {
      if (e.agent !== currentAgent && !e.done) {
        setCurrentAgent(e.agent);
      }

      setBlocks((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.agent === e.agent && !last.done) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...last,
            text: e.fullText,
            done: e.done,
          };
          return updated;
        }
        if (!e.done) {
          return [...prev, { agent: e.agent, text: e.fullText, done: false }];
        }
        return prev;
      });

      setGenerating(!e.done);
    };

    browserLLM.onToken(handleToken);
    return () => {
      browserLLM.onToken(() => {});
    };
  }, [currentAgent]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [blocks]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg h-full bg-[#0d1117] border-l border-slate-800 shadow-2xl flex flex-col animate-slide-in">
        {/* Header */}
        <div className="shrink-0 border-b border-slate-800 px-4 py-3 flex items-center justify-between bg-[#161b22]">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-100">Live Generation</h2>
            {generating && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Streaming
              </span>
            )}
            {!generating && blocks.length > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Done
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current agent indicator */}
        {generating && currentAgent && (
          <div className="shrink-0 px-4 py-2 border-b border-slate-800/50 bg-[#161b22]/50 flex items-center gap-2">
            <Cpu className="w-3 h-3 text-violet-400 animate-pulse" />
            <span className="text-xs text-slate-400">
              <span className="text-violet-400 font-semibold">{currentAgent}</span> is generating...
            </span>
          </div>
        )}

        {/* Streaming output */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
          {blocks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
              <Code2 className="w-8 h-8" />
              <p className="text-sm">Waiting for generation to start...</p>
              <p className="text-[11px] text-slate-700">Code will appear here token by token as the LLM generates it</p>
            </div>
          )}

          {blocks.map((block, i) => (
            <div key={i} className="border-b border-slate-800/30">
              {/* Agent separator */}
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-[#1c2128] border-b border-slate-800/50">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {block.agent || "Agent"}
                </span>
                {block.done && (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 ml-auto" />
                )}
                {!block.done && (
                  <Loader2 className="w-3 h-3 text-emerald-400 animate-spin ml-auto" />
                )}
              </div>
              {/* Code content */}
              <pre className="px-4 py-3 text-[12px] leading-relaxed font-mono text-slate-300 whitespace-pre-wrap break-words overflow-x-hidden">
                {block.text}
                {!block.done && (
                  <span className="inline-block w-1.5 h-4 bg-emerald-400 animate-pulse ml-0.5 align-middle" />
                )}
              </pre>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-800 px-4 py-2 bg-[#161b22]">
          <div className="flex items-center justify-between text-[10px] text-slate-600">
            <span>{blocks.length} generation{blocks.length !== 1 ? "s" : ""}</span>
            <span>{blocks.reduce((a, b) => a + b.text.length, 0).toLocaleString()} chars</span>
          </div>
        </div>
      </div>
    </div>
  );
}

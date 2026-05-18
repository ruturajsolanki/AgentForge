import { useState } from "react";
import { Send, RotateCcw, AlertTriangle } from "lucide-react";

interface Props {
  onSubmit: (prompt: string) => void;
  disabled: boolean;
  projectStatus: string;
  onReset: () => void;
  providerWarning?: string;
}

export default function PromptInput({ onSubmit, disabled, projectStatus, onReset, providerWarning }: Props) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      {providerWarning && (
        <div className="flex items-start gap-2 mb-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{providerWarning}</span>
        </div>
      )}
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
        }}
        placeholder='Describe the project you want to build, e.g. "Build a full-stack portfolio website with authentication"'
        rows={3}
        disabled={disabled}
        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 disabled:opacity-50"
      />
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-slate-500">
          {projectStatus === "running"
            ? "Agents are working…"
            : projectStatus === "completed"
              ? "Project complete!"
              : projectStatus === "error"
                ? "An error occurred."
                : "⌘+Enter to submit"}
        </span>
        <div className="flex gap-2">
          {(projectStatus === "completed" || projectStatus === "error") && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              New Project
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={disabled || !prompt.trim()}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            Build Project
          </button>
        </div>
      </div>
    </div>
  );
}

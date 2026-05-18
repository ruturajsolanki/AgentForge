import { useState, useEffect, useCallback } from "react";
import {
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  HardDrive,
  Cpu,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  browserLLM,
  BROWSER_MODELS,
  type ModelStatus,
  type DownloadProgress,
  type BrowserModel,
} from "../services/browserLLM";

interface Props {
  onModelReady?: (ready: boolean) => void;
}

export default function BrowserModelPanel({ onModelReady }: Props) {
  const [selectedModel, setSelectedModel] = useState<string>(BROWSER_MODELS[0].id);
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [progress, setProgress] = useState<DownloadProgress>({ progress: 0, text: "" });
  const [error, setError] = useState<string | null>(null);
  const webgpuSupported = BrowserLLMServiceSupported();

  useEffect(() => {
    browserLLM.onProgress(setProgress);
    browserLLM.onStatus((s) => {
      setStatus(s);
      onModelReady?.(s === "ready");
    });

    if (browserLLM.isReady && browserLLM.loadedModel) {
      setStatus("ready");
      setSelectedModel(browserLLM.loadedModel);
      onModelReady?.(true);
    }
  }, [onModelReady]);

  const handleLoad = useCallback(async () => {
    setError(null);
    try {
      await browserLLM.loadModel(selectedModel);
    } catch (err) {
      setError(String(err));
    }
  }, [selectedModel]);

  const handleUnload = useCallback(async () => {
    await browserLLM.unload();
    setProgress({ progress: 0, text: "" });
    setError(null);
    onModelReady?.(false);
  }, [onModelReady]);

  const model = BROWSER_MODELS.find((m) => m.id === selectedModel);
  const isLoading = status === "downloading" || status === "loading";
  const isReady = status === "ready" || status === "generating";

  if (!webgpuSupported) {
    return (
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">WebGPU not supported</p>
            <p className="text-[11px] text-amber-400/70 mt-1">
              Your browser doesn't support WebGPU. Use Chrome or Edge (latest version) for
              in-browser LLM inference.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Browser LLM
          </span>
          <StatusBadge status={status} />
        </div>
        {isReady && browserLLM.loadedModel && (
          <p className="text-[11px] text-slate-500 mt-2">
            <span className="text-emerald-400 font-medium">{browserLLM.loadedModel.split("-q")[0]}</span>{" "}
            loaded in browser memory
          </p>
        )}
        {status === "generating" && (
          <p className="text-[11px] text-violet-400 mt-2 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Running inference...
          </p>
        )}
      </div>

      {/* Model Selector */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-300">
          <HardDrive className="w-4 h-4" />
          Select Model
        </label>
        <div className="space-y-1.5">
          {BROWSER_MODELS.map((m) => (
            <ModelOption
              key={m.id}
              model={m}
              selected={selectedModel === m.id}
              loaded={browserLLM.loadedModel === m.id}
              disabled={isLoading}
              onClick={() => setSelectedModel(m.id)}
            />
          ))}
        </div>
      </div>

      {/* Progress Bar */}
      {isLoading && (
        <div className="space-y-2">
          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${progress.progress}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 truncate">{progress.text}</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-[11px] text-red-400">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!isReady ? (
          <button
            onClick={handleLoad}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {status === "downloading" ? "Downloading..." : "Loading into GPU..."}
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download & Load ({model?.size})
              </>
            )}
          </button>
        ) : (
          <button
            onClick={handleUnload}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            Unload Model
          </button>
        )}
      </div>

      <p className="text-[10px] text-slate-600 leading-relaxed">
        Models are downloaded once and cached in your browser. They run entirely on your device
        using WebGPU — no data leaves your machine.
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: ModelStatus }) {
  switch (status) {
    case "ready":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
        </span>
      );
    case "generating":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-violet-400">
          <Cpu className="w-3.5 h-3.5 animate-pulse" /> Generating
        </span>
      );
    case "downloading":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading
        </span>
      );
    case "loading":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-sky-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading GPU
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-red-400">
          <XCircle className="w-3.5 h-3.5" /> Error
        </span>
      );
    default:
      return (
        <span className="text-xs text-slate-500">Not loaded</span>
      );
  }
}

function ModelOption({
  model,
  selected,
  loaded,
  disabled,
  onClick,
}: {
  model: BrowserModel;
  selected: boolean;
  loaded: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all ${
        selected
          ? "border-violet-500/60 bg-violet-500/10"
          : "border-slate-700/50 bg-slate-800/30 hover:border-slate-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${selected ? "text-violet-300" : "text-slate-300"}`}>
            {model.label}
          </span>
          {model.recommended && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Recommended
            </span>
          )}
          {model.tag && !model.recommended && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
              {model.tag}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loaded && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Loaded
            </span>
          )}
          <span className="text-[10px] text-slate-500">{model.size}</span>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-0.5">
        VRAM: {model.vram} · {model.id.split("-q")[0]}
        {model.tag && <span className="ml-1 text-sky-400/70">· {model.tag}</span>}
      </p>
    </button>
  );
}

function BrowserLLMServiceSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return "gpu" in navigator;
}

import * as webllm from "@mlc-ai/web-llm";

export type ModelStatus = "idle" | "downloading" | "loading" | "ready" | "error" | "generating";

export interface DownloadProgress {
  progress: number;
  text: string;
}

export interface BrowserModel {
  id: string;
  label: string;
  size: string;
  vram: string;
  recommended?: boolean;
  tag?: string;
}

export const BROWSER_MODELS: BrowserModel[] = [
  { id: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 Coder 3B", size: "~2.3 GB", vram: "~3 GB", recommended: true, tag: "Best for code" },
  { id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 Coder 1.5B", size: "~1 GB", vram: "~2 GB", tag: "Fast code" },
  { id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 Coder 7B", size: "~4.5 GB", vram: "~6 GB", tag: "Best quality" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Phi 3.5 Mini", size: "~2.5 GB", vram: "~4 GB" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen 2.5 1.5B", size: "~1 GB", vram: "~2 GB" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B", size: "~2 GB", vram: "~3 GB" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC", label: "Llama 3.2 1B", size: "~0.7 GB", vram: "~1.5 GB" },
  { id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC", label: "SmolLM2 1.7B", size: "~1 GB", vram: "~2 GB" },
];

export interface TokenEvent {
  agent: string;
  token: string;
  fullText: string;
  done: boolean;
}

type ProgressCb = (p: DownloadProgress) => void;
type StatusCb = (s: ModelStatus) => void;
type TokenCb = (e: TokenEvent) => void;

interface QueuedRequest {
  prompt: string;
  system?: string;
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
}

const STORAGE_KEY = "agentforge_browser_model";

class BrowserLLMService {
  private engine: webllm.MLCEngine | null = null;
  private _model: string | null = null;
  private _status: ModelStatus = "idle";
  private _progressCb: ProgressCb | null = null;
  private _statusCb: StatusCb | null = null;
  private _tokenCb: TokenCb | null = null;
  private _queue: QueuedRequest[] = [];
  private _processing = false;
  private _autoLoading = false;
  private _currentAgent = "";

  get status() { return this._status; }
  get loadedModel() { return this._model; }
  get isReady() { return this._status === "ready" || this._status === "generating"; }
  get hasModel() { return this.engine !== null && (this._status === "ready" || this._status === "generating"); }

  onProgress(cb: ProgressCb) { this._progressCb = cb; }
  onStatus(cb: StatusCb) { this._statusCb = cb; }
  onToken(cb: TokenCb) { this._tokenCb = cb; }
  setCurrentAgent(name: string) { this._currentAgent = name; }

  private setStatus(s: ModelStatus) {
    this._status = s;
    this._statusCb?.(s);
  }

  static isSupported(): boolean {
    return "gpu" in navigator;
  }

  get savedModelId(): string | null {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  }

  async autoLoadSavedModel(): Promise<void> {
    if (this._autoLoading || this.hasModel) return;
    const saved = this.savedModelId;
    if (!saved) return;
    if (!BrowserLLMService.isSupported()) return;
    this._autoLoading = true;
    console.log(`[BrowserLLM] Auto-loading saved model: ${saved}`);
    try {
      await this.loadModel(saved);
      console.log(`[BrowserLLM] Auto-load complete: ${saved}`);
    } catch (err) {
      console.warn("[BrowserLLM] Auto-load failed, clearing saved model:", err);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    } finally {
      this._autoLoading = false;
    }
  }

  async loadModel(modelId: string): Promise<void> {
    if (this._model === modelId && this.engine && (this._status === "ready" || this._status === "generating")) return;

    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }

    this.setStatus("downloading");

    try {
      this.engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          const progress = Math.round(report.progress * 100);
          this._progressCb?.({ progress, text: report.text });
          if (progress >= 99 && this._status === "downloading") {
            this.setStatus("loading");
          }
        },
      });
      this._model = modelId;
      this.setStatus("ready");
      try { localStorage.setItem(STORAGE_KEY, modelId); } catch {}
    } catch (err) {
      console.error("[BrowserLLM] Load failed:", err);
      this.setStatus("error");
      throw err;
    }
  }

  generate(prompt: string, system?: string): Promise<string> {
    if (!this.engine || (this._status !== "ready" && this._status !== "generating")) {
      return Promise.reject(new Error("Model not loaded"));
    }

    return new Promise<string>((resolve, reject) => {
      this._queue.push({ prompt, system, resolve, reject });
      this._processQueue();
    });
  }

  private async _processQueue(): Promise<void> {
    if (this._processing) return;
    this._processing = true;

    while (this._queue.length > 0) {
      const req = this._queue.shift()!;
      this.setStatus("generating");

      try {
        const messages: webllm.ChatCompletionMessageParam[] = [];
        if (req.system) messages.push({ role: "system", content: req.system });
        messages.push({ role: "user", content: req.prompt });

        if (this._tokenCb) {
          let fullText = "";
          const stream = await this.engine!.chat.completions.create({
            messages,
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
          });
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content ?? "";
            if (token) {
              fullText += token;
              this._tokenCb({ agent: this._currentAgent, token, fullText, done: false });
            }
          }
          this._tokenCb({ agent: this._currentAgent, token: "", fullText, done: true });
          req.resolve(fullText);
        } else {
          const reply = await this.engine!.chat.completions.create({
            messages,
            temperature: 0.7,
            max_tokens: 2048,
          });
          req.resolve(reply.choices[0]?.message?.content ?? "");
        }
      } catch (err) {
        req.reject(err);
      }
    }

    this._processing = false;
    if (this.engine && this._model) {
      this.setStatus("ready");
    }
  }

  async unload(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
      this._model = null;
      this._queue = [];
      this._processing = false;
      this.setStatus("idle");
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }
}

export const browserLLM = new BrowserLLMService();

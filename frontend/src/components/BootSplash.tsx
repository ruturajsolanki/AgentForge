import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

interface Stage {
  id: string;
  label: string;
  detail: string;
  check: () => Promise<boolean>;
}

const STAGES: Stage[] = [
  {
    id: "api",
    label: "Backend API",
    detail: "FastAPI · uvicorn",
    check: async () => {
      try {
        const r = await fetch("/api/health");
        return r.ok;
      } catch {
        return false;
      }
    },
  },
  {
    id: "settings",
    label: "Runtime config",
    detail: "Provider, fallback chain, role overrides",
    check: async () => {
      try {
        const r = await fetch("/api/settings");
        return r.ok;
      } catch {
        return false;
      }
    },
  },
  {
    id: "routing",
    label: "Smart router",
    detail: "12 role profiles · 3-tier fallback armed",
    check: async () => {
      try {
        const r = await fetch("/api/llm/routing");
        if (!r.ok) return false;
        const d = await r.json();
        return Array.isArray(d.routing) && d.routing.length > 0;
      } catch {
        return false;
      }
    },
  },
  {
    id: "models",
    label: "Model catalogue",
    detail: "Inventorying NIM · Groq · OpenRouter",
    check: async () => {
      try {
        const r = await fetch("/api/llm/models");
        return r.ok;
      } catch {
        return false;
      }
    },
  },
  {
    id: "ws",
    label: "WebSocket bus",
    detail: "Live agent.code streaming online",
    check: () =>
      new Promise<boolean>((resolve) => {
        try {
          const ws = new WebSocket(
            (window.location.protocol === "https:" ? "wss:" : "ws:") +
              "//" +
              window.location.host +
              "/ws",
          );
          let settled = false;
          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            try {
              ws.close();
            } catch {
              /* ignore */
            }
            resolve(ok);
          };
          ws.onopen = () => finish(true);
          ws.onerror = () => finish(false);
          setTimeout(() => finish(false), 4000);
        } catch {
          resolve(false);
        }
      }),
  },
];

interface Props {
  onDone: () => void;
}

type Status = "pending" | "active" | "ok" | "fail";

export default function BootSplash({ onDone }: Props) {
  const [status, setStatus] = useState<Status[]>(STAGES.map(() => "pending"));
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < STAGES.length; i++) {
        if (cancelled) return;
        setStatus((s) => s.map((v, j) => (j === i ? "active" : v)));
        const ok = await STAGES[i].check();
        if (cancelled) return;
        setStatus((s) => s.map((v, j) => (j === i ? (ok ? "ok" : "fail") : v)));
        await new Promise((r) => setTimeout(r, 280));
      }
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 500));
      setFadeOut(true);
      setTimeout(onDone, 700);
    })();
    return () => {
      cancelled = true;
    };
  }, [onDone]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 transition-opacity duration-700 ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{
        backgroundImage:
          "radial-gradient(900px 500px at 25% 15%, rgba(124,58,237,0.18) 0%, transparent 60%), radial-gradient(900px 500px at 80% 80%, rgba(13,148,136,0.18) 0%, transparent 60%)",
      }}
    >
      <div
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.06) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative w-full max-w-xl px-8">
        {/* Logo / glow */}
        <div className="flex items-center gap-4 mb-10">
          <div className="relative">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center font-bold text-slate-900 text-2xl">
              F
            </div>
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 blur-xl opacity-40 animate-pulse"></div>
          </div>
          <div>
            <div className="text-xs font-semibold tracking-[0.3em] text-slate-400">
              FORGEOS
            </div>
            <div className="text-2xl font-bold text-white">
              <span className="bg-gradient-to-r from-violet-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                Booting up
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              AgentForge × Vultron · 165-model smart router
            </div>
          </div>
        </div>

        {/* Stage list */}
        <div className="space-y-2.5">
          {STAGES.map((stage, i) => {
            const s = status[i];
            return (
              <div
                key={stage.id}
                className={`flex items-center gap-4 px-4 py-2.5 rounded-xl border transition-all ${
                  s === "active"
                    ? "border-violet-500/50 bg-violet-500/5"
                    : s === "ok"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : s === "fail"
                    ? "border-rose-500/30 bg-rose-500/5"
                    : "border-slate-800/60 bg-slate-900/40 opacity-50"
                }`}
              >
                <div className="w-6 h-6 flex items-center justify-center">
                  {s === "pending" && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                  )}
                  {s === "active" && (
                    <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
                  )}
                  {s === "ok" && (
                    <Check className="w-4 h-4 text-emerald-400" />
                  )}
                  {s === "fail" && <X className="w-4 h-4 text-rose-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-200">
                    {stage.label}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {stage.detail}
                  </div>
                </div>
                <div
                  className={`text-[10px] font-mono uppercase tracking-wider ${
                    s === "ok"
                      ? "text-emerald-400"
                      : s === "fail"
                      ? "text-rose-400"
                      : s === "active"
                      ? "text-violet-300"
                      : "text-slate-600"
                  }`}
                >
                  {s === "pending" && "wait"}
                  {s === "active" && "live…"}
                  {s === "ok" && "ready"}
                  {s === "fail" && "skipped"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center text-[11px] text-slate-600 font-mono">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
          tier-0 NIM · tier-1 Groq · tier-2 OpenRouter
        </div>
      </div>
    </div>
  );
}

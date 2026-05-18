import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Brain, Code2, Eye, Rocket, Server } from "lucide-react";
import type { Agent } from "../types";

interface Props {
  agents: Agent[];
}

type Pos = { x: number; y: number };

const POS: Record<string, Pos> = {
  pm: { x: 50, y: 10 },
  fe: { x: 28, y: 32 },
  be: { x: 72, y: 32 },
  manager: { x: 50, y: 46 },
  devops: { x: 40, y: 64 },
  docs: { x: 76, y: 64 },
};

const PATHS = {
  pm_fe: ["pm", "fe"] as const,
  pm_be: ["pm", "be"] as const,
  fe_devops: ["fe", "devops"] as const,
  be_devops: ["be", "devops"] as const,
  devops_docs: ["devops", "docs"] as const,
};

const DOODLE_NOTES: Record<string, string> = {
  pm: "Assigning mission",
  fe: "Painting pixels",
  be: "Wiring APIs",
  devops: "Launching stack",
  docs: "Writing guide",
};

function pct(v: number) {
  return `${v}%`;
}

function nodeClass(active = false) {
  return [
    "absolute -translate-x-1/2 -translate-y-1/2 w-44 rounded-xl border backdrop-blur-md",
    "bg-slate-900/45 border-cyan-400/40 shadow-[0_0_20px_rgba(34,211,238,0.16)]",
    "px-3 py-2 text-slate-100",
    active ? "animate-pulse border-cyan-300/80 shadow-[0_0_28px_rgba(34,211,238,0.34)]" : "",
  ].join(" ");
}

export default function AgentFactoryScene({ agents }: Props) {
  const [phase, setPhase] = useState(0);
  const [reportTick, setReportTick] = useState(0);

  useEffect(() => {
    const flow = setInterval(() => setPhase((p) => (p + 1) % 4), 1800);
    const report = setInterval(() => setReportTick((t) => t + 1), 5000);
    return () => {
      clearInterval(flow);
      clearInterval(report);
    };
  }, []);

  const byId = useMemo(() => {
    const map = new Map(agents.map((a) => [a.id, a]));
    return {
      pm: map.get("project_manager"),
      fe: map.get("frontend_dev"),
      be: map.get("backend_dev"),
      devops: map.get("devops"),
      docs: map.get("documentation"),
    };
  }, [agents]);

  const activeWire = (id: keyof typeof PATHS) => {
    if (phase === 0) return id === "pm_fe" || id === "pm_be";
    if (phase === 2) return id === "fe_devops" || id === "be_devops";
    if (phase === 3) return id === "devops_docs";
    return false;
  };

  const iconWrap = "w-8 h-8 rounded-lg bg-slate-800/70 border border-cyan-400/30 flex items-center justify-center";

  const reportSources: Array<keyof typeof POS> = ["pm", "fe", "be", "devops", "docs"];

  return (
    <div className="relative h-[560px] rounded-2xl border border-cyan-500/30 bg-slate-900 overflow-hidden shadow-[0_0_80px_rgba(15,23,42,0.9)_inset]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(34,211,238,0.1),transparent_40%),radial-gradient(circle_at_80%_90%,rgba(139,92,246,0.14),transparent_45%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:30px_30px] opacity-20" />
      <DoodleSparkles />

      <svg className="absolute inset-0 w-full h-full">
        {Object.entries(PATHS).map(([id, [from, to]]) => (
          <motion.path
            key={id}
            d={`M ${POS[from].x}% ${POS[from].y}% Q ${(POS[from].x + POS[to].x) / 2}% ${(POS[from].y + POS[to].y) / 2 - 4}% ${POS[to].x}% ${POS[to].y}%`}
            fill="none"
            stroke={activeWire(id as keyof typeof PATHS) ? "#22d3ee" : "rgba(34,211,238,0.28)"}
            strokeWidth={activeWire(id as keyof typeof PATHS) ? 3.5 : 2}
            animate={{
              opacity: activeWire(id as keyof typeof PATHS) ? [0.45, 1, 0.45] : 0.35,
              filter: activeWire(id as keyof typeof PATHS)
                ? "drop-shadow(0 0 10px rgba(34,211,238,0.9))"
                : "drop-shadow(0 0 3px rgba(34,211,238,0.3))",
            }}
            transition={{ duration: 0.9, repeat: activeWire(id as keyof typeof PATHS) ? Infinity : 0 }}
          />
        ))}
      </svg>

      {phase === 0 && (
        <>
          <FlowParticle from={POS.pm} to={POS.fe} delay={0} />
          <FlowParticle from={POS.pm} to={POS.be} delay={0.12} />
        </>
      )}
      {phase === 2 && (
        <>
          <FlowParticle from={POS.fe} to={POS.devops} delay={0} />
          <FlowParticle from={POS.be} to={POS.devops} delay={0.12} />
        </>
      )}
      {phase === 3 && <FlowParticle from={POS.devops} to={POS.docs} delay={0} />}

      {reportSources.map((key) => (
        <FlowParticle key={`${key}-${reportTick}`} from={POS[key]} to={POS.manager} faint />
      ))}

      <div style={{ left: pct(POS.pm.x), top: pct(POS.pm.y) }} className={nodeClass(byId.pm?.status === "working" || phase === 0)}>
        <AgentCard
          kind="pm"
          active={byId.pm?.status === "working" || phase === 0}
          title="Project Manager"
          subtitle={byId.pm?.current_task || "Task Orchestrator"}
          icon={<Brain className="w-4 h-4 text-cyan-200" />}
          iconWrap={iconWrap}
        />
      </div>

      <div style={{ left: pct(POS.fe.x), top: pct(POS.fe.y) }} className={nodeClass(byId.fe?.status === "working" || phase === 1 || phase === 2)}>
        <AgentCard
          kind="fe"
          active={byId.fe?.status === "working" || phase === 1 || phase === 2}
          title="Frontend Developer"
          subtitle={byId.fe?.current_task || "UI + UX Assembly"}
          icon={<Code2 className="w-4 h-4 text-violet-200" />}
          iconWrap={iconWrap}
        />
      </div>

      <div style={{ left: pct(POS.be.x), top: pct(POS.be.y) }} className={nodeClass(byId.be?.status === "working" || phase === 1 || phase === 2)}>
        <AgentCard
          kind="be"
          active={byId.be?.status === "working" || phase === 1 || phase === 2}
          title="Backend Developer"
          subtitle={byId.be?.current_task || "APIs + Data Layer"}
          icon={<Server className="w-4 h-4 text-emerald-200" />}
          iconWrap={iconWrap}
        />
      </div>

      <div style={{ left: pct(POS.devops.x), top: pct(POS.devops.y) }} className={nodeClass(byId.devops?.status === "working" || phase === 3)}>
        <AgentCard
          kind="devops"
          active={byId.devops?.status === "working" || phase === 3}
          title="DevOps"
          subtitle={byId.devops?.current_task || "Deploy + Infra"}
          icon={<Rocket className="w-4 h-4 text-orange-200" />}
          iconWrap={iconWrap}
        />
      </div>

      <div style={{ left: pct(POS.docs.x), top: pct(POS.docs.y) }} className={nodeClass(byId.docs?.status === "working" || phase === 3)}>
        <AgentCard
          kind="docs"
          active={byId.docs?.status === "working" || phase === 3}
          title="Documentation Writer"
          subtitle={byId.docs?.current_task || "Monitors + Documents"}
          icon={<BookOpen className="w-4 h-4 text-sky-200" />}
          iconWrap={iconWrap}
        />
      </div>

      <div
        style={{ left: pct(POS.manager.x), top: pct(POS.manager.y) }}
        className="absolute -translate-x-1/2 -translate-y-1/2 w-40 rounded-full border border-violet-400/60 bg-violet-900/30 backdrop-blur-md px-3 py-3 text-center shadow-[0_0_28px_rgba(139,92,246,0.35)]"
      >
        <div className="mx-auto mb-1 w-8 h-8 rounded-full bg-violet-800/50 border border-violet-300/40 flex items-center justify-center">
          <Eye className="w-4 h-4 text-violet-100" />
        </div>
        <div className="text-xs font-semibold text-violet-100 tracking-wide">Overseer</div>
        <div className="text-[10px] text-violet-300/90 mt-0.5">Central Manager</div>
      </div>

      <div className="absolute left-4 top-3 text-[11px] text-cyan-200/80 font-semibold tracking-widest uppercase">
        AI Agent Factory
      </div>
    </div>
  );
}

function FlowParticle({
  from,
  to,
  delay = 0,
  faint = false,
}: {
  from: Pos;
  to: Pos;
  delay?: number;
  faint?: boolean;
}) {
  return (
    <motion.div
      className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
        faint
          ? "w-1.5 h-1.5 bg-violet-300/80 shadow-[0_0_8px_rgba(196,181,253,0.8)]"
          : "w-2.5 h-2.5 bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,1)]"
      }`}
      initial={{ left: pct(from.x), top: pct(from.y), opacity: faint ? 0.5 : 1 }}
      animate={{ left: pct(to.x), top: pct(to.y), opacity: [faint ? 0.5 : 1, 0.8, 0] }}
      transition={{ duration: faint ? 1.5 : 1.2, delay, ease: "easeInOut" }}
    />
  );
}

function AgentCard({
  kind,
  active,
  title,
  subtitle,
  icon,
  iconWrap,
}: {
  kind: keyof typeof DOODLE_NOTES;
  active: boolean;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  iconWrap: string;
}) {
  return (
    <div className="flex items-start gap-2.5 relative">
      <motion.div
        className="absolute -top-6 left-11 text-[10px] text-cyan-100/90 bg-slate-800/80 border border-cyan-300/20 rounded-full px-2 py-0.5 whitespace-nowrap"
        animate={{ y: [0, -2, 0], opacity: [0.9, 1, 0.9] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        {DOODLE_NOTES[kind]}
      </motion.div>
      <div className="relative">
        <DoodleAvatar kind={kind} active={active} />
      </div>
      <div className={iconWrap}>{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-100 truncate">{title}</div>
        <div className="text-[11px] text-slate-300/90 mt-0.5 truncate">{subtitle}</div>
      </div>
    </div>
  );
}

function DoodleAvatar({
  kind,
  active,
}: {
  kind: keyof typeof DOODLE_NOTES;
  active: boolean;
}) {
  const tint =
    kind === "pm" ? "#67e8f9" : kind === "fe" ? "#c4b5fd" : kind === "be" ? "#86efac" : kind === "devops" ? "#fdba74" : "#7dd3fc";
  return (
    <motion.svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      className="drop-shadow-[0_0_10px_rgba(148,163,184,0.35)]"
      animate={{ rotate: active ? [0, -2, 2, 0] : 0, scale: active ? [1, 1.04, 1] : 1 }}
      transition={{ duration: 1.2, repeat: active ? Infinity : 0 }}
    >
      <circle cx="17" cy="8.5" r="4.5" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 18 Q17 14 24 18" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 18 L17 28" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 28 L12 32" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M17 28 L22 32" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M10 22 L7 17" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M24 22 L27 17" fill="none" stroke={tint} strokeWidth="2.2" strokeLinecap="round" />
    </motion.svg>
  );
}

function DoodleSparkles() {
  const dots = [
    { x: "9%", y: "14%" },
    { x: "82%", y: "18%" },
    { x: "17%", y: "78%" },
    { x: "90%", y: "74%" },
    { x: "56%", y: "22%" },
  ];
  return (
    <div className="absolute inset-0 pointer-events-none">
      {dots.map((d, i) => (
        <motion.div
          key={i}
          className="absolute text-cyan-200/60 text-xs"
          style={{ left: d.x, top: d.y }}
          animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.8, 1.2, 0.8], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 2.2 + i * 0.4, repeat: Infinity }}
        >
          ✦
        </motion.div>
      ))}
    </div>
  );
}

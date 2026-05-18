import { useEffect, useState, useRef } from "react";
import type { Agent } from "../types";

interface DollState {
  x: number;
  y: number;
  facingRight: boolean;
}

const IDLE_THOUGHTS = [
  "Waiting for tasks...",
  "☕ Coffee break",
  "Ready to go!",
  "Checking systems...",
  "Standing by...",
  "🎵 Humming away...",
  "All clear here",
  "💤 Resting...",
  "👀 Looking around",
  "💭 Hmm...",
  "What's next?",
  "🧹 Tidying up...",
];

const ROLE_THOUGHTS: Record<string, string[]> = {
  project_manager: [
    "Planning sprints...",
    "Breaking down tasks...",
    "Assigning work...",
    "Reviewing scope...",
    "📋 Organizing...",
    "Prioritizing backlog...",
  ],
  frontend_dev: [
    "Styling components...",
    "JSX time! ⚛️",
    "Pixel-perfect...",
    "CSS magic! ✨",
    "Building the UI...",
    "Responsive layout...",
  ],
  backend_dev: [
    "Building APIs...",
    "Database queries...",
    "Auth logic... 🔐",
    "Error handling...",
    "Endpoint design...",
    "Writing middleware...",
  ],
  devops: [
    "Docker builds... 🐳",
    "CI/CD pipeline...",
    "Monitoring...",
    "Scaling up... ⚡",
    "Deploying...",
    "Checking logs...",
  ],
  qa_tester: [
    "Running tests... 🧪",
    "Found a bug! 🐛",
    "All tests pass ✅",
    "Edge cases...",
    "Writing assertions...",
    "Coverage check...",
  ],
  documentation: [
    "Writing docs... 📝",
    "README update...",
    "API reference...",
    "Adding examples...",
    "Documenting APIs...",
    "Style guide...",
  ],
};

interface Props {
  agents: Agent[];
}

export default function AgentScene({ agents }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dollStates, setDollStates] = useState<Record<string, DollState>>({});
  const [thoughts, setThoughts] = useState<Record<string, { text: string; visible: boolean }>>({});

  useEffect(() => {
    if (agents.length === 0 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();

    setDollStates((prev) => {
      const next = { ...prev };
      let hasNew = false;
      agents.forEach((agent, i) => {
        if (!next[agent.id]) {
          hasNew = true;
          const spacing = rect.width / (agents.length + 1);
          next[agent.id] = {
            x: spacing * (i + 1),
            y: 130 + Math.random() * 60,
            facingRight: Math.random() > 0.5,
          };
        }
      });
      return hasNew ? next : prev;
    });
  }, [agents]);

  useEffect(() => {
    if (agents.length === 0) return;

    const wander = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      setDollStates((prev) => {
        const next = { ...prev };
        const count = Math.random() > 0.6 ? 2 : 1;
        for (let c = 0; c < count; c++) {
          const agent = agents[Math.floor(Math.random() * agents.length)];
          const pos = next[agent.id];
          if (!pos) continue;

          const newX = Math.max(50, Math.min(rect.width - 50, pos.x + (Math.random() - 0.5) * 160));
          const newY = Math.max(90, Math.min(230, pos.y + (Math.random() - 0.5) * 70));

          next[agent.id] = { x: newX, y: newY, facingRight: newX >= pos.x };
        }
        return next;
      });
    };

    const interval = setInterval(wander, 2800);
    return () => clearInterval(interval);
  }, [agents]);

  useEffect(() => {
    if (agents.length === 0) return;

    const think = () => {
      const agent = agents[Math.floor(Math.random() * agents.length)];
      let text: string;

      if (agent.status === "working" && agent.current_task) {
        if (Math.random() > 0.4) {
          const task = agent.current_task;
          text = task.length > 30 ? task.slice(0, 30) + "..." : task;
        } else {
          const pool = ROLE_THOUGHTS[agent.id] ?? IDLE_THOUGHTS;
          text = pool[Math.floor(Math.random() * pool.length)];
        }
      } else if (agent.status === "completed") {
        text = ["All done! ✅", "Finished! 🎉", "Task complete ✓"][Math.floor(Math.random() * 3)];
      } else {
        text = IDLE_THOUGHTS[Math.floor(Math.random() * IDLE_THOUGHTS.length)];
      }

      setThoughts((prev) => ({ ...prev, [agent.id]: { text, visible: true } }));

      setTimeout(() => {
        setThoughts((prev) => ({
          ...prev,
          [agent.id]: { ...prev[agent.id], visible: false },
        }));
      }, 2800);
    };

    const initial = setTimeout(think, 600);
    const interval = setInterval(think, 3000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [agents]);

  if (agents.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="agent-scene relative w-full h-[280px] border border-slate-800 rounded-xl overflow-hidden select-none"
    >
      <div className="absolute inset-0 scene-floor" />

      <div className="absolute top-3 left-4 text-[11px] text-slate-600 font-semibold tracking-widest uppercase">
        Agent Workspace
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-16 scene-ground" />

      {agents.map((agent) => {
        const state = dollStates[agent.id];
        if (!state) return null;

        const thought = thoughts[agent.id];
        const isWorking = agent.status === "working";

        return (
          <div
            key={agent.id}
            className="agent-doll-container"
            style={{
              left: state.x - 30,
              top: state.y - 40,
              zIndex: Math.round(state.y),
            }}
          >
            {thought && (
              <div
                className={`thought-bubble ${thought.visible ? "thought-in" : "thought-out"}`}
              >
                <div className="thought-content">
                  {thought.text}
                  <div className="thought-tail" />
                </div>
                <div className="thought-dots">
                  <span />
                  <span />
                </div>
              </div>
            )}

            <div
              className="doll-flip"
              style={{ transform: state.facingRight ? "scaleX(1)" : "scaleX(-1)" }}
            >
              <svg
                width="60"
                height="80"
                viewBox="0 0 60 80"
                className={isWorking ? "doll-working" : "doll-idle"}
              >
                <ellipse cx="30" cy="76" rx="12" ry="3" fill="rgba(0,0,0,0.2)" className="doll-shadow" />

                <g className={isWorking ? "leg-anim-l" : ""}>
                  <rect x="22" y="56" width="7" height="16" rx="3.5" fill={agent.color} opacity="0.45" />
                </g>
                <g className={isWorking ? "leg-anim-r" : ""}>
                  <rect x="31" y="56" width="7" height="16" rx="3.5" fill={agent.color} opacity="0.45" />
                </g>

                <rect x="18" y="35" width="24" height="25" rx="8" fill={agent.color} opacity="0.85" />

                <g className={isWorking ? "arm-anim-l" : "arm-idle-l"}>
                  <rect x="8" y="37" width="10" height="17" rx="5" fill={agent.color} opacity="0.55" />
                </g>
                <g className={isWorking ? "arm-anim-r" : "arm-idle-r"}>
                  <rect x="42" y="37" width="10" height="17" rx="5" fill={agent.color} opacity="0.55" />
                </g>

                <circle cx="30" cy="23" r="17" fill={agent.color} />

                <ellipse cx="23" cy="21" rx="3.5" ry="4" fill="white" />
                <ellipse cx="37" cy="21" rx="3.5" ry="4" fill="white" />
                <circle cx="24" cy="22" r="1.8" fill="#0f172a" />
                <circle cx="38" cy="22" r="1.8" fill="#0f172a" />

                <circle cx="25" cy="20.5" r="0.7" fill="white" opacity="0.85" />
                <circle cx="39" cy="20.5" r="0.7" fill="white" opacity="0.85" />

                <ellipse cx="18" cy="27" rx="3.5" ry="2" fill="rgba(255,160,160,0.25)" />
                <ellipse cx="42" cy="27" rx="3.5" ry="2" fill="rgba(255,160,160,0.25)" />

                {agent.status === "completed" ? (
                  <path d="M 23 30 Q 30 36 37 30" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                ) : agent.status === "error" ? (
                  <path d="M 23 33 Q 30 28 37 33" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                ) : (
                  <path d="M 24 31 Q 30 35 36 31" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                )}

                {isWorking && (
                  <circle cx="30" cy="46" r="3.5" fill="white" opacity="0.85">
                    <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1s" repeatCount="indefinite" />
                  </circle>
                )}
                {agent.status === "completed" && (
                  <path d="M 25 46 L 29 50 L 36 43" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                )}
                {agent.status === "error" && (
                  <g>
                    <line x1="26" y1="44" x2="34" y2="52" stroke="white" strokeWidth="2" strokeLinecap="round" />
                    <line x1="34" y1="44" x2="26" y2="52" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </g>
                )}
              </svg>
            </div>

            <div
              className="text-center text-[9px] font-bold whitespace-nowrap"
              style={{ color: agent.color }}
            >
              {agent.name.split(" ").pop()}
            </div>
          </div>
        );
      })}
    </div>
  );
}

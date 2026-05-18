import type { Agent } from "../types";
import AgentCard from "./AgentCard";
import AgentFactoryScene from "./AgentFactoryScene";

interface Props {
  agents: Agent[];
}

export default function Dashboard({ agents }: Props) {
  if (agents.length === 0) return null;

  return (
    <div className="space-y-4">
      <AgentFactoryScene agents={agents} />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}

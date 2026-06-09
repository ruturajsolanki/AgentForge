import { Badge } from "../ui/badge";
import type { SwonLifecycleState } from "../../types";

const STATE_COLORS: Record<SwonLifecycleState, string> = {
  Initiated: "bg-blue-100 text-blue-800",
  Planning: "bg-purple-100 text-purple-800",
  Executing: "bg-amber-100 text-amber-800",
  Monitoring: "bg-cyan-100 text-cyan-800",
  Closing: "bg-orange-100 text-orange-800",
  Warranty: "bg-green-100 text-green-800",
  Closed: "bg-gray-100 text-gray-600",
};

interface Props {
  publicId: string;
  state: SwonLifecycleState;
  className?: string;
}

export default function SwonBadge({ publicId, state, className = "" }: Props) {
  return (
    <Badge variant="outline" className={`gap-1.5 font-mono text-xs ${className}`}>
      <span
        className={`inline-block h-2 w-2 rounded-full ${STATE_COLORS[state]?.split(" ")[0] ?? "bg-gray-300"}`}
      />
      {publicId}
      <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-medium ${STATE_COLORS[state] ?? ""}`}>
        {state}
      </span>
    </Badge>
  );
}

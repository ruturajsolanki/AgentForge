import { Badge } from "../ui/badge";
import type { WonState } from "../../types";

const STATE_COLORS: Record<WonState, string> = {
  Active: "bg-green-100 text-green-700",
  Extended: "bg-blue-100 text-blue-700",
  Released: "bg-gray-100 text-gray-600",
  Renewed: "bg-amber-100 text-amber-700",
};

interface Props {
  publicId: string;
  state: WonState;
  billable: boolean;
  className?: string;
}

export default function WonBadge({ publicId, state, billable, className = "" }: Props) {
  return (
    <Badge variant="outline" className={`gap-1.5 font-mono text-xs ${className}`}>
      <span
        className={`inline-block h-2 w-2 rounded-full ${STATE_COLORS[state]?.split(" ")[0] ?? "bg-gray-300"}`}
      />
      {publicId}
      {billable && (
        <span className="ml-1 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-medium text-emerald-700">
          $
        </span>
      )}
      <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-medium ${STATE_COLORS[state] ?? ""}`}>
        {state}
      </span>
    </Badge>
  );
}

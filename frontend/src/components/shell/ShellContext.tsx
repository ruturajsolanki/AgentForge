import { createContext, useContext } from "react";
import type { WSEvent } from "../../types";

export interface ShellState {
  connected: boolean;
  events: WSEvent[];
  clearEvents: () => void;
  wsRef: React.RefObject<WebSocket | null>;
  subscribeToDemand: (demandId: string) => boolean;
}

export const ShellContext = createContext<ShellState | null>(null);

export function useShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside AppShell");
  return value;
}

import { useCallback, useMemo, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { Circle, Command as CommandIcon } from "lucide-react";
import { Toaster } from "sonner";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useShortcut } from "../../hooks/useShortcut";
import type { WSEvent } from "../../types";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Breadcrumbs } from "./Breadcrumbs";
import { CommandPalette } from "./CommandPalette";
import { LeftRail } from "./LeftRail";
import { ShellContext } from "./ShellContext";

const EVENT_BUFFER_SIZE = 500;

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [events, setEvents] = useState<WSEvent[]>([]);
  const navigate = useNavigate();
  const params = useParams();

  const handleEvent = useCallback((event: WSEvent) => {
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > EVENT_BUFFER_SIZE ? next.slice(next.length - EVENT_BUFFER_SIZE) : next;
    });
  }, []);

  const { connected, wsRef } = useWebSocket(handleEvent);

  useShortcut("mod+k", () => setPaletteOpen(true));
  useShortcut("g d", () => navigate("/demands"));
  useShortcut("g n", () => navigate("/demand/new"));
  useShortcut("g p", () => {
    if (params.id) navigate(`/demand/${params.id}/agents`);
  });

  const value = useMemo(() => ({
    connected,
    events,
    clearEvents: () => setEvents([]),
    wsRef,
  }), [connected, events, wsRef]);

  return (
    <ShellContext.Provider value={value}>
      <div className="min-h-screen bg-canvas text-fg">
        <div className="flex min-h-screen">
          <LeftRail collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
          <div className="min-w-0 flex-1">
            <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-canvas/95 px-4">
              <Breadcrumbs />
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPaletteOpen(true)}>
                  <CommandIcon />
                  <span className="hidden sm:inline">Search</span>
                  <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
                </Button>
                <div className="hidden items-center gap-1 text-xs text-fg-muted sm:flex">
                  <Circle className={connected ? "h-2 w-2 fill-success text-success" : "h-2 w-2 fill-danger text-danger"} />
                  {connected ? "Live" : "Offline"}
                </div>
                <Avatar>
                  <AvatarFallback>RS</AvatarFallback>
                </Avatar>
              </div>
            </header>
            <main className="min-h-[calc(100vh-56px)]">
              <Outlet />
            </main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <Toaster position="bottom-right" toastOptions={{ className: "border border-hairline-hi bg-surface-3 text-fg" }} />
      </div>
    </ShellContext.Provider>
  );
}

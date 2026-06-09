import { useCallback, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { Circle, Command as CommandIcon, LogOut } from "lucide-react";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useShortcut } from "../../hooks/useShortcut";
import { useSession } from "../../hooks/useSession";
import { logout } from "../../lib/auth";
import { roleMeta, topRole } from "../../lib/roles";
import { Badge } from "../ui/badge";
import type { WSEvent } from "../../types";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { Breadcrumbs } from "./Breadcrumbs";
import { CommandPalette } from "./CommandPalette";
import { LeftRail } from "./LeftRail";
import { NotificationBell } from "./NotificationBell";
import { ShellContext } from "./ShellContext";

const EVENT_BUFFER_SIZE = 500;

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [events, setEvents] = useState<WSEvent[]>([]);
  const navigate = useNavigate();
  const params = useParams();
  const session = useSession();

  const handleEvent = useCallback((event: WSEvent) => {
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > EVENT_BUFFER_SIZE ? next.slice(next.length - EVENT_BUFFER_SIZE) : next;
    });
  }, []);

  const { connected, wsRef, subscribeToDemand } = useWebSocket(handleEvent);

  useShortcut("mod+k", () => setPaletteOpen(true));
  useShortcut("g d", () => navigate("/demands"));
  useShortcut("g r", () => navigate("/requests"));
  useShortcut("g n", () => navigate("/demand/new"));
  useShortcut("g p", () => {
    if (params.id) navigate(`/demand/${params.id}/agents`);
  });

  const value = useMemo(() => ({
    connected,
    events,
    clearEvents: () => setEvents([]),
    wsRef,
    subscribeToDemand,
  }), [connected, events, subscribeToDemand, wsRef]);

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
                <Badge variant="outline" className="hidden sm:inline-flex" data-testid="role-badge">
                  {roleMeta(topRole(session)).label}
                </Badge>
                <NotificationBell />
                <Link to="/profile" aria-label="Profile" data-testid="profile-link">
                  <Avatar>
                    <AvatarFallback>{session?.name.split(" ").map((part) => part[0]).join("").slice(0, 2) || "MO"}</AvatarFallback>
                  </Avatar>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden lg:inline">Sign out</span>
                </Button>
              </div>
            </header>
            <main className="min-h-[calc(100vh-56px)]">
              <Outlet />
            </main>
          </div>
        </div>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </ShellContext.Provider>
  );
}

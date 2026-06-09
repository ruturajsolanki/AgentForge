import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check } from "lucide-react";
import { forgeApi, type NotificationItem } from "../../services/forgeApi";
import { Button } from "../ui/button";

const POLL_MS = 30000;

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await forgeApi.listNotifications();
      setItems(res.items);
      setUnread(res.unread_count);
    } catch {
      // Notifications are best-effort; ignore transient failures.
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const markAll = async () => {
    try {
      await forgeApi.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // ignore
    }
  };

  const markOne = async (id: string) => {
    try {
      const res = await forgeApi.markNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread(res.unread_count);
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Notifications"
        data-testid="notification-bell"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
      >
        <span className="relative inline-flex">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              data-testid="notification-badge"
              className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </span>
      </Button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-xl border border-hairline bg-canvas shadow-lg">
          <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
            <span className="text-sm font-semibold text-fg-strong">Notifications</span>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
              onClick={() => void markAll()}
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-fg-muted">You're all caught up.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void markOne(n.id)}
                  className={`block w-full border-b border-hairline px-3 py-2 text-left last:border-b-0 hover:bg-surface-2 ${
                    n.read ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-fg-strong">{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{n.body}</p>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

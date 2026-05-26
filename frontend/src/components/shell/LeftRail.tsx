import { Link, useLocation } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, Settings, SplitSquareVertical, Workflow } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/demands", label: "Demands", icon: Workflow },
  { href: "/models", label: "Models", icon: SplitSquareVertical },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function LeftRail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const location = useLocation();
  return (
    <aside className={cn("sticky top-0 hidden h-screen shrink-0 border-r border-hairline bg-surface-1 transition-all md:flex md:flex-col", collapsed ? "w-16" : "w-[220px]")}>
      <div className="flex h-14 items-center gap-2 border-b border-hairline px-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-sm font-semibold text-accent-fg">F</div>
        {!collapsed && <div className="text-sm font-semibold text-fg-strong">ForgeOS</div>}
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = location.pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn("flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition", active ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg-strong")}
            >
              <Icon className="h-4 w-4 shrink-0 stroke-[1.5]" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-2 border-t border-hairline p-2">
        <ThemeToggle />
        <Button variant="ghost" size="icon" aria-label="Collapse navigation" onClick={onToggle}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </Button>
      </div>
    </aside>
  );
}

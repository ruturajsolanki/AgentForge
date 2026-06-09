import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FilePlus, Inbox, Moon, Search, Settings, SplitSquareVertical, Sun, UsersRound, Workflow } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "../ui/command";
import { Dialog, DialogContent } from "../ui/dialog";
import { forgeApi } from "../../services/forgeApi";
import type { Demand } from "../../types";
import { useThemeContext } from "./ThemeProvider";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useThemeContext();
  const [recent, setRecent] = useState<Demand[]>([]);

  useEffect(() => {
    if (!open) return;
    forgeApi.listDemands().then((rows) => setRecent(rows.slice(0, 5))).catch(() => setRecent([]));
  }, [open]);

  const run = (to: string) => {
    navigate(to);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0" onClose={() => onOpenChange(false)}>
        <Command>
          <div className="flex items-center gap-2 border-b border-hairline px-3">
            <Search className="h-4 w-4 text-fg-muted" />
            <CommandInput placeholder="Search commands..." />
          </div>
          <CommandList>
            <CommandEmpty>No command found.</CommandEmpty>
            <CommandGroup heading="Go to">
              <CommandItem onSelect={() => run("/demands")}><Workflow /> Demands</CommandItem>
              <CommandItem onSelect={() => run("/requests")}><Inbox /> Requests</CommandItem>
              <CommandItem onSelect={() => run("/team")}><UsersRound /> Team</CommandItem>
              <CommandItem onSelect={() => run("/models")}><SplitSquareVertical /> Models</CommandItem>
              <CommandItem onSelect={() => run("/settings")}><Settings /> Settings</CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Demand">
              <CommandItem onSelect={() => run("/demand/new")}><FilePlus /> New demand</CommandItem>
              {recent.map((demand) => (
                <CommandItem key={demand.id} onSelect={() => run(`/demand/${demand.public_id}/plan`)}>
                  <span className="font-mono text-xs">{demand.public_id}</span>
                  <span className="truncate">{demand.raw_text}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Theme">
              <CommandItem onSelect={() => { toggleTheme(); onOpenChange(false); }}>
                {theme === "dark" ? <Sun /> : <Moon />}
                Switch to {theme === "dark" ? "light" : "dark"}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

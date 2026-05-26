import * as React from "react";
import { cn } from "../../lib/cn";

export function Popover({ children, open = true }: { children: React.ReactNode; open?: boolean }) {
  return open ? <>{children}</> : null;
}
export function PopoverTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function PopoverContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-hairline-hi bg-surface-3 p-3 shadow-floating", className)} {...props} />;
}

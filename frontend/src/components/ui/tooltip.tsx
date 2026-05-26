import * as React from "react";
import { cn } from "../../lib/cn";

export function Tooltip({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function TooltipTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function TooltipContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border border-hairline-hi bg-surface-3 px-2 py-1 text-xs text-fg shadow-floating", className)} {...props} />;
}

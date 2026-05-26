import * as React from "react";
import { cn } from "../../lib/cn";

export function DropdownMenu({ children, open = true }: { children: React.ReactNode; open?: boolean }) {
  return open ? <>{children}</> : null;
}
export function DropdownMenuTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
export function DropdownMenuContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-hairline-hi bg-surface-3 p-1 shadow-floating", className)} {...props} />;
}
export function DropdownMenuItem({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg hover:bg-surface-2", className)} {...props} />;
}

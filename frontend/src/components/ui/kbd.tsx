import * as React from "react";
import { cn } from "../../lib/cn";

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn("inline-flex min-w-5 items-center justify-center rounded border border-hairline-hi bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg-muted", className)}
      {...props}
    />
  );
}

import * as React from "react";
import { cn } from "../../lib/cn";

export function Progress({ value = 0, className, ...props }: React.HTMLAttributes<HTMLDivElement> & { value?: number }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-surface-2", className)} {...props}>
      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

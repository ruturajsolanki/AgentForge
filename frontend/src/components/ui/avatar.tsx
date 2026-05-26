import * as React from "react";
import { cn } from "../../lib/cn";

export function Avatar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-2", className)} {...props} />;
}

export function AvatarFallback({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-xs font-medium text-fg", className)} {...props} />;
}

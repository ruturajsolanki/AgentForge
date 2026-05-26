import * as React from "react";
import { cn } from "../../lib/cn";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn("h-9 w-full rounded-lg border border-hairline bg-surface-1 px-3 text-sm text-fg-strong outline-none transition placeholder:text-fg-faint focus:border-accent focus:ring-2 focus:ring-accent/35", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

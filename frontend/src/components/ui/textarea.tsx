import * as React from "react";
import { cn } from "../../lib/cn";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn("min-h-24 w-full rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-sm leading-5 text-fg-strong outline-none transition placeholder:text-fg-faint focus:border-accent focus:ring-2 focus:ring-accent/35", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

import * as React from "react";
import { cn } from "../../lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn("relative h-5 w-9 rounded-full border border-hairline bg-surface-2 transition data-[checked=true]:bg-accent", className)}
      data-checked={checked}
      {...props}
    >
      <span className={cn("absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-fg-strong transition", checked && "translate-x-4 bg-accent-fg")} />
    </button>
  );
}

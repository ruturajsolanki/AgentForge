import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

export function Dialog({ children, open }: { children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return open ? <>{children}</> : null;
}

export function DialogContent({
  className,
  onClose,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-canvas/80 p-4">
      <div role="dialog" aria-modal="true" className={cn("relative max-h-[88vh] w-full max-w-lg overflow-auto rounded-xl border border-hairline-hi bg-surface-3 p-4 shadow-floating", className)} {...props}>
        {onClose && (
          <Button aria-label="Close" variant="ghost" size="icon" className="absolute right-2 top-2" onClick={onClose}>
            <X />
          </Button>
        )}
        {props.children}
      </div>
    </div>
  );
}

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("space-y-1 pr-10", className)} {...props} />;
export const DialogTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold text-fg-strong", className)} {...props} />;
export const DialogDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn("text-sm text-fg-muted", className)} {...props} />;
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("mt-4 flex justify-end gap-2", className)} {...props} />;

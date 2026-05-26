import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button } from "./button";

export function Sheet({ children, open }: { children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return open ? <>{children}</> : null;
}

export function SheetContent({ className, onClose, ...props }: React.HTMLAttributes<HTMLDivElement> & { onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-canvas/70">
      <aside className={cn("ml-auto h-full w-full max-w-md overflow-auto border-l border-hairline-hi bg-surface-3 p-4 shadow-floating", className)} {...props}>
        {onClose && (
          <Button aria-label="Close" variant="ghost" size="icon" className="float-right" onClick={onClose}>
            <X />
          </Button>
        )}
        {props.children}
      </aside>
    </div>
  );
}

export const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div className={cn("space-y-1 pr-10", className)} {...props} />;
export const SheetTitle = ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => <h2 className={cn("text-lg font-semibold text-fg-strong", className)} {...props} />;
export const SheetDescription = ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p className={cn("text-sm text-fg-muted", className)} {...props} />;

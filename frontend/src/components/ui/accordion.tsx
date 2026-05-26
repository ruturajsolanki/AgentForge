import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../../lib/cn";

export function Accordion({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("divide-y divide-hairline", className)} {...props} />;
}

export function AccordionItem({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <button className="flex w-full items-center justify-between py-3 text-left text-sm text-fg-strong" onClick={() => setOpen((v) => !v)}>
        {title}
        <ChevronRight className={cn("h-4 w-4 transition", open && "rotate-90")} />
      </button>
      {open && <div className="pb-3 text-sm text-fg-muted">{children}</div>}
    </div>
  );
}

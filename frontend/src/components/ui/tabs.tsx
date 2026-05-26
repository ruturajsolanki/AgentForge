import * as React from "react";
import { cn } from "../../lib/cn";

export function Tabs({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("w-full", className)} {...props} />;
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="tablist" className={cn("flex gap-4 border-b border-hairline", className)} {...props} />;
}

export function TabsTrigger({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={cn("relative h-10 text-sm font-medium text-fg-muted transition hover:text-fg-strong data-[active=true]:text-fg-strong", className)}
      data-active={active}
      {...props}
    >
      {props.children}
      {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
    </button>
  );
}

export function TabsContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="tabpanel" className={cn("pt-4", className)} {...props} />;
}

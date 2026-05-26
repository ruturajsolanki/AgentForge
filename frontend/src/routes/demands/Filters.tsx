import { cn } from "../../lib/cn";

const FILTERS = ["All", "High", "Mine", "Active", "Completed"];

export function Filters({ active, onChange }: { active: string; onChange: (filter: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onChange(filter)}
          className={cn("h-8 rounded-full border px-3 text-sm transition", active === filter ? "border-accent bg-accent-soft text-accent" : "border-hairline bg-surface-1 text-fg-muted hover:bg-surface-2 hover:text-fg-strong")}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}

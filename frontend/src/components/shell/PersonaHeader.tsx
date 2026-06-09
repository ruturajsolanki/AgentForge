import { useSession } from "../../hooks/useSession";
import { roleMeta, topRole } from "../../lib/roles";
import type { UserRole } from "../../lib/auth";
import { Badge } from "../ui/badge";

/**
 * A role-aware banner shown at the top of each dashboard so every persona's
 * workspace is visibly distinct. Pass `role` to force a specific persona,
 * otherwise it derives from the active session.
 */
export function PersonaHeader({ role }: { role?: UserRole }) {
  const session = useSession();
  const r = role ?? topRole(session);
  const meta = roleMeta(r);
  return (
    <div
      data-testid="persona-header"
      className="rounded-xl border border-hairline bg-gradient-to-r from-accent/10 to-transparent p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="uppercase tracking-wide">{meta.label}</Badge>
            <span className="text-sm font-medium text-fg-strong">{meta.tagline}</span>
          </div>
          <p className="mt-1 text-sm text-fg-muted">{meta.description}</p>
        </div>
        {session && (
          <div className="text-right text-xs text-fg-muted">
            Signed in as
            <div className="text-sm font-medium text-fg-strong">{session.name}</div>
          </div>
        )}
      </div>
    </div>
  );
}

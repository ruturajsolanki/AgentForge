import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";

export default function DemandsRoute() {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Demands</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg-strong">Operations board</h1>
          <p className="mt-2 max-w-2xl text-sm text-fg-muted">Kanban board lands in the next milestone.</p>
        </div>
        <Button asChild variant="primary"><Link to="/demand/new">New demand</Link></Button>
      </div>
    </div>
  );
}

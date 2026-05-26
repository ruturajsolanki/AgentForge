import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";

export default function NewDemandRoute() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas p-6">
      <div className="max-w-xl rounded-xl border border-hairline bg-surface-1 p-6">
        <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">New demand</p>
        <h1 className="mt-2 text-2xl font-semibold text-fg-strong">3-step intake wizard</h1>
        <p className="mt-2 text-sm text-fg-muted">Wizard lands in the intake milestone.</p>
        <Button asChild className="mt-4"><Link to="/demands">Back to board</Link></Button>
      </div>
    </div>
  );
}

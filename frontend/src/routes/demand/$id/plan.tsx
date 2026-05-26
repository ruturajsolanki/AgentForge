import { Link, useParams } from "react-router-dom";
import { Button } from "../../../components/ui/button";

export default function DemandPlanRoute() {
  const { id } = useParams();
  return (
    <div className="p-4 sm:p-6">
      <h1 className="text-2xl font-semibold text-fg-strong">Plan</h1>
      <p className="mt-2 text-sm text-fg-muted">{id}</p>
      <Button asChild className="mt-4"><Link to={`/demand/${id}/agents`}>Open in canvas</Link></Button>
    </div>
  );
}

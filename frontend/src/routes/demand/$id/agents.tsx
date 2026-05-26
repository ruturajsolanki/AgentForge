import { useParams } from "react-router-dom";
import { Network } from "lucide-react";
import { DemandWorkspace } from "../../../components/demand/DemandWorkspace";
import { Card, CardContent } from "../../../components/ui/card";

export default function DemandAgentsRoute() {
  const { id = "" } = useParams();
  return (
    <DemandWorkspace publicId={id} active="agents">
      {() => (
        <div className="p-4 sm:p-6">
          <Card>
            <CardContent className="grid min-h-[520px] place-items-center p-6 text-center">
              <div>
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-hairline bg-surface-2 text-accent">
                  <Network className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-fg-strong">Agent canvas is materializing</h2>
                <p className="mt-2 max-w-md text-sm text-fg-muted">The spatial canvas lands in the next milestone, wired to live WebSocket deltas.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </DemandWorkspace>
  );
}

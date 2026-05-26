import { useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { AgentCanvas } from "../../../components/canvas/AgentCanvas";
import { DemandWorkspace } from "../../../components/demand/DemandWorkspace";
import { useShell } from "../../../components/shell/ShellContext";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";

export default function DemandAgentsRoute() {
  const { id = "" } = useParams();
  const { events } = useShell();
  return (
    <DemandWorkspace publicId={id} active="agents">
      {({ demand, plan, error, refresh }) => (
        <div className="p-4 sm:p-6">
          {plan ? (
            <AgentCanvas publicId={id} plan={plan} events={events} stage={demand?.stage} />
          ) : (
            <Card>
              <CardContent className="grid min-h-[520px] place-items-center p-6 text-center">
                <div>
                  <h2 className="text-xl font-semibold text-fg-strong">Agent canvas unavailable</h2>
                  <p className="mt-2 max-w-md text-sm text-fg-muted">{error || "The fulfillment plan is not ready yet."}</p>
                  <Button className="mt-4" onClick={refresh}>
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </DemandWorkspace>
  );
}

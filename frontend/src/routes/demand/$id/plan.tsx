import { Link, useParams } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Accordion, AccordionItem } from "../../../components/ui/accordion";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { DemandWorkspace } from "../../../components/demand/DemandWorkspace";
import { PlanCard } from "../../../components/demand/PlanCard";
import { RebalanceSignals } from "../../../components/demand/RebalanceSignals";
import type { DemandStage } from "../../../types";

const stages: DemandStage[] = [
  "ingested",
  "understanding",
  "deciding",
  "allocating",
  "awaiting_approval",
  "executing",
  "monitoring",
  "explaining",
  "completed",
  "failed",
];

export default function DemandPlanRoute() {
  const { id = "" } = useParams();
  return (
    <DemandWorkspace publicId={id} active="plan">
      {({ demand, plan, error, refresh }) => (
        <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            {plan ? (
              <PlanCard plan={plan} readOnly />
            ) : (
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-lg font-semibold text-fg-strong">Plan unavailable</h2>
                  <p className="mt-2 text-sm text-fg-muted">{error || "The manager plan has not materialized yet."}</p>
                  <Button className="mt-4" onClick={refresh}>
                    <RefreshCw className="h-4 w-4" />
                    Retry
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Stage rail</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {stages.map((stage) => {
                    const active = stage === demand?.stage;
                    return (
                      <li key={stage} className="flex items-center gap-3">
                        <span className={active ? "h-3 w-3 rounded-full border border-accent bg-accent animate-pulse" : "h-3 w-3 rounded-full border border-hairline bg-surface-2"} />
                        <span className={active ? "text-sm font-medium capitalize text-fg-strong" : "text-sm capitalize text-fg-muted"}>
                          {stage.replace(/_/g, " ")}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>

            <RebalanceSignals allocation={plan?.allocation} />

            <Card>
              <CardHeader>
                <CardTitle>Reuse candidates</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion>
                  {(demand?.similar_projects?.matches || []).length ? (
                    demand?.similar_projects?.matches.map((match) => (
                      <AccordionItem
                        key={match.project_id}
                        title={(
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs">{match.project_id}</span>
                            <Badge>{Math.round(match.similarity * 100)}%</Badge>
                          </span>
                        )}
                      >
                        <p>{match.description}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {match.reuse_components.map((component) => <Badge key={component}>{component.replace(/_/g, " ")}</Badge>)}
                        </div>
                      </AccordionItem>
                    ))
                  ) : (
                    <p className="text-sm text-fg-muted">No high-confidence reuse candidates yet.</p>
                  )}
                </Accordion>
              </CardContent>
            </Card>

            <Button asChild variant="primary" className="w-full">
              <Link to={`/demand/${id}/agents`}>
                Open in canvas
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </aside>
        </div>
      )}
    </DemandWorkspace>
  );
}

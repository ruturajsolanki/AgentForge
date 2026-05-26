import type { Allocation, Decision, Understanding } from "../../types";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TeamList } from "./TeamList";

export interface PlanShape {
  publicId: string;
  understanding: Understanding;
  decision: Decision;
  allocation: Allocation;
  reuseScore: number;
}

const recommendationOptions = ["project", "poc", "hackathon", "internal_build", "partner"];

export function PlanCard({
  plan,
  readOnly = false,
  onChange,
}: {
  plan: PlanShape;
  readOnly?: boolean;
  onChange?: (plan: PlanShape) => void;
}) {
  const cost = Math.round(plan.decision.estimated_cost_usd || plan.allocation.total_daily_cost * plan.decision.estimated_time_days);
  const confidence = plan.decision.confidence_score > 1 ? plan.decision.confidence_score : plan.decision.confidence_score * 100;
  const updateUnderstanding = (next: Partial<Understanding>) => {
    onChange?.({ ...plan, understanding: { ...plan.understanding, ...next } });
  };
  const updateDecision = (next: Partial<Decision>) => {
    onChange?.({ ...plan, decision: { ...plan.decision, ...next } });
  };
  const rows: Array<{ key: keyof Understanding; label: string; value: string | number }> = [
    { key: "problem_type", label: "Problem", value: plan.understanding.problem_type },
    { key: "domain", label: "Domain", value: plan.understanding.domain },
    { key: "complexity", label: "Complexity", value: plan.understanding.complexity },
    { key: "urgency", label: "Urgency", value: plan.understanding.urgency },
    { key: "estimated_scope_days", label: "Scope days", value: plan.understanding.estimated_scope_days },
  ];
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{readOnly ? "Plan" : "We understood your request as..."}</CardTitle>
          <Badge>{Math.round(confidence)}% confidence</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm leading-6 text-fg">{plan.understanding.summary}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="rounded-lg border border-hairline bg-surface-2 p-3">
              <div className="text-xs text-fg-muted">{row.label}</div>
              {readOnly ? (
                <div className="mt-1 text-sm font-medium capitalize text-fg-strong">{String(row.value).replace(/_/g, " ")}</div>
              ) : (
                <Input
                  className="mt-2 h-8 bg-surface-1"
                  value={String(row.value).replace(/_/g, " ")}
                  type={row.key === "estimated_scope_days" ? "number" : "text"}
                  onChange={(event) => {
                    const value = row.key === "estimated_scope_days"
                      ? Math.max(1, Number(event.target.value || 1))
                      : event.target.value.replace(/\s+/g, "_");
                    updateUnderstanding({ [row.key]: value } as Partial<Understanding>);
                    if (row.key === "estimated_scope_days") updateDecision({ estimated_time_days: Number(value) });
                  }}
                />
              )}
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs text-fg-muted">Required skills</div>
          {readOnly ? (
            <div className="mt-2 flex flex-wrap gap-2">{plan.understanding.required_skills.map((skill) => <Badge key={skill}>{skill.replace(/_/g, " ")}</Badge>)}</div>
          ) : (
            <Input
              className="mt-2"
              value={plan.understanding.required_skills.join(", ")}
              onChange={(event) => updateUnderstanding({ required_skills: splitTags(event.target.value) })}
            />
          )}
        </div>
        <div>
          <div className="text-xs text-fg-muted">Risk factors</div>
          {readOnly ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {plan.decision.risk_factors.length
                ? plan.decision.risk_factors.map((risk) => <Badge key={risk}>{risk.replace(/_/g, " ")}</Badge>)
                : <span className="text-sm text-fg-muted">No major risks detected.</span>}
            </div>
          ) : (
            <Input
              className="mt-2"
              value={plan.decision.risk_factors.join(", ")}
              onChange={(event) => updateDecision({ risk_factors: splitTags(event.target.value) })}
            />
          )}
        </div>
        <div className="rounded-lg border border-hairline bg-surface-2 p-4">
          <div className="text-xs text-fg-muted">Recommendation</div>
          <div className="mt-2 text-sm font-medium text-fg-strong">{plan.decision.project_type.replace(/_/g, " ")} · {plan.decision.execution_mode.replace(/_/g, " ")}</div>
          <p className="mt-2 text-sm leading-5 text-fg-muted">{plan.decision.reasoning}</p>
          {!readOnly && confidence < 80 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {recommendationOptions.map((option) => (
                <Button
                  key={option}
                  type="button"
                  size="sm"
                  variant={plan.decision.project_type === option ? "primary" : "secondary"}
                  onClick={() => updateDecision({ project_type: option })}
                >
                  {option.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          )}
        </div>
        <TeamList team={plan.allocation.team} compact />
        <div className="rounded-lg border border-hairline bg-canvas p-4">
          <div className="text-xs text-fg-muted">Estimated cost</div>
          <div className="mt-1 text-3xl font-semibold text-fg-strong">${cost.toLocaleString()}</div>
          <div className="mt-1 text-xs text-fg-muted">${Math.round(plan.allocation.total_daily_cost).toLocaleString()} / day × {plan.decision.estimated_time_days} days</div>
        </div>
      </CardContent>
    </Card>
  );
}

function splitTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

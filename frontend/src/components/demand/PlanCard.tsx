import { useState } from "react";
import type { Allocation, Decision, ReuseRationale, Understanding } from "../../types";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TeamList } from "./TeamList";

export interface SuggestedReuse {
  projectId: string;
  description: string;
  similarity: number;
  rationale?: ReuseRationale | null;
}

export interface PlanShape {
  publicId: string;
  understanding: Understanding;
  decision: Decision;
  allocation: Allocation;
  reuseScore: number;
  suggestedReuse?: SuggestedReuse[];
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
        {readOnly ? (
          <TeamList team={plan.allocation.team} compact />
        ) : (
          <TeamEditor
            team={plan.allocation.team}
            onChange={(team) => onChange?.({ ...plan, allocation: { ...plan.allocation, team } })}
          />
        )}
        <div className="rounded-lg border border-hairline bg-canvas p-4">
          <div className="text-xs text-fg-muted">Estimated cost</div>
          <div className="mt-1 text-3xl font-semibold text-fg-strong">${cost.toLocaleString()}</div>
          <div className="mt-1 text-xs text-fg-muted">${Math.round(plan.allocation.total_daily_cost).toLocaleString()} / day × {plan.decision.estimated_time_days} days</div>
        </div>
        {plan.suggestedReuse && plan.suggestedReuse.length > 0 && (
          <ReuseComparison suggestions={plan.suggestedReuse} readOnly={readOnly} />
        )}
      </CardContent>
    </Card>
  );
}

function ReuseComparison({ suggestions, readOnly }: { suggestions: SuggestedReuse[]; readOnly: boolean }) {
  const [decisions, setDecisions] = useState<Record<string, "accept" | "fresh">>({});

  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-fg-muted uppercase tracking-wide">Reuse Suggestions</div>
      {suggestions.map((s) => (
        <div key={s.projectId} className="rounded-lg border border-hairline p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono text-xs text-fg-muted">{s.projectId}</span>
              <span className="ml-2 text-xs text-fg-muted">
                {Math.round(s.similarity * 100)}% match
              </span>
            </div>
            {decisions[s.projectId] && (
              <Badge variant={decisions[s.projectId] === "accept" ? "default" : "secondary"}>
                {decisions[s.projectId] === "accept" ? "Accepted" : "Build fresh"}
              </Badge>
            )}
          </div>
          <p className="text-sm text-fg">{s.description}</p>

          {s.rationale && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded bg-green-50 p-3 dark:bg-green-950/30">
                <div className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">
                  Why reusable
                </div>
                <ul className="text-xs text-green-800 dark:text-green-300 space-y-0.5">
                  {s.rationale.why_reusable.map((r, i) => (
                    <li key={i}>+ {r}</li>
                  ))}
                </ul>
                {s.rationale.components_kept.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.rationale.components_kept.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] bg-green-100 dark:bg-green-900/40">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded bg-amber-50 p-3 dark:bg-amber-950/30">
                <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">
                  Why NOT reusable
                </div>
                <ul className="text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                  {s.rationale.why_not_reusable.map((r, i) => (
                    <li key={i}>- {r}</li>
                  ))}
                </ul>
                {s.rationale.components_replaced.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.rationale.components_replaced.map((c) => (
                      <Badge key={c} variant="outline" className="text-[10px] bg-amber-100 dark:bg-amber-900/40">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {s.rationale?.estimated_savings_days && (
            <div className="text-xs text-fg-muted">
              Estimated savings: <span className="font-medium text-fg">{s.rationale.estimated_savings_days} days</span>
            </div>
          )}

          {!readOnly && !decisions[s.projectId] && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => setDecisions((p) => ({ ...p, [s.projectId]: "accept" }))}
              >
                Accept reuse
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setDecisions((p) => ({ ...p, [s.projectId]: "fresh" }))}
              >
                Build fresh
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function splitTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

type TeamEntry = Allocation["team"][number];

function TeamEditor({ team, onChange }: { team: TeamEntry[]; onChange: (team: TeamEntry[]) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"member" | "trainer" | "learner">("member");

  const remove = (target: string) => onChange(team.filter((m) => m.name !== target));

  const add = (entry: Partial<TeamEntry> & { name: string; kind: string }) => {
    if (team.some((m) => m.name.toLowerCase() === entry.name.toLowerCase())) return;
    onChange([
      ...team,
      {
        resource_type: entry.resource_type || (entry.kind === "learner" ? "ai_learner" : entry.kind === "trainer" ? "trainer" : "backend_engineer"),
        name: entry.name,
        title: entry.title || (entry.kind === "trainer" ? "Trainer" : entry.kind === "learner" ? "AI Learner" : "Team Member"),
        seniority: entry.kind === "learner" ? "learner" : entry.kind === "trainer" ? "trainer" : "senior",
        allocation_percentage: entry.allocation_percentage ?? 1,
        skills: entry.skills || [],
        cost_per_day: entry.cost_per_day ?? 0,
        kind: entry.kind,
      } as TeamEntry,
    ]);
  };

  return (
    <div className="rounded-lg border border-hairline bg-surface-1 p-3" data-testid="team-editor">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-fg-muted">Team ({team.length})</div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="secondary" onClick={() => add({ name: `Trainer ${team.filter((m) => m.kind === "trainer").length + 1}`, kind: "trainer" })}>
            + Trainer
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => add({ name: `AI Learner ${team.filter((m) => m.kind === "learner").length + 1}`, kind: "learner" })}>
            + AI Learner
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {team.map((m) => (
          <div key={`${m.name}-${m.resource_type}`} className="flex items-center justify-between gap-2 rounded-md border border-hairline bg-surface-2 px-3 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-fg-strong">{m.name}</span>
                {m.kind && m.kind !== "member" && (
                  <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase text-accent">{m.kind}</span>
                )}
              </div>
              <div className="truncate text-xs text-fg-muted">{m.title || m.resource_type.replace(/_/g, " ")}</div>
            </div>
            <button
              type="button"
              aria-label={`Remove ${m.name}`}
              onClick={() => remove(m.name)}
              className="shrink-0 rounded-md border border-hairline px-2 py-1 text-xs text-fg-muted hover:border-danger hover:text-danger"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Input className="h-8 flex-1 bg-surface-1" placeholder="Add by name…" value={name} onChange={(e) => setName(e.target.value)} />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "member" | "trainer" | "learner")}
          className="h-8 rounded-md border border-hairline bg-surface-1 px-2 text-sm"
        >
          <option value="member">Member</option>
          <option value="trainer">Trainer</option>
          <option value="learner">AI Learner</option>
        </select>
        <Button
          type="button"
          size="sm"
          disabled={!name.trim()}
          onClick={() => {
            add({ name: name.trim(), kind });
            setName("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

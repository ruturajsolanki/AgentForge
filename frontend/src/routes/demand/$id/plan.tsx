import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  DollarSign,
  FileText,
  Loader2,
  RefreshCw,
  Rocket,
  SendHorizontal,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionItem } from "../../../components/ui/accordion";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/card";
import { Progress } from "../../../components/ui/progress";
import { Textarea } from "../../../components/ui/textarea";
import { DemandWorkspace } from "../../../components/demand/DemandWorkspace";
import { StageChip } from "../../../components/demand/StageChip";
import { TeamList } from "../../../components/demand/TeamList";
import { cn } from "../../../lib/cn";
import { forgeApi } from "../../../services/forgeApi";
import type { Demand, DemandStage } from "../../../types";
import type { PlanShape } from "../../../components/demand/PlanCard";

type ChatTurn = { role: "user" | "assistant"; content: string };

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
        <PlanBrief publicId={id} demand={demand} plan={plan} error={error} refresh={refresh} />
      )}
    </DemandWorkspace>
  );
}

function PlanBrief({
  publicId,
  demand,
  plan,
  error,
  refresh,
}: {
  publicId: string;
  demand: Demand | null;
  plan: PlanShape | null;
  error: string | null;
  refresh: () => void;
}) {
  const [approving, setApproving] = useState(false);

  const approve = async () => {
    setApproving(true);
    try {
      await forgeApi.approveDemand(publicId);
      toast.success("Demand launched");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not launch demand");
    } finally {
      setApproving(false);
    }
  };

  if (!demand && !plan) {
    return (
      <div className="p-4 sm:p-6">
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
      </div>
    );
  }

  return (
    <div className="grid gap-5 p-4 sm:p-6 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <main className="min-w-0 space-y-5">
        <DecisionHeader
          publicId={publicId}
          demand={demand}
          plan={plan}
          approving={approving}
          onApprove={approve}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <OriginalDemandCard text={demand?.raw_text || plan?.understanding.summary || ""} publicId={publicId} />
          <ExecutiveSnapshot demand={demand} plan={plan} />
        </div>

        {plan ? (
          <>
            <DecisionSummary plan={plan} />
            <div className="grid gap-5 xl:grid-cols-2">
              <ScopeAndSkills plan={plan} />
              <RiskPanel plan={plan} />
            </div>
            <TeamPanel plan={plan} />
          </>
        ) : (
          <PlanUnavailable error={error} refresh={refresh} />
        )}

        <div className="grid gap-5 xl:grid-cols-2">
          <StageProgress current={demand?.stage || "ingested"} />
          <ReuseCandidates demand={demand} />
        </div>
      </main>

      <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-20 2xl:self-start">
        <PlanCopilot publicId={publicId} demand={demand} plan={plan} />
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Button asChild variant="secondary">
              <Link to={`/demand/${publicId}/agents`}>
                Open agent canvas
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to={`/demand/${publicId}/files`}>
                Open IDE
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function DecisionHeader({
  publicId,
  demand,
  plan,
  approving,
  onApprove,
}: {
  publicId: string;
  demand: Demand | null;
  plan: PlanShape | null;
  approving: boolean;
  onApprove: () => void;
}) {
  const canApprove = demand?.stage === "awaiting_approval" || demand?.stage === "failed";
  const confidence = plan ? normalizePercent(plan.decision.confidence_score) : null;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-muted">{publicId}</span>
            {demand?.stage && <StageChip stage={demand.stage} />}
            {plan?.understanding.urgency && <Badge className={urgencyClass(plan.understanding.urgency)}>{plan.understanding.urgency} priority</Badge>}
            {confidence !== null && <Badge>{confidence}% confidence</Badge>}
          </div>
          <h2 className="mt-2 max-w-4xl truncate text-2xl font-semibold text-fg-strong">
            {plan?.understanding.summary || demand?.raw_text || "Demand plan"}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/demands">Back to demands</Link>
          </Button>
          {canApprove && (
            <Button variant="primary" disabled={approving} onClick={() => void onApprove()}>
              {approving ? <Loader2 className="animate-spin" /> : <Rocket />}
              Approve and launch
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OriginalDemandCard({ text, publicId }: { text: string; publicId: string }) {
  return (
    <Card className="border-accent/35">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-accent">
              <FileText className="h-3.5 w-3.5" />
              Original demand
            </div>
            <CardTitle className="mt-2">Client request</CardTitle>
          </div>
          <Badge>{publicId}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] overflow-auto rounded-lg border border-hairline bg-canvas p-5">
          <p className="whitespace-pre-wrap text-base leading-7 text-fg-strong">{text || "No demand text available."}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutiveSnapshot({ demand, plan }: { demand: Demand | null; plan: PlanShape | null }) {
  const cost = plan ? Math.round(plan.decision.estimated_cost_usd || plan.allocation.total_daily_cost * plan.decision.estimated_time_days) : null;
  const coverage = plan ? normalizePercent(plan.allocation.coverage_score || 0) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision snapshot</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SnapshotMetric icon={Workflow} label="Recommendation" value={plan ? `${formatLabel(plan.decision.project_type)} · ${formatLabel(plan.decision.execution_mode)}` : "Pending"} />
        <SnapshotMetric icon={DollarSign} label="Estimate" value={cost ? `$${cost.toLocaleString()}` : "Pending"} />
        <SnapshotMetric icon={Clock3} label="Timeline" value={plan ? `${plan.decision.estimated_time_days} days` : "Pending"} />
        <SnapshotMetric icon={UsersRound} label="Team" value={plan ? `${plan.allocation.team.length} resources` : "Pending"} />
        <div className="rounded-lg border border-hairline bg-surface-2 p-3">
          <div className="text-xs text-fg-muted">Coverage</div>
          <div className="mt-2 flex items-center gap-3">
            <Progress value={coverage || 0} className="flex-1" />
            <span className="font-mono text-sm text-fg-strong">{coverage ?? 0}%</span>
          </div>
        </div>
        {demand?.created_at && <SnapshotMetric icon={FileText} label="Created" value={formatDate(demand.created_at)} />}
      </CardContent>
    </Card>
  );
}

function DecisionSummary({ plan }: { plan: PlanShape }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>AI decision brief</CardTitle>
          <Badge>{formatLabel(plan.understanding.problem_type)} · {formatLabel(plan.understanding.domain)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-fg-muted">
              <Sparkles className="h-3.5 w-3.5" />
              Summary
            </div>
            <p className="mt-2 text-sm leading-6 text-fg">{plan.understanding.summary}</p>
          </div>
          <div>
            <div className="text-xs font-medium uppercase text-fg-muted">Why this route</div>
            <p className="mt-2 text-sm leading-6 text-fg-muted">{plan.decision.reasoning}</p>
          </div>
        </div>
        <div className="grid content-start gap-3">
          <SnapshotMetric icon={Clock3} label="Scope estimate" value={`${plan.understanding.estimated_scope_days} scope days`} />
          <SnapshotMetric icon={Bot} label="Execution mode" value={formatLabel(plan.decision.execution_mode)} />
          <SnapshotMetric icon={CheckCircle2} label="Reuse score" value={`${normalizePercent(plan.reuseScore)}%`} />
        </div>
      </CardContent>
    </Card>
  );
}

function ScopeAndSkills({ plan }: { plan: PlanShape }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Scope and skills</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs font-medium uppercase text-fg-muted">Key features</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.understanding.key_features.map((feature) => <Badge key={feature}>{formatLabel(feature)}</Badge>)}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase text-fg-muted">Required skills</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {plan.understanding.required_skills.map((skill) => <Badge key={skill}>{formatLabel(skill)}</Badge>)}
          </div>
        </div>
        {plan.allocation.uncovered_skills?.length ? (
          <div className="rounded-lg border border-warn/35 bg-surface-2 p-3">
            <div className="text-xs text-fg-muted">Uncovered skills</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {plan.allocation.uncovered_skills.map((skill) => <Badge key={skill}>{formatLabel(skill)}</Badge>)}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RiskPanel({ plan }: { plan: PlanShape }) {
  const risks = plan.decision.risk_factors;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Risks and approval checks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {risks.length ? risks.map((risk) => (
          <div key={risk} className="flex gap-3 rounded-lg border border-hairline bg-surface-2 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <p className="text-sm leading-5 text-fg">{formatLabel(risk)}</p>
          </div>
        )) : (
          <div className="flex gap-3 rounded-lg border border-success/30 bg-surface-2 p-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <p className="text-sm leading-5 text-fg">No major risks detected in the current plan.</p>
          </div>
        )}
        <div className="rounded-lg border border-hairline bg-canvas p-3 text-sm leading-5 text-fg-muted">
          Confirm acceptance criteria, source data, timeline, owner availability, and production constraints before launching agents.
        </div>
      </CardContent>
    </Card>
  );
}

function TeamPanel({ plan }: { plan: PlanShape }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Suggested delivery team</CardTitle>
          <Badge>{plan.allocation.team.length} resources</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm leading-6 text-fg-muted">{plan.allocation.allocation_reasoning}</p>
        <TeamList team={plan.allocation.team} />
      </CardContent>
    </Card>
  );
}

function StageProgress({ current }: { current: DemandStage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stage progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {stages.map((stage) => {
            const active = stage === current;
            return (
              <li key={stage} className="flex items-center gap-3">
                <span className={active ? "h-3 w-3 rounded-full border border-accent bg-accent animate-pulse" : "h-3 w-3 rounded-full border border-hairline bg-surface-2"} />
                <span className={active ? "text-sm font-medium capitalize text-fg-strong" : "text-sm capitalize text-fg-muted"}>
                  {formatLabel(stage)}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function ReuseCandidates({ demand }: { demand: Demand | null }) {
  const matches = demand?.similar_projects?.matches || [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reuse candidates</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion>
          {matches.length ? (
            matches.map((match) => (
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
                  {match.reuse_components.map((component) => <Badge key={component}>{formatLabel(component)}</Badge>)}
                </div>
              </AccordionItem>
            ))
          ) : (
            <p className="text-sm text-fg-muted">No high-confidence reuse candidates yet.</p>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}

function PlanCopilot({ publicId, demand, plan }: { publicId: string; demand: Demand | null; plan: PlanShape | null }) {
  const [messages, setMessages] = useState<ChatTurn[]>([
    {
      role: "assistant",
      content: "Ask me about scope, risks, staffing, timeline, approval readiness, or what to clarify with the client.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const ask = async (message = input) => {
    const text = message.trim();
    if (!text) return;
    const history = messages.filter((item) => item.role === "user" || item.role === "assistant");
    setMessages((current) => [...current, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const result = await forgeApi.managerChat(publicId, { message: text, history });
      setMessages((current) => [...current, { role: "assistant", content: result.response }]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: err instanceof Error ? `I could not reach the copilot service: ${err.message}` : "I could not reach the copilot service.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const suggestions = [
    "What should I validate before approval?",
    "What are the biggest delivery risks?",
    "Is the suggested team enough?",
  ];

  return (
    <Card className="border-accent/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Plan copilot</CardTitle>
          <Badge>AI</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={cn(
                "rounded-lg border p-3",
                message.role === "user" ? "border-accent/30 bg-accent-soft text-fg-strong" : "border-hairline bg-surface-2 text-fg",
              )}
            >
              <div className="mb-1 text-[11px] font-medium uppercase text-fg-muted">
                {message.role === "user" ? "Manager" : "Copilot"}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-left text-xs text-fg-muted transition hover:border-hairline-hi hover:text-fg-strong"
              disabled={sending}
              onClick={() => void ask(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={plan || demand ? "Ask about this plan..." : "Plan context unavailable"}
          className="min-h-24 resize-none"
          disabled={sending}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void ask();
          }}
        />
        <Button variant="primary" className="w-full" disabled={!input.trim() || sending} onClick={() => void ask()}>
          {sending ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
          Ask copilot
        </Button>
      </CardContent>
    </Card>
  );
}

function PlanUnavailable({ error, refresh }: { error: string | null; refresh: () => void }) {
  return (
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
  );
}

function SnapshotMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-3">
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 break-words text-sm font-medium capitalize text-fg-strong">{value}</div>
    </div>
  );
}

function normalizePercent(value: number) {
  return Math.round(value > 1 ? value : value * 100);
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function urgencyClass(urgency: string) {
  if (urgency === "high") return "border-danger/30 bg-danger/10 text-danger";
  if (urgency === "low") return "border-hairline bg-surface-2 text-fg-muted";
  return "border-accent/30 bg-accent-soft text-accent";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

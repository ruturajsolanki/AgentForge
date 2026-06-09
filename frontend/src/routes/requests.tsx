import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  Rocket,
  Search,
  SendHorizontal,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { TeamList } from "../components/demand/TeamList";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { cn } from "../lib/cn";
import { useSession } from "../hooks/useSession";
import { forgeApi } from "../services/forgeApi";
import type { PortalMessage, PortalRequest } from "../types";

type BusyState = "approve" | "clarify" | "agent" | null;
type RequestFilter = "all" | "review" | "clarification" | "launched";

const requestFilters: Array<{ id: RequestFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "review", label: "Needs review" },
  { id: "clarification", label: "Clarification" },
  { id: "launched", label: "Launched" },
];

export default function RequestsRoute() {
  const session = useSession();
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RequestFilter>("all");
  const [selectedId, setSelectedId] = useState("");
  const [clarification, setClarification] = useState("");
  const [agentQuestion, setAgentQuestion] = useState("");
  const [busy, setBusy] = useState<BusyState>(null);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const rows = await forgeApi.portalListRequests();
      setRequests(rows);
      setSelectedId((current) => current && rows.some((request) => request.id === current) ? current : rows[0]?.id || "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load client requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((request) => {
      const matchesFilter = filter === "all" || requestMatchesFilter(request, filter);
      const matchesQuery = !q || [
        request.publicId,
        request.client.name,
        request.client.company,
        request.client.email,
        request.description,
        request.plan.understanding?.summary || "",
        request.status,
        request.industry,
        request.priority,
      ].join(" ").toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query, requests]);

  const selected = visible.find((request) => request.id === selectedId) || visible[0] || null;
  const stats = useMemo(() => ({
    review: requests.filter((request) => requestMatchesFilter(request, "review")).length,
    clarification: requests.filter((request) => requestMatchesFilter(request, "clarification")).length,
    launched: requests.filter((request) => requestMatchesFilter(request, "launched")).length,
    total: requests.length,
  }), [requests]);

  const upsertRequest = (next: PortalRequest) => {
    setRequests((current) => current.map((request) => request.id === next.id ? next : request));
    setSelectedId(next.id);
  };

  const approveAndLaunch = async () => {
    if (!selected) return;
    setBusy("approve");
    try {
      await forgeApi.approveDemand(selected.publicId);
      const updated = await forgeApi.portalPatchRequest(selected.id, { status: "launched" });
      upsertRequest(updated);
      toast.success("Demand launched");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not launch demand");
    } finally {
      setBusy(null);
    }
  };

  const sendClarification = async () => {
    if (!selected || !clarification.trim() || !session) return;
    setBusy("clarify");
    try {
      const updated = await forgeApi.portalAddMessage(selected.id, {
        author: session.name,
        role: "manager",
        status: "needs_clarification",
        body: clarification.trim(),
      });
      upsertRequest(updated);
      setClarification("");
      toast.success("Clarification added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send clarification");
    } finally {
      setBusy(null);
    }
  };

  const askAgent = async (questionOverride?: string) => {
    const question = (questionOverride || agentQuestion).trim();
    if (!selected || !question || !session) return;
    setBusy("agent");
    try {
      const result = await forgeApi.portalAgentChat(selected.id, {
        author: session.name,
        message: question,
      });
      upsertRequest(result.request);
      setAgentQuestion("");
      toast.success("Copilot response added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not ask copilot");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase text-fg-muted">Manager workspace</p>
          <h1 className="mt-2 text-2xl font-semibold text-fg-strong">Client requests</h1>
          <p className="mt-2 max-w-2xl text-sm leading-5 text-fg-muted">
            Review client intake, clarify gaps, ask AI about the plan, and launch approved demand work.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <QueueStat label="Review" value={stats.review} />
          <QueueStat label="Clarify" value={stats.clarification} />
          <QueueStat label="Launched" value={stats.launched} />
          <QueueStat label="Total" value={stats.total} />
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-fg-muted" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, company, demand, domain, status" />
          </div>
          <div className="flex flex-wrap gap-2">
            {requestFilters.map((item) => (
              <Button key={item.id} size="sm" variant={filter === item.id ? "primary" : "secondary"} onClick={() => setFilter(item.id)}>
                {item.label}
              </Button>
            ))}
          </div>
          <Button variant="secondary" onClick={() => void loadRequests()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : <Inbox />}
            Refresh
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="grid min-h-[520px] place-items-center rounded-lg border border-hairline bg-surface-1">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyRequests />
      ) : selected ? (
        <div className="grid gap-5 2xl:grid-cols-[330px_minmax(0,1fr)_370px]">
          <RequestQueue
            requests={visible}
            selectedId={selected.id}
            onSelect={(id) => setSelectedId(id)}
          />
          <RequestWorkspace request={selected} />
          <ActionPanel
            request={selected}
            clarification={clarification}
            setClarification={setClarification}
            agentQuestion={agentQuestion}
            setAgentQuestion={setAgentQuestion}
            busy={busy}
            onApprove={approveAndLaunch}
            onClarify={sendClarification}
            onAskAgent={askAgent}
          />
        </div>
      ) : null}
    </div>
  );
}

function RequestQueue({
  requests,
  selectedId,
  onSelect,
}: {
  requests: PortalRequest[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="min-w-0 2xl:sticky 2xl:top-20 2xl:self-start">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Queue</CardTitle>
            <Badge>{requests.length} shown</Badge>
          </div>
        </CardHeader>
        <CardContent className="max-h-[calc(100vh-220px)] space-y-2 overflow-auto pr-2">
          {requests.map((request) => (
            <RequestRow
              key={request.id}
              request={request}
              selected={selectedId === request.id}
              onSelect={() => onSelect(request.id)}
            />
          ))}
        </CardContent>
      </Card>
    </aside>
  );
}

function RequestWorkspace({ request }: { request: PortalRequest }) {
  const decision = request.plan.decision;
  const allocation = request.plan.allocation;
  const estimatedCost = decision && allocation
    ? Math.round(decision.estimated_cost_usd || allocation.total_daily_cost * decision.estimated_time_days)
    : 0;

  return (
    <main className="min-w-0 space-y-5">
      <RequestHeader request={request} />
      <AttentionPanel request={request} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ClientDemandBlock request={request} />
        <DecisionSnapshot request={request} estimatedCost={estimatedCost} />
      </div>
      <AiInterpretation request={request} estimatedCost={estimatedCost} />
      <SuggestedTeam request={request} />
    </main>
  );
}

function RequestHeader({ request }: { request: PortalRequest }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusClass(request.status)}>{formatLabel(request.status)}</Badge>
            <span className="font-mono text-xs text-fg-muted">{request.publicId}</span>
          </div>
          <h2 className="mt-2 truncate text-xl font-semibold text-fg-strong">{request.client.company}</h2>
          <p className="mt-1 text-sm text-fg-muted">{request.client.name} · {request.client.email} · {formatDate(request.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to={`/demand/${request.publicId}/plan`}>
              Open plan
              <ExternalLink />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/demands">
              Demand board
              <ExternalLink />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AttentionPanel({ request }: { request: PortalRequest }) {
  const signals = reviewSignals(request);
  const ready = signals.length === 1 && signals[0].tone === "success";
  return (
    <div className={cn(
      "rounded-lg border p-4",
      ready ? "border-success/30 bg-success/10" : "border-warn/30 bg-surface-1",
    )}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-fg-strong">
            {ready ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertTriangle className="h-4 w-4 text-warn" />}
            Manager attention
          </div>
          <p className="mt-1 text-sm text-fg-muted">
            {ready ? "The request looks launch-ready. Review the client text once before approval." : "Resolve these points before launching the work."}
          </p>
        </div>
        <Badge>{signals.length} signal{signals.length === 1 ? "" : "s"}</Badge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {signals.map((signal) => (
          <div key={signal.label} className="rounded-lg border border-hairline bg-surface-2 p-3">
            <div className="text-sm font-medium text-fg-strong">{signal.label}</div>
            <p className="mt-1 text-xs leading-5 text-fg-muted">{signal.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientDemandBlock({ request }: { request: PortalRequest }) {
  return (
    <Card className="border-accent/35 bg-surface-1">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase text-accent">Original client demand</p>
            <CardTitle className="mt-2">What the client actually asked for</CardTitle>
          </div>
          <Badge>{request.description.length.toLocaleString()} chars</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[460px] overflow-auto rounded-lg border border-hairline bg-canvas p-5">
          <p className="whitespace-pre-wrap text-base leading-7 text-fg-strong">{request.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionSnapshot({ request, estimatedCost }: { request: PortalRequest; estimatedCost: number }) {
  const decision = request.plan.decision;
  const allocation = request.plan.allocation;
  const understanding = request.plan.understanding;
  const confidence = decision ? Math.round(decision.confidence_score * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Decision snapshot</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SnapshotMetric icon={Workflow} label="Route" value={decision ? `${formatLabel(decision.project_type)} · ${formatLabel(decision.execution_mode)}` : "Pending"} />
        <SnapshotMetric icon={Sparkles} label="Domain" value={understanding?.domain || request.industry || "Unknown"} />
        <SnapshotMetric icon={Clock3} label="Timeline" value={decision ? `${decision.estimated_time_days} days` : request.timeline} />
        <SnapshotMetric icon={FileText} label="Estimate" value={estimatedCost ? `$${estimatedCost.toLocaleString()}` : request.budgetRange} />
        <SnapshotMetric icon={UsersRound} label="Team" value={`${allocation?.team?.length || 0} resources`} />
        <SnapshotMetric icon={CheckCircle2} label="Confidence" value={confidence ? `${confidence}%` : "Pending"} />
      </CardContent>
    </Card>
  );
}

function AiInterpretation({ request, estimatedCost }: { request: PortalRequest; estimatedCost: number }) {
  const understanding = request.plan.understanding;
  const decision = request.plan.decision;
  const allocation = request.plan.allocation;
  const risks = decision?.risk_factors || [];
  const skills = understanding?.required_skills || [];
  const uncovered = allocation?.uncovered_skills || [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>AI interpretation</CardTitle>
          {decision && (
            <Badge>{formatLabel(decision.project_type)} · {formatLabel(decision.execution_mode)}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase text-fg-muted">
              <Sparkles className="h-3.5 w-3.5" />
              Structured brief
            </div>
            <p className="mt-2 text-sm leading-6 text-fg">{understanding?.summary || "No AI brief is available yet."}</p>
          </div>

          {decision && (
            <div>
              <div className="text-xs font-medium uppercase text-fg-muted">Recommendation</div>
              <p className="mt-2 text-sm leading-6 text-fg-muted">{decision.reasoning}</p>
            </div>
          )}

          <div>
            <div className="text-xs font-medium uppercase text-fg-muted">Required skills</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {skills.length ? skills.map((skill) => <Badge key={skill}>{formatLabel(skill)}</Badge>) : <span className="text-sm text-fg-muted">No skills classified.</span>}
            </div>
          </div>
        </div>

        <div className="grid content-start gap-3">
          <SnapshotMetric icon={FileText} label="Estimated cost" value={estimatedCost ? `$${estimatedCost.toLocaleString()}` : "Not available"} />
          <SnapshotMetric icon={Workflow} label="Reuse score" value={`${Math.round((request.plan.reuseScore || 0) * 100)}%`} />
          <SignalList title="Risks" icon={AlertTriangle} items={risks} empty="No major risks detected." />
          <SignalList title="Uncovered skills" icon={UsersRound} items={uncovered} empty="Coverage looks complete." />
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestedTeam({ request }: { request: PortalRequest }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Suggested delivery team</CardTitle>
          <Badge>{request.plan.allocation?.team?.length || 0} resources</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {request.plan.allocation?.allocation_reasoning && (
          <p className="mb-4 text-sm leading-6 text-fg-muted">{request.plan.allocation.allocation_reasoning}</p>
        )}
        {request.plan.allocation?.team?.length ? (
          <TeamList team={request.plan.allocation.team} compact />
        ) : (
          <p className="text-sm text-fg-muted">No allocation was generated for this request.</p>
        )}
      </CardContent>
    </Card>
  );
}

function ActionPanel({
  request,
  clarification,
  setClarification,
  agentQuestion,
  setAgentQuestion,
  busy,
  onApprove,
  onClarify,
  onAskAgent,
}: {
  request: PortalRequest;
  clarification: string;
  setClarification: (value: string) => void;
  agentQuestion: string;
  setAgentQuestion: (value: string) => void;
  busy: BusyState;
  onApprove: () => void;
  onClarify: () => void;
  onAskAgent: (questionOverride?: string) => void;
}) {
  const launched = requestMatchesFilter(request, "launched");
  const prompts = [
    "Is this request launch-ready?",
    "What is missing from the client?",
    "What should I clarify before approval?",
  ];

  return (
    <aside className="min-w-0 space-y-5 2xl:sticky 2xl:top-20 2xl:self-start">
      <Card className="border-accent/30">
        <CardHeader>
          <CardTitle>Manager actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="primary" className="w-full" disabled={launched || busy !== null} onClick={onApprove}>
            {busy === "approve" ? <Loader2 className="animate-spin" /> : launched ? <CheckCircle2 /> : <Rocket />}
            {launched ? "Already launched" : "Approve and launch"}
          </Button>

          <div className="rounded-lg border border-hairline bg-surface-2 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-fg-strong">
              <MessageSquare className="h-4 w-4 text-accent" />
              Ask for clarification
            </div>
            <Textarea
              value={clarification}
              onChange={(event) => setClarification(event.target.value)}
              placeholder="Write what the client or team must clarify before launch"
              className="mt-3 min-h-24 resize-none"
              disabled={busy !== null}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void onClarify();
              }}
            />
            <Button className="mt-3 w-full" variant="secondary" disabled={!clarification.trim() || busy !== null} onClick={() => void onClarify()}>
              {busy === "clarify" ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
              Send clarification
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>AI copilot</CardTitle>
            <Badge>AI</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className="rounded-lg border border-hairline bg-surface-2 px-3 py-1.5 text-left text-xs text-fg-muted transition hover:border-hairline-hi hover:text-fg-strong"
                disabled={busy !== null}
                onClick={() => void onAskAgent(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <Input
            value={agentQuestion}
            onChange={(event) => setAgentQuestion(event.target.value)}
            placeholder="Ask about scope, staffing, risks"
            disabled={busy !== null}
            onKeyDown={(event) => {
              if (event.key === "Enter") void onAskAgent();
            }}
          />
          <Button variant="secondary" className="w-full" disabled={!agentQuestion.trim() || busy !== null} onClick={() => void onAskAgent()}>
            {busy === "agent" ? <Loader2 className="animate-spin" /> : <Bot />}
            Ask copilot
          </Button>
        </CardContent>
      </Card>

      <ConversationPanel messages={request.messages} />
    </aside>
  );
}

function ConversationPanel({ messages }: { messages: PortalMessage[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Conversation</CardTitle>
          <Badge>{messages.length} messages</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] space-y-3 overflow-auto pr-1">
          {messages.map((message) => (
            <div key={message.id} className={cn("rounded-lg border p-3", message.role === "client" ? "border-accent/30 bg-accent-soft/40" : "border-hairline bg-surface-2")}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-fg-strong">{message.author}</div>
                <Badge>{message.role}</Badge>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-fg">{message.body}</p>
              <div className="mt-2 text-xs text-fg-muted">{formatDate(message.createdAt)}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RequestRow({ request, selected, onSelect }: { request: PortalRequest; selected: boolean; onSelect: () => void }) {
  const decision = request.plan.decision;
  const confidence = decision ? Math.round(decision.confidence_score * 100) : 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-lg border p-4 text-left transition",
        selected ? "border-accent bg-accent-soft" : "border-hairline bg-surface-2 hover:border-hairline-hi hover:bg-surface-3",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg-strong">{request.client.company}</div>
          <div className="mt-1 text-xs text-fg-muted">{request.client.name}</div>
        </div>
        <Badge className={statusClass(request.status)}>{formatLabel(request.status)}</Badge>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-5 text-fg">{request.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <Clock3 className="h-3.5 w-3.5" />
        <span>{formatDate(request.createdAt)}</span>
        <span>·</span>
        <span>{formatLabel(request.priority || "medium")}</span>
        {confidence ? (
          <>
            <span>·</span>
            <span>{confidence}% confidence</span>
          </>
        ) : null}
      </div>
    </button>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-1 px-3 py-2">
      <div className="text-[11px] uppercase text-fg-muted">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-fg-strong">{value}</div>
    </div>
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
      <div className="mt-1 break-words text-sm font-medium capitalize text-fg-strong">{formatLabel(value)}</div>
    </div>
  );
}

function SignalList({
  title,
  icon: Icon,
  items,
  empty,
}: {
  title: string;
  icon: typeof AlertTriangle;
  items: string[];
  empty: string;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface-2 p-3">
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length ? items.map((item) => <Badge key={item}>{formatLabel(item)}</Badge>) : <span className="text-sm text-fg-muted">{empty}</span>}
      </div>
    </div>
  );
}

function EmptyRequests() {
  return (
    <div className="grid min-h-[480px] place-items-center rounded-lg border border-dashed border-hairline bg-surface-1 p-8 text-center">
      <div>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-lg border border-hairline bg-surface-2">
          <Inbox className="h-7 w-7 text-accent" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-fg-strong">No client requests yet</h2>
        <p className="mt-2 text-sm text-fg-muted">Client submissions will appear here after AI classification.</p>
      </div>
    </div>
  );
}

function requestMatchesFilter(request: PortalRequest, filter: Exclude<RequestFilter, "all">) {
  if (filter === "launched") return ["launched", "executing", "completed"].includes(request.status);
  if (filter === "clarification") return request.status === "needs_clarification";
  return !["launched", "executing", "completed", "cancelled"].includes(request.status) && request.status !== "needs_clarification";
}

function reviewSignals(request: PortalRequest) {
  const decision = request.plan.decision;
  const allocation = request.plan.allocation;
  const signals: Array<{ label: string; detail: string; tone: "success" | "warn" | "danger" }> = [];
  if (!decision) {
    signals.push({ label: "Plan missing", detail: "The AI decision has not been generated yet.", tone: "danger" });
  }
  if (decision && decision.confidence_score < 0.7) {
    signals.push({ label: "Low confidence", detail: `AI confidence is ${Math.round(decision.confidence_score * 100)}%. Clarify scope before launch.`, tone: "warn" });
  }
  if (decision?.risk_factors?.length) {
    signals.push({ label: "Delivery risks", detail: decision.risk_factors.slice(0, 2).map(formatLabel).join(", "), tone: "warn" });
  }
  if (allocation?.uncovered_skills?.length) {
    signals.push({ label: "Skill gaps", detail: allocation.uncovered_skills.slice(0, 3).map(formatLabel).join(", "), tone: "warn" });
  }
  if (request.status === "needs_clarification") {
    signals.push({ label: "Clarification open", detail: "A manager clarification has been requested for this intake.", tone: "warn" });
  }
  if (!signals.length) {
    signals.push({ label: "Launch-ready", detail: "Plan, confidence, staffing, and risk checks look acceptable.", tone: "success" });
  }
  return signals;
}

function statusClass(status: string) {
  if (["launched", "executing", "completed"].includes(status)) return "border-success/30 text-success";
  if (["failed", "cancelled"].includes(status)) return "border-danger/30 text-danger";
  if (status === "needs_clarification") return "border-warn/30 text-warn";
  return "border-accent/30 text-accent";
}

function formatLabel(value: string) {
  return value.replace(/_/g, " ");
}

function formatDate(value?: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

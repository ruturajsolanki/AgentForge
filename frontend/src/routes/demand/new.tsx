import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket, SendHorizontal, SkipForward, X } from "lucide-react";
import { toast } from "sonner";
import { Gate } from "../../components/gate/Gate";
import { PlanCard, type PlanShape } from "../../components/demand/PlanCard";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { forgeApi } from "../../services/forgeApi";
import type { ClarificationQuestion, ClarificationAnswer, ConverseResult } from "../../services/forgeApi";
import type { AllocatedResource, Understanding } from "../../types";
import { useSession } from "../../hooks/useSession";

const INDUSTRIES = [
  "Banking",
  "Capital Markets",
  "Consumer Packaged Goods and Distribution",
  "Communications, Media, and Information Services",
  "Education",
  "Energy, Resources, and Utilities",
  "Healthcare",
  "High Tech",
  "Insurance",
  "Life Sciences",
  "Manufacturing",
  "Public Services",
  "Retail",
  "Travel and Logistics",
];

const PRIORITIES = ["low", "medium", "high"] as const;
const TIMELINES = ["2 weeks", "This month", "This quarter", "Flexible"];
const BUDGETS = ["<$25k", "$25k - $75k", "$75k - $150k", ">$150k"];
const STARTERS = [
  "Build an AI demand triage dashboard for sales teams with manager approvals and capacity signals.",
  "Create a customer onboarding portal that summarizes uploaded documents and routes exceptions to humans.",
  "Modernize a portfolio website with case studies, lead capture, analytics, and editable content sections.",
];
const PLACEHOLDERS = [
  "Describe the business problem in plain language...",
  "Example: I need a claims dashboard that flags high risk cases and drafts manager summaries.",
  "Tell ForgeOS what outcome you need, who uses it, and what constraints matter.",
];

type Priority = (typeof PRIORITIES)[number];

export default function NewDemandRoute() {
  const navigate = useNavigate();
  const session = useSession();
  const [searchParams] = useSearchParams();
  const seed = searchParams.get("seed") || "";
  const [step, setStep] = useState(1);
  const [text, setText] = useState(seed);
  const [industry, setIndustry] = useState(INDUSTRIES[0]);
  const [priority, setPriority] = useState<Priority>("medium");
  const [timeline, setTimeline] = useState(TIMELINES[2]);
  const [budgetRange, setBudgetRange] = useState(BUDGETS[1]);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [plan, setPlan] = useState<PlanShape | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<Array<{ role: "assistant" | "user"; content: string; questions?: ClarificationQuestion[] }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [completenessScore, setCompletenessScore] = useState<number>(0);
  const [readyForPlan, setReadyForPlan] = useState(false);
  const [clarifying, setClarifying] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length), 3200);
    return () => window.clearInterval(id);
  }, []);

  const enrichedText = useMemo(
    () => buildDemandText(text, { industry, priority, timeline, budgetRange }),
    [budgetRange, industry, priority, text, timeline],
  );

  const fetchClarifications = async () => {
    if (!text.trim()) return;
    setClarifying(true);
    setError(null);
    try {
      const result = await forgeApi.clarifyDemand(enrichedText);
      const introMsg =
        result.questions.length > 0
          ? `I've analyzed your demand and have ${result.questions.length} question${result.questions.length > 1 ? "s" : ""} to help me build a better plan for you.`
          : "Your demand looks quite detailed! You can proceed to plan generation.";
      setChatMessages([
        { role: "assistant", content: introMsg, questions: result.questions },
      ]);
      setCompletenessScore(result.completeness_score || 0);
      setReadyForPlan(result.questions.length === 0);
      setStep(2);
    } catch {
      const fallbackQuestions = buildFallbackQuestions(enrichedText);
      setChatMessages([{
        role: "assistant",
        content: "Thanks for your demand description! I have a few questions to help produce a better plan.",
        questions: fallbackQuestions,
      }]);
      setReadyForPlan(false);
      setCompletenessScore(0.2);
      setStep(2);
    } finally {
      setClarifying(false);
    }
  };

  const sendChatMessage = async (override?: string) => {
    const msg = (override ?? chatInput).trim();
    if (!msg || sending) return;
    setSending(true);
    const userMsg = { role: "user" as const, content: msg };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    try {
      const history = updatedMessages.map((m) => ({ role: m.role, content: m.content }));
      const result: ConverseResult = await forgeApi.converseDemand(enrichedText, history.slice(0, -1), msg);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.message, questions: result.follow_up_questions },
      ]);
      setCompletenessScore(result.completeness_score);
      setReadyForPlan(result.ready_for_plan);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Thanks for that. Feel free to continue or generate the plan when ready.", questions: [] },
      ]);
    } finally {
      setSending(false);
    }
  };

  const buildClarificationPayload = (): ClarificationAnswer[] => {
    const answers: ClarificationAnswer[] = [];
    let qIdx = 0;
    for (const msg of chatMessages) {
      if (msg.role === "user") {
        const prevAssistant = chatMessages.filter((m) => m.role === "assistant" && (m.questions?.length ?? 0) > 0);
        const lastQ = prevAssistant[prevAssistant.length - 1]?.questions?.[0];
        answers.push({
          question_id: lastQ?.id || `q${qIdx}`,
          question: lastQ?.question || "Follow-up",
          answer: msg.content,
        });
        qIdx++;
      }
    }
    return answers;
  };

  const ensurePlan = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    const answers = buildClarificationPayload();
    try {
      const response = await forgeApi.createDemand(enrichedText, answers);
      const nextPlan: PlanShape = {
        publicId: response.demand_id,
        understanding: response.understanding!,
        decision: response.decision!,
        allocation: response.allocation!,
        reuseScore: response.reuse_score,
      };
      persistLocalPlan(nextPlan, text);
      setPlan(nextPlan);
      setOffline(false);
      setStep(3);
      toast.success("Structured brief generated");
    } catch (err) {
      const nextPlan = buildLocalPlan(text, { industry, priority, timeline, budgetRange });
      persistLocalPlan(nextPlan, text);
      setPlan(nextPlan);
      setOffline(true);
      setStep(3);
      toast.warning("Backend unavailable. Local plan generated for manager review.");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const launch = async () => {
    if (!plan) return;
    setSubmitting(true);
    try {
      persistLocalPlan(plan, text);
      if (!offline && !plan.publicId.startsWith("local-")) {
        await forgeApi.approveDemand(plan.publicId);
      }
      toast.success("Demand launched");
      navigate(`/demand/${plan.publicId}/agents`);
    } catch (err) {
      toast.error("Launch failed");
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const userMsgCount = chatMessages.filter((m) => m.role === "user").length;

  const highRisk = Boolean(plan && (plan.decision.execution_mode === "human_team" || plan.decision.risk_factors.length >= 3));
  const estimate = plan ? Math.round(plan.decision.estimated_cost_usd || plan.allocation.total_daily_cost * plan.decision.estimated_time_days) : 0;
  const agentCount = plan?.allocation.team.filter((resource) => resource.resource_type.includes("agent")).length || 0;
  const cancelPath = "/demands";

  if (!session) return <Navigate to="/login" replace />;
  if (session.role === "client") {
    return <ClientDemandIntake initialText={seed} />;
  }

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <Link to={cancelPath} className="inline-flex items-center gap-2 text-sm text-fg-muted transition hover:text-fg-strong">
          <ArrowLeft className="h-4 w-4" />
          Cancel
        </Link>
        <StepProgress step={step} />
        <Button asChild variant="ghost" size="icon" aria-label="Close wizard">
          <Link to={cancelPath}><X className="h-4 w-4" /></Link>
        </Button>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 pb-10">
        {step === 1 && (
          <section className="mx-auto w-full max-w-4xl pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Step 1</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-fg-strong">What should ForgeOS build?</h1>
            <Textarea
              autoFocus
              className="mt-6 min-h-56 resize-none rounded-xl p-5 text-base leading-7"
              value={text}
              placeholder={PLACEHOLDERS[placeholderIndex]}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void fetchClarifications();
              }}
            />
            <div className="mt-5 grid gap-4">
              <ChipGroup label="Industry" options={INDUSTRIES} value={industry} onChange={setIndustry} />
              <ChipGroup label="Priority" options={[...PRIORITIES]} value={priority} onChange={(value) => setPriority(value as Priority)} />
              <ChipGroup label="Timeline" options={TIMELINES} value={timeline} onChange={setTimeline} />
              <ChipGroup label="Budget" options={BUDGETS} value={budgetRange} onChange={setBudgetRange} />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  className="rounded-full border border-hairline bg-surface-1 px-3 py-1.5 text-left text-xs text-fg-muted transition hover:border-hairline-hi hover:bg-surface-2 hover:text-fg"
                  onClick={() => setText(starter)}
                >
                  {starter}
                </button>
              ))}
            </div>
            <WizardFooter
              left={<Button asChild variant="ghost"><Link to={cancelPath}>Cancel</Link></Button>}
              meta={`${text.length} chars captured`}
              right={(
                <Button variant="primary" disabled={!text.trim() || clarifying} onClick={() => void fetchClarifications()}>
                  {clarifying ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                  Next
                </Button>
              )}
            />
          </section>
        )}

        {step === 2 && (
          <section className="mx-auto w-full max-w-4xl pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Step 2</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-fg-strong">
              Let's refine your demand
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              ForgeOS is having a conversation with you to understand your needs better.
              Answer the questions, and the AI will follow up until it has enough detail.
            </p>

            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-surface-2">
                <div
                  className="h-2 rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.round(completenessScore * 100)}%` }}
                />
              </div>
              <span className="shrink-0 text-xs text-fg-muted">
                {Math.round(completenessScore * 100)}% clarity
              </span>
            </div>

            <div className="mt-5 flex max-h-[420px] flex-col gap-4 overflow-y-auto rounded-xl border border-hairline bg-surface-1 p-4">
              {chatMessages.map((msg, idx) => (
                <div key={idx}>
                  <div
                    className={
                      msg.role === "assistant"
                        ? "flex items-start gap-3"
                        : "flex items-start justify-end gap-3"
                    }
                  >
                    {msg.role === "assistant" && (
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                        AI
                      </span>
                    )}
                    <div
                      className={
                        msg.role === "assistant"
                          ? "max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-3 text-sm text-fg"
                          : "max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-3 text-sm text-accent-fg"
                      }
                    >
                      {msg.content}
                    </div>
                    {msg.role === "user" && (
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fg-strong text-xs font-bold text-canvas">
                        You
                      </span>
                    )}
                  </div>
                  {msg.role === "assistant" && msg.questions && msg.questions.length > 0 && idx === chatMessages.length - 1 && (
                    <div className="ml-10 mt-3 space-y-3">
                      {msg.questions.map((q) => (
                        <div key={q.id} className="rounded-lg border border-hairline bg-canvas px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-fg-strong">{q.question}</p>
                            <Badge>{q.category}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-fg-muted">{q.why}</p>
                          {q.options && q.options.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {q.options.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={sending}
                                  className="rounded-full border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent transition hover:border-accent hover:bg-accent hover:text-accent-fg disabled:opacity-50"
                                  onClick={() => void sendChatMessage(opt)}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === "assistant" && msg.questions && msg.questions.length > 0 && idx < chatMessages.length - 1 && (
                    <div className="ml-10 mt-2 space-y-1.5">
                      {msg.questions.map((q) => (
                        <div key={q.id} className="rounded-lg bg-surface-2/50 px-3 py-1.5 text-xs text-fg-muted">
                          {q.question}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {sending && (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg">
                    AI
                  </span>
                  <div className="rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-3 text-sm text-fg-muted">
                    <Loader2 className="inline h-4 w-4 animate-spin" /> Thinking...
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <Textarea
                className="min-h-[48px] max-h-[96px] flex-1 resize-none text-sm"
                placeholder="Click an option above to answer, or type your own..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChatMessage();
                  }
                }}
              />
              <Button
                variant="secondary"
                className="self-end"
                disabled={!chatInput.trim() || sending}
                onClick={() => void sendChatMessage()}
              >
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>

            {readyForPlan && (
              <div className="mt-3 rounded-lg border border-success/30 bg-success/5 px-4 py-2 text-sm text-fg">
                <Check className="mr-1 inline h-4 w-4 text-success" />
                ForgeOS has enough detail to generate a solid plan.
              </div>
            )}

            <WizardFooter
              left={<Button variant="ghost" onClick={() => setStep(1)}>Back</Button>}
              meta={
                userMsgCount > 0
                  ? `${userMsgCount} response${userMsgCount > 1 ? "s" : ""} provided`
                  : "Answer the questions or skip to generate plan"
              }
              right={
                <div className="flex items-center gap-2">
                  {userMsgCount === 0 && (
                    <Button variant="ghost" onClick={() => void ensurePlan()}>
                      <SkipForward className="h-4 w-4" />
                      Skip
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    disabled={submitting}
                    onClick={() => void ensurePlan()}
                  >
                    {submitting ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                    Generate Plan
                  </Button>
                </div>
              }
            />
          </section>
        )}

        {step === 3 && plan && (
          <section className="grid gap-6 pt-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              {offline && (
                <div className="mb-4 rounded-xl border border-warn/40 bg-surface-1 p-3 text-sm text-fg">
                  Backend planning is unavailable, so this is a local manager planning preview.
                </div>
              )}
              <PlanCard plan={plan} onChange={setPlan} />
            </div>
            <aside className="space-y-3">
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <div className="text-xs text-fg-muted">Route</div>
                    <div className="mt-1 text-lg font-semibold capitalize text-fg-strong">{plan.decision.project_type.replace(/_/g, " ")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-fg-muted">Execution mode</div>
                    <div className="mt-1 text-sm capitalize text-fg">{plan.decision.execution_mode.replace(/_/g, " ")}</div>
                  </div>
                  <div>
                    <div className="text-xs text-fg-muted">Manager review</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge>{plan.allocation.team.length} resources</Badge>
                      <Badge>{Math.round((plan.allocation.coverage_score ?? 0.82) * 100)}% coverage</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <WizardFooter
                vertical
                left={<Button variant="ghost" onClick={() => setStep(2)}>Back</Button>}
                meta="Review and edit before launch"
                right={<Button variant="primary" onClick={() => setStep(4)}>Continue</Button>}
              />
            </aside>
          </section>
        )}

        {step === 4 && plan && (
          <section className="mx-auto w-full max-w-4xl pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Step 4</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-fg-strong">
              Approve and launch
            </h1>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <Metric label="Estimated cost" value={`$${estimate.toLocaleString()}`} />
              <Metric label="Token estimate" value={`${Math.max(12, Math.round(text.length * 3)).toLocaleString()}`} />
              <Metric label="Agents" value={String(agentCount)} />
              <Metric label="ETA" value={`${plan.decision.estimated_time_days}d`} />
            </div>
            <Card className="mt-5">
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-fg-muted">{plan.publicId}</div>
                    <div className="mt-1 text-lg font-semibold text-fg-strong">{plan.understanding.summary}</div>
                  </div>
                  {offline && <Badge>local preview</Badge>}
                </div>
                {error && <p className="rounded-lg border border-danger/40 bg-surface-2 p-3 text-sm text-fg">{error}</p>}
              </CardContent>
            </Card>
            <WizardFooter
              left={<Button variant="ghost" onClick={() => setStep(3)}>Back</Button>}
              meta={highRisk ? "Type confirmation is required for this launch" : "Human approval required"}
              right={(
                <Gate
                  mode={{
                    kind: "modal",
                    title: `Launch ${plan.publicId}?`,
                    cooldownMs: 2000,
                    requireTyped: highRisk ? "launch" : undefined,
                    summary: [
                      `spawn ${agentCount || plan.allocation.team.length} agents and reviewers`,
                      `estimated ${Math.max(12, Math.round(text.length * 3)).toLocaleString()} tokens`,
                      `wall time about ${plan.decision.estimated_time_days} days`,
                      "no production deploy",
                    ],
                  }}
                  onConfirm={launch}
                >
                  {(open) => (
                    <Button variant="primary" disabled={submitting} onClick={open}>
                      {submitting ? <Loader2 className="animate-spin" /> : <Rocket />}
                      Launch
                    </Button>
                  )}
                </Gate>
              )}
            />
          </section>
        )}
      </main>
    </div>
  );
}

function ClientDemandIntake({ initialText }: { initialText: string }) {
  const navigate = useNavigate();
  const session = useSession();
  const [clientStep, setClientStep] = useState<1 | 2>(1);
  const [text, setText] = useState(initialText);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<Array<{ role: "assistant" | "user"; content: string; questions?: ClarificationQuestion[] }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [completeness, setCompleteness] = useState(0);
  const [readyForSubmit, setReadyForSubmit] = useState(false);
  const [sending, setSending] = useState(false);
  const [clarifying, setClarifying] = useState(false);

  if (!session) return <Navigate to="/login" replace />;
  if (session.role !== "client") return <Navigate to="/demands" replace />;

  const startChat = async () => {
    if (!text.trim()) return;
    setClarifying(true);
    try {
      const result = await forgeApi.clarifyDemand(text.trim());
      const intro =
        result.questions.length > 0
          ? `Thanks for describing your project! I have ${result.questions.length} question${result.questions.length > 1 ? "s" : ""} to make sure we build exactly what you need.`
          : "Your description is quite detailed! You can submit it now or add more details.";
      setChatMessages([{ role: "assistant", content: intro, questions: result.questions }]);
      setCompleteness(result.completeness_score || 0);
      setReadyForSubmit(result.questions.length === 0);
      setClientStep(2);
    } catch {
      const fallbackQuestions = buildFallbackQuestions(text.trim());
      setChatMessages([{
        role: "assistant",
        content: `Thanks for sharing your idea! I have a few questions to make sure we understand your requirements properly.`,
        questions: fallbackQuestions,
      }]);
      setReadyForSubmit(false);
      setCompleteness(0.2);
      setClientStep(2);
    } finally {
      setClarifying(false);
    }
  };

  const sendChat = async (override?: string) => {
    const msg = (override ?? chatInput).trim();
    if (!msg || sending) return;
    setSending(true);
    const userMsg = { role: "user" as const, content: msg };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    try {
      const history = updated.map((m) => ({ role: m.role, content: m.content }));
      const result: ConverseResult = await forgeApi.converseDemand(text.trim(), history.slice(0, -1), msg);
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.message, questions: result.follow_up_questions },
      ]);
      setCompleteness(result.completeness_score);
      setReadyForSubmit(result.ready_for_plan);
    } catch {
      const remaining = buildFallbackQuestions(text.trim() + " " + msg);
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: remaining.length > 0
            ? "Thanks for that detail! I have a follow-up to help us refine this further."
            : "Great, I think we have enough detail now. You can submit whenever you're ready!",
          questions: remaining.slice(0, 2),
        },
      ]);
      if (remaining.length === 0) setReadyForSubmit(true);
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    const userAnswers = chatMessages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    const fullDescription = userAnswers
      ? `${text.trim()}\n\n--- Additional Details ---\n${userAnswers}`
      : text.trim();
    setSubmitting(true);
    setError(null);
    try {
      const request = await forgeApi.portalCreateRequest({
        client: {
          role: "client",
          name: session.name,
          email: session.email,
          company: session.company,
        },
        description: fullDescription,
      });
      rememberClientSubmission(request.publicId);
      toast.success("Demand submitted for manager review");
      navigate(`/client?submitted=${encodeURIComponent(request.publicId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit demand");
      toast.error("Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const userMsgCount = chatMessages.filter((m) => m.role === "user").length;

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-5">
        <Link to="/client" className="inline-flex items-center gap-2 text-sm text-fg-muted transition hover:text-fg-strong">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <div className="flex items-center gap-2">
          {["Describe", "Refine & Submit"].map((label, idx) => (
            <div key={label} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-0.5">
                <span className={
                  idx + 1 < clientStep
                    ? "grid h-7 w-7 place-items-center rounded-full border border-success bg-surface-1 text-success"
                    : idx + 1 === clientStep
                      ? "grid h-7 w-7 place-items-center rounded-full border border-accent bg-accent text-accent-fg"
                      : "grid h-7 w-7 place-items-center rounded-full border border-hairline bg-surface-1 text-fg-muted"
                }>
                  {idx + 1 < clientStep ? <Check className="h-3.5 w-3.5" /> : idx + 1}
                </span>
                <span className="text-[10px] text-fg-muted">{label}</span>
              </div>
              {idx === 0 && <span className="h-px w-5 bg-hairline" />}
            </div>
          ))}
        </div>
        <div className="text-xs text-fg-muted">{session.company}</div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-12">
        {clientStep === 1 && (
          <section className="pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Step 1</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.02em] text-fg-strong">
              What outcome do you need ForgeOS to deliver?
            </h1>
            <Textarea
              autoFocus
              className="mt-7 min-h-[280px] resize-none rounded-xl p-6 text-lg leading-8"
              value={text}
              placeholder="Describe the business problem, workflow, users, and outcome you want..."
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void startChat();
              }}
            />
            {error && (
              <div role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
                {error}
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-5">
              <Button asChild variant="ghost"><Link to="/client">Cancel</Link></Button>
              <div className="text-xs text-fg-muted">{text.trim().length} chars captured</div>
              <Button variant="primary" disabled={!text.trim() || clarifying} onClick={() => void startChat()}>
                {clarifying ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                Next
              </Button>
            </div>
          </section>
        )}

        {clientStep === 2 && (
          <section className="pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Step 2</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-fg-strong">
              Let's refine your request
            </h1>
            <p className="mt-2 text-sm text-fg-muted">
              The AI delivery architect has some questions. Answer what you can to help us build the right solution.
            </p>

            <div className="mt-3 flex items-center gap-3">
              <div className="h-2 flex-1 rounded-full bg-surface-2">
                <div className="h-2 rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.round(completeness * 100)}%` }} />
              </div>
              <span className="shrink-0 text-xs text-fg-muted">{Math.round(completeness * 100)}% clarity</span>
            </div>

            <div className="mt-5 flex max-h-[400px] flex-col gap-4 overflow-y-auto rounded-xl border border-hairline bg-surface-1 p-4">
              {chatMessages.map((msg, idx) => (
                <div key={idx}>
                  <div className={msg.role === "assistant" ? "flex items-start gap-3" : "flex items-start justify-end gap-3"}>
                    {msg.role === "assistant" && (
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg">AI</span>
                    )}
                    <div className={
                      msg.role === "assistant"
                        ? "max-w-[85%] rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-3 text-sm text-fg"
                        : "max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-3 text-sm text-accent-fg"
                    }>
                      {msg.content}
                    </div>
                    {msg.role === "user" && (
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fg-strong text-xs font-bold text-canvas">You</span>
                    )}
                  </div>
                  {msg.role === "assistant" && msg.questions && msg.questions.length > 0 && idx === chatMessages.length - 1 && (
                    <div className="ml-10 mt-3 space-y-3">
                      {msg.questions.map((q) => (
                        <div key={q.id} className="rounded-lg border border-hairline bg-canvas px-4 py-3">
                          <p className="text-sm font-medium text-fg-strong">{q.question}</p>
                          <p className="mt-1 text-xs text-fg-muted">{q.why}</p>
                          {q.options && q.options.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-2">
                              {q.options.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={sending}
                                  className="rounded-full border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent transition hover:border-accent hover:bg-accent hover:text-accent-fg disabled:opacity-50"
                                  onClick={() => void sendChat(opt)}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {msg.role === "assistant" && msg.questions && msg.questions.length > 0 && idx < chatMessages.length - 1 && (
                    <div className="ml-10 mt-2 space-y-1.5">
                      {msg.questions.map((q) => (
                        <div key={q.id} className="rounded-lg bg-surface-2/50 px-3 py-1.5 text-xs text-fg-muted">{q.question}</div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg">AI</span>
                  <div className="rounded-2xl rounded-tl-sm bg-surface-2 px-4 py-3 text-sm text-fg-muted">
                    <Loader2 className="inline h-4 w-4 animate-spin" /> Thinking...
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <Textarea
                className="min-h-[48px] max-h-[96px] flex-1 resize-none text-sm"
                placeholder="Click an option above to answer, or type your own..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
              />
              <Button variant="secondary" className="self-end" disabled={!chatInput.trim() || sending} onClick={() => void sendChat()}>
                <SendHorizontal className="h-4 w-4" />
              </Button>
            </div>

            {readyForSubmit && (
              <div className="mt-3 rounded-lg border border-success/30 bg-success/5 px-4 py-2 text-sm text-fg">
                <Check className="mr-1 inline h-4 w-4 text-success" />
                Great — we have enough detail to proceed!
              </div>
            )}

            {error && (
              <div role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{error}</div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-5">
              <Button variant="ghost" onClick={() => setClientStep(1)}>Back</Button>
              <div className="text-xs text-fg-muted">
                {userMsgCount > 0 ? `${userMsgCount} response${userMsgCount > 1 ? "s" : ""} provided` : "Answer questions or submit directly"}
              </div>
              <Button variant="primary" disabled={submitting} onClick={() => void submit()}>
                {submitting ? <Loader2 className="animate-spin" /> : <SendHorizontal />}
                Submit demand
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

const STEP_LABELS = ["Describe", "Clarify", "Review", "Launch"];

function StepProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2" aria-label={`Step ${step} of ${STEP_LABELS.length}`}>
      {STEP_LABELS.map((label, idx) => {
        const num = idx + 1;
        return (
          <div key={num} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-0.5">
              <span
                className={
                  num < step
                    ? "grid h-7 w-7 place-items-center rounded-full border border-success bg-surface-1 text-success"
                    : num === step
                      ? "grid h-7 w-7 place-items-center rounded-full border border-accent bg-accent text-accent-fg"
                      : "grid h-7 w-7 place-items-center rounded-full border border-hairline bg-surface-1 text-fg-muted"
                }
              >
                {num < step ? <Check className="h-3.5 w-3.5" /> : num}
              </span>
              <span className="hidden text-[10px] text-fg-muted sm:block">{label}</span>
            </div>
            {num < STEP_LABELS.length && <span className="h-px w-5 bg-hairline" />}
          </div>
        );
      })}
    </div>
  );
}

function ChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs text-fg-muted">{label}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={
              value === option
                ? "rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-xs font-medium text-fg-strong"
                : "rounded-full border border-hairline bg-surface-1 px-3 py-1.5 text-xs text-fg-muted transition hover:border-hairline-hi hover:bg-surface-2 hover:text-fg"
            }
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function WizardFooter({
  left,
  meta,
  right,
  vertical = false,
}: {
  left: ReactNode;
  meta: string;
  right: ReactNode;
  vertical?: boolean;
}) {
  return (
    <div className={vertical ? "mt-4 grid gap-3" : "mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-5"}>
      <div>{left}</div>
      <div className="text-xs text-fg-muted">{meta}</div>
      <div>{right}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-1 p-4">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-fg-strong">{value}</div>
    </div>
  );
}

function buildFallbackQuestions(demandText: string): ClarificationQuestion[] {
  const t = demandText.toLowerCase();
  const questions: ClarificationQuestion[] = [];

  if (!/(user|role|admin|customer|employee|persona)/.test(t)) {
    questions.push({
      id: "fq1",
      question: "Who will be the primary users of this system? What distinct roles will they have?",
      why: "User roles shape the access control design and the number of screens we build.",
      category: "users",
      options: ["Admin + End Users (2 roles)", "Admin + Manager + End User (3 roles)", "Complex hierarchy with 4+ roles"],
    });
  }
  if (!/(integrat|api|connect|third.party|existing|legacy|system)/.test(t)) {
    questions.push({
      id: "fq2",
      question: "Does this need to integrate with any existing systems, databases, or third-party services?",
      why: "Integration points significantly affect architecture complexity and delivery timeline.",
      category: "integration",
      options: ["No — standalone system", "Yes, 1-2 APIs (e.g. payment, email)", "Yes, multiple systems (ERP, CRM, legacy DB)"],
    });
  }
  if (!/(scale|concurrent|performance|traffic|volume|load|thousand|million)/.test(t)) {
    questions.push({
      id: "fq3",
      question: "What is the expected user volume?",
      why: "Performance needs determine the infrastructure and architecture patterns we choose.",
      category: "performance",
      options: ["Small (under 100 users)", "Medium (100-1,000 concurrent users)", "Large-scale (1,000+ concurrent users)"],
    });
  }
  if (!/(complian|gdpr|hipaa|pci|security|encrypt|audit|regulation)/.test(t)) {
    questions.push({
      id: "fq4",
      question: "Are there any compliance, security, or regulatory requirements?",
      why: "Compliance adds mandatory architectural constraints and testing requirements.",
      category: "compliance",
      options: ["No specific compliance needed", "Standard security (SSL, encryption, auth)", "Industry-regulated (GDPR, HIPAA, PCI-DSS)"],
    });
  }
  if (!/(mobile|responsive|ios|android|tablet|device|app)/.test(t)) {
    questions.push({
      id: "fq5",
      question: "Should this work on mobile devices?",
      why: "Mobile support affects the technology stack and testing scope.",
      category: "ux",
      options: ["Desktop web only", "Responsive web (works on mobile browsers)", "Native mobile app (iOS / Android)"],
    });
  }

  return questions.length > 0 ? questions.slice(0, 4) : [{
    id: "fq1",
    question: "Can you share more specifics about the core workflow or the key problem this should solve?",
    why: "A clearer picture of the workflow helps us design the right solution architecture.",
    category: "scope",
    options: ["Internal tool for employees", "Customer-facing product", "Data processing / automation"],
  }];
}

function buildDemandText(
  text: string,
  context: { industry: string; priority: Priority; timeline: string; budgetRange: string },
) {
  return [
    `Industry: ${context.industry}`,
    `Priority: ${context.priority}`,
    `Timeline: ${context.timeline}`,
    `Budget range: ${context.budgetRange}`,
    `Requirement: ${text}`,
  ].join("\n");
}

function persistLocalPlan(plan: PlanShape, rawText: string) {
  window.localStorage.setItem(`forgeos.localDemand.${plan.publicId}`, JSON.stringify({ plan, rawText, savedAt: new Date().toISOString() }));
}

function rememberClientSubmission(publicId: string) {
  const key = "forgeos.clientSubmissions";
  const current = JSON.parse(window.localStorage.getItem(key) || "[]") as string[];
  window.localStorage.setItem(key, JSON.stringify([publicId, ...current.filter((id) => id !== publicId)].slice(0, 10)));
}

function buildLocalPlan(
  text: string,
  context: { industry: string; priority: Priority; timeline: string; budgetRange: string },
): PlanShape {
  const lower = text.toLowerCase();
  const isAi = /\b(ai|agent|automation|chatbot|llm|analytics)\b/.test(lower);
  const isDashboard = /\b(dashboard|report|analytics|insight|tracking)\b/.test(lower);
  const complexity: Understanding["complexity"] = isAi || isDashboard || text.length > 180 ? "medium" : "low";
  const scopeDays = complexity === "low" ? 8 : 15;
  const team: AllocatedResource[] = [
    {
      resource_type: "automation_agent",
      name: "Forge-PM",
      title: "AI Planning Agent",
      seniority: "agent",
      allocation_percentage: 1,
      skills: ["requirements", "task_planning"],
      cost_per_day: 55,
      match_score: 4.2,
      reason: "Structures the client request for manager review",
    },
    {
      resource_type: "code_generator_agent",
      name: "Forge-FE",
      title: "AI Frontend Agent",
      seniority: "agent",
      allocation_percentage: 1,
      skills: ["react", "typescript", "responsive_ui"],
      cost_per_day: 50,
      match_score: 4,
      reason: "Builds the first UI draft",
    },
    {
      resource_type: "frontend_engineer",
      name: "Sam Rivera",
      title: "React Frontend Engineer",
      seniority: "senior",
      allocation_percentage: 0.6,
      skills: ["react", "typescript", "ux"],
      cost_per_day: 760,
      match_score: 3.7,
      reason: "Reviews and hardens generated work",
    },
    {
      resource_type: "ux_designer",
      name: "Mateo Garcia",
      title: "Product Designer",
      seniority: "senior",
      allocation_percentage: 0.5,
      skills: ["ux", "wireframes", "accessibility"],
      cost_per_day: 700,
      match_score: 3.4,
      reason: "Shapes the information architecture",
    },
    {
      resource_type: "qa_agent",
      name: "Forge-QA",
      title: "AI QA Agent",
      seniority: "agent",
      allocation_percentage: 1,
      skills: ["qa", "review", "regression"],
      cost_per_day: 35,
      match_score: 2.8,
      reason: "Checks gaps before handoff",
    },
  ];
  const totalDailyCost = team.reduce((sum, resource) => sum + resource.cost_per_day * resource.allocation_percentage, 0);

  return {
    publicId: `local-${Date.now()}`,
    reuseScore: 0,
    understanding: {
      problem_type: isDashboard ? "analytics" : "web_app",
      domain: context.industry,
      complexity,
      urgency: context.priority,
      required_skills: ["requirements", "ux", "react", "typescript", isAi ? "llm" : "content_strategy", "qa"],
      key_features: ["client_workflow", "responsive_ui", "content_management", isAi ? "ai_assistance" : "review_workflow"],
      estimated_scope_days: scopeDays,
      summary: `Client needs ${text}. Industry is ${context.industry}. Timeline is ${context.timeline} with budget signal ${context.budgetRange}.`,
    },
    decision: {
      execution_mode: complexity === "low" ? "ai_agent" : "hybrid",
      project_type: scopeDays <= 10 ? "poc" : "project",
      reasoning: "Local intake preview selected an AI-led build with human review because backend planning is unavailable.",
      estimated_cost_usd: Math.round(totalDailyCost * scopeDays),
      estimated_time_days: scopeDays,
      confidence_score: 0.74,
      risk_factors: ["backend unavailable", "manager must validate scope"],
      reuse_percentage: 0,
    },
    allocation: {
      team,
      total_daily_cost: Math.round(totalDailyCost),
      allocation_reasoning: "Suggested a compact blend of AI planning/build agents plus human design and engineering review.",
      bench_size: 50,
      coverage_score: 0.78,
      uncovered_skills: [],
    },
  };
}

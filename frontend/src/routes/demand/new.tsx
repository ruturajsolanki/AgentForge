import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket, X } from "lucide-react";
import { toast } from "sonner";
import { Gate } from "../../components/gate/Gate";
import { PlanCard, type PlanShape } from "../../components/demand/PlanCard";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Textarea } from "../../components/ui/textarea";
import { forgeApi } from "../../services/forgeApi";
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

  useEffect(() => {
    const id = window.setInterval(() => setPlaceholderIndex((current) => (current + 1) % PLACEHOLDERS.length), 3200);
    return () => window.clearInterval(id);
  }, []);

  const enrichedText = useMemo(
    () => buildDemandText(text, { industry, priority, timeline, budgetRange }),
    [budgetRange, industry, priority, text, timeline],
  );

  const ensurePlan = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await forgeApi.createDemand(enrichedText);
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
      if (session?.role === "client") {
        rememberClientSubmission(nextPlan.publicId);
        toast.success("Demand submitted for manager review");
        navigate(`/client?submitted=${encodeURIComponent(nextPlan.publicId)}`);
        return;
      }
      setStep(2);
      toast.success("Structured brief generated");
    } catch (err) {
      const nextPlan = buildLocalPlan(text, { industry, priority, timeline, budgetRange });
      persistLocalPlan(nextPlan, text);
      setPlan(nextPlan);
      setOffline(true);
      if (session?.role === "client") {
        rememberClientSubmission(nextPlan.publicId);
        toast.warning("Backend unavailable. Demand saved locally for manager review.");
        navigate(`/client?submitted=${encodeURIComponent(nextPlan.publicId)}`);
        return;
      }
      setStep(2);
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
      if (session?.role === "client") {
        rememberClientSubmission(plan.publicId);
        toast.success("Demand submitted for manager review");
        navigate(`/client?submitted=${encodeURIComponent(plan.publicId)}`);
        return;
      }
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

  const highRisk = Boolean(plan && (plan.decision.execution_mode === "human_team" || plan.decision.risk_factors.length >= 3));
  const estimate = plan ? Math.round(plan.decision.estimated_cost_usd || plan.allocation.total_daily_cost * plan.decision.estimated_time_days) : 0;
  const agentCount = plan?.allocation.team.filter((resource) => resource.resource_type.includes("agent")).length || 0;
  const cancelPath = session?.role === "client" ? "/client" : "/demands";

  if (!session) return <Navigate to="/login" replace />;

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
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void ensurePlan();
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
                <Button variant="primary" disabled={!text.trim() || submitting} onClick={() => void ensurePlan()}>
                  {submitting ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                  {session.role === "client" ? "Submit" : "Next"}
                </Button>
              )}
            />
          </section>
        )}

        {step === 2 && plan && (
          <section className="grid gap-6 pt-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              {offline && (
                <div className="mb-4 rounded-xl border border-warn/40 bg-surface-1 p-3 text-sm text-fg">
                  Backend planning is unavailable, so this is a local client intake preview.
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
                left={<Button variant="ghost" onClick={() => setStep(1)}>Back</Button>}
                meta="Review and edit before launch"
                right={<Button variant="primary" onClick={() => setStep(3)}>Continue</Button>}
              />
            </aside>
          </section>
        )}

        {step === 3 && plan && (
          <section className="mx-auto w-full max-w-4xl pt-8">
            <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-muted">Step 3</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] text-fg-strong">
              {session.role === "client" ? "Submit for manager review" : "Approve and launch"}
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
              left={<Button variant="ghost" onClick={() => setStep(2)}>Back</Button>}
              meta={session.role === "client" ? "The manager will review team and execution mode" : highRisk ? "Type confirmation is required for this launch" : "Human approval required"}
              right={(
                <Gate
                  mode={{
                    kind: "modal",
                    title: session.role === "client" ? `Submit ${plan.publicId}?` : `Launch ${plan.publicId}?`,
                    cooldownMs: 2000,
                    requireTyped: session.role === "client" ? undefined : highRisk ? "launch" : undefined,
                    summary: [
                      session.role === "client" ? "send structured brief to manager queue" : `spawn ${agentCount || plan.allocation.team.length} agents and reviewers`,
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
                      {session.role === "client" ? "Submit" : "Launch"}
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

function StepProgress({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-3" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((item) => (
        <div key={item} className="flex items-center gap-3">
          <span
            className={
              item < step
                ? "grid h-8 w-8 place-items-center rounded-full border border-success bg-surface-1 text-success"
                : item === step
                  ? "grid h-8 w-8 place-items-center rounded-full border border-accent bg-accent text-accent-fg"
                  : "grid h-8 w-8 place-items-center rounded-full border border-hairline bg-surface-1 text-fg-muted"
            }
          >
            {item < step ? <Check className="h-4 w-4" /> : item}
          </span>
          {item < 3 && <span className="h-px w-8 bg-hairline" />}
        </div>
      ))}
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

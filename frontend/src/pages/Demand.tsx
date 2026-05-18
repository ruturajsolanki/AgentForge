import { useState } from "react";
import { forgeApi } from "../services/forgeApi";
import type {
  Allocation,
  Decision,
  SimilarProject,
  Understanding,
} from "../types";

interface DemandPageProps {
  onApproved: (publicId: string) => void;
}

export default function DemandPage({ onApproved }: DemandPageProps) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<{
    publicId: string;
    understanding: Understanding;
    decision: Decision;
    allocation: Allocation;
    similar: SimilarProject[];
    reuseScore: number;
  } | null>(null);

  const submit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await forgeApi.createDemand(text.trim());
      setPlan({
        publicId: res.demand_id,
        understanding: res.understanding!,
        decision: res.decision!,
        allocation: res.allocation!,
        similar: res.similar_projects?.matches || [],
        reuseScore: res.reuse_score,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async () => {
    if (!plan) return;
    setSubmitting(true);
    try {
      await forgeApi.approveDemand(plan.publicId);
      onApproved(plan.publicId);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-emerald-400 bg-clip-text text-transparent">
          What do you need built?
        </h1>
        <p className="text-slate-400 text-sm">
          ForgeOS analyses your demand, checks for reusable past projects, and
          recommends the best execution path before any code is written.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder='e.g. "Build a banking chatbot with FAQ + account balance queries, multilingual, urgent"'
        className="w-full p-4 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{text.length} chars</span>
        <button
          onClick={submit}
          disabled={submitting || !text.trim()}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Analysing…" : "Analyse demand"}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-rose-700 bg-rose-950/60 text-rose-200 text-sm">
          {error}
        </div>
      )}

      {plan && (
        <div className="space-y-4">
          <PlanSection title="Understanding">
            <Pair label="Problem" value={plan.understanding.problem_type} />
            <Pair label="Domain" value={plan.understanding.domain} />
            <Pair label="Complexity" value={plan.understanding.complexity} />
            <Pair label="Urgency" value={plan.understanding.urgency} />
            <Pair label="Estimated scope" value={`${plan.understanding.estimated_scope_days} days`} />
            <Pair label="Summary" value={plan.understanding.summary} />
            <Pair label="Skills" value={plan.understanding.required_skills.join(", ")} />
            <Pair label="Features" value={plan.understanding.key_features.join(", ")} />
          </PlanSection>

          <PlanSection title="Decision">
            <Pair label="Execution mode" value={plan.decision.execution_mode} />
            <Pair label="Project type" value={plan.decision.project_type} />
            <Pair label="Confidence" value={`${Math.round(plan.decision.confidence_score * 100)}%`} />
            <Pair label="Time" value={`${plan.decision.estimated_time_days} days`} />
            <Pair label="Cost" value={`$${plan.decision.estimated_cost_usd.toLocaleString()}`} />
            <Pair label="Reasoning" value={plan.decision.reasoning} />
            {plan.decision.risk_factors.length > 0 && (
              <Pair label="Risks" value={plan.decision.risk_factors.join("; ")} />
            )}
          </PlanSection>

          <PlanSection title="Allocation">
            <Pair label="Daily burn" value={`$${plan.allocation.total_daily_cost.toLocaleString()}`} />
            <Pair label="Reasoning" value={plan.allocation.allocation_reasoning} />
            <div className="col-span-2 space-y-2 mt-2">
              {plan.allocation.team.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/40"
                >
                  <div>
                    <div className="text-sm text-slate-100 font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.resource_type.replace(/_/g, " ")}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-400">{Math.round(r.allocation_percentage * 100)}% allocated</div>
                    <div className="text-xs text-emerald-400">${r.cost_per_day}/day</div>
                  </div>
                </div>
              ))}
            </div>
          </PlanSection>

          {plan.similar.length > 0 && (
            <PlanSection title={`Similar past projects (${plan.similar.length})`}>
              <div className="col-span-2 space-y-2">
                {plan.similar.map((p) => (
                  <div
                    key={p.project_id}
                    className="flex items-start justify-between gap-3 px-3 py-2 rounded-lg border border-slate-800 bg-slate-900/40"
                  >
                    <div>
                      <div className="text-sm text-slate-200">{p.description}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {p.problem_type} · {p.domain}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-violet-300">
                      {Math.round(p.similarity * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </PlanSection>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setPlan(null)}
              className="px-4 py-2 rounded-xl text-sm border border-slate-700 hover:bg-slate-800 text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={approve}
              disabled={submitting}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors"
            >
              {submitting ? "Sending to executor…" : "Approve & build"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <h3 className="text-xs uppercase tracking-wider text-slate-400 mb-3 font-semibold">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">{children}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <>
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-200 break-words">{value}</div>
    </>
  );
}

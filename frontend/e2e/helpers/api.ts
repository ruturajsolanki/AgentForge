import type { Page, Route } from "@playwright/test";

/**
 * Deterministic API mocking for UI E2E. Install with `await mockApi(page)`
 * before navigation. Pass `overrides` to replace/add specific responses keyed
 * by a substring of the request path; the value is either a JSON-able object or
 * a function `(route) => void` for full control.
 */
type Responder = unknown | ((route: Route) => void | Promise<void>);

const SAMPLE_DEMAND = {
  id: "00000000-0000-0000-0000-000000000001",
  public_id: "DMD-DEMO01",
  stage: "executing",
  raw_text: "Build a customer support dashboard with auth and analytics.",
  understanding: {
    problem_type: "web_app",
    domain: "customer_support",
    complexity: "medium",
    urgency: "high",
    estimated_scope_days: 30,
    summary: "A support dashboard with RBAC and analytics.",
    required_skills: ["react", "python", "analytics"],
    key_features: ["authentication", "dashboard"],
  },
  decision: {
    execution_mode: "hybrid",
    project_type: "project",
    confidence_score: 0.82,
    estimated_cost_usd: 48000,
    estimated_time_days: 30,
    risk_factors: ["integration_complexity"],
    reasoning: "Hybrid AI + human team recommended.",
  },
  allocation: {
    team: [
      { resource_type: "frontend_engineer", name: "Sam Rivera", title: "React Engineer", seniority: "senior", allocation_percentage: 1, skills: ["react"], cost_per_day: 760, kind: "member" },
      { resource_type: "code_generator_agent", name: "Forge-FE", title: "AI Frontend Agent", seniority: "agent", allocation_percentage: 1, skills: ["react"], cost_per_day: 50, kind: "member" },
    ],
    total_daily_cost: 810,
    allocation_reasoning: "Selected 2 resources.",
    coverage_score: 0.9,
    uncovered_skills: [],
  },
  similar_projects: [],
  reuse_score: 0.2,
  preview_url: null,
  agent_runs: [],
};

function defaults(): Record<string, Responder> {
  return {
    "/api/notifications": { items: [], unread_count: 0 },
    "/api/settings": { llm_provider: "nim", demo_mode: true, agent_concurrency: 8 },
    "/api/dashboard/executive": {
      total_demands: 12, active_demands: 5, closed_demands: 6, failed_demands: 0, delayed_demands: 1,
      stage_breakdown: { executing: 3, completed: 6 },
      task_total: 40, tasks_done: 30, tasks_blocked: 2, sla_breaches: 1,
      swon_count: 4, won_count: 6, resource_utilization: 0.7, total_team: 12, assigned_team: 8,
      delivery_rate: 0.9, task_completion_rate: 0.8,
      demand_trend: [{ day: "2026-06-01", count: 2 }],
      recent_completed: [],
    },
    "/api/dashboard/manager": {
      demands: [],
      stage_breakdown: { executing: 3 },
      pending_approvals: [],
      sla_breaches: [],
      blocked_tasks: [],
      team_workload: {},
      team_allocation: [],
      summary: {
        total_demands: 5, active_demands: 3, total_tasks: 20, tasks_done: 12,
        tasks_in_progress: 5, total_blocked: 1, total_sla_breaches: 1, pending_approval_count: 2,
      },
    },
    "/api/dashboard/leader": {
      member_progress: {},
      work_distribution: {},
      blocked_tasks: [],
      sla_at_risk: [],
      active_demands: [],
      summary: {
        total_tasks: 10, tasks_done: 6, tasks_in_progress: 3, tasks_blocked: 1,
        health_score: 82, active_demand_count: 3,
      },
    },
    "/api/reports/portfolio": {
      delivered_this_quarter: 6,
      live_deliveries: [],
      active_swons: 4,
      recently_shipped: [],
    },
    "/api/demands": { items: [SAMPLE_DEMAND], total: 1 },
    "/api/tasks": [],
    "/api/swon": [],
    "/api/won": [],
    "/api/audit": { items: [], total: 0, limit: 50, offset: 0, has_more: false },
  };
}

export async function mockApi(page: Page, overrides: Record<string, Responder> = {}) {
  const table = { ...defaults(), ...overrides };

  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    // Exact-ish match: longest key that is a prefix/substring of the path.
    const key = Object.keys(table)
      .filter((k) => path.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];

    if (!key) {
      // Unknown endpoint -> empty 200 so the UI degrades gracefully.
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      return;
    }

    const responder = table[key];
    if (typeof responder === "function") {
      await (responder as (r: Route) => void | Promise<void>)(route);
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(responder),
    });
  });
}

export { SAMPLE_DEMAND };

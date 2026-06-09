export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: string;
  color: string;
  status: "idle" | "working" | "completed" | "error" | "waiting";
  current_task: string | null;
  progress: number;
}

export interface LogEntry {
  agent_id: string;
  agent_name: string;
  level: string;
  message: string;
  timestamp: string;
}

export interface OutputFile {
  path: string;
  content: string;
}

export interface WSEvent {
  type: string;
  agent_id?: string;
  agent_name?: string;
  status?: string;
  current_task?: string;
  progress?: number;
  level?: string;
  message?: string;
  files?: OutputFile[];
  agents?: Agent[];
  project_id?: string;
  demo_mode?: boolean;
  timestamp?: string;
  // ForgeOS pipeline events
  stage?: string;
  demand_id?: string;
  tenant_id?: string;
  understanding?: Understanding;
  decision?: Decision;
  allocation?: Allocation;
  similar_projects?: SimilarProject[];
  reuse_score?: number;
  explanation?: string;
  artifacts_prefix?: string;
  // Live LLM streaming
  phase?: "start" | "chunk" | "end" | "error";
  delta?: string;
  seq?: number;
  model?: string;
  provider?: string;
  task?: string;
  total_chunks?: number;
  char_count?: number;
}

// ── ForgeOS planner contracts ─────────────────────────────────

export type DemandStage =
  | "ingested"
  | "understanding"
  | "deciding"
  | "allocating"
  | "awaiting_approval"
  | "executing"
  | "monitoring"
  | "explaining"
  | "completed"
  | "failed"
  | "cancelled";

export interface Understanding {
  problem_type: string;
  domain: string;
  complexity: "low" | "medium" | "high";
  urgency: "low" | "medium" | "high";
  required_skills: string[];
  key_features: string[];
  estimated_scope_days: number;
  summary: string;
}

export interface Decision {
  execution_mode: "ai_agent" | "human_team" | "hybrid" | "reuse_existing";
  project_type: string;
  reasoning: string;
  estimated_cost_usd: number;
  estimated_time_days: number;
  confidence_score: number;
  risk_factors: string[];
  reuse_percentage: number;
}

export interface AllocatedResource {
  resource_type: string;
  name: string;
  title?: string | null;
  seniority?: string | null;
  allocation_percentage: number;
  skills: string[];
  cost_per_day: number;
  match_score?: number;
  reason?: string | null;
  kind?: string;
  currently_allocated_to?: string | null;
  move_recommended?: boolean;
  move_probability?: number;
  move_importance?: string | null;
  move_rationale?: string | null;
}

export interface Allocation {
  team: AllocatedResource[];
  total_daily_cost: number;
  allocation_reasoning: string;
  bench_size?: number;
  coverage_score?: number;
  uncovered_skills?: string[];
}

export interface SimilarProject {
  project_id: string;
  description: string;
  similarity: number;
  domain?: string;
  problem_type?: string;
  reuse_components: string[];
}

export interface Demand {
  id: string;
  public_id: string;
  stage: DemandStage;
  raw_text: string;
  understanding?: Understanding | null;
  decision?: Decision | null;
  allocation?: Allocation | null;
  similar_projects?: { matches: SimilarProject[] } | null;
  reuse_score: number;
  explanation?: string | null;
  artifacts_prefix?: string | null;
  preview_url?: string | null;
  error?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}

export interface PortalClient {
  role: "client";
  name: string;
  email: string;
  company: string;
}

export interface PortalMessage {
  id: string;
  author: string;
  role: "client" | "manager" | "agent" | string;
  body: string;
  createdAt?: string | null;
}

export interface PortalRequest {
  id: string;
  publicId: string;
  client: PortalClient;
  industry: string;
  priority: string;
  timeline: string;
  budgetRange: string;
  description: string;
  status: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  source: string;
  plan: {
    publicId: string;
    understanding?: Understanding | null;
    decision?: Decision | null;
    allocation?: Allocation | null;
    similar?: SimilarProject[];
    reuseScore?: number;
  };
  messages: PortalMessage[];
  approvedTeam: string[];
}

export interface PortalTeamMember {
  id: string;
  name: string;
  role: string;
  experience: string;
  aiReadiness: "advanced" | "active" | "learning" | string;
  skills: string;
  availability: string;
  currentProject: string;
}

// ── TCS Delivery Layer types ──────────────────────────────────

export type SwonLifecycleState =
  | "Initiated"
  | "Planning"
  | "Executing"
  | "Monitoring"
  | "Closing"
  | "Warranty"
  | "Closed";

export type WonState = "Active" | "Extended" | "Released" | "Renewed";

export type TaskStatus = "Todo" | "InProgress" | "Review" | "Blocked" | "Done";

export interface SwonRecord {
  id: string;
  public_id: string;
  demand_id: string;
  customer_loa_ref?: string | null;
  sow_summary?: string | null;
  lifecycle_state: SwonLifecycleState;
  opened_at?: string | null;
  closed_at?: string | null;
  total_value_inr?: number | null;
  billing_currency: string;
}

export interface WonRecord {
  id: string;
  public_id: string;
  swon_id: string;
  billable: boolean;
  resource_id?: string | null;
  cost_centre?: string | null;
  allocation_pct: number;
  start_date?: string | null;
  end_date?: string | null;
  monthly_value_inr?: number | null;
  state: WonState;
}

export interface TaskItem {
  id: string;
  public_id: string;
  demand_id: string;
  swon_id?: string | null;
  parent_task_id?: string | null;
  title: string;
  description?: string | null;
  owner_id?: string | null;
  status: TaskStatus;
  priority: string;
  est_hours?: number | null;
  actual_hours?: number | null;
  sla_due_at?: string | null;
  blocked_reason?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}

export interface AuditEventItem {
  id: string;
  entity_kind: string;
  entity_id: string;
  actor_id?: string | null;
  action: string;
  diff?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface ReuseRationale {
  why_reusable: string[];
  why_not_reusable: string[];
  components_kept: string[];
  components_replaced: string[];
  estimated_savings_days: number;
}

export interface DeliveryReport {
  period: string;
  swon_count: number;
  won_count: number;
  task_total: number;
  tasks_done: number;
  demands_total: number;
}

export interface PortfolioReport {
  demands: Demand[];
  closed_swons_count: number;
  active_swons_count: number;
  total_demands: number;
}

// ── Dashboard types ───────────────────────────────────────────

export interface ExecutiveDashboard {
  total_demands: number;
  active_demands: number;
  closed_demands: number;
  failed_demands: number;
  delayed_demands: number;
  stage_breakdown: Record<string, number>;
  task_total: number;
  tasks_done: number;
  tasks_blocked: number;
  sla_breaches: number;
  swon_count: number;
  won_count: number;
  resource_utilization: number;
  total_team: number;
  assigned_team: number;
  delivery_rate: number;
  task_completion_rate: number;
  demand_trend: { day: string; count: number }[];
  recent_completed: {
    id: string;
    public_id: string;
    stage: string;
    raw_text: string;
    completed_at?: string | null;
  }[];
}

export interface ManagerDashboardData {
  demands: {
    id: string;
    public_id: string;
    stage: string;
    raw_text: string;
    created_at?: string | null;
    updated_at?: string | null;
    age_days: number;
  }[];
  stage_breakdown: Record<string, number>;
  pending_approvals: {
    id: string;
    public_id: string;
    raw_text: string;
    created_at?: string | null;
  }[];
  sla_breaches: {
    id: string;
    public_id: string;
    title: string;
    status: string;
    sla_due_at?: string | null;
    demand_id: string;
  }[];
  blocked_tasks: {
    id: string;
    public_id: string;
    title: string;
    blocked_reason?: string | null;
    demand_id: string;
  }[];
  team_workload: Record<string, { total: number; done: number; in_progress: number; blocked: number }>;
  team_allocation: {
    id: string;
    name: string;
    role: string;
    availability: string;
    current_project: string;
  }[];
  summary: {
    total_demands: number;
    active_demands: number;
    total_tasks: number;
    tasks_done: number;
    tasks_in_progress: number;
    total_blocked: number;
    total_sla_breaches: number;
    pending_approval_count: number;
  };
}

export interface LeaderDashboardData {
  member_progress: Record<string, { total: number; done: number; in_progress: number; blocked: number; todo: number; review: number }>;
  work_distribution: Record<string, number>;
  blocked_tasks: {
    id: string;
    public_id: string;
    title: string;
    blocked_reason?: string | null;
    owner_id?: string | null;
    demand_id: string;
    sla_due_at?: string | null;
  }[];
  sla_at_risk: {
    id: string;
    public_id: string;
    title: string;
    status: string;
    sla_due_at?: string | null;
    owner_id?: string | null;
  }[];
  active_demands: {
    id: string;
    public_id: string;
    stage: string;
    raw_text: string;
    task_count: number;
    tasks_done: number;
  }[];
  summary: {
    total_tasks: number;
    tasks_done: number;
    tasks_in_progress: number;
    tasks_blocked: number;
    health_score: number;
    active_demand_count: number;
  };
}

// ── Report types ──────────────────────────────────────────────

export interface TeamPerformanceReport {
  members: {
    name: string;
    role: string;
    availability: string;
    current_project: string;
    total_tasks: number;
    done: number;
    in_progress: number;
    blocked: number;
    hours_logged: number;
    completion_rate: number;
  }[];
  total_members: number;
}

export interface DemandAgingReport {
  demands: {
    public_id: string;
    stage: string;
    age_days: number;
    bucket: string;
    created_at: string;
    updated_at: string;
  }[];
  buckets: Record<string, number>;
  total: number;
}

export interface SlaComplianceReport {
  tasks: {
    public_id: string;
    title: string;
    status: string;
    sla_due_at: string;
    completed_at: string;
    sla_status: string;
  }[];
  summary: {
    total: number;
    breached: number;
    at_risk: number;
    on_track: number;
    no_sla: number;
    compliance_rate: number;
  };
}

export interface PaginatedAuditResponse {
  items: AuditEventItem[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

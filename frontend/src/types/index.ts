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
  allocation_percentage: number;
  skills: string[];
  cost_per_day: number;
}

export interface Allocation {
  team: AllocatedResource[];
  total_daily_cost: number;
  allocation_reasoning: string;
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

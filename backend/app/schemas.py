"""ForgeOS schemas — fusion of Vultron's planner contracts and AgentForge's executor models."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Planner enums (ported from Vultron) ──────────────────────────────


class ProblemType(str, Enum):
    WEB_APP = "web_app"
    CHATBOT = "chatbot"
    ANALYTICS = "analytics"
    AUTOMATION = "automation"
    ML_MODEL = "ml_model"
    DATA_PIPELINE = "data_pipeline"
    INTEGRATION = "integration"
    OTHER = "other"


class Domain(str, Enum):
    BANKING = "banking"
    HEALTHCARE = "healthcare"
    RETAIL = "retail"
    INSURANCE = "insurance"
    TELECOM = "telecom"
    HR = "hr"
    FINANCE = "finance"
    DEVELOPER_TOOLS = "developer_tools"
    GENERAL = "general"


class Complexity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Urgency(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ExecutionMode(str, Enum):
    AI_AGENT = "ai_agent"
    HUMAN_TEAM = "human_team"
    HYBRID = "hybrid"
    REUSE_EXISTING = "reuse_existing"


class ProjectType(str, Enum):
    PROJECT = "project"
    POC = "poc"
    HACKATHON = "hackathon"
    PARTNER = "partner"


class ResourceType(str, Enum):
    BACKEND_ENGINEER = "backend_engineer"
    FRONTEND_ENGINEER = "frontend_engineer"
    AI_ENGINEER = "ai_engineer"
    DATA_ENGINEER = "data_engineer"
    CODE_GENERATOR_AGENT = "code_generator_agent"
    CHATBOT_BUILDER_AGENT = "chatbot_builder_agent"
    DATA_ANALYST_AGENT = "data_analyst_agent"
    AUTOMATION_AGENT = "automation_agent"
    PARTNER_VENDOR = "partner_vendor"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DELAYED = "delayed"
    REASSIGNED = "reassigned"


class AgentStatus(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    COMPLETED = "completed"
    ERROR = "error"


class DemandStage(str, Enum):
    INGESTED = "ingested"
    UNDERSTANDING = "understanding"
    DECIDING = "deciding"
    ALLOCATING = "allocating"
    AWAITING_APPROVAL = "awaiting_approval"
    EXECUTING = "executing"
    MONITORING = "monitoring"
    EXPLAINING = "explaining"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# ── Planner contracts ─────────────────────────────────────────────────


class DemandInput(BaseModel):
    text: str = Field(..., description="Raw demand text")
    source: str = Field(default="manual")
    priority_override: Optional[Urgency] = None


class DemandUnderstanding(BaseModel):
    problem_type: ProblemType
    domain: Domain
    complexity: Complexity
    urgency: Urgency
    required_skills: list[str]
    key_features: list[str]
    estimated_scope_days: int
    summary: str


class ExecutionDecision(BaseModel):
    execution_mode: ExecutionMode
    project_type: ProjectType
    reasoning: str
    estimated_cost_usd: float
    estimated_time_days: int
    confidence_score: float = Field(ge=0.0, le=1.0)
    risk_factors: list[str]
    reuse_percentage: float = Field(default=0.0, ge=0.0, le=1.0)


class AllocatedResource(BaseModel):
    resource_type: ResourceType
    name: str
    allocation_percentage: float = Field(ge=0.0, le=1.0)
    skills: list[str]
    cost_per_day: float


class ResourceAllocation(BaseModel):
    team: list[AllocatedResource]
    total_daily_cost: float
    allocation_reasoning: str


class SimilarProject(BaseModel):
    project_id: str
    description: str
    similarity: float
    domain: Optional[str] = None
    problem_type: Optional[str] = None
    reuse_components: list[str] = Field(default_factory=list)


# ── Executor contracts (ported from AgentForge) ────────────────────────


class ExecutorTask(BaseModel):
    id: str
    title: str
    description: str
    agent: str
    dependencies: list[str] = Field(default_factory=list)
    priority: int = 2


class ExecutorPlan(BaseModel):
    project_name: str
    description: str
    tasks: list[ExecutorTask]


class GeneratedFile(BaseModel):
    path: str
    content: str


class AgentRunResult(BaseModel):
    agent_id: str
    files: list[GeneratedFile] = Field(default_factory=list)


# ── Combined pipeline state ────────────────────────────────────────────


class PipelineSnapshot(BaseModel):
    """Single document representing where a demand is in the pipeline."""

    demand_id: str
    tenant_id: str
    stage: DemandStage
    original_input: str
    ingested_at: datetime
    understanding: Optional[DemandUnderstanding] = None
    similar_projects: list[SimilarProject] = Field(default_factory=list)
    reuse_score: float = 0.0
    decision: Optional[ExecutionDecision] = None
    allocation: Optional[ResourceAllocation] = None
    executor_plan: Optional[ExecutorPlan] = None
    artifacts_prefix: Optional[str] = None
    preview_url: Optional[str] = None
    explanation: Optional[str] = None
    error: Optional[str] = None
    updated_at: datetime


class StreamEvent(BaseModel):
    """Generic event broadcast over Redis pub/sub then WebSocket."""

    type: str
    demand_id: Optional[str] = None
    tenant_id: Optional[str] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime

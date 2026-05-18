from pydantic import BaseModel
from typing import List, Optional
from enum import Enum


class AgentStatus(str, Enum):
    IDLE = "idle"
    WORKING = "working"
    COMPLETED = "completed"
    ERROR = "error"
    WAITING = "waiting"


class ProjectCreate(BaseModel):
    prompt: str


class AgentState(BaseModel):
    id: str
    name: str
    role: str
    icon: str
    color: str
    status: AgentStatus = AgentStatus.IDLE
    current_task: Optional[str] = None
    progress: int = 0


class ProjectResponse(BaseModel):
    id: str
    prompt: str
    status: str
    created_at: str
    output_path: Optional[str] = None
    files: List[dict] = []

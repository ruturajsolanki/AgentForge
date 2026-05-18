from __future__ import annotations

import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from models import AgentStatus
from llm_client import LLMClient


class BaseAgent(ABC):
    """Common behaviour shared by every specialised agent."""

    def __init__(
        self,
        agent_id: str,
        name: str,
        role: str,
        icon: str,
        color: str,
        llm_client: LLMClient,
        event_callback=None,
    ) -> None:
        self.agent_id = agent_id
        self.name = name
        self.role = role
        self.icon = icon
        self.color = color
        self.status = AgentStatus.IDLE
        self.current_task: str | None = None
        self.progress = 0
        self.llm_client = llm_client
        self.event_callback = event_callback
        self.system_prompt = ""

    async def emit(self, event_type: str, data: dict | None = None) -> None:
        if self.event_callback:
            await self.event_callback(
                {
                    "type": event_type,
                    "agent_id": self.agent_id,
                    "agent_name": self.name,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    **(data or {}),
                }
            )

    async def update_status(
        self, status: AgentStatus, task: str | None = None, progress: int | None = None
    ) -> None:
        self.status = status
        if task is not None:
            self.current_task = task
        if progress is not None:
            self.progress = progress
        await self.emit(
            "agent.status",
            {"status": status, "current_task": self.current_task, "progress": self.progress},
        )

    async def log(self, message: str, level: str = "info") -> None:
        await self.emit("agent.log", {"level": level, "message": message})

    async def execute(self, task: dict, context: list | None = None) -> dict:
        title = task.get("title", "Working…")
        try:
            await self.update_status(AgentStatus.WORKING, title, 0)
            await self.log(f"Starting: {title}")
            result = await self.process(task, context)
            await self.update_status(AgentStatus.COMPLETED, title, 100)
            await self.log(f"Completed: {title}")
            return result
        except Exception as exc:
            await self.update_status(AgentStatus.ERROR)
            await self.log(f"Error — {exc}", level="error")
            raise

    @abstractmethod
    async def process(self, task: dict, context: list | None = None) -> dict: ...

    def get_state(self) -> dict:
        return {
            "id": self.agent_id,
            "name": self.name,
            "role": self.role,
            "icon": self.icon,
            "color": self.color,
            "status": self.status,
            "current_task": self.current_task,
            "progress": self.progress,
        }

    @staticmethod
    def parse_files(response: str, prefix: str = "") -> list[dict]:
        files: list[dict] = []
        seen: set[str] = set()

        def _add(path: str, content: str) -> None:
            path = path.strip().lstrip("/")
            if not path or path in seen:
                return
            seen.add(path)
            files.append({"path": f"{prefix}{path}" if not path.startswith(prefix) else path, "content": content.strip()})

        # Format 1: ===FILE: path===\n...\n===END FILE===
        for m in re.finditer(r"===FILE:\s*(.+?)===\s*\n([\s\S]*?)===END FILE===", response):
            _add(m.group(1), m.group(2))
        if files:
            return files

        # Format 2: FILE: path\n```\n...\n```
        for m in re.finditer(r"FILE:\s*(.+?)\s*\n```\w*\n([\s\S]*?)```", response):
            _add(m.group(1), m.group(2))
        if files:
            return files

        # Format 3: **path**\n```\n...\n``` or ### path\n```\n...\n```
        for m in re.finditer(r"(?:\*\*|###?\s+)([^\*\n]+\.(?:tsx?|jsx?|html|css|json|sql|py|md|yml|yaml))(?:\*\*)?:?\s*\n```\w*\n([\s\S]*?)```", response):
            _add(m.group(1), m.group(2))
        if files:
            return files

        # Format 4: `path`\n```\n...\n```
        for m in re.finditer(r"`([^`]+\.(?:tsx?|jsx?|html|css|json|sql|py|md|yml|yaml))`\s*:?\s*\n```\w*\n([\s\S]*?)```", response):
            _add(m.group(1), m.group(2))

        return files

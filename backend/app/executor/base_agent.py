"""BaseAgent — shared behaviour for every specialised executor agent."""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

from app.llm import get_provider, model_router
from app.schemas import AgentStatus

EventEmitter = Callable[[dict], Awaitable[None]]


class BaseAgent(ABC):
    role: str = ""  # which model_router role to use ("frontend", "backend", etc.)

    def __init__(
        self,
        agent_id: str,
        name: str,
        title: str,
        icon: str,
        color: str,
        emit: Optional[EventEmitter] = None,
    ) -> None:
        self.agent_id = agent_id
        self.name = name
        self.title = title
        self.icon = icon
        self.color = color
        self.status = AgentStatus.IDLE
        self.current_task: Optional[str] = None
        self.progress = 0
        self.emit_cb = emit
        self.system_prompt = ""

    async def emit(self, event_type: str, data: Optional[dict] = None) -> None:
        if not self.emit_cb:
            return
        await self.emit_cb({
            "type": event_type,
            "agent_id": self.agent_id,
            "agent_name": self.name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            **(data or {}),
        })

    async def update_status(
        self,
        status: AgentStatus,
        task: Optional[str] = None,
        progress: Optional[int] = None,
    ) -> None:
        self.status = status
        if task is not None:
            self.current_task = task
        if progress is not None:
            self.progress = progress
        await self.emit(
            "agent.status",
            {
                "status": status.value,
                "current_task": self.current_task,
                "progress": self.progress,
            },
        )

    async def log(self, message: str, level: str = "info") -> None:
        await self.emit("agent.log", {"level": level, "message": message})

    async def llm(self, prompt: str, system: Optional[str] = None) -> str:
        """Route LLM calls through the per-role router. Streams chunks back
        to the client over the event bus as ``agent.code`` events so the UI
        can render code as it's generated, then returns the full text."""
        routed = model_router.resolve(self.role)
        provider = get_provider(routed.provider)
        messages = [
            {"role": "system", "content": system or ""},
            {"role": "user", "content": prompt},
        ]

        # If no emitter is bound (e.g. unit tests), fall back to a single chat call.
        if self.emit_cb is None:
            return await provider.chat(
                messages, model=routed.model, temperature=0.5, max_tokens=4096,
            )

        await self.emit("agent.code", {
            "model": routed.model,
            "provider": routed.provider,
            "phase": "start",
            "task": self.current_task,
        })

        chunks: list[str] = []
        seq = 0
        try:
            async for chunk in provider.stream(
                messages, model=routed.model, temperature=0.5, max_tokens=4096,
            ):
                if not chunk:
                    continue
                chunks.append(chunk)
                await self.emit("agent.code", {
                    "phase": "chunk",
                    "seq": seq,
                    "delta": chunk,
                })
                seq += 1
        except Exception as exc:
            await self.emit("agent.code", {
                "phase": "error",
                "message": f"{type(exc).__name__}: {exc}",
            })
            raise
        finally:
            await self.emit("agent.code", {
                "phase": "end",
                "total_chunks": seq,
                "char_count": sum(len(c) for c in chunks),
            })

        return "".join(chunks)

    async def execute(self, task: dict, context: Optional[list] = None) -> dict:
        title = task.get("title", "Working")
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
    async def process(self, task: dict, context: Optional[list] = None) -> dict: ...

    def state(self) -> dict:
        return {
            "id": self.agent_id,
            "name": self.name,
            "title": self.title,
            "icon": self.icon,
            "color": self.color,
            "status": self.status.value,
            "current_task": self.current_task,
            "progress": self.progress,
        }

    # ── File parsing ───────────────────────────────────────────────────

    @staticmethod
    def parse_files(response: str, prefix: str = "") -> list[dict]:
        """Extract `path` + `content` pairs from a generated response.
        Supports the 4 markdown formats AgentForge historically emits."""
        files: list[dict] = []
        seen: set[str] = set()

        def add(path: str, content: str) -> None:
            p = path.strip().lstrip("/")
            if not p or p in seen:
                return
            seen.add(p)
            files.append({
                "path": f"{prefix}{p}" if not p.startswith(prefix) else p,
                "content": content.strip(),
            })

        for m in re.finditer(r"===FILE:\s*(.+?)===\s*\n([\s\S]*?)===END FILE===", response):
            add(m.group(1), m.group(2))
        if files:
            return files

        for m in re.finditer(r"FILE:\s*(.+?)\s*\n```\w*\n([\s\S]*?)```", response):
            add(m.group(1), m.group(2))
        if files:
            return files

        for m in re.finditer(
            r"(?:\*\*|###?\s+)([^\*\n]+\.(?:tsx?|jsx?|html|css|json|sql|py|md|yml|yaml))(?:\*\*)?:?\s*\n```\w*\n([\s\S]*?)```",
            response,
        ):
            add(m.group(1), m.group(2))
        if files:
            return files

        for m in re.finditer(
            r"`([^`]+\.(?:tsx?|jsx?|html|css|json|sql|py|md|yml|yaml))`\s*:?\s*\n```\w*\n([\s\S]*?)```",
            response,
        ):
            add(m.group(1), m.group(2))
        return files

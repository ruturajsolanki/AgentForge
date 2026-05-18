"""The six specialised executor agents, rewired onto the new LLM router."""

from __future__ import annotations

import asyncio
from typing import Optional

from app.executor.base_agent import BaseAgent
from app.planner._jsonutil import extract_json
from app.schemas import AgentStatus


class ProjectManagerAgent(BaseAgent):
    role = "planner"

    def __init__(self, emit=None) -> None:
        super().__init__(
            agent_id="project_manager",
            name="Project Manager",
            title="Planning & Coordination",
            icon="Crown",
            color="#F59E0B",
            emit=emit,
        )
        self.system_prompt = (
            "You are a Project Manager AI. Decompose a software requirement into "
            "4-6 concrete tasks. Respond with ONLY a JSON object:\n"
            '{"project_name":"slug","description":"short","tasks":['
            '{"id":"t1","title":"...","description":"...","agent":"frontend_dev",'
            '"dependencies":[],"priority":1}]}\n'
            "agent must be one of: frontend_dev, backend_dev, devops, qa_tester, documentation."
        )

    async def process(self, task: dict, context: Optional[list] = None) -> dict:
        prompt = task.get("prompt", "")
        await self.update_status(AgentStatus.WORKING, "Analysing requirements", 20)
        response = await self.llm(
            prompt=f"Project request: {prompt}\n\nDecompose into 4-6 tasks. JSON only.",
            system=self.system_prompt,
        )
        await self.update_status(AgentStatus.WORKING, "Organising plan", 70)
        plan = extract_json(response)
        if plan and isinstance(plan.get("tasks"), list) and plan["tasks"]:
            valid = {"frontend_dev", "backend_dev", "devops", "qa_tester", "documentation"}
            for i, t in enumerate(plan["tasks"]):
                if t.get("agent") not in valid:
                    t["agent"] = "frontend_dev"
                t.setdefault("id", f"t{i + 1}")
                t.setdefault("dependencies", [])
                t.setdefault("priority", 2)
            await self.log(f"Parsed plan with {len(plan['tasks'])} tasks")
        else:
            await self.log("LLM plan unparseable — using fallback", "warning")
            plan = self._fallback_plan(prompt)
        return plan

    @staticmethod
    def _fallback_plan(prompt: str) -> dict:
        return {
            "project_name": "generated-project",
            "description": prompt,
            "tasks": [
                {"id": "t1", "title": "Design database schema", "description": f"Supabase tables for: {prompt}", "agent": "backend_dev", "dependencies": [], "priority": 1},
                {"id": "t2", "title": "Build main UI", "description": f"React UI for: {prompt}", "agent": "frontend_dev", "dependencies": ["t1"], "priority": 2},
                {"id": "t3", "title": "Wire CRUD operations", "description": "Supabase CRUD calls", "agent": "frontend_dev", "dependencies": ["t1"], "priority": 2},
                {"id": "t4", "title": "Dockerfile + compose", "description": "Container config", "agent": "devops", "dependencies": [], "priority": 1},
                {"id": "t5", "title": "Run tests", "description": "Validate generated code", "agent": "qa_tester", "dependencies": ["t2", "t3"], "priority": 3},
                {"id": "t6", "title": "Write documentation", "description": "README + setup", "agent": "documentation", "dependencies": ["t2", "t3", "t4"], "priority": 4},
            ],
        }


_FRONTEND_PROMPT = """\
You are a Frontend Developer AI. Generate a React + TypeScript + Vite app.

Hard rules:
1. Output each file using EXACTLY:
   ===FILE: src/components/MyComp.tsx===
   <code>
   ===END FILE===
2. Use the existing Supabase client at src/lib/supabase.ts — DO NOT regenerate it.
   Import:  import { supabase } from '../lib/supabase'
   `supabase` may be null; always check / use `supabase?.` optional chaining.
3. Use Tailwind classes (CDN is in index.html). No external CSS files.
4. Always update src/App.tsx to render the new components.
5. Use react import: `import { useState, useEffect } from 'react'`.
6. If Supabase is not configured, persist to localStorage so the app still works.
7. Never overwrite: index.html, src/main.tsx, src/lib/supabase.ts, vite.config.ts, package.json.
"""


class FrontendDevAgent(BaseAgent):
    role = "frontend"

    def __init__(self, emit=None) -> None:
        super().__init__(
            agent_id="frontend_dev",
            name="Frontend Developer",
            title="UI & Client-Side",
            icon="Palette",
            color="#10B981",
            emit=emit,
        )
        self.system_prompt = _FRONTEND_PROMPT

    async def process(self, task: dict, context: Optional[list] = None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 25)
        response = await self.llm(
            prompt=(
                f"Task: {title}\nDetails: {desc}\n\n"
                "Generate React components and update src/App.tsx so it imports + renders them."
            ),
            system=self.system_prompt,
        )
        await self.update_status(AgentStatus.WORKING, "Parsing output", 80)
        files = self.parse_files(response)
        if not files and ("export" in response and ("<" in response or "return" in response)):
            name = (title.replace(" ", "") or "Generated")[:24]
            files = [{"path": f"src/components/{name}.tsx", "content": response}]
        await self.log(f"Generated {len(files)} file(s)")
        return {"files": files, "raw": response}


_BACKEND_PROMPT = """\
You are a Backend Developer AI. Generate Supabase (Postgres) SQL migrations.

Rules:
1. Output each file using:
   ===FILE: supabase/migrations/001_*.sql===
   <code>
   ===END FILE===
2. CREATE TABLE statements must include sane columns + types.
3. Always ALTER TABLE ... ENABLE ROW LEVEL SECURITY and add a permissive policy.
4. Use gen_random_uuid() for primary keys and TIMESTAMPTZ DEFAULT now() for timestamps.
"""


class BackendDevAgent(BaseAgent):
    role = "backend"

    def __init__(self, emit=None) -> None:
        super().__init__(
            agent_id="backend_dev",
            name="Backend Developer",
            title="Database & API",
            icon="Server",
            color="#8B5CF6",
            emit=emit,
        )
        self.system_prompt = _BACKEND_PROMPT

    async def process(self, task: dict, context: Optional[list] = None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 30)
        response = await self.llm(
            prompt=f"Task: {title}\nDetails: {desc}\n\nGenerate Supabase SQL migrations.",
            system=self.system_prompt,
        )
        await self.update_status(AgentStatus.WORKING, "Parsing output", 80)
        files = self.parse_files(response, "supabase/migrations/")
        if not files:
            files = [{"path": "supabase/migrations/001_schema.sql", "content": response}]
        await self.log(f"Generated {len(files)} file(s)")
        return {"files": files, "raw": response}


class DevOpsAgent(BaseAgent):
    role = "devops"

    def __init__(self, emit=None) -> None:
        super().__init__(
            agent_id="devops",
            name="DevOps Engineer",
            title="Infrastructure & Config",
            icon="Container",
            color="#06B6D4",
            emit=emit,
        )
        self.system_prompt = (
            "You are a DevOps Engineer AI. Output Dockerfile, docker-compose.yml, "
            ".env.example using ===FILE: path=== / ===END FILE=== blocks."
        )

    async def process(self, task: dict, context: Optional[list] = None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 30)
        response = await self.llm(
            prompt=f"Task: {title}\nDetails: {desc}\n\nGenerate DevOps files.",
            system=self.system_prompt,
        )
        files = self.parse_files(response)
        if not files:
            files = [{"path": "Dockerfile", "content": response}]
        await self.log(f"Generated {len(files)} config file(s)")
        return {"files": files, "raw": response}


class QATestingAgent(BaseAgent):
    role = "qa"

    def __init__(self, emit=None) -> None:
        super().__init__(
            agent_id="qa_tester",
            name="QA Tester",
            title="Quality Assurance",
            icon="TestTube",
            color="#F43F5E",
            emit=emit,
        )
        self.system_prompt = (
            "You are a QA Testing AI. Review code, list issues, and produce test files "
            "using ===FILE: tests/xyz.test.ts=== / ===END FILE===."
        )

    async def process(self, task: dict, context: Optional[list] = None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 30)

        snippet = ""
        if context:
            for item in context:
                if isinstance(item, dict) and "files" in item:
                    for f in item["files"][:4]:
                        snippet += f"\n--- {f['path']} ---\n{f.get('content','')[:400]}\n"

        prompt = f"Task: {title}\nDetails: {desc}\n"
        if snippet:
            prompt += f"\nCode under review:\n{snippet}\n"
        prompt += "\nReturn analysis and test files."

        response = await self.llm(prompt=prompt, system=self.system_prompt)
        files = self.parse_files(response, "tests/")
        await self.log(f"QA finished, produced {len(files)} test file(s)")
        return {"files": files, "report": response}


class DocumentationAgent(BaseAgent):
    role = "docs"

    def __init__(self, emit=None) -> None:
        super().__init__(
            agent_id="documentation",
            name="Documentation Writer",
            title="Technical Writing",
            icon="FileText",
            color="#3B82F6",
            emit=emit,
        )
        self.system_prompt = (
            "You are a Documentation Writer AI. Produce README.md and SETUP.md "
            "using ===FILE: README.md=== / ===END FILE=== blocks."
        )

    async def process(self, task: dict, context: Optional[list] = None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 30)

        listing = ""
        if context:
            for item in context:
                if isinstance(item, dict) and "files" in item:
                    for f in item["files"]:
                        listing += f"\n- {f['path']}"

        prompt = f"Task: {title}\nDetails: {desc}\n"
        if listing:
            prompt += f"\nProject files:{listing}\n"
        prompt += "\nWrite comprehensive Markdown docs."

        response = await self.llm(prompt=prompt, system=self.system_prompt)
        files = self.parse_files(response)
        if not files:
            files = [{"path": "README.md", "content": response}]
        await self.log(f"Generated {len(files)} doc file(s)")
        return {"files": files, "raw": response}


async def _noop(_event: dict) -> None:  # used in tests
    await asyncio.sleep(0)

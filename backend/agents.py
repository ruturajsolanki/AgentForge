"""All six specialised AgentForge agents."""

from __future__ import annotations

import asyncio
import json
import re

from base_agent import BaseAgent
from models import AgentStatus


def _extract_json(text: str) -> dict | None:
    """Try multiple strategies to extract a JSON object from LLM output."""
    # Strategy 1: direct parse
    try:
        return json.loads(text.strip())
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 2: extract from markdown ```json ... ``` blocks
    for m in re.finditer(r"```(?:json)?\s*\n?([\s\S]*?)```", text):
        try:
            return json.loads(m.group(1).strip())
        except (json.JSONDecodeError, ValueError):
            pass

    # Strategy 3: find outermost { ... } brace pair (balanced)
    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                candidate = text[start : i + 1]
                try:
                    return json.loads(candidate)
                except (json.JSONDecodeError, ValueError):
                    # Strategy 4: fix common LLM issues (trailing commas)
                    cleaned = re.sub(r",\s*([}\]])", r"\1", candidate)
                    try:
                        return json.loads(cleaned)
                    except (json.JSONDecodeError, ValueError):
                        pass
                start = -1

    return None


class ProjectManagerAgent(BaseAgent):
    def __init__(self, llm_client, event_callback=None):
        super().__init__(
            "project_manager", "Project Manager", "Planning & Coordination",
            "Crown", "#F59E0B", llm_client, event_callback,
        )
        self.system_prompt = (
            "You are a Project Manager AI agent. Analyze software project requirements "
            "and decompose them into 4-6 specific tasks (no more than 6).\n\n"
            "Return a JSON object with this structure:\n"
            '{"project_name":"short-name","description":"brief description",'
            '"tasks":[{"id":"task_1","title":"Task title","description":"Details",'
            '"agent":"frontend_dev","dependencies":[],"priority":1}]}\n\n'
            "Valid agent values: frontend_dev, backend_dev, devops, qa_tester, documentation.\n"
            "Keep it to 4-6 tasks total. Return ONLY the JSON object, nothing else."
        )

    async def process(self, task: dict, context=None) -> dict:
        prompt = task.get("prompt", "")
        await self.update_status(AgentStatus.WORKING, "Analysing requirements", 10)
        await self.log("Analysing project requirements…")
        await asyncio.sleep(0.5)

        await self.update_status(AgentStatus.WORKING, "Decomposing into tasks", 30)
        await self.log("Breaking down into actionable tasks…")

        response = await self.llm_client.generate(
            prompt=f"Project request: {prompt}\n\nDecompose this into tasks. Return JSON only.",
            system=self.system_prompt,
        )

        await self.update_status(AgentStatus.WORKING, "Organising task plan", 70)

        plan = _extract_json(response)

        if plan and "tasks" in plan and isinstance(plan["tasks"], list) and len(plan["tasks"]) > 0:
            valid_agents = {"frontend_dev", "backend_dev", "devops", "qa_tester", "documentation"}
            for t in plan["tasks"]:
                if t.get("agent") not in valid_agents:
                    t["agent"] = "frontend_dev"
                if "id" not in t:
                    t["id"] = f"t{plan['tasks'].index(t) + 1}"
                if "dependencies" not in t:
                    t["dependencies"] = []
            await self.log(f"Parsed LLM plan with {len(plan['tasks'])} tasks")
        else:
            await self.log("LLM response could not be parsed as a task plan, using fallback", "warning")
            plan = self._fallback_plan(prompt)

        await self.log(f"Created plan with {len(plan.get('tasks', []))} tasks")
        return plan

    @staticmethod
    def _fallback_plan(prompt: str) -> dict:
        return {
            "project_name": "generated-project",
            "description": prompt,
            "tasks": [
                {"id": "t1", "title": "Design database schema", "description": f"Supabase tables for: {prompt}", "agent": "backend_dev", "dependencies": [], "priority": 1},
                {"id": "t2", "title": "Build main UI", "description": f"React components for: {prompt}", "agent": "frontend_dev", "dependencies": ["t1"], "priority": 2},
                {"id": "t3", "title": "Add CRUD operations", "description": f"Supabase CRUD logic for: {prompt}", "agent": "frontend_dev", "dependencies": ["t1"], "priority": 2},
                {"id": "t4", "title": "Create deployment config", "description": "Docker configuration", "agent": "devops", "dependencies": [], "priority": 1},
                {"id": "t5", "title": "Run tests", "description": "Validate generated code", "agent": "qa_tester", "dependencies": ["t2", "t3"], "priority": 3},
                {"id": "t6", "title": "Write documentation", "description": "Generate README", "agent": "documentation", "dependencies": ["t2", "t3", "t4"], "priority": 4},
            ],
        }


class FrontendDevAgent(BaseAgent):
    def __init__(self, llm_client, event_callback=None):
        super().__init__(
            "frontend_dev", "Frontend Developer", "UI & Client-Side",
            "Palette", "#10B981", llm_client, event_callback,
        )
        self.system_prompt = (
            "You are a Frontend Developer AI agent. Generate a React + TypeScript application.\n\n"
            "The project uses:\n"
            "- React 18 with TypeScript and JSX\n"
            "- Vite as the build tool (env vars: import.meta.env.VITE_*)\n"
            "- @supabase/supabase-js for backend (database, auth, storage)\n"
            "- Tailwind CSS via CDN (already in index.html) for styling\n"
            "- The Supabase client is at src/lib/supabase.ts (already exists, DO NOT regenerate it)\n\n"
            "CRITICAL RULES:\n"
            "1. Generate React components in src/components/ as .tsx files.\n"
            "2. Use the existing Supabase client: import { supabase } from '../lib/supabase'\n"
            "   supabase may be null when not configured — always check before use.\n"
            "3. For CRUD: supabase?.from('table').select() / .insert() / .update() / .delete()\n"
            "4. For each file use:\n===FILE: src/components/MyComponent.tsx===\ncode\n===END FILE===\n\n"
            "5. ALWAYS update src/App.tsx to import and render your components.\n"
            "6. Use Tailwind CSS classes for all styling (no separate CSS files).\n"
            "7. Include loading states, error handling, and empty states.\n"
            "8. Make the UI beautiful and modern.\n"
            "9. If Supabase is not configured, use localStorage as fallback instead of crashing.\n"
            "10. DO NOT regenerate these files (they already exist): index.html, src/main.tsx, "
            "src/lib/supabase.ts, vite.config.ts, tsconfig.json, package.json.\n"
            "11. Every component MUST import what it uses: import React, { useState, useEffect } from 'react'\n"
        )

    async def process(self, task: dict, context=None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 10)
        await self.log(f"Working on: {title}")
        await self.update_status(AgentStatus.WORKING, "Generating website", 30)
        await self.log("Generating HTML/CSS/JS…")

        response = await self.llm_client.generate(
            prompt=f"Task: {title}\nDetails: {desc}\n\nGenerate React components with Supabase integration. Use Tailwind CSS classes. Output complete .tsx files with proper imports. You MUST update src/App.tsx to import and use your components.",
            system=self.system_prompt,
        )
        await self.update_status(AgentStatus.WORKING, "Processing output", 80)
        files = self.parse_files(response)
        if not files:
            has_jsx = "export" in response and ("<" in response or "return" in response)
            if has_jsx:
                name = title.replace(" ", "").replace("-", "")[:20] or "Generated"
                files = [{"path": f"src/components/{name}.tsx", "content": response}]
            else:
                files = []
        await self.log(f"Generated {len(files)} file(s)")
        return {"files": files, "raw": response}


class BackendDevAgent(BaseAgent):
    def __init__(self, llm_client, event_callback=None):
        super().__init__(
            "backend_dev", "Backend Developer", "API & Server-Side",
            "Server", "#8B5CF6", llm_client, event_callback,
        )
        self.system_prompt = (
            "You are a Backend Developer AI agent. Generate Supabase database schemas and SQL migrations.\n\n"
            "The project uses Supabase (PostgreSQL) for the backend.\n\n"
            "RULES:\n"
            "1. Generate SQL migration files in supabase/migrations/ directory.\n"
            "2. Create tables with proper columns, types, and constraints.\n"
            "3. ALWAYS enable Row Level Security (RLS) on all tables.\n"
            "4. Create RLS policies that allow all operations (for development).\n"
            "5. Use gen_random_uuid() for UUID primary keys.\n"
            "6. Use TIMESTAMPTZ DEFAULT now() for timestamps.\n"
            "7. For each file use:\n===FILE: supabase/migrations/001_create_tables.sql===\ncode\n===END FILE===\n\n"
            "Example table:\n"
            "CREATE TABLE items (\n"
            "  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n"
            "  title TEXT NOT NULL,\n"
            "  created_at TIMESTAMPTZ DEFAULT now()\n"
            ");\n"
            "ALTER TABLE items ENABLE ROW LEVEL SECURITY;\n"
            "CREATE POLICY \"Allow all\" ON items FOR ALL USING (true);\n"
        )

    async def process(self, task: dict, context=None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 10)
        await self.log(f"Working on: {title}")
        await self.update_status(AgentStatus.WORKING, "Building server logic", 30)
        await self.log("Generating backend code…")

        response = await self.llm_client.generate(
            prompt=f"Task: {title}\nDetails: {desc}\n\nGenerate Supabase SQL migration files.",
            system=self.system_prompt,
        )
        await self.update_status(AgentStatus.WORKING, "Processing output", 80)
        files = self.parse_files(response, "supabase/migrations/")
        if not files:
            files = [{"path": "supabase/migrations/001_schema.sql", "content": response}]
        await self.log(f"Generated {len(files)} file(s)")
        return {"files": files, "raw": response}


class DevOpsAgent(BaseAgent):
    def __init__(self, llm_client, event_callback=None):
        super().__init__(
            "devops", "DevOps Engineer", "Infrastructure & Config",
            "Container", "#06B6D4", llm_client, event_callback,
        )
        self.system_prompt = (
            "You are a DevOps Engineer AI agent. Generate infrastructure files.\n\n"
            "For each file, use:\n===FILE: path/to/file.ext===\ncode\n===END FILE===\n\n"
            "Generate Dockerfiles, docker-compose, .env, and deployment configs."
        )

    async def process(self, task: dict, context=None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 10)
        await self.log(f"Working on: {title}")
        await self.update_status(AgentStatus.WORKING, "Generating configs", 40)
        await self.log("Creating infrastructure configs…")

        response = await self.llm_client.generate(
            prompt=f"Task: {title}\nDetails: {desc}\n\nGenerate DevOps files.",
            system=self.system_prompt,
        )
        await self.update_status(AgentStatus.WORKING, "Processing output", 80)
        files = self.parse_files(response)
        if not files:
            files = [{"path": "Dockerfile", "content": response}]
        await self.log(f"Generated {len(files)} config file(s)")
        return {"files": files, "raw": response}


class QATestingAgent(BaseAgent):
    def __init__(self, llm_client, event_callback=None):
        super().__init__(
            "qa_tester", "QA Tester", "Quality Assurance",
            "TestTube", "#F43F5E", llm_client, event_callback,
        )
        self.system_prompt = (
            "You are a QA Testing AI agent. Review code and identify issues.\n\n"
            "Check for: syntax errors, bugs, best practices, security issues.\n"
            "Generate test files using:\n===FILE: path===\ncode\n===END FILE===\n\n"
            "Also provide a summary of findings."
        )

    async def process(self, task: dict, context=None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 10)
        await self.log(f"Starting QA review: {title}")

        context_str = ""
        if context:
            for item in context:
                if isinstance(item, dict) and "files" in item:
                    for f in item["files"]:
                        context_str += f"\n--- {f['path']} ---\n{f.get('content', '')[:500]}\n"

        await self.update_status(AgentStatus.WORKING, "Reviewing code", 40)
        await self.log("Analysing code for issues…")

        prompt = f"Task: {title}\nDetails: {desc}\n"
        if context_str:
            prompt += f"\nCode to review:\n{context_str}"
        prompt += "\n\nReview and provide analysis with test files."

        response = await self.llm_client.generate(prompt=prompt, system=self.system_prompt)
        await self.update_status(AgentStatus.WORKING, "Compiling report", 80)
        files = self.parse_files(response, "tests/")
        await self.log(f"QA complete — {len(files)} test file(s)")
        return {"files": files, "report": response}


class DocumentationAgent(BaseAgent):
    def __init__(self, llm_client, event_callback=None):
        super().__init__(
            "documentation", "Documentation Writer", "Technical Writing",
            "FileText", "#3B82F6", llm_client, event_callback,
        )
        self.system_prompt = (
            "You are a Documentation Writer AI agent. Generate clear documentation.\n\n"
            "For each file, use:\n===FILE: path===\ncode\n===END FILE===\n\n"
            "Create README.md, SETUP.md with proper Markdown. Include code examples."
        )

    async def process(self, task: dict, context=None) -> dict:
        title = task.get("title", "")
        desc = task.get("description", "")
        await self.update_status(AgentStatus.WORKING, title, 10)
        await self.log(f"Working on: {title}")

        context_str = ""
        if context:
            for item in context:
                if isinstance(item, dict) and "files" in item:
                    for f in item["files"]:
                        context_str += f"\n- {f['path']}"

        await self.update_status(AgentStatus.WORKING, "Writing documentation", 40)
        await self.log("Generating project documentation…")

        prompt = f"Task: {title}\nDetails: {desc}\n"
        if context_str:
            prompt += f"\nProject files:{context_str}"
        prompt += "\n\nGenerate comprehensive documentation."

        response = await self.llm_client.generate(prompt=prompt, system=self.system_prompt)
        await self.update_status(AgentStatus.WORKING, "Finalising docs", 80)
        files = self.parse_files(response)
        if not files:
            files = [{"path": "README.md", "content": response}]
        await self.log(f"Generated {len(files)} doc file(s)")
        return {"files": files, "raw": response}

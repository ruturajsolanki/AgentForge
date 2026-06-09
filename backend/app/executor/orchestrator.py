"""Executor orchestrator — runs the agent fleet and writes artifacts to storage."""

from __future__ import annotations

import asyncio
import os
import re
import shutil
from datetime import datetime, timezone
from typing import Awaitable, Callable, Optional

from app.config import TEMPLATE_DIR, settings
from app.executor.agents import (
    BackendDevAgent,
    DevOpsAgent,
    DocumentationAgent,
    FrontendDevAgent,
    ProjectManagerAgent,
    QATestingAgent,
)
from app.executor.base_agent import BaseAgent
from app.schemas import AgentStatus, ExecutorTask
from app.storage import ArtifactStore, get_store

EventEmitter = Callable[[dict], Awaitable[None]]


class Orchestrator:
    """Drives the agent pipeline for a single demand."""

    _SKIP_COLLECT = {"node_modules", ".vite", "dist", ".git", "__pycache__", ".next", ".nuxt"}
    _PROTECTED_FILES = {
        "src/lib/supabase.ts",
        "src/main.tsx",
        "vite.config.ts",
        "tsconfig.json",
        "package.json",
        ".env",
    }

    def __init__(
        self,
        emit: Optional[EventEmitter] = None,
        store: Optional[ArtifactStore] = None,
    ) -> None:
        self.emit = emit or self._noop
        self.store = store or get_store()
        self.agents: dict[str, BaseAgent] = self._init_agents()

    def _init_agents(self) -> dict[str, BaseAgent]:
        return {
            "project_manager": ProjectManagerAgent(self.emit),
            "frontend_dev": FrontendDevAgent(self.emit),
            "backend_dev": BackendDevAgent(self.emit),
            "devops": DevOpsAgent(self.emit),
            "qa_tester": QATestingAgent(self.emit),
            "documentation": DocumentationAgent(self.emit),
        }

    @staticmethod
    async def _noop(_event: dict) -> None:
        return None

    def agents_state(self) -> list[dict]:
        return [a.state() for a in self.agents.values()]

    @property
    def _is_sequential(self) -> bool:
        """Browser LLM can only do one request at a time."""
        return settings.is_browser

    # ── Main entry ──────────────────────────────────────────────────────

    async def execute_project(
        self,
        project_id: str,
        prompt: str,
        tenant_id: str = "default",
        local_work_dir: Optional[str] = None,
    ) -> dict:
        """Run the full executor pipeline.

        Returns a summary dict the caller can persist + broadcast.
        `local_work_dir` is a scratch directory the orchestrator owns; artifacts
        are mirrored into the artifact store under tenant/project_id.
        """
        if local_work_dir is None:
            from app.config import PROJECTS_DIR  # late import — works in worker too
            local_work_dir = os.path.join(PROJECTS_DIR, project_id)
        os.makedirs(local_work_dir, exist_ok=True)

        await self.emit({
            "type": "project.started",
            "project_id": project_id,
            "tenant_id": tenant_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        self._seed_template(local_work_dir)

        try:
            plan = await self._run_pm(prompt)
        except Exception as exc:
            await self.agents["project_manager"].log(
                f"LLM error: {exc} — using fallback plan", "warning"
            )
            plan = ProjectManagerAgent._fallback_plan(prompt)

        tasks = plan.get("tasks", [])
        if self._is_sequential and len(tasks) > 6:
            await self.agents["project_manager"].log(
                f"Trimming {len(tasks)} tasks to 6 for browser LLM mode", "info"
            )
            tasks = tasks[:6]

        grouped: dict[str, list[dict]] = {}
        for t in tasks:
            grouped.setdefault(t.get("agent", ""), []).append(t)

        results: list[dict] = []

        # First pass: tasks with no dependencies
        first_pass = [(aid, [t for t in ts if not t.get("dependencies")])
                      for aid, ts in grouped.items() if aid in self.agents]
        first_pass = [item for item in first_pass if item[1]]
        if first_pass:
            results.extend(await self._run_batch(first_pass, local_work_dir, None))

        # Second pass: dependent tasks, with results from first pass as context
        second_pass = [(aid, [t for t in ts if t.get("dependencies")])
                       for aid, ts in grouped.items() if aid in self.agents]
        second_pass = [item for item in second_pass if item[1]]
        if second_pass:
            results.extend(await self._run_batch(second_pass, local_work_dir, results))

        # Always run QA + Docs at the end if not explicitly requested
        if "qa_tester" not in grouped:
            r = await self._run_agent("qa_tester",
                                      [{"title": "Review all code", "description": "Final QA"}],
                                      local_work_dir, results)
            if r:
                results.append(r)

        if "documentation" not in grouped:
            r = await self._run_agent("documentation",
                                      [{"title": "Generate documentation",
                                        "description": f"Write docs for: {prompt}"}],
                                      local_work_dir, results)
            if r:
                results.append(r)

        self._post_process(local_work_dir)

        files = self._collect_output_files(local_work_dir)
        artifacts_prefix = f"tenants/{tenant_id}/projects/{project_id}"
        await self.store.put_directory(local_work_dir, artifacts_prefix)

        summary = {
            "project_id": project_id,
            "tenant_id": tenant_id,
            "files": files,
            "artifacts_prefix": artifacts_prefix,
            "plan": plan,
            "agent_runs": results,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }

        await self.emit({
            "type": "project.completed",
            **summary,
            "timestamp": summary["completed_at"],
        })
        return summary

    # ── Agent helpers ───────────────────────────────────────────────────

    async def _run_pm(self, prompt: str) -> dict:
        return await self.agents["project_manager"].execute({
            "prompt": prompt,
            "title": "Analyse and decompose project",
        })

    async def _run_batch(
        self,
        items: list[tuple[str, list[dict]]],
        work_dir: str,
        context: Optional[list[dict]],
    ) -> list[dict]:
        if self._is_sequential:
            out: list[dict] = []
            for aid, ts in items:
                r = await self._run_agent(aid, ts, work_dir, context)
                if r:
                    out.append(r)
            return out
        sem = asyncio.Semaphore(max(1, settings.agent_concurrency))

        async def guarded(aid: str, ts: list[dict]) -> Optional[dict]:
            async with sem:
                return await self._run_agent(aid, ts, work_dir, context)

        coros = [guarded(aid, ts) for aid, ts in items]
        raw = await asyncio.gather(*coros, return_exceptions=True)
        return [r for r in raw if isinstance(r, dict)]

    async def _run_agent(
        self,
        agent_id: str,
        tasks: list[dict],
        work_dir: str,
        context: Optional[list[dict]],
    ) -> Optional[dict]:
        agent = self.agents[agent_id]
        files: list[dict] = []
        for task in tasks:
            try:
                result = await agent.execute(task, context=context)
            except Exception as exc:
                await agent.log(f"LLM error: {exc} — skipping task", "warning")
                continue
            if result and "files" in result:
                self._write_files(work_dir, result["files"])
                files.extend(result["files"])
        return {"agent_id": agent_id, "files": files}

    # ── Output handling ─────────────────────────────────────────────────

    def _write_files(self, work_dir: str, files: list[dict]) -> None:
        for f in files:
            path = f.get("path") or ""
            if path in self._PROTECTED_FILES:
                continue
            full = os.path.join(work_dir, path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w") as fh:
                fh.write(f.get("content", ""))

    def _seed_template(self, work_dir: str) -> None:
        if not os.path.isdir(TEMPLATE_DIR):
            return
        for root, dirs, files in os.walk(TEMPLATE_DIR):
            rel_root = os.path.relpath(root, TEMPLATE_DIR)
            dest_root = os.path.join(work_dir, rel_root) if rel_root != "." else work_dir
            os.makedirs(dest_root, exist_ok=True)
            for fname in files:
                src = os.path.join(root, fname)
                dst = os.path.join(dest_root, fname)
                if not os.path.exists(dst):
                    shutil.copy2(src, dst)
        env_path = os.path.join(work_dir, ".env")
        if os.path.isfile(env_path) and settings.supabase_url:
            with open(env_path, "w") as fh:
                fh.write(
                    f"VITE_SUPABASE_URL={settings.supabase_url.strip()}\n"
                    f"VITE_SUPABASE_ANON_KEY={(settings.supabase_anon_key or '').strip()}\n"
                )

    def _collect_output_files(self, work_dir: str) -> list[dict]:
        out: list[dict] = []
        for root, dirs, files in os.walk(work_dir):
            dirs[:] = [d for d in dirs if d not in self._SKIP_COLLECT]
            for fname in files:
                if fname.startswith(".") and fname != ".env":
                    continue
                full = os.path.join(root, fname)
                rel = os.path.relpath(full, work_dir)
                try:
                    with open(full, "r") as fh:
                        out.append({"path": rel, "content": fh.read()})
                except Exception:
                    out.append({"path": rel, "content": "[binary file]"})
        return out

    # ── Post-processing (port of AgentForge's safety nets) ──────────────

    def _post_process(self, work_dir: str) -> None:
        self._ensure_app_renders_components(work_dir)
        self._ensure_index_html(work_dir)
        self._ensure_supabase_lib(work_dir)

    def _ensure_app_renders_components(self, work_dir: str) -> None:
        app_path = os.path.join(work_dir, "src", "App.tsx")
        if not os.path.isfile(app_path):
            return
        with open(app_path) as fh:
            content = fh.read()
        has_real_content = any(
            tok in content
            for tok in ("useState", "useEffect", "fetch(", "supabase", "onClick")
        )
        if has_real_content:
            return
        comps_dir = os.path.join(work_dir, "src", "components")
        if not os.path.isdir(comps_dir):
            return
        components = sorted(
            f for f in os.listdir(comps_dir)
            if f.endswith(".tsx") and not f.startswith("_")
        )
        if not components:
            return
        imports = "\n".join(
            f'import {c.removesuffix(".tsx")} from "./components/{c.removesuffix(".tsx")}";'
            for c in components
        )
        renders = "\n".join(f"      <{c.removesuffix('.tsx')} />" for c in components)
        new_app = (
            f"{imports}\n\nexport default function App() {{\n"
            f'  return (\n    <div className="min-h-screen bg-gray-50">\n'
            f"{renders}\n    </div>\n  );\n}}\n"
        )
        with open(app_path, "w") as fh:
            fh.write(new_app)

    def _ensure_index_html(self, work_dir: str) -> None:
        html_path = os.path.join(work_dir, "index.html")
        if not os.path.isfile(html_path):
            return
        with open(html_path) as fh:
            content = fh.read()
        main_tsx = os.path.join(work_dir, "src", "main.tsx")
        main_jsx = os.path.join(work_dir, "src", "main.jsx")
        entry = (
            "/src/main.tsx" if os.path.isfile(main_tsx)
            else "/src/main.jsx" if os.path.isfile(main_jsx)
            else None
        )
        if not entry:
            return
        content = re.sub(
            r'<script[^>]*src=["\'][^"\']*main\.[jt]sx?["\'][^>]*>\s*</script>',
            f'<script type="module" src="{entry}"></script>',
            content,
        )
        if "tailwind" not in content:
            content = content.replace(
                "</head>",
                '  <script src="https://cdn.tailwindcss.com"></script>\n</head>',
            )
        with open(html_path, "w") as fh:
            fh.write(content)

    def _ensure_supabase_lib(self, work_dir: str) -> None:
        lib_path = os.path.join(work_dir, "src", "lib", "supabase.ts")
        if not os.path.isfile(lib_path):
            return
        with open(lib_path) as fh:
            content = fh.read()
        needs_fix = (
            "process.env" in content
            or ("export default" in content and "export {" not in content)
            or ("createClient(supabaseUrl, supabaseAnonKey)" in content and "if " not in content)
        )
        if not needs_fix:
            return
        template_path = os.path.join(TEMPLATE_DIR, "src", "lib", "supabase.ts")
        if os.path.isfile(template_path):
            shutil.copy2(template_path, lib_path)

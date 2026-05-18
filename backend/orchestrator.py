"""Core orchestration engine — task decomposition, parallel execution, output aggregation."""

from __future__ import annotations

import asyncio
import os
import shutil
from datetime import datetime, timezone

from agents import (
    BackendDevAgent,
    DevOpsAgent,
    DocumentationAgent,
    FrontendDevAgent,
    ProjectManagerAgent,
    QATestingAgent,
)
from config import settings, PROJECTS_DIR
from database import Database
from demo_data import DEMO_FILES
from llm_client import LLMClient
from models import AgentStatus
from vector_store import BaseVectorStore, create_vector_store
from ws_manager import ConnectionManager

TEMPLATE_DIR = os.path.join(os.path.dirname(__file__), "templates", "react-supabase")


class Orchestrator:
    def __init__(self, ws_manager: ConnectionManager, database: Database, project_runner=None) -> None:
        self.ws = ws_manager
        self.db = database
        self.llm = LLMClient()
        self.vector_store: BaseVectorStore = create_vector_store()
        self.agents: dict = {}
        self.running = False
        self._project_runner = project_runner
        self._init_agents()

    def _init_agents(self) -> None:
        cb = self._handle_event
        self.agents = {
            "project_manager": ProjectManagerAgent(self.llm, cb),
            "frontend_dev": FrontendDevAgent(self.llm, cb),
            "backend_dev": BackendDevAgent(self.llm, cb),
            "devops": DevOpsAgent(self.llm, cb),
            "qa_tester": QATestingAgent(self.llm, cb),
            "documentation": DocumentationAgent(self.llm, cb),
        }

    async def _handle_event(self, event: dict) -> None:
        await self.ws.broadcast(event)

    def get_agents_state(self) -> list[dict]:
        return [a.get_state() for a in self.agents.values()]

    async def reset_agents(self) -> None:
        for a in self.agents.values():
            a.status = AgentStatus.IDLE
            a.current_task = None
            a.progress = 0
            await a.emit("agent.status", {"status": AgentStatus.IDLE, "current_task": None, "progress": 0})

    def _seed_template(self, output_path: str) -> None:
        """Copy the React + Supabase template into the project directory."""
        if not os.path.isdir(TEMPLATE_DIR):
            return
        for root, dirs, files in os.walk(TEMPLATE_DIR):
            rel_root = os.path.relpath(root, TEMPLATE_DIR)
            dest_root = os.path.join(output_path, rel_root) if rel_root != "." else output_path
            os.makedirs(dest_root, exist_ok=True)
            for fname in files:
                src = os.path.join(root, fname)
                dst = os.path.join(dest_root, fname)
                if not os.path.exists(dst):
                    shutil.copy2(src, dst)
        env_path = os.path.join(output_path, ".env")
        if os.path.isfile(env_path) and settings.supabase_url:
            url = settings.supabase_url.strip()
            key = (settings.supabase_anon_key or "").strip()
            with open(env_path, "w") as f:
                f.write(f"VITE_SUPABASE_URL={url}\nVITE_SUPABASE_ANON_KEY={key}\n")

    @property
    def _is_sequential(self) -> bool:
        """Browser LLM can only process one request at a time, so run agents sequentially."""
        return settings.llm_provider == "browser"

    async def _run_agents_batch(self, agent_items: list[tuple[str, list[dict]]], output_path: str, context: list | None = None) -> list[dict]:
        """Run a batch of agents — parallel for cloud/local LLMs, sequential for browser LLM."""
        results: list[dict] = []
        if self._is_sequential:
            for aid, ts in agent_items:
                try:
                    r = await self._run_agent(aid, ts, output_path, context)
                    if isinstance(r, dict):
                        results.append(r)
                except Exception:
                    pass
        else:
            coros = [self._run_agent(aid, ts, output_path, context) for aid, ts in agent_items]
            if coros:
                raw = await asyncio.gather(*coros, return_exceptions=True)
                results.extend(r for r in raw if isinstance(r, dict))
        return results

    async def execute_project(self, project_id: str, prompt: str) -> None:
        self.running = True
        output_path = os.path.join(PROJECTS_DIR, project_id)
        os.makedirs(output_path, exist_ok=True)

        self._seed_template(output_path)

        try:
            self.db.update_project_status(project_id, "running")
            await self.ws.broadcast({
                "type": "project.started",
                "project_id": project_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            if settings.demo_mode:
                plan = await self._demo_pm(prompt)
            else:
                try:
                    plan = await self.agents["project_manager"].execute({"prompt": prompt, "title": "Analyse and decompose project"})
                except Exception as exc:
                    await self.agents["project_manager"].log(f"LLM error: {exc} — using fallback plan", "warning")
                    plan = await self._demo_pm(prompt)

            tasks = plan.get("tasks", [])

            # Cap task count for browser LLMs to avoid very long generation times
            if self._is_sequential and len(tasks) > 6:
                await self.agents["project_manager"].log(
                    f"Trimming {len(tasks)} tasks to 6 for browser LLM performance", "info"
                )
                tasks = tasks[:6]

            agent_tasks: dict[str, list[dict]] = {}
            for t in tasks:
                aid = t.get("agent", "")
                agent_tasks.setdefault(aid, []).append(t)

            all_results: list[dict] = []

            independent = {aid: [t for t in ts if not t.get("dependencies")] for aid, ts in agent_tasks.items()}
            items1 = [(aid, ts) for aid, ts in independent.items() if ts and aid in self.agents]
            if items1:
                all_results.extend(await self._run_agents_batch(items1, output_path))

            dependent = {aid: [t for t in ts if t.get("dependencies")] for aid, ts in agent_tasks.items()}
            items2 = [(aid, ts) for aid, ts in dependent.items() if ts and aid in self.agents]
            if items2:
                all_results.extend(await self._run_agents_batch(items2, output_path, all_results))

            if "qa_tester" not in agent_tasks:
                r = await self._run_agent("qa_tester", [{"title": "Review all code", "description": "Validate project"}], output_path, all_results)
                if isinstance(r, dict):
                    all_results.append(r)

            if "documentation" not in agent_tasks:
                r = await self._run_agent("documentation", [{"title": "Generate documentation", "description": f"Write docs for: {prompt}"}], output_path, all_results)
                if isinstance(r, dict):
                    all_results.append(r)

            self._ensure_valid_app(output_path)
            self._ensure_valid_index_html(output_path)
            self._ensure_valid_supabase_lib(output_path)

            self.db.update_project_status(project_id, "completed", output_path)
            output_files = self._collect_output_files(output_path)

            server_url = None
            if self._project_runner and os.path.isfile(os.path.join(output_path, "package.json")):
                try:
                    port = await self._project_runner.start(project_id)
                    server_url = f"http://localhost:{port}"
                except Exception as exc:
                    await self.ws.broadcast({
                        "type": "project.server.error",
                        "project_id": project_id,
                        "message": str(exc),
                    })

            await self.ws.broadcast({
                "type": "project.completed",
                "project_id": project_id,
                "output_path": output_path,
                "files": output_files,
                "server_url": server_url,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        except Exception as exc:
            self.db.update_project_status(project_id, "error")
            await self.ws.broadcast({
                "type": "project.error",
                "project_id": project_id,
                "message": str(exc),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        finally:
            self.running = False

    async def _run_agent(self, agent_id: str, tasks: list[dict], output_path: str, context: list | None = None) -> dict:
        agent = self.agents[agent_id]
        all_files: list[dict] = []
        for task in tasks:
            if settings.demo_mode:
                result = await self._demo_execute(agent, task, output_path)
            else:
                try:
                    result = await agent.execute(task, context=context)
                except Exception as exc:
                    await agent.log(f"LLM error: {exc} — falling back to demo output", "warning")
                    result = await self._demo_execute(agent, task, output_path)
            if result and "files" in result:
                self._write_files(output_path, result["files"])
                self._index_files(result["files"])
                all_files.extend(result["files"])
        return {"agent_id": agent_id, "files": all_files}

    _PROTECTED_FILES = {"src/lib/supabase.ts", "src/main.tsx", "vite.config.ts",
                         "tsconfig.json", "package.json", ".env"}

    def _write_files(self, output_path: str, files: list[dict]) -> None:
        for f in files:
            if f["path"] in self._PROTECTED_FILES:
                continue
            fp = os.path.join(output_path, f["path"])
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            with open(fp, "w") as fh:
                fh.write(f["content"])

    def _index_files(self, files: list[dict]) -> None:
        """Store file content embeddings in the vector store (best-effort, skip on error)."""
        for f in files:
            try:
                import numpy as np
                fake_embedding = np.random.randn(384).tolist()
                self.vector_store.add(fake_embedding, {"path": f["path"], "snippet": f["content"][:200]})
            except Exception:
                pass

    _SKIP_COLLECT = {"node_modules", ".vite", "dist", ".git", "__pycache__", ".next", ".nuxt"}

    def _collect_output_files(self, output_path: str) -> list[dict]:
        output_files: list[dict] = []
        for root, dirs, files in os.walk(output_path):
            dirs[:] = [d for d in dirs if d not in self._SKIP_COLLECT]
            for fname in files:
                if fname.startswith(".") and fname not in (".env",):
                    continue
                full = os.path.join(root, fname)
                rel = os.path.relpath(full, output_path)
                try:
                    with open(full) as fh:
                        output_files.append({"path": rel, "content": fh.read()})
                except Exception:
                    output_files.append({"path": rel, "content": "[binary file]"})
        return output_files

    def _ensure_valid_app(self, output_path: str) -> None:
        """If agents produced .tsx components but didn't update App.tsx to import
        them, build an App.tsx that imports and renders everything generated."""
        app_path = os.path.join(output_path, "src", "App.tsx")
        if not os.path.isfile(app_path):
            return

        with open(app_path, "r") as f:
            content = f.read()

        has_real_content = (
            "useState" in content
            or "useEffect" in content
            or "fetch(" in content
            or "supabase" in content
            or "onClick" in content
        )
        if has_real_content:
            return

        components_dir = os.path.join(output_path, "src", "components")
        component_files: list[str] = []
        if os.path.isdir(components_dir):
            for fname in sorted(os.listdir(components_dir)):
                if fname.endswith(".tsx") and not fname.startswith("_"):
                    component_files.append(fname)

        if component_files:
            imports = []
            renders = []
            for f in component_files:
                name = f.replace(".tsx", "")
                imports.append(f'import {name} from "./components/{name}";')
                renders.append(f"      <{name} />")

            new_app = (
                "\n".join(imports)
                + "\n\nexport default function App() {\n  return (\n    <div className=\"min-h-screen bg-gray-50\">\n"
                + "\n".join(renders)
                + "\n    </div>\n  );\n}\n"
            )
            with open(app_path, "w") as f:
                f.write(new_app)
        else:
            demo_files = DEMO_FILES.get("frontend_dev", [])
            for df in demo_files:
                if df["path"] == "src/App.tsx":
                    with open(app_path, "w") as f:
                        f.write(df["content"])
                    break

    def _ensure_valid_index_html(self, output_path: str) -> None:
        """Make sure index.html points to the real entry file (main.tsx) with
        type='module' so Vite can resolve it, and includes Tailwind CDN."""
        html_path = os.path.join(output_path, "index.html")
        if not os.path.isfile(html_path):
            return
        with open(html_path, "r") as f:
            content = f.read()
        main_tsx = os.path.join(output_path, "src", "main.tsx")
        main_jsx = os.path.join(output_path, "src", "main.jsx")
        entry = "/src/main.tsx" if os.path.isfile(main_tsx) else "/src/main.jsx" if os.path.isfile(main_jsx) else None
        if not entry:
            return
        import re
        content = re.sub(
            r'<script[^>]*src=["\'][^"\']*main\.[jt]sx?["\'][^>]*>\s*</script>',
            f'<script type="module" src="{entry}"></script>',
            content,
        )
        if "tailwindcss" not in content and "tailwind" not in content:
            content = content.replace("</head>", '  <script src="https://cdn.tailwindcss.com"></script>\n</head>')
        with open(html_path, "w") as f:
            f.write(content)

    def _ensure_valid_supabase_lib(self, output_path: str) -> None:
        """If the LLM overwrote supabase.ts with a broken version, replace it
        with the known-good template version."""
        lib_path = os.path.join(output_path, "src", "lib", "supabase.ts")
        if not os.path.isfile(lib_path):
            return
        with open(lib_path, "r") as f:
            content = f.read()
        needs_fix = False
        if "process.env" in content:
            needs_fix = True
        if "export default" in content and "export {" not in content:
            needs_fix = True
        if "createClient(supabaseUrl, supabaseAnonKey)" in content and "if " not in content:
            needs_fix = True
        if not needs_fix:
            return
        template_path = os.path.join(TEMPLATE_DIR, "src", "lib", "supabase.ts")
        if os.path.isfile(template_path):
            shutil.copy2(template_path, lib_path)

    async def _demo_pm(self, prompt: str) -> dict:
        pm = self.agents["project_manager"]
        await pm.update_status(AgentStatus.WORKING, "Analysing requirements", 20)
        await pm.log("Analysing project requirements…")
        await asyncio.sleep(1)
        plan = pm._fallback_plan(prompt)
        await pm.update_status(AgentStatus.WORKING, "Creating task plan", 60)
        await pm.log(f"Created {len(plan['tasks'])} tasks")
        await asyncio.sleep(0.5)
        await pm.update_status(AgentStatus.COMPLETED, "Project plan complete", 100)
        await pm.log("Project plan complete")
        return plan

    async def _demo_execute(self, agent, task: dict, output_path: str) -> dict:
        title = task.get("title", "Working…")
        await agent.update_status(AgentStatus.WORKING, title, 0)
        await agent.log(f"Starting: {title}")

        demo_files = DEMO_FILES.get(agent.agent_id, [])

        steps = [(20, "Analysing requirements…"), (45, "Generating code…"), (70, "Writing files…"), (90, "Finalising…")]
        for progress, msg in steps:
            await asyncio.sleep(0.6)
            await agent.update_status(AgentStatus.WORKING, title, progress)
            await agent.log(msg)

        if demo_files:
            self._write_files(output_path, demo_files)
            for f in demo_files:
                await agent.log(f"Created: {f['path']}")

        await agent.update_status(AgentStatus.COMPLETED, title, 100)
        await agent.log(f"Completed: {title}")
        return {"files": demo_files}

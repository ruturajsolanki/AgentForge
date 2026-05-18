"""Manages live Vite dev server subprocesses for generated projects."""

from __future__ import annotations

import asyncio
import os
import signal
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ws_manager import ConnectionManager

from config import PROJECTS_DIR

PORT_BASE = 3001
PORT_MAX = 3050


class _ProjectProcess:
    __slots__ = ("project_id", "port", "proc", "install_proc")

    def __init__(self, project_id: str, port: int) -> None:
        self.project_id = project_id
        self.port = port
        self.proc: asyncio.subprocess.Process | None = None
        self.install_proc: asyncio.subprocess.Process | None = None


class ProjectRunner:
    def __init__(self, ws: "ConnectionManager") -> None:
        self._ws = ws
        self._running: dict[str, _ProjectProcess] = {}
        self._used_ports: set[int] = set()

    def _allocate_port(self) -> int:
        for port in range(PORT_BASE, PORT_MAX + 1):
            if port not in self._used_ports:
                self._used_ports.add(port)
                return port
        raise RuntimeError("No available ports for dev server")

    def _release_port(self, port: int) -> None:
        self._used_ports.discard(port)

    def _project_dir(self, project_id: str) -> str:
        return os.path.join(PROJECTS_DIR, project_id)

    async def start(self, project_id: str) -> int:
        """Install deps and start Vite dev server. Returns the assigned port."""
        if project_id in self._running:
            await self.stop(project_id)

        pdir = self._project_dir(project_id)
        if not os.path.isfile(os.path.join(pdir, "package.json")):
            raise FileNotFoundError(f"No package.json in project {project_id}")

        port = self._allocate_port()
        pp = _ProjectProcess(project_id, port)

        await self._ws.broadcast({
            "type": "project.server.starting",
            "project_id": project_id,
            "port": port,
        })

        npm_cmd = "npm"
        node_modules = os.path.join(pdir, "node_modules")
        if not os.path.isdir(node_modules):
            await self._ws.broadcast({
                "type": "project.server.log",
                "project_id": project_id,
                "message": "Installing dependencies...",
            })
            pp.install_proc = await asyncio.create_subprocess_exec(
                npm_cmd, "install", "--no-audit", "--no-fund",
                cwd=pdir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            await pp.install_proc.wait()
            pp.install_proc = None

        pp.proc = await asyncio.create_subprocess_exec(
            "npx", "vite", "--port", str(port), "--host", "0.0.0.0", "--strictPort",
            cwd=pdir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        self._running[project_id] = pp

        asyncio.create_task(self._wait_for_ready(pp))

        return port

    async def _wait_for_ready(self, pp: _ProjectProcess) -> None:
        """Poll stdout for Vite's ready message, then broadcast."""
        if not pp.proc or not pp.proc.stdout:
            return
        ready_sent = False
        try:
            while True:
                line = await asyncio.wait_for(pp.proc.stdout.readline(), timeout=120)
                if not line:
                    break
                text = line.decode(errors="replace").strip()
                if not ready_sent and (
                    "Local:" in text
                    or "ready in" in text
                    or "localhost" in text.lower()
                    or "VITE" in text
                    or "port" in text.lower()
                ):
                    url = f"http://localhost:{pp.port}"
                    await self._ws.broadcast({
                        "type": "project.server.ready",
                        "project_id": pp.project_id,
                        "port": pp.port,
                        "url": url,
                    })
                    ready_sent = True
        except asyncio.TimeoutError:
            if not ready_sent:
                await self._ws.broadcast({
                    "type": "project.server.ready",
                    "project_id": pp.project_id,
                    "port": pp.port,
                    "url": f"http://localhost:{pp.port}",
                })

    async def stop(self, project_id: str) -> None:
        pp = self._running.pop(project_id, None)
        if not pp:
            return
        if pp.proc and pp.proc.returncode is None:
            try:
                pp.proc.terminate()
                await asyncio.wait_for(pp.proc.wait(), timeout=5)
            except (asyncio.TimeoutError, ProcessLookupError):
                try:
                    pp.proc.kill()
                except ProcessLookupError:
                    pass
        self._release_port(pp.port)
        await self._ws.broadcast({
            "type": "project.server.stopped",
            "project_id": project_id,
        })

    async def restart(self, project_id: str) -> int:
        await self.stop(project_id)
        return await self.start(project_id)

    def get_status(self, project_id: str) -> dict:
        pp = self._running.get(project_id)
        if not pp:
            return {"running": False, "port": None, "url": None}
        running = pp.proc is not None and pp.proc.returncode is None
        return {
            "running": running,
            "port": pp.port,
            "url": f"http://localhost:{pp.port}" if running else None,
        }

    async def stop_all(self) -> None:
        ids = list(self._running.keys())
        for pid in ids:
            await self.stop(pid)

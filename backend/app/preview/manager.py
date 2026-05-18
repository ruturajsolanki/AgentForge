"""Per-project live-preview manager.

Spawns a real Vite dev-server in a tempdir for each project so the IDE can
render a working preview in an iframe. Lifecycle:

1. ``start(public_id, prefix)`` — fetch all artifacts to a local tempdir,
   ``npm install`` (cached across runs), then ``npm run dev`` on a free port.
   Returns ``{running, url, port, phase}`` and emits progress phases over
   ``progress_cb`` so the UI can show "installing deps…" etc.
2. ``sync_file(public_id, rel_path, content)`` — write a single file into
   the tempdir; Vite's HMR picks it up automatically.
3. ``stop(public_id)`` — kill the process; keep ``node_modules`` so
   restarting is fast.

Each project's tempdir lives at ``~/.forgeos/previews/{public_id}/`` and is
reused across restarts to skip ``npm install`` on every boot.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import shutil
import signal
import socket
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Awaitable, Callable, Optional

from app.storage import get_store

logger = logging.getLogger(__name__)

PREVIEW_ROOT = Path(os.getenv("FORGEOS_PREVIEW_DIR", str(Path.home() / ".forgeos" / "previews")))
PORT_RANGE = (5300, 5500)
IDLE_TIMEOUT_SEC = int(os.getenv("FORGEOS_PREVIEW_IDLE_SEC", "900"))  # 15 min default


ProgressCallback = Callable[[str, dict], Awaitable[None]]


@dataclass
class PreviewProc:
    public_id: str
    workdir: Path
    port: int
    process: Optional[asyncio.subprocess.Process] = None
    url: Optional[str] = None
    phase: str = "idle"          # idle | fetching | installing | starting | ready | failed
    last_log: str = ""
    last_access: float = field(default_factory=time.time)
    starting_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    @property
    def running(self) -> bool:
        return self.process is not None and self.process.returncode is None


def _free_port() -> int:
    """Return a free TCP port within PORT_RANGE."""
    for port in range(*PORT_RANGE):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError("No free preview port available")


class PreviewManager:
    """Singleton orchestrating per-project Vite dev servers."""

    def __init__(self) -> None:
        self._procs: dict[str, PreviewProc] = {}
        self._global_lock = asyncio.Lock()
        PREVIEW_ROOT.mkdir(parents=True, exist_ok=True)
        self._janitor_task: Optional[asyncio.Task] = None

    # ── public API ─────────────────────────────────────────────────────

    def status(self, public_id: str) -> dict:
        proc = self._procs.get(public_id)
        if not proc:
            return {"running": False, "url": None, "phase": "idle"}
        proc.last_access = time.time()
        return {
            "running": proc.running,
            "url": proc.url if proc.running else None,
            "phase": proc.phase,
            "port": proc.port,
        }

    async def start(
        self,
        public_id: str,
        storage_prefix: str,
        progress_cb: Optional[ProgressCallback] = None,
    ) -> dict:
        """Start (or attach to) the preview for ``public_id``.

        Idempotent — if it's already running, returns immediately.
        If it's mid-startup, waits for the in-flight start to finish.
        """
        self._ensure_janitor()
        proc = self._procs.get(public_id)
        if not proc:
            workdir = PREVIEW_ROOT / public_id
            workdir.mkdir(parents=True, exist_ok=True)
            proc = PreviewProc(public_id=public_id, workdir=workdir, port=_free_port())
            self._procs[public_id] = proc

        async with proc.starting_lock:
            proc.last_access = time.time()
            if proc.running:
                return self.status(public_id)
            try:
                await self._fetch_artifacts(proc, storage_prefix, progress_cb)
                await self._npm_install(proc, progress_cb)
                await self._spawn_vite(proc, progress_cb)
            except Exception as exc:
                proc.phase = "failed"
                proc.last_log = str(exc)
                logger.exception("preview failed for %s", public_id)
                return {"running": False, "url": None, "phase": "failed", "error": str(exc)}
        return self.status(public_id)

    async def stop(self, public_id: str) -> dict:
        proc = self._procs.get(public_id)
        if not proc or not proc.process:
            return {"running": False}
        try:
            proc.process.send_signal(signal.SIGTERM)
            try:
                await asyncio.wait_for(proc.process.wait(), timeout=5)
            except asyncio.TimeoutError:
                proc.process.kill()
                await proc.process.wait()
        except ProcessLookupError:
            pass
        proc.process = None
        proc.url = None
        proc.phase = "idle"
        return {"running": False}

    async def restart(
        self,
        public_id: str,
        storage_prefix: str,
        progress_cb: Optional[ProgressCallback] = None,
    ) -> dict:
        await self.stop(public_id)
        return await self.start(public_id, storage_prefix, progress_cb)

    async def sync_file(self, public_id: str, rel_path: str, data: bytes) -> bool:
        """Mirror a file edit from S3 into the live preview workdir so HMR
        picks it up. Returns True if synced, False if no preview is running."""
        proc = self._procs.get(public_id)
        if not proc:
            return False
        target = proc.workdir / rel_path
        if ".." in str(rel_path):
            return False
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return True

    # ── internal helpers ────────────────────────────────────────────────

    async def _fetch_artifacts(
        self, proc: PreviewProc, storage_prefix: str, cb: Optional[ProgressCallback]
    ) -> None:
        proc.phase = "fetching"
        if cb:
            await cb("fetching", {"message": "Pulling project files from object store"})
        store = get_store()
        prefix = storage_prefix.rstrip("/") + "/"
        keys = await store.list_objects(prefix.rstrip("/"))
        n = 0
        for key in keys:
            if not key.startswith(prefix):
                continue
            rel = key[len(prefix):]
            if not rel or rel.endswith("/"):
                continue
            data = await store.get_object(key)
            target = proc.workdir / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            n += 1
        proc.last_log = f"fetched {n} files"
        logger.info("preview %s: fetched %d files into %s", proc.public_id, n, proc.workdir)

    async def _npm_install(self, proc: PreviewProc, cb: Optional[ProgressCallback]) -> None:
        node_modules = proc.workdir / "node_modules"
        pkg = proc.workdir / "package.json"
        if not pkg.exists():
            raise RuntimeError("package.json missing — cannot start preview")
        # Skip install if node_modules already populated for this exact lockfile.
        marker = node_modules / ".forgeos.installed"
        if marker.exists():
            proc.phase = "installing"
            if cb:
                await cb("installing", {"message": "Dependencies already installed (cached)"})
            return
        proc.phase = "installing"
        if cb:
            await cb("installing", {"message": "Installing npm dependencies (first run may take ~60s)"})
        env = os.environ.copy()
        env["CI"] = "1"
        proc_install = await asyncio.create_subprocess_exec(
            "npm", "install", "--prefer-offline", "--no-audit", "--no-fund", "--loglevel=error",
            cwd=str(proc.workdir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=env,
        )
        stdout, _ = await proc_install.communicate()
        if proc_install.returncode != 0:
            tail = (stdout.decode("utf-8", errors="ignore") or "")[-800:]
            raise RuntimeError(f"npm install failed (exit {proc_install.returncode}):\n{tail}")
        marker.touch()

    async def _spawn_vite(self, proc: PreviewProc, cb: Optional[ProgressCallback]) -> None:
        proc.phase = "starting"
        if cb:
            await cb("starting", {"message": f"Booting Vite dev server on :{proc.port}"})

        cmd = [
            "npx", "--no-install", "vite",
            "--host", "127.0.0.1",
            "--port", str(proc.port),
            "--strictPort",
        ]
        proc.process = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=str(proc.workdir),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            env=os.environ.copy(),
        )

        # Read stdout until we see "Local:   http://..." or process dies.
        url_pattern = re.compile(r"Local:\s+(http://[^\s]+)")
        async def _reader() -> Optional[str]:
            assert proc.process is not None
            while True:
                assert proc.process.stdout is not None
                line = await proc.process.stdout.readline()
                if not line:
                    return None
                decoded = line.decode("utf-8", errors="ignore").rstrip()
                proc.last_log = decoded
                m = url_pattern.search(decoded)
                if m:
                    return m.group(1)

        try:
            url = await asyncio.wait_for(_reader(), timeout=45)
        except asyncio.TimeoutError:
            await self.stop(proc.public_id)
            raise RuntimeError("Vite did not become ready in 45s")
        if not url:
            raise RuntimeError(f"Vite exited before reporting URL: {proc.last_log}")

        proc.url = url.rstrip("/")
        proc.phase = "ready"
        if cb:
            await cb("ready", {"message": "Preview is live", "url": proc.url})
        # Drain remaining stdout in the background to stop the buffer filling up.
        asyncio.create_task(self._drain(proc))

    async def _drain(self, proc: PreviewProc) -> None:
        if not proc.process or not proc.process.stdout:
            return
        try:
            while proc.process and proc.process.returncode is None:
                line = await proc.process.stdout.readline()
                if not line:
                    break
                proc.last_log = line.decode("utf-8", errors="ignore").rstrip()
        except Exception:
            pass

    # ── Janitor — auto-stop idle previews ───────────────────────────────

    def _ensure_janitor(self) -> None:
        if self._janitor_task and not self._janitor_task.done():
            return
        loop = asyncio.get_running_loop()
        self._janitor_task = loop.create_task(self._janitor_loop())

    async def _janitor_loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            now = time.time()
            for pid, proc in list(self._procs.items()):
                if proc.running and (now - proc.last_access) > IDLE_TIMEOUT_SEC:
                    logger.info("preview %s idle for %ds — stopping", pid, IDLE_TIMEOUT_SEC)
                    try:
                        await self.stop(pid)
                    except Exception:
                        logger.exception("idle stop failed")


preview_manager = PreviewManager()

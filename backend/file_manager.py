"""File CRUD operations for project directories with WebSocket broadcast."""

from __future__ import annotations

import os
import shutil
from typing import Any

from config import PROJECTS_DIR
from ws_manager import ConnectionManager


class FileManager:
    def __init__(self, ws: ConnectionManager) -> None:
        self._ws = ws

    def _project_dir(self, project_id: str) -> str:
        d = os.path.join(PROJECTS_DIR, project_id)
        os.makedirs(d, exist_ok=True)
        return d

    def _safe_path(self, project_id: str, rel_path: str) -> str:
        base = self._project_dir(project_id)
        full = os.path.normpath(os.path.join(base, rel_path))
        if not full.startswith(os.path.normpath(base)):
            raise ValueError("Path traversal denied")
        return full

    def list_tree(self, project_id: str) -> list[dict]:
        base = self._project_dir(project_id)
        return self._walk(base, base)

    _SKIP_DIRS = {"node_modules", ".vite", "dist", ".git", "__pycache__", ".next", ".nuxt"}

    def _walk(self, root: str, base: str) -> list[dict]:
        entries: list[dict] = []
        if not os.path.isdir(root):
            return entries
        for name in sorted(os.listdir(root)):
            if name in self._SKIP_DIRS:
                continue
            full = os.path.join(root, name)
            rel = os.path.relpath(full, base)
            if os.path.isdir(full):
                entries.append({"name": name, "path": rel, "type": "directory", "children": self._walk(full, base)})
            else:
                try:
                    size = os.path.getsize(full)
                except OSError:
                    size = 0
                entries.append({"name": name, "path": rel, "type": "file", "size": size})
        return entries

    def read_file(self, project_id: str, rel_path: str) -> str:
        full = self._safe_path(project_id, rel_path)
        if not os.path.isfile(full):
            raise FileNotFoundError(f"File not found: {rel_path}")
        with open(full, "r", errors="replace") as f:
            return f.read()

    async def write_file(self, project_id: str, rel_path: str, content: str) -> None:
        full = self._safe_path(project_id, rel_path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        is_new = not os.path.exists(full)
        with open(full, "w") as f:
            f.write(content)
        event_type = "file.created" if is_new else "file.updated"
        await self._ws.broadcast({
            "type": event_type,
            "project_id": project_id,
            "path": rel_path,
        })

    async def delete_file(self, project_id: str, rel_path: str) -> None:
        full = self._safe_path(project_id, rel_path)
        if os.path.isdir(full):
            shutil.rmtree(full)
        elif os.path.isfile(full):
            os.remove(full)
        else:
            raise FileNotFoundError(f"Not found: {rel_path}")
        await self._ws.broadcast({
            "type": "file.deleted",
            "project_id": project_id,
            "path": rel_path,
        })

    async def rename_file(self, project_id: str, old_path: str, new_path: str) -> None:
        old_full = self._safe_path(project_id, old_path)
        new_full = self._safe_path(project_id, new_path)
        if not os.path.exists(old_full):
            raise FileNotFoundError(f"Not found: {old_path}")
        os.makedirs(os.path.dirname(new_full), exist_ok=True)
        shutil.move(old_full, new_full)
        await self._ws.broadcast({
            "type": "file.renamed",
            "project_id": project_id,
            "old_path": old_path,
            "new_path": new_path,
        })

    async def create_directory(self, project_id: str, rel_path: str) -> None:
        full = self._safe_path(project_id, rel_path)
        os.makedirs(full, exist_ok=True)
        await self._ws.broadcast({
            "type": "file.created",
            "project_id": project_id,
            "path": rel_path,
            "is_directory": True,
        })

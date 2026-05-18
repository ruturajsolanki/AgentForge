"""Local-filesystem backed `ArtifactStore` — used in dev / single-node mode."""

from __future__ import annotations

import os
import shutil
from typing import Optional

from app.config import PROJECTS_DIR
from app.storage.base import ArtifactStore


_SKIP = {"node_modules", ".vite", "dist", ".git", "__pycache__", ".next", ".nuxt"}


class LocalArtifactStore(ArtifactStore):
    def __init__(self, root: Optional[str] = None) -> None:
        self.root = root or os.path.join(PROJECTS_DIR, "_artifacts")
        os.makedirs(self.root, exist_ok=True)

    def _full(self, key: str) -> str:
        safe = key.lstrip("/")
        return os.path.join(self.root, safe)

    async def put_object(self, key: str, data: bytes, content_type: Optional[str] = None) -> str:
        full = self._full(key)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as fh:
            fh.write(data)
        return key

    async def get_object(self, key: str) -> bytes:
        full = self._full(key)
        if not os.path.isfile(full):
            raise FileNotFoundError(key)
        with open(full, "rb") as fh:
            return fh.read()

    async def delete_object(self, key: str) -> None:
        full = self._full(key)
        if os.path.isfile(full):
            os.remove(full)

    async def list_objects(self, prefix: str) -> list[str]:
        base = self._full(prefix)
        if not os.path.isdir(base):
            return []
        out: list[str] = []
        for root, _dirs, files in os.walk(base):
            for f in files:
                full = os.path.join(root, f)
                rel = os.path.relpath(full, self.root)
                out.append(rel.replace(os.sep, "/"))
        return out

    async def put_directory(self, local_dir: str, key_prefix: str) -> int:
        count = 0
        for root, dirs, files in os.walk(local_dir):
            dirs[:] = [d for d in dirs if d not in _SKIP]
            for f in files:
                src = os.path.join(root, f)
                rel = os.path.relpath(src, local_dir)
                key = f"{key_prefix.rstrip('/')}/{rel.replace(os.sep, '/')}"
                with open(src, "rb") as fh:
                    await self.put_object(key, fh.read())
                count += 1
        return count

    async def fetch_directory(self, key_prefix: str, local_dir: str) -> None:
        base = self._full(key_prefix)
        if not os.path.isdir(base):
            return
        os.makedirs(local_dir, exist_ok=True)
        for root, _dirs, files in os.walk(base):
            for f in files:
                src = os.path.join(root, f)
                rel = os.path.relpath(src, base)
                dst = os.path.join(local_dir, rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                shutil.copy2(src, dst)

    async def signed_url(self, key: str, expires_seconds: int = 300) -> str:
        # Dev mode: route via the gateway's /artifacts/* endpoint.
        return f"/artifacts/{key}"

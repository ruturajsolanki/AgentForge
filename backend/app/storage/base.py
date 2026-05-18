"""Abstract artifact-store interface."""

from __future__ import annotations

import abc
from typing import AsyncIterator, Optional


class ArtifactStore(abc.ABC):
    @abc.abstractmethod
    async def put_object(self, key: str, data: bytes, content_type: Optional[str] = None) -> str:
        """Upload `data`. Return the canonical storage key."""

    @abc.abstractmethod
    async def get_object(self, key: str) -> bytes: ...

    @abc.abstractmethod
    async def delete_object(self, key: str) -> None: ...

    @abc.abstractmethod
    async def list_objects(self, prefix: str) -> list[str]: ...

    @abc.abstractmethod
    async def put_directory(self, local_dir: str, key_prefix: str) -> int:
        """Recursively upload local_dir into the store under key_prefix.
        Returns the number of files uploaded. Skips common build artifacts."""

    @abc.abstractmethod
    async def fetch_directory(self, key_prefix: str, local_dir: str) -> None:
        """Download `key_prefix` back into local_dir for live preview / worker runs."""

    @abc.abstractmethod
    async def signed_url(self, key: str, expires_seconds: int = 300) -> str:
        """Pre-signed URL for direct browser download (S3) or local proxy URL (dev)."""

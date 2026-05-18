"""Pick the right `ArtifactStore` based on env."""

from __future__ import annotations

import os

from app.storage.base import ArtifactStore
from app.storage.local import LocalArtifactStore


def get_store() -> ArtifactStore:
    backend = os.getenv("FORGEOS_STORAGE", "local").lower()
    if backend == "s3":
        # Lazy import so dev environments don't need aioboto3.
        from app.storage.s3 import S3ArtifactStore

        return S3ArtifactStore()
    return LocalArtifactStore()

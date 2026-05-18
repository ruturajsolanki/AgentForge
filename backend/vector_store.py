"""Vector store with Google ScaNN primary backend and numpy cosine-similarity fallback."""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod

import numpy as np

from config import EMBEDDING_DIM, PROJECTS_DIR, VECTOR_BACKEND


class BaseVectorStore(ABC):
    @abstractmethod
    def add(self, embedding: list[float], metadata: dict) -> None: ...

    @abstractmethod
    def search(self, query_embedding: list[float], k: int = 5) -> list[dict]: ...

    @abstractmethod
    def clear(self) -> None: ...


class NumpyStore(BaseVectorStore):
    """Brute-force cosine-similarity search over an in-memory matrix."""

    def __init__(self) -> None:
        self._vectors: list[np.ndarray] = []
        self._metadata: list[dict] = []

    def add(self, embedding: list[float], metadata: dict) -> None:
        self._vectors.append(np.asarray(embedding, dtype=np.float32))
        self._metadata.append(metadata)

    def search(self, query_embedding: list[float], k: int = 5) -> list[dict]:
        if not self._vectors:
            return []
        q = np.asarray(query_embedding, dtype=np.float32)
        q_norm = q / (np.linalg.norm(q) + 1e-10)
        mat = np.stack(self._vectors)
        norms = np.linalg.norm(mat, axis=1, keepdims=True) + 1e-10
        mat_norm = mat / norms
        scores = mat_norm @ q_norm
        top_k = min(k, len(scores))
        indices = np.argpartition(-scores, top_k)[:top_k]
        indices = indices[np.argsort(-scores[indices])]
        return [
            {**self._metadata[i], "score": float(scores[i])}
            for i in indices
        ]

    def clear(self) -> None:
        self._vectors.clear()
        self._metadata.clear()


class ScaNNStore(BaseVectorStore):
    """ANN search via Google ScaNN. Falls back to NumpyStore if ScaNN import fails."""

    def __init__(self) -> None:
        self._pending_vectors: list[np.ndarray] = []
        self._metadata: list[dict] = []
        self._searcher = None
        self._dirty = True

    def add(self, embedding: list[float], metadata: dict) -> None:
        self._pending_vectors.append(np.asarray(embedding, dtype=np.float32))
        self._metadata.append(metadata)
        self._dirty = True

    def _rebuild(self) -> None:
        import scann  # type: ignore

        if not self._pending_vectors:
            return
        dataset = np.stack(self._pending_vectors)
        n = len(dataset)
        num_leaves = max(1, int(n**0.5))
        self._searcher = (
            scann.scann_ops_pybind.builder(dataset, 10, "dot_product")
            .tree(num_leaves=num_leaves, num_leaves_to_search=min(num_leaves, 10))
            .score_ah(2)
            .reorder(min(100, n))
            .build()
        )
        self._dirty = False

    def search(self, query_embedding: list[float], k: int = 5) -> list[dict]:
        if not self._pending_vectors:
            return []
        if self._dirty:
            self._rebuild()
        q = np.asarray(query_embedding, dtype=np.float32)
        indices, _ = self._searcher.search(q, final_num_neighbors=min(k, len(self._pending_vectors)))
        return [self._metadata[i] for i in indices if i < len(self._metadata)]

    def clear(self) -> None:
        self._pending_vectors.clear()
        self._metadata.clear()
        self._searcher = None
        self._dirty = True


def create_vector_store() -> BaseVectorStore:
    if VECTOR_BACKEND == "scann":
        try:
            import scann  # type: ignore  # noqa: F401
            return ScaNNStore()
        except ImportError:
            print("[vector_store] ScaNN not available, falling back to numpy")
    return NumpyStore()

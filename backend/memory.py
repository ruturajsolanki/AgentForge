"""Cross-session memory engine: file indexing, context retrieval, user preferences."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from database import Database
    from vector_store import BaseVectorStore
    from llm_client import LLMClient


def _chunk_text(text: str, max_chars: int = 500) -> list[str]:
    lines = text.split("\n")
    chunks: list[str] = []
    buf: list[str] = []
    buf_len = 0
    for line in lines:
        if buf_len + len(line) > max_chars and buf:
            chunks.append("\n".join(buf))
            buf = []
            buf_len = 0
        buf.append(line)
        buf_len += len(line) + 1
    if buf:
        chunks.append("\n".join(buf))
    return chunks


class MemoryEngine:
    def __init__(self, db: "Database", vector_store: "BaseVectorStore", llm: "LLMClient") -> None:
        self.db = db
        self.vs = vector_store
        self.llm = llm
        self._tfidf = None

    async def index_file(self, project_id: str, path: str, content: str) -> None:
        """Index file content as vector embeddings (or TF-IDF fallback)."""
        chunks = _chunk_text(content)
        for i, chunk in enumerate(chunks):
            try:
                embedding = await self.llm.embed(chunk)
                if embedding and len(embedding) > 10:
                    self.vs.add(embedding, {
                        "project_id": project_id,
                        "path": path,
                        "chunk_index": i,
                        "snippet": chunk[:200],
                        "full_chunk": chunk,
                    })
                    continue
            except Exception:
                pass
            self._tfidf_index(project_id, path, i, chunk)

    def _tfidf_index(self, project_id: str, path: str, chunk_index: int, chunk: str) -> None:
        """Fallback: store chunk with a simple hashed embedding for keyword matching."""
        import numpy as np
        words = set(re.findall(r'\w+', chunk.lower()))
        vec = np.zeros(384, dtype=np.float32)
        for w in words:
            idx = hash(w) % 384
            vec[idx] += 1.0
        norm = float(np.linalg.norm(vec))
        if norm > 0:
            vec = vec / norm
        self.vs.add(vec.tolist(), {
            "project_id": project_id,
            "path": path,
            "chunk_index": chunk_index,
            "snippet": chunk[:200],
            "full_chunk": chunk,
        })

    async def get_relevant_context(
        self, project_id: str, query: str, k: int = 5
    ) -> dict:
        """Build context dict with relevant file chunks, recent conversation, and user prefs."""
        file_chunks: list[dict] = []
        try:
            embedding = await self.llm.embed(query)
            if embedding and len(embedding) > 10:
                results = self.vs.search(embedding, k=k * 2)
            else:
                results = self._tfidf_search(query, k * 2)
        except Exception:
            results = self._tfidf_search(query, k * 2)

        seen_paths: set[str] = set()
        for r in results:
            if r.get("project_id") != project_id:
                continue
            path = r.get("path", "")
            chunk_key = f"{path}:{r.get('chunk_index', 0)}"
            if chunk_key in seen_paths:
                continue
            seen_paths.add(chunk_key)
            file_chunks.append({
                "path": path,
                "content": r.get("full_chunk", r.get("snippet", "")),
            })
            if len(file_chunks) >= k:
                break

        conversation = self.db.get_conversation(project_id, limit=20)
        memories = self.db.get_memories()

        return {
            "file_chunks": file_chunks,
            "conversation": conversation,
            "user_memories": memories,
        }

    def _tfidf_search(self, query: str, k: int) -> list[dict]:
        """Fallback search using hashed word vectors."""
        import numpy as np
        words = set(re.findall(r'\w+', query.lower()))
        vec = np.zeros(384, dtype=np.float32)
        for w in words:
            idx = hash(w) % 384
            vec[idx] += 1.0
        norm = float(np.linalg.norm(vec))
        if norm > 0:
            vec = vec / norm
        return self.vs.search(vec.tolist(), k=k)

    async def extract_and_store_preferences(self, assistant_response: str) -> None:
        """Best-effort: look for preference hints the AI mentions about the user."""
        patterns = [
            (r"(?:you |user )(?:prefer|like|want)s?\s+(.+?)(?:\.|$)", "preference"),
            (r"(?:your|user's)\s+(?:coding\s+)?style\s+(?:is|seems)\s+(.+?)(?:\.|$)", "style"),
        ]
        for pattern, category in patterns:
            matches = re.findall(pattern, assistant_response, re.IGNORECASE)
            for match in matches[:3]:
                clean = match.strip()
                if 5 < len(clean) < 200:
                    self.db.upsert_memory(category, clean[:50], clean)

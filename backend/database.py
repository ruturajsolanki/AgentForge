from __future__ import annotations

import os
import sqlite3

from config import DATABASE_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    prompt        TEXT NOT NULL,
    status        TEXT DEFAULT 'pending',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at  TIMESTAMP,
    output_path   TEXT
);
CREATE TABLE IF NOT EXISTS tasks (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL,
    agent_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    description   TEXT,
    status        TEXT DEFAULT 'pending',
    output        TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at  TIMESTAMP
);
CREATE TABLE IF NOT EXISTS agent_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    TEXT NOT NULL,
    agent_id      TEXT NOT NULL,
    level         TEXT DEFAULT 'info',
    message       TEXT NOT NULL,
    timestamp     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS conversations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    TEXT NOT NULL,
    role          TEXT NOT NULL,
    content       TEXT NOT NULL,
    file_edits    TEXT,
    timestamp     DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_memory (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    category      TEXT NOT NULL,
    key           TEXT NOT NULL,
    value         TEXT NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""


class Database:
    def __init__(self, path: str | None = None) -> None:
        self.path = path or DATABASE_PATH
        os.makedirs(os.path.dirname(os.path.abspath(self.path)), exist_ok=True)
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def create_project(self, project_id: str, prompt: str) -> None:
        with self._conn() as c:
            c.execute("INSERT INTO projects (id, prompt) VALUES (?, ?)", (project_id, prompt))

    def update_project_status(self, pid: str, status: str, output_path: str | None = None) -> None:
        with self._conn() as c:
            if output_path:
                c.execute(
                    "UPDATE projects SET status=?, output_path=?, completed_at=CURRENT_TIMESTAMP WHERE id=?",
                    (status, output_path, pid),
                )
            else:
                c.execute("UPDATE projects SET status=? WHERE id=?", (status, pid))

    def get_project(self, pid: str) -> dict | None:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            row = c.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
            return dict(row) if row else None

    def list_projects(self) -> list[dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            return [dict(r) for r in c.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()]

    def add_log(self, project_id: str, agent_id: str, level: str, message: str) -> None:
        with self._conn() as c:
            c.execute(
                "INSERT INTO agent_logs (project_id, agent_id, level, message) VALUES (?,?,?,?)",
                (project_id, agent_id, level, message),
            )

    def get_logs(self, project_id: str) -> list[dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            return [
                dict(r)
                for r in c.execute(
                    "SELECT * FROM agent_logs WHERE project_id=? ORDER BY timestamp", (project_id,)
                ).fetchall()
            ]

    # ── Conversation methods ─────────────────────────────

    def add_message(self, project_id: str, role: str, content: str, file_edits: str | None = None) -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO conversations (project_id, role, content, file_edits) VALUES (?,?,?,?)",
                (project_id, role, content, file_edits),
            )
            return cur.lastrowid or 0

    def get_conversation(self, project_id: str, limit: int = 50) -> list[dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            rows = c.execute(
                "SELECT * FROM conversations WHERE project_id=? ORDER BY timestamp DESC LIMIT ?",
                (project_id, limit),
            ).fetchall()
            return [dict(r) for r in reversed(rows)]

    # ── User memory methods ──────────────────────────────

    def add_memory(self, category: str, key: str, value: str) -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO user_memory (category, key, value) VALUES (?,?,?)",
                (category, key, value),
            )
            return cur.lastrowid or 0

    def get_memories(self, category: str | None = None) -> list[dict]:
        with self._conn() as c:
            c.row_factory = sqlite3.Row
            if category:
                rows = c.execute(
                    "SELECT * FROM user_memory WHERE category=? ORDER BY updated_at DESC", (category,)
                ).fetchall()
            else:
                rows = c.execute("SELECT * FROM user_memory ORDER BY updated_at DESC").fetchall()
            return [dict(r) for r in rows]

    def update_memory(self, memory_id: int, value: str) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE user_memory SET value=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (value, memory_id),
            )

    def upsert_memory(self, category: str, key: str, value: str) -> None:
        with self._conn() as c:
            existing = c.execute(
                "SELECT id FROM user_memory WHERE category=? AND key=?", (category, key)
            ).fetchone()
            if existing:
                c.execute(
                    "UPDATE user_memory SET value=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                    (value, existing[0]),
                )
            else:
                c.execute(
                    "INSERT INTO user_memory (category, key, value) VALUES (?,?,?)",
                    (category, key, value),
                )

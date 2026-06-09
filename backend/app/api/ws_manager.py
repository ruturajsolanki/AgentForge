"""WebSocket connection manager. Per-tenant client lists so we can fan out
Redis events to the right browser session."""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, set[WebSocket]] = defaultdict(set)
        self.lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, tenant_id: str) -> None:
        await ws.accept()
        async with self.lock:
            self.active[tenant_id].add(ws)

    async def disconnect(self, ws: WebSocket, tenant_id: str) -> None:
        async with self.lock:
            self.active[tenant_id].discard(ws)

    async def broadcast(self, tenant_id: str, payload: dict) -> None:
        async with self.lock:
            sockets = list(self.active.get(tenant_id, ()))
        await self._send_many(sockets, payload)

    async def broadcast_all(self, payload: dict) -> None:
        async with self.lock:
            sockets = self.all_connections
        await self._send_many(sockets, payload)

    async def _send_many(self, sockets: list[WebSocket], payload: dict) -> None:
        for ws in sockets:
            try:
                await ws.send_json(payload)
            except Exception as exc:
                logger.debug("ws send failed: %s", exc)

    @property
    def all_connections(self) -> list[WebSocket]:
        out: list[WebSocket] = []
        for s in self.active.values():
            out.extend(s)
        return out

    @property
    def active_connections(self) -> list[WebSocket]:
        return self.all_connections  # convenience alias for bridge compatibility

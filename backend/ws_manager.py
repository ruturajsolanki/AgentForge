from __future__ import annotations

import asyncio
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.active_connections.append(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            if ws in self.active_connections:
                self.active_connections.remove(ws)

    async def broadcast(self, event: dict) -> None:
        async with self._lock:
            snapshot = list(self.active_connections)
        for conn in snapshot:
            try:
                await conn.send_json(event)
            except Exception:
                await self.disconnect(conn)

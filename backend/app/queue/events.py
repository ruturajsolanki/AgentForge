"""Redis pub/sub channel that ties workers -> gateway -> WebSocket clients.

The gateway listens on `forgeos:events:{tenant_id}` and forwards every event
to every connected WebSocket for that tenant. The worker publishes via
`EventBus.emit`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator, Optional

import redis.asyncio as aioredis

from app.config import REDIS_URL

logger = logging.getLogger(__name__)

CHANNEL_PREFIX = "forgeos:events"


class EventBus:
    def __init__(self, url: str = REDIS_URL) -> None:
        self.url = url
        self._client: Optional[aioredis.Redis] = None

    async def _conn(self) -> aioredis.Redis:
        if self._client is None:
            self._client = aioredis.from_url(self.url, decode_responses=True)
        return self._client

    @staticmethod
    def channel(tenant_id: str) -> str:
        return f"{CHANNEL_PREFIX}:{tenant_id}"

    async def emit(self, tenant_id: str, event: dict) -> None:
        try:
            client = await self._conn()
            await client.publish(self.channel(tenant_id), json.dumps(event))
        except Exception as exc:
            logger.warning("EventBus.emit failed: %s", exc)

    async def subscribe(self, tenant_id: str) -> AsyncIterator[dict]:
        client = await self._conn()
        pubsub = client.pubsub()
        await pubsub.subscribe(self.channel(tenant_id))
        try:
            async for msg in pubsub.listen():
                if msg.get("type") != "message":
                    continue
                try:
                    yield json.loads(msg["data"])
                except (json.JSONDecodeError, ValueError):
                    continue
        finally:
            try:
                await pubsub.unsubscribe(self.channel(tenant_id))
                await pubsub.close()
            except Exception:
                pass


event_bus = EventBus()


def make_emitter(tenant_id: str, demand_id: str):
    """Return an async callable that publishes events for a given run."""

    async def emit(payload: dict) -> None:
        payload.setdefault("demand_id", demand_id)
        payload.setdefault("tenant_id", tenant_id)
        await event_bus.emit(tenant_id, payload)

    return emit

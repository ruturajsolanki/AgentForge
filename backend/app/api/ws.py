"""Per-tenant WebSocket endpoint. Bridges Redis pub/sub to browsers and
relays browser LLM responses to the LLM bridge."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from app.api.ws_manager import ConnectionManager
from app.auth import AuthContext, get_auth_context
from app.llm.bridge import bridge
from app.queue.events import event_bus

logger = logging.getLogger(__name__)

router = APIRouter(tags=["ws"])
ws_manager = ConnectionManager()
bridge.bind(ws_manager)


@router.websocket("/ws")
async def websocket_endpoint(
    ws: WebSocket,
    ctx: AuthContext = Depends(get_auth_context),
) -> None:
    tenant_id = str(ctx.tenant_id)
    await ws_manager.connect(ws, tenant_id)

    await ws.send_json({
        "type": "init",
        "tenant_id": tenant_id,
        "user_id": str(ctx.user_id),
    })

    # Fan Redis pubsub for this tenant into this socket.
    relay_task = asyncio.create_task(_relay_redis(ws, tenant_id))

    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")
            if msg_type == "llm.response":
                bridge.resolve(
                    msg.get("request_id", ""),
                    msg.get("content", ""),
                    msg.get("error"),
                )
            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        await ws_manager.disconnect(ws, tenant_id)


async def _relay_redis(ws: WebSocket, tenant_id: str) -> None:
    try:
        async for event in event_bus.subscribe(tenant_id):
            try:
                await ws.send_json(event)
            except Exception:
                break
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        logger.warning("redis relay errored: %s", exc)

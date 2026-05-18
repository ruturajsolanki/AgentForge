"""WebSocket bridge for browser-hosted WebLLM inference.

Same idea as AgentForge's `llm_bridge.py` but typed and bound to ForgeOS's
connection manager. Used by `BrowserBridgeProvider`.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Optional

logger = logging.getLogger(__name__)


class LLMBridge:
    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future[str]] = {}
        self._ws_manager = None

    def bind(self, ws_manager) -> None:
        self._ws_manager = ws_manager

    async def request(
        self,
        prompt: str,
        system: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 600.0,
    ) -> str:
        if not self._ws_manager:
            raise RuntimeError("LLMBridge not bound to a WebSocket manager")
        if not self._ws_manager.active_connections:
            raise RuntimeError(
                "No browser connected. Open the ForgeOS dashboard and load a "
                "WebLLM model under Settings → Browser before submitting a demand."
            )

        request_id = uuid.uuid4().hex[:12]
        loop = asyncio.get_running_loop()
        future: asyncio.Future[str] = loop.create_future()
        self._pending[request_id] = future

        await self._ws_manager.broadcast({
            "type": "llm.request",
            "request_id": request_id,
            "prompt": prompt,
            "system": system or "",
            "model": model or "",
        })

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError as exc:
            raise RuntimeError(
                f"Browser LLM did not respond within {int(timeout)}s. "
                "Confirm the model shows 'Ready' in Settings → Browser."
            ) from exc
        finally:
            self._pending.pop(request_id, None)

    def resolve(self, request_id: str, content: str, error: Optional[str] = None) -> None:
        future = self._pending.get(request_id)
        if not future or future.done():
            return
        if error:
            future.set_exception(RuntimeError(f"Browser LLM error: {error}"))
        else:
            future.set_result(content)


bridge = LLMBridge()

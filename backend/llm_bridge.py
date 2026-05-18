"""Bridge that routes LLM inference through the browser via WebSocket.

Flow:
  1. Backend agent needs an LLM response.
  2. LLMClient calls bridge.request(prompt, system).
  3. Bridge broadcasts an llm.request message to all connected browsers.
  4. The browser's WebLLM engine runs inference locally.
  5. Browser sends back an llm.response message with the result.
  6. Bridge resolves the asyncio Future and returns the text.
"""

from __future__ import annotations

import asyncio
import logging
import uuid

logger = logging.getLogger(__name__)


class LLMBridge:
    def __init__(self) -> None:
        self._pending: dict[str, asyncio.Future[str]] = {}
        self._ws_manager = None

    def bind(self, ws_manager) -> None:
        self._ws_manager = ws_manager

    async def request(self, prompt: str, system: str | None = None, model: str | None = None) -> str:
        if not self._ws_manager:
            raise RuntimeError("LLMBridge not bound to a WebSocket manager")

        if not self._ws_manager.active_connections:
            raise RuntimeError(
                "No browser connected. Open the AgentForge dashboard in your browser, "
                "go to Settings → Browser (WebLLM), download a model, then try again."
            )

        request_id = uuid.uuid4().hex[:8]
        loop = asyncio.get_running_loop()
        future: asyncio.Future[str] = loop.create_future()
        self._pending[request_id] = future

        prompt_preview = prompt[:100] + "..." if len(prompt) > 100 else prompt
        logger.info(f"[LLMBridge] Sending llm.request {request_id} ({len(prompt)} chars): {prompt_preview}")

        await self._ws_manager.broadcast({
            "type": "llm.request",
            "request_id": request_id,
            "prompt": prompt,
            "system": system or "",
            "model": model or "",
        })

        try:
            result = await asyncio.wait_for(future, timeout=600.0)
            logger.info(f"[LLMBridge] Got response for {request_id} ({len(result)} chars)")
            return result
        except asyncio.TimeoutError:
            raise RuntimeError(
                "Browser LLM did not respond within 10 minutes. "
                "Make sure you have a model loaded in Settings → Browser (WebLLM). "
                "The model must show 'Ready' status before submitting a project."
            )
        finally:
            self._pending.pop(request_id, None)

    def resolve(self, request_id: str, content: str, error: str | None = None) -> None:
        future = self._pending.get(request_id)
        if not future or future.done():
            logger.warning(f"[LLMBridge] resolve({request_id}) — future not found or already done")
            return
        if error:
            logger.error(f"[LLMBridge] Error for {request_id}: {error}")
            future.set_exception(RuntimeError(f"Browser LLM error: {error}"))
        else:
            logger.info(f"[LLMBridge] Resolved {request_id} with {len(content)} chars")
            future.set_result(content)


llm_bridge = LLMBridge()

"""Unified LLM provider abstraction.

All providers expose the same async interface so the orchestrator never
needs to care whether it's talking to NVIDIA NIM, vLLM, Ollama, or a
browser-hosted WebLLM engine.
"""

from __future__ import annotations

import abc
import asyncio
import logging
import random
from typing import Any, AsyncIterator, Optional

import httpx

from app.config import settings, PROVIDER_PRESETS

logger = logging.getLogger(__name__)


# Retryable HTTP status codes — these flip us to the fallback provider.
_RETRYABLE_STATUS = {408, 425, 429, 500, 502, 503, 504, 529}


def _is_retryable(exc: Exception) -> bool:
    """Should we try the fallback provider on this error?"""
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in _RETRYABLE_STATUS
    if isinstance(exc, (httpx.ConnectError, httpx.ReadTimeout, httpx.WriteTimeout,
                        httpx.PoolTimeout, httpx.RemoteProtocolError, asyncio.TimeoutError)):
        return True
    return False


class LLMProvider(abc.ABC):
    name: str = "abstract"

    @abc.abstractmethod
    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 4096,
        extra: Optional[dict[str, Any]] = None,
    ) -> str: ...

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 4096,
        extra: Optional[dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        """Default impl falls back to one-shot chat then yields a single chunk."""
        text = await self.chat(
            messages, model=model, temperature=temperature,
            max_tokens=max_tokens, extra=extra,
        )
        yield text

    async def embed(self, text: str, *, model: Optional[str] = None) -> list[float]:
        raise NotImplementedError

    async def health(self) -> bool:
        return True


class OpenAICompatibleProvider(LLMProvider):
    """Works with anything speaking the OpenAI Chat Completions API
    (NIM, vLLM, Groq, OpenAI, Together, OpenRouter, Ollama's /v1, etc)."""

    def __init__(self, name: str, base_url: str, api_key: str = "", default_model: str = "") -> None:
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.default_model = default_model

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 4096,
        extra: Optional[dict[str, Any]] = None,
    ) -> str:
        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if extra:
            payload.update(extra)

        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices", [])
            if not choices:
                return ""
            return choices[0].get("message", {}).get("content", "") or ""

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 4096,
        extra: Optional[dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        import json as _json

        payload: dict[str, Any] = {
            "model": model or self.default_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        if extra:
            payload.update(extra)

        async with httpx.AsyncClient(timeout=300.0) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=self._headers(),
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    body = line[6:].strip()
                    if body == "[DONE]":
                        break
                    try:
                        chunk = _json.loads(body)
                        delta = chunk["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield delta
                    except (KeyError, IndexError, ValueError):
                        continue

    async def embed(self, text: str, *, model: Optional[str] = None) -> list[float]:
        payload = {"model": model or settings.embed_model, "input": text}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{self.base_url}/embeddings", json=payload, headers=self._headers()
            )
            resp.raise_for_status()
            data = resp.json()
            entries = data.get("data", [])
            if entries:
                return entries[0].get("embedding", [])
            return []

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(f"{self.base_url}/models", headers=self._headers())
                return resp.status_code in (200, 401)  # 401 means reachable but key wrong
        except Exception:
            return False


class OllamaProvider(LLMProvider):
    """Native Ollama /api/generate endpoint, kept as a dev fallback."""

    name = "ollama"

    def __init__(self, base_url: str, default_model: str = "qwen2.5-coder:7b") -> None:
        self.base_url = base_url.rstrip("/")
        self.default_model = default_model

    @staticmethod
    def _build_prompt(messages: list[dict[str, str]]) -> tuple[str, str]:
        system_parts: list[str] = []
        body_parts: list[str] = []
        for m in messages:
            if m["role"] == "system":
                system_parts.append(m["content"])
            elif m["role"] == "user":
                body_parts.append(m["content"])
            elif m["role"] == "assistant":
                body_parts.append(f"Assistant previously said: {m['content']}")
        return "\n".join(system_parts), "\n\n".join(body_parts)

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 4096,
        extra: Optional[dict[str, Any]] = None,
    ) -> str:
        system, prompt = self._build_prompt(messages)
        payload = {
            "model": model or self.default_model,
            "prompt": prompt,
            "system": system,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
        }
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(f"{self.base_url}/api/generate", json=payload)
            resp.raise_for_status()
            return resp.json().get("response", "")

    async def embed(self, text: str, *, model: Optional[str] = None) -> list[float]:
        payload = {"model": model or "nomic-embed-text", "input": text}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{self.base_url}/api/embed", json=payload)
            resp.raise_for_status()
            data = resp.json()
            embs = data.get("embeddings", [])
            return embs[0] if embs else []

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                return resp.status_code == 200
        except Exception:
            return False


class BrowserBridgeProvider(LLMProvider):
    """Routes inference to a WebLLM engine running in the user's browser
    via the existing WebSocket bridge. Used as the free-tier option."""

    name = "browser"

    def __init__(self) -> None:
        from app.llm.bridge import bridge  # local import to avoid cycle

        self._bridge = bridge

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 2048,
        extra: Optional[dict[str, Any]] = None,
    ) -> str:
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        prompt = "\n\n".join(m["content"] for m in messages if m["role"] != "system")
        return await self._bridge.request(prompt=prompt, system=system, model=model)

    async def health(self) -> bool:
        return True


class FallbackTier:
    """One link in the fallback chain — a provider plus a model-map that
    translates the *primary's* logical model ids into something this tier
    understands."""

    def __init__(
        self,
        provider: LLMProvider,
        model_map: dict[str, str],
        default_model: str,
    ) -> None:
        self.provider = provider
        self.model_map = model_map
        self.default_model = default_model

    def resolve_model(self, primary_model: Optional[str]) -> str:
        if not primary_model:
            return self.default_model
        return self.model_map.get(primary_model, self.default_model)


class FallbackProvider(LLMProvider):
    """Wrap a primary provider with an ordered chain of fallback tiers.

    On any retryable error (429, 5xx, timeout, network blip) the next tier
    is tried with a model id translated through that tier's ``model_map``.
    Production wiring is NIM → Groq → OpenRouter (all model-compatible with
    Llama 3.3 / Qwen Coder), but the chain is fully configurable.
    """

    name = "fallback"

    # Canonical maps used when a tier has no explicit override.
    GROQ_MAP: dict[str, str] = {
        "meta/llama-3.3-70b-instruct": "llama-3.3-70b-versatile",
        "meta/llama-3.1-70b-instruct": "llama-3.1-70b-versatile",
        "meta/llama-3.1-8b-instruct": "llama-3.1-8b-instant",
        "qwen/qwen2.5-coder-32b-instruct": "qwen-2.5-coder-32b",
        "qwen/qwen2.5-32b-instruct": "qwen-2.5-32b",
        "deepseek-ai/deepseek-v3": "deepseek-r1-distill-llama-70b",
        "deepseek-ai/deepseek-r1": "deepseek-r1-distill-llama-70b",
    }
    # Maps to OpenRouter ``:free`` model IDs that are *currently* serving.
    # Llama 3.3 :free is frequently upstream-rate-limited on OpenRouter, so we
    # prefer Nemotron 120B + Qwen 3 Coder which have wider headroom.
    OPENROUTER_MAP: dict[str, str] = {
        "meta/llama-3.3-70b-instruct": "nvidia/nemotron-3-super-120b-a12b:free",
        "meta/llama-3.1-70b-instruct": "nvidia/nemotron-3-super-120b-a12b:free",
        "qwen/qwen2.5-coder-32b-instruct": "qwen/qwen3-coder:free",
        "qwen/qwen2.5-32b-instruct": "qwen/qwen3-next-80b-a3b-instruct:free",
        "deepseek-ai/deepseek-v3": "deepseek/deepseek-v4-flash:free",
        "deepseek-ai/deepseek-r1": "deepseek/deepseek-v4-flash:free",
        # Groq -> OpenRouter shortcuts (used when chain skips primary).
        "llama-3.3-70b-versatile": "nvidia/nemotron-3-super-120b-a12b:free",
        "llama-3.1-70b-versatile": "nvidia/nemotron-3-super-120b-a12b:free",
        "qwen-2.5-coder-32b": "qwen/qwen3-coder:free",
    }

    def __init__(
        self,
        primary: LLMProvider,
        tiers: list[FallbackTier],
    ) -> None:
        self.primary = primary
        self.tiers = tiers

    @property
    def fallback(self) -> Optional[LLMProvider]:
        """Compat shim — older code/tests read ``.fallback``; expose the first tier."""
        return self.tiers[0].provider if self.tiers else None

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 4096,
        extra: Optional[dict[str, Any]] = None,
    ) -> str:
        # 1) Primary with one jittered retry.
        last_exc: Optional[Exception] = None
        for attempt in range(2):
            try:
                return await self.primary.chat(
                    messages, model=model, temperature=temperature,
                    max_tokens=max_tokens, extra=extra,
                )
            except Exception as exc:
                last_exc = exc
                if not _is_retryable(exc):
                    raise
                if attempt == 0:
                    await asyncio.sleep(0.6 + random.random() * 0.4)

        # 2) Walk the fallback chain in order.
        for tier in self.tiers:
            fb_model = tier.resolve_model(model)
            logger.warning(
                "[LLM] %s failed (%s) — trying %s/%s",
                self.primary.name, type(last_exc).__name__ if last_exc else "?",
                tier.provider.name, fb_model,
            )
            try:
                return await tier.provider.chat(
                    messages, model=fb_model, temperature=temperature,
                    max_tokens=max_tokens, extra=extra,
                )
            except Exception as exc:
                last_exc = exc
                if not _is_retryable(exc):
                    logger.error("[LLM] %s returned non-retryable error: %s",
                                 tier.provider.name, exc)
                    raise
                continue
        # Every tier exhausted.
        assert last_exc is not None
        logger.error("[LLM] all fallback tiers exhausted; last error: %s", last_exc)
        raise last_exc

    async def stream(
        self,
        messages: list[dict[str, str]],
        *,
        model: Optional[str] = None,
        temperature: float = 0.4,
        max_tokens: int = 4096,
        extra: Optional[dict[str, Any]] = None,
    ) -> AsyncIterator[str]:
        try:
            async for chunk in self.primary.stream(
                messages, model=model, temperature=temperature,
                max_tokens=max_tokens, extra=extra,
            ):
                yield chunk
            return
        except Exception as exc:
            if not _is_retryable(exc):
                raise
            primary_exc = exc

        # Streaming fallback — try each tier in turn; first one that opens
        # a stream wins. We don't retry mid-stream (would duplicate output).
        for tier in self.tiers:
            fb_model = tier.resolve_model(model)
            logger.warning(
                "[LLM] streaming on %s failed (%s) — switching to %s/%s",
                self.primary.name, type(primary_exc).__name__,
                tier.provider.name, fb_model,
            )
            try:
                async for chunk in tier.provider.stream(
                    messages, model=fb_model, temperature=temperature,
                    max_tokens=max_tokens, extra=extra,
                ):
                    yield chunk
                return
            except Exception as exc:
                if not _is_retryable(exc):
                    raise
                primary_exc = exc
                continue
        raise primary_exc

    async def embed(self, text: str, *, model: Optional[str] = None) -> list[float]:
        # Embeddings only run on the primary — Groq/OpenRouter don't expose
        # comparable endpoints for free. Return [] so callers can keyword-fallback.
        try:
            return await self.primary.embed(text, model=model)
        except Exception as exc:
            logger.warning("[LLM] embed failed on %s: %s", self.primary.name, exc)
            return []

    async def health(self) -> bool:
        if await self.primary.health():
            return True
        for tier in self.tiers:
            if await tier.provider.health():
                return True
        return False


def _build_openai_compatible(
    name: str, default_base: str, api_key: str, default_model: str
) -> OpenAICompatibleProvider:
    return OpenAICompatibleProvider(name, default_base, api_key, default_model)


def _groq_tier() -> Optional[FallbackTier]:
    """Tier 1: Groq — same models as NIM at ~1000 RPM, free tier."""
    key = (settings.groq_api_key or "").strip()
    if not key:
        return None
    base = settings.groq_api_base or PROVIDER_PRESETS.get(
        "groq", {}).get("base_url", "https://api.groq.com/openai/v1")
    provider = _build_openai_compatible(
        "groq", base, key,
        settings.groq_default_model or "llama-3.3-70b-versatile",
    )
    return FallbackTier(
        provider=provider,
        model_map=FallbackProvider.GROQ_MAP,
        default_model=settings.groq_default_model or "llama-3.3-70b-versatile",
    )


def _openrouter_tier() -> Optional[FallbackTier]:
    """Tier 2: OpenRouter free models — last-resort safety net."""
    key = (settings.openrouter_api_key or "").strip()
    if not key:
        return None
    base = settings.openrouter_api_base or PROVIDER_PRESETS.get(
        "openrouter", {}).get("base_url", "https://openrouter.ai/api/v1")
    provider = _build_openai_compatible(
        "openrouter", base, key,
        settings.openrouter_default_model or "meta-llama/llama-3.3-70b-instruct:free",
    )
    return FallbackTier(
        provider=provider,
        model_map=FallbackProvider.OPENROUTER_MAP,
        default_model=(
            settings.openrouter_default_model
            or "meta-llama/llama-3.3-70b-instruct:free"
        ),
    )


def _build_fallback_chain() -> list[FallbackTier]:
    """Assemble the configured fallback chain in priority order."""
    chain: list[FallbackTier] = []
    groq = _groq_tier()
    if groq:
        chain.append(groq)
    openrouter = _openrouter_tier()
    if openrouter:
        chain.append(openrouter)
    return chain


def get_provider(name: Optional[str] = None) -> LLMProvider:
    """Build a provider object for the requested (or current) provider name.

    * If ``name`` is None or matches the configured primary, returns the
      primary (wrapped in a fallback chain when applicable).
    * If ``name`` requests a *different* provider (e.g. the smart router
      sends docs to Groq while the primary is NIM), this returns a client
      pointed at that provider's own base URL + API key — NOT the primary's.
    """
    provider_name = name or settings.llm_provider
    is_primary = (provider_name == settings.llm_provider) or (name is None)

    if provider_name == "browser":
        return BrowserBridgeProvider()

    if provider_name == "ollama":
        return OllamaProvider(settings.ollama_url, settings.default_model)

    preset = PROVIDER_PRESETS.get(provider_name, {})

    # Per-provider base/key resolution: when the caller asks for a non-primary
    # provider, we MUST use that provider's own credentials, not the primary's.
    if not is_primary:
        if provider_name == "groq":
            base = settings.groq_api_base
            api_key = settings.groq_api_key
            default_model = settings.groq_default_model or preset.get("default_model", "")
        elif provider_name == "openrouter":
            base = settings.openrouter_api_base
            api_key = settings.openrouter_api_key
            default_model = settings.openrouter_default_model or preset.get("default_model", "")
        elif provider_name == "vllm":
            base = settings.vllm_base_url or preset.get("base_url", "http://localhost:8000/v1")
            api_key = settings.api_key  # vLLM usually doesn't gate on key
            default_model = preset.get("default_model", "")
        else:
            # Unknown non-primary — fall back to the preset's base, no key.
            base = preset.get("base_url", "")
            api_key = ""
            default_model = preset.get("default_model", "")
        if not base:
            raise RuntimeError(
                f"get_provider('{provider_name}'): no base URL configured for that provider"
            )
        if not api_key and provider_name in ("groq", "openrouter"):
            raise RuntimeError(
                f"get_provider('{provider_name}'): API key for {provider_name} is empty — "
                f"set it in Settings or in deploy/.env"
            )
        return _build_openai_compatible(provider_name, base, api_key, default_model)

    # ── Primary provider path ──────────────────────────────────────────
    if provider_name == "vllm":
        base = settings.vllm_base_url or preset.get("base_url") or "http://localhost:8000/v1"
        primary = _build_openai_compatible(
            "vllm", base, settings.api_key,
            settings.default_model or preset.get("default_model", ""),
        )
        chain = _build_fallback_chain()
        return FallbackProvider(primary, chain) if chain else primary

    # NIM, Groq, OpenAI, Together, OpenRouter when *primary*.
    base = settings.api_base_url or preset.get("base_url", "")
    api_key = settings.api_key
    default_model = settings.default_model or preset.get("default_model", "")
    primary = _build_openai_compatible(provider_name, base, api_key, default_model)

    if provider_name in ("nim", "vllm"):
        chain = _build_fallback_chain()
        if chain:
            return FallbackProvider(primary, chain)
    return primary

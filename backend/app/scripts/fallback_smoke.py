"""Smoke-test the NIM -> Groq fallback chain.

Runs three scenarios against the real providers using the keys configured
in forgeos_settings.json / env:

  1. Healthy NIM call (expect: NIM responds, no fallback used).
  2. Direct Groq call (expect: Groq alone responds).
  3. Forced rate-limit simulation: wrap NIM in a stub that always raises
     httpx.HTTPStatusError(429), confirm FallbackProvider routes to Groq.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from typing import Any, AsyncIterator, Optional

import httpx

# Allow running as `python backend/app/scripts/fallback_smoke.py`.
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from app.config import settings  # noqa: E402
from app.llm.provider import (  # noqa: E402
    FallbackProvider,
    FallbackTier,
    LLMProvider,
    OpenAICompatibleProvider,
    _groq_tier,
    _openrouter_tier,
    get_provider,
)


PROMPT = [
    {"role": "system", "content": "You are a terse status reporter."},
    {"role": "user", "content": "Respond with exactly: ForgeOS fallback ok."},
]


class AlwaysRateLimited(LLMProvider):
    """Stand-in primary that always raises a 429 — proves fallback fires."""

    name = "nim-stub"

    async def chat(
        self,
        messages,
        *,
        model=None,
        temperature=0.4,
        max_tokens=4096,
        extra=None,
    ) -> str:
        request = httpx.Request("POST", "https://integrate.api.nvidia.com/v1/chat/completions")
        response = httpx.Response(429, request=request, text="too many requests")
        raise httpx.HTTPStatusError("simulated rate limit", request=request, response=response)


def _truncate(text: str, n: int = 80) -> str:
    text = (text or "").strip().replace("\n", " ")
    return text[:n] + ("…" if len(text) > n else "")


async def scenario_nim_only() -> dict[str, Any]:
    provider = get_provider("nim")
    # Make sure the fallback wrapper IS in effect.
    wrapped = isinstance(provider, FallbackProvider)
    t0 = time.time()
    try:
        out = await provider.chat(PROMPT, model=settings.default_model, max_tokens=64)
        ok = "fallback" in out.lower() or "forgeos" in out.lower() or len(out) > 0
        return {
            "scenario": "nim_primary",
            "wrapped_in_fallback": wrapped,
            "ok": ok,
            "elapsed_ms": int((time.time() - t0) * 1000),
            "response_preview": _truncate(out),
        }
    except Exception as exc:
        return {
            "scenario": "nim_primary",
            "wrapped_in_fallback": wrapped,
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
        }


async def scenario_groq_direct() -> dict[str, Any]:
    tier = _groq_tier()
    if not tier:
        return {"scenario": "groq_direct", "ok": False, "error": "groq key not configured"}
    t0 = time.time()
    try:
        out = await tier.provider.chat(PROMPT, model=tier.default_model, max_tokens=64)
        return {
            "scenario": "groq_direct",
            "ok": bool(out),
            "elapsed_ms": int((time.time() - t0) * 1000),
            "response_preview": _truncate(out),
        }
    except Exception as exc:
        return {"scenario": "groq_direct", "ok": False, "error": f"{type(exc).__name__}: {exc}"}


async def scenario_openrouter_direct() -> dict[str, Any]:
    tier = _openrouter_tier()
    if not tier:
        return {"scenario": "openrouter_direct", "ok": False,
                "error": "openrouter key not configured"}
    t0 = time.time()
    try:
        out = await tier.provider.chat(PROMPT, model=tier.default_model, max_tokens=64)
        return {
            "scenario": "openrouter_direct",
            "ok": bool(out),
            "elapsed_ms": int((time.time() - t0) * 1000),
            "response_preview": _truncate(out),
            "model": tier.default_model,
        }
    except Exception as exc:
        return {"scenario": "openrouter_direct", "ok": False,
                "error": f"{type(exc).__name__}: {exc}"}


async def scenario_forced_fallback_to_groq() -> dict[str, Any]:
    groq = _groq_tier()
    if not groq:
        return {"scenario": "forced_fallback_groq", "ok": False,
                "error": "groq key not configured"}
    wrapped = FallbackProvider(primary=AlwaysRateLimited(), tiers=[groq])
    t0 = time.time()
    try:
        out = await wrapped.chat(
            PROMPT, model="meta/llama-3.3-70b-instruct", max_tokens=64
        )
        return {
            "scenario": "forced_fallback_groq",
            "ok": bool(out),
            "elapsed_ms": int((time.time() - t0) * 1000),
            "response_preview": _truncate(out),
            "note": "primary returned 429, routed to Groq",
        }
    except Exception as exc:
        return {"scenario": "forced_fallback_groq", "ok": False,
                "error": f"{type(exc).__name__}: {exc}"}


async def scenario_forced_chain_to_openrouter() -> dict[str, Any]:
    """Primary and Groq both fail — verify chain walks to OpenRouter."""
    openrouter = _openrouter_tier()
    if not openrouter:
        return {"scenario": "forced_chain_openrouter", "ok": False,
                "error": "openrouter key not configured"}
    # Both primary and "groq" tier are stubs returning 429.
    failing_groq_tier = FallbackTier(
        provider=AlwaysRateLimited(),
        model_map={},
        default_model="stub-model",
    )
    wrapped = FallbackProvider(
        primary=AlwaysRateLimited(),
        tiers=[failing_groq_tier, openrouter],
    )
    t0 = time.time()
    try:
        out = await wrapped.chat(
            PROMPT, model="meta/llama-3.3-70b-instruct", max_tokens=64
        )
        return {
            "scenario": "forced_chain_openrouter",
            "ok": bool(out),
            "elapsed_ms": int((time.time() - t0) * 1000),
            "response_preview": _truncate(out),
            "note": "primary + groq both failed, walked to OpenRouter free tier",
        }
    except Exception as exc:
        return {"scenario": "forced_chain_openrouter", "ok": False,
                "error": f"{type(exc).__name__}: {exc}"}


async def main() -> int:
    print(f"[fallback_smoke] provider={settings.llm_provider} "
          f"groq={bool(settings.groq_api_key)} "
          f"openrouter={bool(settings.openrouter_api_key)}")
    results = []
    for fn in (
        scenario_nim_only,
        scenario_groq_direct,
        scenario_openrouter_direct,
        scenario_forced_fallback_to_groq,
        scenario_forced_chain_to_openrouter,
    ):
        result = await fn()
        results.append(result)
        print(json.dumps(result, indent=2))
    all_ok = all(r.get("ok") for r in results)
    print(f"\n[fallback_smoke] {'ALL PASSED' if all_ok else 'FAILED'}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

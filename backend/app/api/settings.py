"""Settings + health + model routing introspection routes."""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends

from app.auth import AuthContext, require_auth
from app.config import PROVIDER_PRESETS, settings
from app.llm import get_provider
from app.llm.router import PROVIDER_CATALOG, model_router

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/settings")
async def get_settings(_ctx: AuthContext = Depends(require_auth)) -> dict:
    provider = get_provider()
    connected = await provider.health()
    return {
        **settings.to_dict(),
        "provider_presets": PROVIDER_PRESETS,
        "provider_connected": connected,
    }


@router.put("/settings")
async def update_settings(
    body: dict,
    _ctx: AuthContext = Depends(require_auth),
) -> dict:
    settings.update(body)
    provider = get_provider()
    connected = await provider.health()
    return {
        **settings.to_dict(),
        "saved": True,
        "provider_presets": PROVIDER_PRESETS,
        "provider_connected": connected,
    }


@router.get("/health")
async def health() -> dict:
    provider = get_provider()
    return {
        "status": "ok",
        "provider": settings.llm_provider,
        "provider_connected": await provider.health(),
        "demo_mode": settings.demo_mode,
    }


@router.get("/llm/routing")
async def llm_routing(_ctx: AuthContext = Depends(require_auth)) -> dict:
    """Returns the smart-routing matrix (which model serves which role)
    plus the per-kind catalog so the UI can render it."""
    return {
        "primary_provider": settings.llm_provider,
        "speed_shortcut": (
            model_router.SPEED_SHORTCUT_PROVIDER
            if bool(settings.groq_api_key) else None
        ),
        "catalog": PROVIDER_CATALOG,
        "routing": model_router.routing_table(),
    }


async def _list_remote_models(base_url: str, api_key: str) -> list[dict]:
    """Fetch /models from any OpenAI-compatible endpoint. Returns a normalised list."""
    if not base_url or not api_key:
        return []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(
                f"{base_url.rstrip('/')}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if r.status_code != 200:
                return []
            return [
                {
                    "id": m.get("id"),
                    "context_length": m.get("context_length"),
                    "owned_by": m.get("owned_by"),
                }
                for m in (r.json().get("data") or [])
                if m.get("id")
            ]
    except Exception as exc:
        logger.warning("model listing failed for %s: %s", base_url, exc)
        return []


@router.get("/llm/models")
async def llm_models(_ctx: AuthContext = Depends(require_auth)) -> dict:
    """Return the full live model catalog for every configured provider.

    Lets the UI display 'here are 125 NIM models, 16 Groq models, 24 free
    OpenRouter models' rather than blind-typing model IDs.
    """
    nim_models = await _list_remote_models(settings.api_base_url, settings.api_key) \
        if settings.llm_provider in ("nim", "vllm", "openai") else []
    groq_models = await _list_remote_models(
        settings.groq_api_base, settings.groq_api_key,
    )
    openrouter_models = await _list_remote_models(
        settings.openrouter_api_base, settings.openrouter_api_key,
    )
    # OpenRouter: surface only :free models by default to keep the list focused.
    openrouter_free = [m for m in openrouter_models if (m.get("id") or "").endswith(":free")]
    return {
        "nim": nim_models,
        "groq": groq_models,
        "openrouter": openrouter_models,
        "openrouter_free": openrouter_free,
    }

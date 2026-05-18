"""Smart per-role model routing.

Each role has a *kind* (what the model needs to do well — code / reasoning /
structured output / prose / embedding) and a *priority* (speed vs quality).
The router picks the best concrete model for that profile on the currently
configured primary provider — and, for ``priority="speed"`` roles, can
short-circuit to a faster provider (Groq) when one is available, because a
sub-second Groq Llama 8B beats a 4-second NIM 70B for prose tasks every time.

The fallback chain in ``provider.FallbackProvider`` still wraps everything;
this router only picks the *intended* model for each role.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.config import settings


@dataclass(frozen=True)
class RoutedModel:
    provider: str
    model: str
    kind: str = "general"
    priority: str = "balanced"


# ── Per-role profile ────────────────────────────────────────────────────


@dataclass(frozen=True)
class RoleProfile:
    kind: str        # "code" | "reasoning" | "structured" | "prose" | "embed"
    priority: str    # "quality" | "balanced" | "speed"


ROLE_PROFILES: dict[str, RoleProfile] = {
    # Planning + decision want the best reasoning, no rush.
    "planner":       RoleProfile(kind="reasoning",  priority="quality"),
    "decision":      RoleProfile(kind="reasoning",  priority="quality"),
    "understanding": RoleProfile(kind="structured", priority="balanced"),

    # Code-writing agents — always use a coder-specialised model.
    "frontend":      RoleProfile(kind="code",       priority="quality"),
    "backend":       RoleProfile(kind="code",       priority="quality"),
    "devops":        RoleProfile(kind="code",       priority="quality"),

    # QA reasons over code but doesn't write it.
    "qa":            RoleProfile(kind="reasoning",  priority="balanced"),

    # Docs / explanations — prose, where speed beats quality.
    "documentation": RoleProfile(kind="prose",      priority="speed"),
    "docs":          RoleProfile(kind="prose",      priority="speed"),
    "explanation":   RoleProfile(kind="prose",      priority="speed"),

    # Long-context refactors get the biggest coder model we have.
    "longctx":       RoleProfile(kind="code_deep",  priority="quality"),

    # Embeddings — only one option per provider.
    "embed":         RoleProfile(kind="embed",      priority="balanced"),
}


# ── Provider × kind catalogue ───────────────────────────────────────────
#
# Every entry below has been verified live (see ``scripts/smart_router_check.py``)
# Models that are listed but broken on the provider's side are deliberately
# omitted; the fallback chain handles unexpected failures.

PROVIDER_CATALOG: dict[str, dict[str, str]] = {
    "nim": {
        # NOTE: qwen3-coder-480b is in NIM's catalog but on the free tier it
        # streams too slowly to finish a full agent task in time. We default
        # `code` to qwen3-next-80b-a3b (3B active MoE — fast + strong) and
        # reserve the 480B model for explicit long-context refactors.
        "code":       "qwen/qwen3-next-80b-a3b-instruct",
        "code_deep":  "qwen/qwen3-coder-480b-a35b-instruct",
        "reasoning":  "meta/llama-3.3-70b-instruct",
        "reasoning_deep": "mistralai/mistral-large-3-675b-instruct-2512",
        "structured": "qwen/qwen3-next-80b-a3b-instruct",
        "prose":      "meta/llama-3.1-8b-instruct",
        "general":    "meta/llama-3.3-70b-instruct",
        "embed":      "nvidia/nv-embedqa-e5-v5",
    },
    "groq": {
        "code":       "qwen/qwen3-32b",
        "reasoning":  "llama-3.3-70b-versatile",
        "structured": "llama-3.3-70b-versatile",
        "prose":      "llama-3.1-8b-instant",
        "general":    "llama-3.3-70b-versatile",
    },
    "openrouter": {
        "code":       "qwen/qwen3-coder:free",
        "reasoning":  "nvidia/nemotron-3-super-120b-a12b:free",
        "structured": "qwen/qwen3-next-80b-a3b-instruct:free",
        "prose":      "meta-llama/llama-3.2-3b-instruct:free",
        "general":    "nvidia/nemotron-3-super-120b-a12b:free",
    },
    "vllm": {
        # vLLM is self-hosted; defaults to the configured default_model
        # but follow GLM family names if the user serves them.
        "code":       "zai-org/GLM-4.6",
        "reasoning":  "zai-org/GLM-4.6",
        "structured": "zai-org/GLM-4.6",
        "prose":      "zai-org/GLM-4.6",
        "general":    "zai-org/GLM-4.6",
    },
    "ollama": {
        "code":       "qwen2.5-coder:32b",
        "reasoning":  "llama3.3:70b",
        "structured": "qwen2.5-coder:32b",
        "prose":      "llama3.2:3b",
        "general":    "llama3.3:70b",
        "embed":      "nomic-embed-text",
    },
    "browser": {
        "code":       "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
        "reasoning":  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
        "structured": "Llama-3.2-3B-Instruct-q4f16_1-MLC",
        "prose":      "Llama-3.2-3B-Instruct-q4f16_1-MLC",
        "general":    "Llama-3.2-3B-Instruct-q4f16_1-MLC",
    },
    "openai": {
        "code":       "gpt-4o",
        "reasoning":  "gpt-4o",
        "structured": "gpt-4o-mini",
        "prose":      "gpt-4o-mini",
        "general":    "gpt-4o-mini",
    },
}


class ModelRouter:
    """Resolve role -> (provider, model_id) for the active configuration.

    * Primary provider comes from ``settings.llm_provider``.
    * For ``priority="speed"`` roles, the router prefers a *separate fast
      provider* (Groq) when one is configured — even if the primary is
      healthy — because prose latency dominates user-perceived speed.
    * Embeddings always stay on the primary (only NIM/Ollama expose them).
    """

    SPEED_SHORTCUT_PROVIDER = "groq"

    # Known provider names — used to parse "provider/model" overrides.
    _KNOWN_PROVIDERS = frozenset(PROVIDER_CATALOG.keys())

    def resolve(self, role: str) -> RoutedModel:
        profile = ROLE_PROFILES.get(role) or RoleProfile(kind="general", priority="balanced")
        primary = settings.llm_provider

        # User override wins — accepts "model" (stays on primary) or
        # "<provider>/<model>" (forces provider).
        override = (settings.role_overrides or {}).get(role)
        if override:
            ov_provider, ov_model = self._parse_override(override, default_provider=primary)
            return RoutedModel(
                provider=ov_provider, model=ov_model,
                kind=profile.kind, priority=profile.priority,
            )

        # Embeddings can't be re-routed — only the primary may have them.
        if profile.kind == "embed":
            return self._pick(primary, "embed", profile, fallback_general=False)

        # Speed-first roles: jump to Groq directly when configured.
        if (
            profile.priority == "speed"
            and primary != self.SPEED_SHORTCUT_PROVIDER
            and bool(settings.groq_api_key)
        ):
            return self._pick(self.SPEED_SHORTCUT_PROVIDER, profile.kind, profile)

        return self._pick(primary, profile.kind, profile)

    def _parse_override(self, raw: str, default_provider: str) -> tuple[str, str]:
        """Parse 'provider/model' or 'model'. Returns (provider, model)."""
        raw = raw.strip()
        head, sep, rest = raw.partition("/")
        if sep and head in self._KNOWN_PROVIDERS:
            return head, rest
        return default_provider, raw

    # ── helpers ────────────────────────────────────────────────────────

    def _pick(
        self,
        provider: str,
        kind: str,
        profile: RoleProfile,
        *,
        fallback_general: bool = True,
    ) -> RoutedModel:
        catalog = PROVIDER_CATALOG.get(provider, {})
        model = catalog.get(kind)
        if not model and fallback_general:
            model = catalog.get("general")
        if not model:
            # Last resort — use whatever the user typed in settings.
            model = settings.default_model
        return RoutedModel(
            provider=provider, model=model, kind=kind, priority=profile.priority,
        )

    # ── Inspection ─────────────────────────────────────────────────────

    def routing_table(self) -> list[dict]:
        """Return the full routing matrix for display in the UI."""
        overrides = settings.role_overrides or {}
        rows = []
        for role, profile in ROLE_PROFILES.items():
            routed = self.resolve(role)
            rows.append({
                "role": role,
                "kind": profile.kind,
                "priority": profile.priority,
                "provider": routed.provider,
                "model": routed.model,
                "overridden": role in overrides,
            })
        return rows


model_router = ModelRouter()

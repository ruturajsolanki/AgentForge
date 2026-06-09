"""Central configuration for ForgeOS.

Reads from environment + an optional on-disk JSON (UI-mutable settings).
Falls back to sane defaults so local dev works without any env file.
"""

from __future__ import annotations

import json
import os
from typing import Any

_BASE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_BASE, "..", ".."))

PROJECTS_DIR = os.getenv("FORGEOS_PROJECTS_DIR", os.path.join(_REPO_ROOT, "projects"))
SETTINGS_PATH = os.getenv("FORGEOS_SETTINGS_PATH", os.path.join(_REPO_ROOT, "forgeos_settings.json"))
TEMPLATE_DIR = os.path.join(_BASE, "..", "templates", "react-supabase")

EMBEDDING_DIM = 768

# Model plane defaults — NVIDIA NIM is the production primary.
NIM_API_BASE = os.getenv("NIM_API_BASE", "https://integrate.api.nvidia.com/v1")
NIM_API_KEY = os.getenv("NIM_API_KEY", "")
VLLM_API_BASE = os.getenv("VLLM_API_BASE", "")
VLLM_API_KEY = os.getenv("VLLM_API_KEY", "")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

# Optional fallback when the primary provider hits rate-limits / 5xx.
# Groq's free tier serves the same Llama 3.3 70B and Qwen 2.5 Coder 32B
# models at ~1000 RPM, so it's the natural overflow valve for NIM's 40 RPM.
GROQ_API_BASE = os.getenv("GROQ_API_BASE", "https://api.groq.com/openai/v1")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Second-tier safety net — OpenRouter aggregates ~25 free models including
# Llama 3.3 70B, DeepSeek V3, Qwen Coder 32B, Gemini 2.0 Flash Exp, etc.
# Used only when both NIM and Groq have failed.
OPENROUTER_API_BASE = os.getenv("OPENROUTER_API_BASE", "https://openrouter.ai/api/v1")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

# Data plane
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://forgeos:forgeos@localhost:5432/forgeos",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Object storage (S3-compatible — works with AWS S3 or MinIO).
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://localhost:9000")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "forgeos")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "forgeospassword")
S3_BUCKET = os.getenv("S3_BUCKET", "forgeos-artifacts")
S3_REGION = os.getenv("S3_REGION", "us-east-1")

# Auth
CLERK_JWT_ISSUER = os.getenv("CLERK_JWT_ISSUER", "")
CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL", "")
DEV_AUTH_BYPASS = os.getenv("FORGEOS_DEV_AUTH_BYPASS", "true").lower() == "true"

# Email (SMTP) — when host is unset, emails are captured in the demo outbox.
SMTP_HOST = os.getenv("FORGEOS_SMTP_HOST", "")
SMTP_PORT = int(os.getenv("FORGEOS_SMTP_PORT", "587") or "587")
SMTP_USER = os.getenv("FORGEOS_SMTP_USER", "")
SMTP_PASSWORD = os.getenv("FORGEOS_SMTP_PASSWORD", "")
EMAIL_FROM = os.getenv("FORGEOS_EMAIL_FROM", "delivery@forgeos.local")
PUBLIC_BASE_URL = os.getenv("FORGEOS_PUBLIC_BASE_URL", "http://localhost:5173")

# GitHub auto-publish during production. Disabled unless explicitly configured.
GITHUB_AUTO_PUSH = os.getenv("FORGEOS_GITHUB_AUTO_PUSH", "false").lower() == "true"
GITHUB_REMOTE_URL = os.getenv("FORGEOS_GITHUB_REMOTE_URL", "")
GITHUB_TOKEN = os.getenv("FORGEOS_GITHUB_TOKEN", "")
GITHUB_BRANCH = os.getenv("FORGEOS_GITHUB_BRANCH", "main")

PROVIDER_PRESETS: dict[str, dict] = {
    "nim": {
        "base_url": NIM_API_BASE,
        "default_model": "meta/llama-3.3-70b-instruct",
        "label": "NVIDIA NIM",
    },
    "vllm": {
        "base_url": VLLM_API_BASE or "http://localhost:8000/v1",
        "default_model": "zai-org/GLM-4.6",
        "label": "vLLM (self-hosted GLM)",
    },
    "ollama": {
        "base_url": OLLAMA_BASE_URL,
        "default_model": "qwen2.5-coder:7b",
        "label": "Ollama (local)",
    },
    "browser": {
        "base_url": "",
        "default_model": "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",
        "label": "Browser WebLLM",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "default_model": "llama-3.3-70b-versatile",
        "label": "Groq",
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "label": "OpenAI",
    },
    "openrouter": {
        "base_url": OPENROUTER_API_BASE,
        "default_model": "nvidia/nemotron-3-super-120b-a12b:free",
        "label": "OpenRouter",
    },
}


def _env_int(name: str, default: int, *, min_value: int = 1, max_value: int = 32) -> int:
    try:
        return max(min_value, min(max_value, int(os.getenv(name, str(default)))))
    except (TypeError, ValueError):
        return default


class RuntimeConfig:
    """UI-mutable settings persisted to disk."""

    def __init__(self) -> None:
        self.llm_provider: str = os.getenv("FORGEOS_PROVIDER", "nim")
        self.api_base_url: str = os.getenv("FORGEOS_API_BASE", NIM_API_BASE)
        self.api_key: str = os.getenv("FORGEOS_API_KEY", NIM_API_KEY)
        self.default_model: str = os.getenv("FORGEOS_MODEL", "meta/llama-3.3-70b-instruct")
        self.code_model: str = os.getenv(
            "FORGEOS_CODE_MODEL", "qwen/qwen2.5-coder-32b-instruct"
        )
        self.planner_model: str = os.getenv(
            "FORGEOS_PLANNER_MODEL", "meta/llama-3.3-70b-instruct"
        )
        self.longctx_model: str = os.getenv(
            "FORGEOS_LONGCTX_MODEL", "zai-org/GLM-4.6"
        )
        self.embed_model: str = os.getenv("FORGEOS_EMBED_MODEL", "nvidia/nv-embedqa-e5-v5")
        self.ollama_url: str = OLLAMA_BASE_URL
        self.vllm_base_url: str = VLLM_API_BASE
        self.demo_mode: bool = os.getenv("FORGEOS_DEMO", "false").lower() == "true"
        self.supabase_url: str = os.getenv("SUPABASE_URL", "")
        self.supabase_anon_key: str = os.getenv("SUPABASE_ANON_KEY", "")
        # Fallback provider — automatically wraps NIM/vLLM when configured.
        self.groq_api_base: str = GROQ_API_BASE
        self.groq_api_key: str = GROQ_API_KEY
        self.groq_default_model: str = os.getenv(
            "FORGEOS_GROQ_MODEL", "llama-3.3-70b-versatile"
        )
        # Tier-2 fallback — OpenRouter free models.
        self.openrouter_api_base: str = OPENROUTER_API_BASE
        self.openrouter_api_key: str = OPENROUTER_API_KEY
        self.openrouter_default_model: str = os.getenv(
            "FORGEOS_OPENROUTER_MODEL", "nvidia/nemotron-3-super-120b-a12b:free"
        )
        self.worker_max_jobs: int = _env_int("FORGEOS_WORKER_MAX_JOBS", 8)
        self.agent_concurrency: int = _env_int("FORGEOS_AGENT_CONCURRENCY", 8)
        # Email
        self.smtp_host: str = SMTP_HOST
        self.smtp_port: int = SMTP_PORT
        self.smtp_user: str = SMTP_USER
        self.smtp_password: str = SMTP_PASSWORD
        self.email_from: str = EMAIL_FROM
        self.public_base_url: str = PUBLIC_BASE_URL
        # GitHub auto-publish
        self.github_auto_push: bool = GITHUB_AUTO_PUSH
        self.github_remote_url: str = GITHUB_REMOTE_URL
        self.github_token: str = GITHUB_TOKEN
        self.github_branch: str = GITHUB_BRANCH
        # Per-role model overrides — `{role: "<provider>/<model>" | "<model>"}`.
        # When set, takes precedence over the smart-router pick for that role.
        # Use a value of "" to clear an override.
        self.role_overrides: dict[str, str] = {}
        self._load()

    @property
    def is_openai_compatible(self) -> bool:
        return self.llm_provider in ("nim", "vllm", "groq", "openai", "ollama")

    @property
    def is_browser(self) -> bool:
        return self.llm_provider == "browser"

    def to_dict(self) -> dict[str, Any]:
        return {
            "llm_provider": self.llm_provider,
            "api_base_url": self.api_base_url,
            "api_key_set": bool(self.api_key),
            "default_model": self.default_model,
            "code_model": self.code_model,
            "planner_model": self.planner_model,
            "longctx_model": self.longctx_model,
            "embed_model": self.embed_model,
            "ollama_url": self.ollama_url,
            "vllm_base_url": self.vllm_base_url,
            "demo_mode": self.demo_mode,
            "supabase_url": self.supabase_url,
            "supabase_anon_key_set": bool(self.supabase_anon_key),
            "groq_api_base": self.groq_api_base,
            "groq_api_key_set": bool(self.groq_api_key),
            "groq_default_model": self.groq_default_model,
            "openrouter_api_base": self.openrouter_api_base,
            "openrouter_api_key_set": bool(self.openrouter_api_key),
            "openrouter_default_model": self.openrouter_default_model,
            "fallback_active": (
                self.llm_provider in ("nim", "vllm", "browser")
                and (bool(self.groq_api_key) or bool(self.openrouter_api_key))
            ),
            "fallback_chain": [
                tier for tier, enabled in (
                    ("groq", bool(self.groq_api_key)),
                    ("openrouter", bool(self.openrouter_api_key)),
                ) if enabled
            ],
            "worker_max_jobs": self.worker_max_jobs,
            "agent_concurrency": self.agent_concurrency,
            "role_overrides": dict(self.role_overrides),
        }

    def update(self, data: dict[str, Any]) -> None:
        for key in (
            "llm_provider", "api_base_url", "api_key",
            "default_model", "code_model", "planner_model",
            "longctx_model", "embed_model", "ollama_url",
            "vllm_base_url", "supabase_url", "supabase_anon_key",
            "groq_api_base", "groq_api_key", "groq_default_model",
            "openrouter_api_base", "openrouter_api_key", "openrouter_default_model",
        ):
            if key in data and isinstance(data[key], str):
                setattr(self, key, data[key].strip())
        for key in ("worker_max_jobs", "agent_concurrency"):
            if key in data:
                try:
                    value = int(data[key])
                except (TypeError, ValueError):
                    continue
                setattr(self, key, max(1, min(32, value)))
        if "demo_mode" in data and isinstance(data["demo_mode"], bool):
            self.demo_mode = data["demo_mode"]

        if "role_overrides" in data and isinstance(data["role_overrides"], dict):
            cleaned: dict[str, str] = {}
            for role, model in data["role_overrides"].items():
                if not isinstance(role, str) or not isinstance(model, str):
                    continue
                model = model.strip()
                if model:  # "" means clear
                    cleaned[role.strip()] = model
            self.role_overrides = cleaned

        if "llm_provider" in data:
            preset = PROVIDER_PRESETS.get(data["llm_provider"], {})
            if preset.get("base_url") and not data.get("api_base_url"):
                self.api_base_url = preset["base_url"]
            if preset.get("default_model") and not data.get("default_model"):
                self.default_model = preset["default_model"]
        self._save()

    def _load(self) -> None:
        try:
            if os.path.isfile(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    saved = json.load(f)
                for k, v in saved.items():
                    if hasattr(self, k):
                        setattr(self, k, v)
        except Exception:
            pass

    def _save(self) -> None:
        try:
            with open(SETTINGS_PATH, "w") as f:
                json.dump(
                    self.to_dict() | {
                        "api_key": self.api_key,
                        "supabase_anon_key": self.supabase_anon_key,
                        "groq_api_key": self.groq_api_key,
                        "openrouter_api_key": self.openrouter_api_key,
                    },
                    f,
                    indent=2,
                )
        except Exception:
            pass


settings = RuntimeConfig()

import json
import os

_BASE = os.path.dirname(os.path.abspath(__file__))

PROJECTS_DIR = os.getenv("AGENTFORGE_PROJECTS_DIR", os.path.join(_BASE, "..", "projects"))
DATABASE_PATH = os.getenv("AGENTFORGE_DB_PATH", os.path.join(_BASE, "..", "agentforge.db"))
SETTINGS_PATH = os.path.join(_BASE, "..", "agentforge_settings.json")
EMBEDDING_DIM = 384

PROVIDER_PRESETS: dict[str, dict] = {
    "browser": {"base_url": "", "default_model": "SmolLM2-1.7B-Instruct-q4f16_1-MLC"},
    "ollama": {"base_url": "http://localhost:11434", "default_model": "mistral"},
    "groq": {"base_url": "https://api.groq.com/openai/v1", "default_model": "llama-3.3-70b-versatile"},
    "openai": {"base_url": "https://api.openai.com/v1", "default_model": "gpt-4o-mini"},
    "gemini": {"base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "default_model": "gemini-2.0-flash"},
    "together": {"base_url": "https://api.together.xyz/v1", "default_model": "meta-llama/Llama-3.3-70B-Instruct-Turbo"},
}


class RuntimeConfig:
    """Mutable runtime settings changed from the UI. Persisted to disk."""

    def __init__(self) -> None:
        self.llm_provider: str = os.getenv("AGENTFORGE_PROVIDER", "ollama")
        self.ollama_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        self.api_base_url: str = os.getenv("AGENTFORGE_API_BASE", "")
        self.api_key: str = os.getenv("AGENTFORGE_API_KEY", "")
        self.default_model: str = os.getenv("AGENTFORGE_MODEL", "mistral")
        self.code_model: str = os.getenv("AGENTFORGE_CODE_MODEL", self.default_model)
        self.embed_model: str = os.getenv("AGENTFORGE_EMBED_MODEL", "nomic-embed-text")
        self.demo_mode: bool = os.getenv("AGENTFORGE_DEMO", "false").lower() == "true"
        self.vector_backend: str = os.getenv("AGENTFORGE_VECTOR_BACKEND", "numpy")
        self.supabase_url: str = os.getenv("SUPABASE_URL", "")
        self.supabase_anon_key: str = os.getenv("SUPABASE_ANON_KEY", "")
        self._load_saved()

    @property
    def is_cloud(self) -> bool:
        return self.llm_provider not in ("ollama", "browser")

    def to_dict(self) -> dict:
        return {
            "llm_provider": self.llm_provider,
            "ollama_url": self.ollama_url,
            "api_base_url": self.api_base_url,
            "api_key_set": bool(self.api_key),
            "default_model": self.default_model,
            "code_model": self.code_model,
            "embed_model": self.embed_model,
            "demo_mode": self.demo_mode,
            "vector_backend": self.vector_backend,
            "supabase_url": self.supabase_url,
            "supabase_anon_key_set": bool(self.supabase_anon_key),
        }

    def _load_saved(self) -> None:
        """Load previously saved settings from disk."""
        try:
            if os.path.isfile(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    saved = json.load(f)
                for key in ("llm_provider", "ollama_url", "api_base_url", "api_key",
                            "default_model", "code_model", "embed_model",
                            "vector_backend", "supabase_url", "supabase_anon_key"):
                    if key in saved and isinstance(saved[key], str):
                        setattr(self, key, saved[key])
                if "demo_mode" in saved and isinstance(saved["demo_mode"], bool):
                    self.demo_mode = saved["demo_mode"]
        except Exception:
            pass

    def _save(self) -> None:
        """Persist current settings to disk."""
        data = {
            "llm_provider": self.llm_provider,
            "ollama_url": self.ollama_url,
            "api_base_url": self.api_base_url,
            "api_key": self.api_key,
            "default_model": self.default_model,
            "code_model": self.code_model,
            "embed_model": self.embed_model,
            "demo_mode": self.demo_mode,
            "vector_backend": self.vector_backend,
            "supabase_url": self.supabase_url,
            "supabase_anon_key": self.supabase_anon_key,
        }
        try:
            with open(SETTINGS_PATH, "w") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass

    def update(self, data: dict) -> None:
        for key in (
            "ollama_url", "api_base_url", "api_key",
            "default_model", "code_model", "embed_model",
            "vector_backend", "llm_provider",
            "supabase_url", "supabase_anon_key",
        ):
            if key in data and isinstance(data[key], str):
                setattr(self, key, data[key].strip())
        if "demo_mode" in data and isinstance(data["demo_mode"], bool):
            self.demo_mode = data["demo_mode"]

        if "llm_provider" in data:
            provider = data["llm_provider"]
            preset = PROVIDER_PRESETS.get(provider, {})
            if preset.get("base_url") and not data.get("api_base_url"):
                self.api_base_url = preset["base_url"]
            if preset.get("default_model") and not data.get("default_model"):
                self.default_model = preset["default_model"]
                self.code_model = preset["default_model"]

        self._save()


settings = RuntimeConfig()

OLLAMA_BASE_URL = settings.ollama_url
DEFAULT_MODEL = settings.default_model
CODE_MODEL = settings.code_model
DEMO_MODE = settings.demo_mode
VECTOR_BACKEND = settings.vector_backend

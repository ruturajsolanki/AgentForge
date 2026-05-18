"""Unified LLM client — routes to Ollama, OpenAI-compatible API, or browser WebLLM."""

from __future__ import annotations

import httpx

from config import settings


class LLMClient:
    """Reads the current provider from settings on every call so UI changes take effect immediately."""

    async def generate(
        self,
        prompt: str,
        model: str | None = None,
        system: str | None = None,
    ) -> str:
        if settings.llm_provider == "browser":
            return await self._browser_generate(prompt, model, system)
        if settings.is_cloud:
            return await self._openai_generate(prompt, model, system)
        return await self._ollama_generate(prompt, model, system)

    async def _browser_generate(
        self, prompt: str, model: str | None, system: str | None
    ) -> str:
        from llm_bridge import llm_bridge
        return await llm_bridge.request(prompt, system, model)

    async def _ollama_generate(
        self, prompt: str, model: str | None, system: str | None
    ) -> str:
        payload: dict = {
            "model": model or settings.default_model,
            "prompt": prompt,
            "stream": False,
        }
        if system:
            payload["system"] = system

        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/generate", json=payload
            )
            resp.raise_for_status()
            return resp.json().get("response", "")

    async def _openai_generate(
        self, prompt: str, model: str | None, system: str | None
    ) -> str:
        base = settings.api_base_url.rstrip("/")
        url = f"{base}/chat/completions"

        messages: list[dict] = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model or settings.default_model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 4096,
        }

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if settings.api_key:
            headers["Authorization"] = f"Bearer {settings.api_key}"

        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            choices = data.get("choices", [])
            if choices:
                return choices[0].get("message", {}).get("content", "")
            return ""

    async def embed(self, text: str, model: str | None = None) -> list[float]:
        m = model or settings.embed_model
        if settings.is_cloud:
            return await self._openai_embed(text, m)
        return await self._ollama_embed(text, m)

    async def _ollama_embed(self, text: str, model: str) -> list[float]:
        payload = {"model": model, "input": text}
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/embed", json=payload
            )
            resp.raise_for_status()
            data = resp.json()
            embeddings = data.get("embeddings", [])
            return embeddings[0] if embeddings else []

    async def _openai_embed(self, text: str, model: str) -> list[float]:
        base = settings.api_base_url.rstrip("/")
        url = f"{base}/embeddings"
        payload = {"model": model, "input": text}
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if settings.api_key:
            headers["Authorization"] = f"Bearer {settings.api_key}"
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(url, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                return data.get("data", [{}])[0].get("embedding", [])
        except Exception:
            return []

    async def check_health(self) -> bool:
        if settings.llm_provider == "browser":
            return True
        try:
            if settings.is_cloud:
                base = settings.api_base_url.rstrip("/")
                headers: dict[str, str] = {}
                if settings.api_key:
                    headers["Authorization"] = f"Bearer {settings.api_key}"
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(f"{base}/models", headers=headers)
                    return resp.status_code == 200
            else:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{settings.ollama_url}/api/tags")
                    return resp.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        if settings.llm_provider == "browser":
            return []
        try:
            if settings.is_cloud:
                base = settings.api_base_url.rstrip("/")
                headers: dict[str, str] = {}
                if settings.api_key:
                    headers["Authorization"] = f"Bearer {settings.api_key}"
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(f"{base}/models", headers=headers)
                    data = resp.json()
                    return [m.get("id", "") for m in data.get("data", [])]
            else:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{settings.ollama_url}/api/tags")
                    return [m["name"] for m in resp.json().get("models", [])]
        except Exception:
            return []

"""LLM provider plane — unified abstraction for NIM, vLLM, Ollama, browser, plus router."""

from app.llm.provider import LLMProvider, get_provider
from app.llm.router import ModelRouter, model_router

__all__ = ["LLMProvider", "get_provider", "ModelRouter", "model_router"]

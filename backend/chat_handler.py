"""AI chat handler — vibe coding core: prompt building, LLM call, file-edit extraction."""

from __future__ import annotations

import json
import os
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from database import Database
    from file_manager import FileManager
    from llm_client import LLMClient
    from memory import MemoryEngine

from config import PROJECTS_DIR, settings

SYSTEM_PROMPT = """\
You are an AI coding assistant inside a browser IDE.
You can see the user's project files and edit them.

CRITICAL: When you change a file, use EXACTLY this format:

FILE: path/to/file.ext
```
full file content here
```

You MUST output the COMPLETE file content — never abbreviate with "..." or "// rest".
You may output multiple FILE blocks for multiple files.
Read the existing files carefully and modify them — do NOT replace with placeholder code.
Keep all existing functionality and only change what the user asked for.
"""

SYSTEM_PROMPT_COMPACT = """\
You are a code editor. You MUST respond with ONLY file blocks. No explanations.

FORMAT (mandatory):

FILE: src/App.tsx
```
full file content
```

Rules:
- Start each file with FILE: then the path
- Output the COMPLETE file, not a snippet
- Keep all existing code, only change what was asked
- No markdown headings, no instructions, no steps — ONLY FILE blocks
"""

MAX_FILE_SIZE_DEFAULT = 8000
MAX_TOTAL_CONTEXT_DEFAULT = 30000
MAX_FILE_SIZE_BROWSER = 3000
MAX_TOTAL_CONTEXT_BROWSER = 3000


class ChatHandler:
    def __init__(
        self,
        db: "Database",
        llm: "LLMClient",
        memory: "MemoryEngine",
        file_mgr: "FileManager",
    ) -> None:
        self.db = db
        self.llm = llm
        self.memory = memory
        self.file_mgr = file_mgr

    def _is_browser_llm(self) -> bool:
        return getattr(settings, "llm_provider", "") == "browser"

    async def handle_message(
        self, project_id: str, user_message: str
    ) -> dict:
        self.db.add_message(project_id, "user", user_message)

        is_browser = self._is_browser_llm()
        project_files = self._read_project_files(project_id, compact=is_browser)

        if is_browser:
            prompt = self._build_prompt_compact(user_message, project_files)
            sys_prompt = SYSTEM_PROMPT_COMPACT
        else:
            ctx = await self.memory.get_relevant_context(project_id, user_message)
            prompt = self._build_prompt(user_message, project_files, ctx)
            sys_prompt = SYSTEM_PROMPT

        try:
            response_text = await self.llm.generate(prompt, system=sys_prompt)
        except Exception as exc:
            response_text = self._fallback_response(user_message, project_files, str(exc))

        file_edits = self._extract_file_edits(response_text)

        edits_json = json.dumps(file_edits) if file_edits else None
        self.db.add_message(project_id, "assistant", response_text, edits_json)

        for edit in file_edits:
            try:
                await self.file_mgr.write_file(project_id, edit["path"], edit["content"])
                await self.memory.index_file(project_id, edit["path"], edit["content"])
            except Exception:
                pass

        try:
            await self.memory.extract_and_store_preferences(response_text)
        except Exception:
            pass

        return {
            "response": response_text,
            "file_edits": file_edits,
        }

    def prepare_prompt(self, project_id: str, user_message: str) -> dict:
        """Build the prompt and return it without calling the LLM."""
        is_browser = self._is_browser_llm()
        project_files = self._read_project_files(project_id, compact=is_browser)
        if is_browser:
            prompt = self._build_prompt_compact(user_message, project_files)
            sys_prompt = SYSTEM_PROMPT_COMPACT
        else:
            prompt = self._build_prompt_compact(user_message, project_files)
            sys_prompt = SYSTEM_PROMPT
        return {"prompt": prompt, "system": sys_prompt}

    async def complete_with_response(
        self, project_id: str, user_message: str, llm_response: str
    ) -> dict:
        """Accept a pre-generated LLM response, extract edits, and apply them."""
        self.db.add_message(project_id, "user", user_message)

        file_edits = self._extract_file_edits(llm_response)
        edits_json = json.dumps(file_edits) if file_edits else None
        self.db.add_message(project_id, "assistant", llm_response, edits_json)

        for edit in file_edits:
            try:
                await self.file_mgr.write_file(project_id, edit["path"], edit["content"])
                await self.memory.index_file(project_id, edit["path"], edit["content"])
            except Exception:
                pass

        return {
            "response": llm_response,
            "file_edits": file_edits,
        }

    def get_history(self, project_id: str, limit: int = 50) -> list[dict]:
        rows = self.db.get_conversation(project_id, limit)
        messages = []
        for r in rows:
            msg: dict = {
                "id": r["id"],
                "role": r["role"],
                "content": r["content"],
                "timestamp": r["timestamp"],
            }
            if r.get("file_edits"):
                try:
                    msg["file_edits"] = json.loads(r["file_edits"])
                except (json.JSONDecodeError, TypeError):
                    pass
            messages.append(msg)
        return messages

    def _read_project_files(self, project_id: str, compact: bool = False) -> list[dict]:
        """Read text files from the project directory, skipping build artifacts."""
        project_dir = os.path.join(PROJECTS_DIR, project_id)
        if not os.path.isdir(project_dir):
            return []

        max_file = MAX_FILE_SIZE_BROWSER if compact else MAX_FILE_SIZE_DEFAULT
        max_total = MAX_TOTAL_CONTEXT_BROWSER if compact else MAX_TOTAL_CONTEXT_DEFAULT

        files: list[dict] = []
        total_size = 0
        TEXT_EXTENSIONS = {
            ".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".json", ".md",
            ".txt", ".py", ".sh", ".yml", ".yaml", ".xml", ".svg", ".env",
            ".toml", ".cfg", ".ini", ".sql", ".rb", ".go", ".rs", ".java",
            ".php", ".vue", ".svelte", ".astro",
        }
        PRIORITY_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js", ".html", ".css"}

        SKIP_DIRS = {"node_modules", ".vite", "dist", ".git", "__pycache__", ".next", ".nuxt"}

        all_candidates: list[tuple[str, str, int]] = []
        for root, dirs, filenames in os.walk(project_dir):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for fname in sorted(filenames):
                if fname.startswith("."):
                    continue
                ext = os.path.splitext(fname)[1].lower()
                if ext not in TEXT_EXTENSIONS and not fname.endswith("file"):
                    continue
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, project_dir)
                try:
                    size = os.path.getsize(full_path)
                except OSError:
                    size = 0
                all_candidates.append((full_path, rel_path, size))

        def sort_key(item: tuple[str, str, int]) -> tuple[int, str]:
            _, rel, _ = item
            ext = os.path.splitext(rel)[1].lower()
            priority = 0 if ext in PRIORITY_EXTENSIONS else 1
            depth = rel.count(os.sep)
            return (priority, f"{depth:04d}{rel}")

        all_candidates.sort(key=sort_key)

        for full_path, rel_path, size in all_candidates:
            if size > max_file:
                files.append({"path": rel_path, "content": f"[File too large: {size} bytes]"})
                continue
            if total_size + size > max_total:
                files.append({"path": rel_path, "content": "[Omitted — context limit]"})
                continue
            try:
                with open(full_path, "r", errors="replace") as f:
                    content = f.read()
                files.append({"path": rel_path, "content": content})
                total_size += len(content)
            except Exception:
                files.append({"path": rel_path, "content": "[Could not read]"})

        return files

    def _build_prompt_compact(self, user_message: str, project_files: list[dict]) -> str:
        """Minimal prompt for browser LLM with tiny context windows.
        Only includes the most relevant files inline; lists the rest by name."""
        msg_lower = user_message.lower()

        ALWAYS_INCLUDE = {"src/App.tsx", "src/app.tsx", "index.html"}
        relevant: list[dict] = []
        other_names: list[str] = []

        for f in project_files:
            if f["content"].startswith("["):
                other_names.append(f["path"])
                continue
            name_lower = f["path"].lower()
            mentioned = any(part in msg_lower for part in name_lower.replace("/", " ").replace(".", " ").split() if len(part) > 2)
            if f["path"] in ALWAYS_INCLUDE or mentioned:
                relevant.append(f)
            else:
                other_names.append(f["path"])

        if not relevant and project_files:
            for f in project_files:
                if not f["content"].startswith("["):
                    relevant.append(f)
                    if len(relevant) >= 2:
                        break

        parts: list[str] = []
        if other_names:
            parts.append(f"Other project files: {', '.join(other_names)}")
        for f in relevant:
            content = f["content"][:MAX_FILE_SIZE_BROWSER]
            parts.append(f"FILE: {f['path']}\n```\n{content}\n```")
        parts.append(f"\nUser: {user_message}")
        return "\n\n".join(parts)

    def _build_prompt(self, user_message: str, project_files: list[dict], ctx: dict) -> str:
        parts: list[str] = []

        if project_files:
            parts.append("[Project Files]")
            parts.append(f"The project contains {len(project_files)} file(s):\n")
            for f in project_files:
                parts.append(f"=== {f['path']} ===")
                parts.append(f["content"])
                parts.append("")

        extra_chunks = ctx.get("file_chunks", [])
        if extra_chunks:
            seen = {f["path"] for f in project_files}
            new_chunks = [c for c in extra_chunks if c.get("path") not in seen]
            if new_chunks:
                parts.append("[Additional Context from Memory]")
                for chunk in new_chunks[:5]:
                    parts.append(f"--- {chunk['path']} ---")
                    parts.append(chunk["content"])
                parts.append("")

        memories = ctx.get("user_memories", [])
        if memories:
            parts.append("[User Preferences & Memory]")
            for m in memories[:10]:
                parts.append(f"- [{m.get('category', '')}] {m.get('key', '')}: {m.get('value', '')}")
            parts.append("")

        conversation = ctx.get("conversation", [])
        if conversation:
            recent = conversation[-6:]
            parts.append("[Recent Conversation]")
            for msg in recent:
                role = msg.get("role", "user").capitalize()
                content = msg.get("content", "")
                if len(content) > 300:
                    content = content[:300] + "..."
                parts.append(f"{role}: {content}")
            parts.append("")

        parts.append(f"[User Message]\n{user_message}")
        return "\n".join(parts)

    def _fallback_response(self, user_message: str, project_files: list[dict], error: str) -> str:
        """Generate a helpful response without an LLM."""
        file_list = "\n".join(f"- `{f['path']}`" for f in project_files) if project_files else "No files found."
        msg_lower = user_message.lower()

        if any(w in msg_lower for w in ("what file", "files", "project", "understand", "tell me", "describe", "overview")):
            summaries: list[str] = []
            for f in project_files[:10]:
                content = f["content"]
                preview = content[:150].replace("\n", " ").strip()
                if len(content) > 150:
                    preview += "..."
                summaries.append(f"**{f['path']}** — {preview}")

            return (
                f"I can see your project has **{len(project_files)} file(s)**:\n\n"
                + "\n\n".join(summaries)
                + "\n\n---\n"
                + f"*Note: I'm showing you what I can read from disk. To get AI-powered editing, "
                + f"open **Settings** (gear icon in toolbar) and configure an LLM provider like Groq (free) or Gemini.*\n\n"
                + f"*Connection error: {error}*"
            )

        return (
            f"I can see your project files:\n\n{file_list}\n\n"
            f"However, I couldn't reach the LLM to generate a full response.\n\n"
            f"**To fix this:** Open **Settings** (gear icon in the IDE toolbar) and either:\n"
            f"- Select **Groq** (free) and add your API key from [console.groq.com](https://console.groq.com)\n"
            f"- Select **Google Gemini** (free tier) and add your API key\n"
            f"- Start Ollama locally (`ollama serve`)\n"
            f"- Turn on **Demo Mode** for testing\n\n"
            f"*Error: {error}*"
        )

    def _extract_file_edits(self, response: str) -> list[dict]:
        """Parse file edits from LLM response, supporting multiple formats."""
        edits: list[dict] = []
        seen_paths: set[str] = set()

        # Format 1: FILE: path/to/file.ext\n```...\n<content>\n```
        for match in re.finditer(r'FILE:\s*(.+?)\s*\n```\w*\n(.*?)```', response, re.DOTALL):
            path = match.group(1).strip().strip("`")
            content = match.group(2)
            if path and content is not None and path not in seen_paths:
                edits.append({"path": path, "content": content})
                seen_paths.add(path)

        if edits:
            return edits

        # Format 2: --- path/to/file.ext ... ```\n<content>\n```
        for match in re.finditer(r'---\s+(\S+\.(?:tsx?|jsx?|html|css|json|py|md))\s.*?\n```\w*\n(.*?)```', response, re.DOTALL):
            path = match.group(1).strip()
            content = match.group(2)
            if path and content is not None and path not in seen_paths:
                edits.append({"path": path, "content": content})
                seen_paths.add(path)

        if edits:
            return edits

        # Format 3: **path/to/file.ext**\n```\n<content>\n```
        for match in re.finditer(r'\*\*(.+?\.(?:tsx?|jsx?|html|css|json|py|md))\*\*\s*:?\s*\n```\w*\n(.*?)```', response, re.DOTALL):
            path = match.group(1).strip()
            content = match.group(2)
            if path and content is not None and path not in seen_paths:
                edits.append({"path": path, "content": content})
                seen_paths.add(path)

        if edits:
            return edits

        # Format 4: `path/to/file.ext`\n```\n<content>\n```
        for match in re.finditer(r'`([^`]+\.(?:tsx?|jsx?|html|css|json|py|md))`\s*:?\s*\n```\w*\n(.*?)```', response, re.DOTALL):
            path = match.group(1).strip()
            content = match.group(2)
            if path and content is not None and path not in seen_paths:
                edits.append({"path": path, "content": content})
                seen_paths.add(path)

        if edits:
            return edits

        # Format 5: file path mentioned in nearby text (within 200 chars) before a code block
        # Catches tutorial-style responses from small LLMs
        EXT_PAT = r'((?:src/|\./)?\S+\.(?:tsx?|jsx?|html|css|json|py|md|sql))'
        blocks = list(re.finditer(r'```\w*\n(.*?)```', response, re.DOTALL))
        for block in blocks:
            content = block.group(1)
            if not content.strip() or len(content.strip()) < 20:
                continue
            preamble = response[max(0, block.start() - 300):block.start()]
            path_matches = re.findall(EXT_PAT, preamble)
            if path_matches:
                path = path_matches[-1].strip()
                if path.startswith("./"):
                    path = path[2:]
                if path not in seen_paths and ("import " in content or "export " in content
                        or "function " in content or "const " in content or "<" in content
                        or "CREATE " in content.upper() or "{" in content):
                    edits.append({"path": path, "content": content})
                    seen_paths.add(path)

        return edits

"""IDE chat routes for generated projects.

The active ForgeOS app stores generated projects in the artifact store, so the
chat assistant reads and writes S3/MinIO/local artifacts instead of the legacy
local project directory.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.config import settings
from app.db import get_session
from app.db.models import Artifact, DemandRequest, ProjectChatMessage
from app.llm import get_provider, model_router
from app.preview import preview_manager
from app.storage import get_store

router = APIRouter(prefix="/api/projects", tags=["project-chat"])

SYSTEM_PROMPT = """\
You are an AI coding assistant inside the ForgeOS browser IDE.
You can inspect the project's files and edit them.

When you change a file, use EXACTLY:

FILE: path/to/file.ext
```tsx
complete file content
```

Rules:
- Output complete file contents, never snippets or ellipses.
- Preserve existing behavior unless the user asks to change it.
- Prefer small, surgical edits.
- If no file edit is needed, answer normally.
"""

SYSTEM_PROMPT_COMPACT = """\
You are an AI coding assistant inside the ForgeOS browser IDE.

If the user explicitly asks you to change, add, remove, fix, implement, refactor,
or restyle code, respond with ONLY file blocks:

FILE: src/App.tsx
```
complete file content
```

Output complete files, not snippets.

If the user is greeting you, asking a question, or asking for an explanation,
answer normally. Do not output FILE blocks unless an edit was explicitly requested.
"""

SYSTEM_PROMPT_CHAT = """\
You are an AI coding assistant inside the ForgeOS browser IDE.
Answer briefly and helpfully. Do not output FILE blocks unless the user explicitly
asks you to modify project files.
"""

MAX_FILE_SIZE_DEFAULT = 9000
MAX_TOTAL_CONTEXT_DEFAULT = 36000
MAX_FILE_SIZE_BROWSER = 3500
MAX_TOTAL_CONTEXT_BROWSER = 7000

TEXT_EXTENSIONS = {
    ".html", ".css", ".js", ".jsx", ".ts", ".tsx", ".json", ".md",
    ".txt", ".py", ".sh", ".yml", ".yaml", ".xml", ".svg", ".toml",
    ".cfg", ".ini", ".sql", ".rb", ".go", ".rs", ".java", ".php",
    ".vue", ".svelte", ".astro",
}
PRIORITY_EXTENSIONS = {".tsx", ".ts", ".jsx", ".js", ".html", ".css", ".sql"}
SKIP_DIRS = {"node_modules", ".vite", "dist", ".git", "__pycache__", ".next", ".nuxt"}
EDIT_INTENT_RE = re.compile(
    r"\b("
    r"add|apply|build|change|connect|create|delete|edit|fix|implement|"
    r"install|make|modify|move|refactor|remove|rename|replace|restyle|"
    r"rewrite|style|update|wire"
    r")\b",
    re.IGNORECASE,
)
FILE_REFERENCE_RE = re.compile(
    r"\b[\w./-]+\.(tsx?|jsx?|html|css|json|md|sql|yml|yaml|py|sh)\b",
    re.IGNORECASE,
)
SMALL_TALK = {
    "hi", "hey", "hay", "hello", "yo", "sup", "gm", "good morning",
    "good afternoon", "good evening", "thanks", "thank you", "ok", "okay",
}


class ChatBody(BaseModel):
    message: str


class CompleteBody(BaseModel):
    message: str
    llm_response: str


def _normalized_message(message: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", message.lower())).strip()


def _is_small_talk(message: str) -> bool:
    normalized = _normalized_message(message)
    return normalized in SMALL_TALK or normalized.startswith(("hey ", "hi ", "hello "))


def _has_edit_intent(message: str) -> bool:
    text = message.strip()
    if not text:
        return False
    if _is_small_talk(text):
        return False
    return bool(EDIT_INTENT_RE.search(text) or FILE_REFERENCE_RE.search(text))


def _small_talk_response(message: str) -> str:
    if _normalized_message(message) in {"thanks", "thank you"}:
        return "You are welcome. Tell me what you want to inspect or change next."
    return "Hey. Tell me what you want to inspect or change in this project."


def _response_has_file_blocks(response: str) -> bool:
    return bool(re.search(r"FILE:\s*.+?\n```", response, re.DOTALL | re.IGNORECASE))


def _sanitize_response_for_intent(message: str, response: str) -> str:
    if _is_small_talk(message) and _response_has_file_blocks(response):
        return _small_talk_response(message)
    return response


async def _resolve_demand(
    public_id: str,
    ctx: AuthContext,
    session: AsyncSession,
) -> DemandRequest:
    demand = (await session.execute(
        select(DemandRequest).where(
            DemandRequest.public_id == public_id,
            DemandRequest.tenant_id == ctx.tenant_id,
        )
    )).scalar_one_or_none()
    if not demand:
        raise HTTPException(status_code=404, detail="Project not found")
    return demand


def _prefix(demand: DemandRequest, tenant_id) -> str:
    prefix = demand.artifacts_prefix or f"tenants/{tenant_id}/projects/{demand.public_id}"
    return prefix.rstrip("/") + "/"


def _safe_rel(path: str) -> str:
    rel = path.strip().lstrip("/").replace("\\", "/")
    if not rel or ".." in rel.split("/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    return rel


def _guess_mime(path: str) -> str:
    lower = path.lower()
    if lower.endswith(".html"):
        return "text/html"
    if lower.endswith((".js", ".jsx", ".ts", ".tsx")):
        return "application/javascript"
    if lower.endswith(".css"):
        return "text/css"
    if lower.endswith(".json"):
        return "application/json"
    if lower.endswith((".md", ".txt")):
        return "text/plain"
    if lower.endswith(".svg"):
        return "image/svg+xml"
    if lower.endswith(".sql"):
        return "application/sql"
    return "application/octet-stream"


async def _read_project_files(prefix: str, compact: bool) -> list[dict]:
    store = get_store()
    keys = await store.list_objects(prefix.rstrip("/"))
    candidates: list[tuple[str, str]] = []
    for key in keys:
        if not key.startswith(prefix):
            continue
        rel = key[len(prefix):]
        if not rel or rel.endswith("/.gitkeep"):
            continue
        parts = rel.split("/")
        if any(part in SKIP_DIRS for part in parts):
            continue
        name = parts[-1]
        if name.startswith("."):
            continue
        ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
        if ext not in TEXT_EXTENSIONS:
            continue
        candidates.append((key, rel))

    def sort_key(item: tuple[str, str]) -> tuple[int, str]:
        _, rel = item
        ext = "." + rel.rsplit(".", 1)[-1].lower() if "." in rel else ""
        priority = 0 if ext in PRIORITY_EXTENSIONS else 1
        return (priority, f"{rel.count('/'):04d}{rel}")

    candidates.sort(key=sort_key)
    max_file = MAX_FILE_SIZE_BROWSER if compact else MAX_FILE_SIZE_DEFAULT
    max_total = MAX_TOTAL_CONTEXT_BROWSER if compact else MAX_TOTAL_CONTEXT_DEFAULT
    out: list[dict] = []
    total = 0

    for key, rel in candidates:
        try:
            data = await store.get_object(key)
        except FileNotFoundError:
            continue
        size = len(data)
        if size > max_file:
            out.append({"path": rel, "content": f"[File too large: {size} bytes]"})
            continue
        if total + size > max_total:
            out.append({"path": rel, "content": "[Omitted: context budget reached]"})
            continue
        try:
            content = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        out.append({"path": rel, "content": content})
        total += len(content)
    return out


def _build_prompt_compact(user_message: str, project_files: list[dict]) -> str:
    msg_lower = user_message.lower()
    always_include = {"src/App.tsx", "src/app.tsx", "index.html", "package.json"}
    relevant: list[dict] = []
    other_names: list[str] = []

    for file in project_files:
        content = file["content"]
        path = file["path"]
        if content.startswith("["):
            other_names.append(path)
            continue
        terms = path.lower().replace("/", " ").replace(".", " ").split()
        mentioned = any(term in msg_lower for term in terms if len(term) > 2)
        if path in always_include or mentioned:
            relevant.append(file)
        else:
            other_names.append(path)

    if not relevant:
        relevant = [f for f in project_files if not f["content"].startswith("[")][:3]

    parts: list[str] = []
    if other_names:
        parts.append(f"Other files: {', '.join(other_names[:80])}")
    for file in relevant:
        parts.append(f"FILE: {file['path']}\n```\n{file['content'][:MAX_FILE_SIZE_BROWSER]}\n```")
    parts.append(f"User request: {user_message}")
    return "\n\n".join(parts)


def _build_prompt(user_message: str, project_files: list[dict]) -> str:
    parts = ["[Project Files]"]
    for file in project_files:
        parts.append(f"\n=== {file['path']} ===\n{file['content']}")
    parts.append(f"\n[User Request]\n{user_message}")
    return "\n".join(parts)


def _extract_file_edits(response: str) -> list[dict]:
    edits: list[dict] = []
    seen: set[str] = set()

    patterns = [
        r"FILE:\s*(.+?)\s*\n```\w*\n(.*?)```",
        r"===FILE:\s*(.+?)===\s*\n(.*?)===END FILE===",
        r"\*\*(.+?\.(?:tsx?|jsx?|html|css|json|py|md|sql|yml|yaml))\*\*\s*:?\s*\n```\w*\n(.*?)```",
        r"`([^`]+\.(?:tsx?|jsx?|html|css|json|py|md|sql|yml|yaml))`\s*:?\s*\n```\w*\n(.*?)```",
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, response, re.DOTALL):
            path = match.group(1).strip().strip("`")
            content = match.group(2).strip()
            if path and path not in seen:
                edits.append({"path": path, "content": content})
                seen.add(path)
        if edits:
            return edits

    blocks = list(re.finditer(r"```\w*\n(.*?)```", response, re.DOTALL))
    ext_pat = r"((?:src/|\./)?\S+\.(?:tsx?|jsx?|html|css|json|py|md|sql|yml|yaml))"
    for block in blocks:
        content = block.group(1).strip()
        if len(content) < 20:
            continue
        preamble = response[max(0, block.start() - 300):block.start()]
        matches = re.findall(ext_pat, preamble)
        if matches:
            path = matches[-1].strip()
            if path.startswith("./"):
                path = path[2:]
            if path not in seen:
                edits.append({"path": path, "content": content})
                seen.add(path)
    return edits


async def _record(
    session: AsyncSession,
    *,
    tenant_id,
    demand_id,
    role: str,
    content: str,
    file_edits: Optional[list[dict]] = None,
) -> ProjectChatMessage:
    row = ProjectChatMessage(
        tenant_id=tenant_id,
        demand_id=demand_id,
        role=role,
        content=content,
        file_edits=file_edits,
        created_at=datetime.now(timezone.utc),
    )
    session.add(row)
    await session.flush()
    return row


async def _apply_edits(
    session: AsyncSession,
    demand: DemandRequest,
    tenant_id,
    edits: list[dict],
) -> None:
    store = get_store()
    prefix = _prefix(demand, tenant_id)
    for edit in edits:
        rel = _safe_rel(edit["path"])
        data = edit["content"].encode("utf-8")
        key = prefix + rel
        await store.put_object(key, data, content_type=_guess_mime(rel))
        await preview_manager.sync_file(demand.public_id, rel, data)

        existing = (await session.execute(
            select(Artifact).where(
                Artifact.tenant_id == tenant_id,
                Artifact.demand_id == demand.id,
                Artifact.path == rel,
            )
        )).scalar_one_or_none()
        if existing:
            existing.storage_key = key
            existing.size_bytes = len(data)
            existing.content_type = _guess_mime(rel)
        else:
            session.add(Artifact(
                tenant_id=tenant_id,
                demand_id=demand.id,
                storage_key=key,
                path=rel,
                size_bytes=len(data),
                content_type=_guess_mime(rel),
            ))


def _fallback_response(message: str, files: list[dict], error: str) -> str:
    if _is_small_talk(message):
        return _small_talk_response(message)
    if any(word in message.lower() for word in ("explain", "overview", "files", "what")):
        lines = [f"I can read {len(files)} project file(s)."]
        for file in files[:12]:
            preview = file["content"][:140].replace("\n", " ").strip()
            lines.append(f"- {file['path']}: {preview}")
        lines.append(f"\nLLM call failed: {error}")
        return "\n".join(lines)
    return (
        "I could read the project, but the model call failed before I could "
        f"produce an edit.\n\nError: {error}"
    )


@router.get("/{public_id}/chat")
async def chat_history(
    public_id: str,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    demand = await _resolve_demand(public_id, ctx, session)
    rows = list((await session.execute(
        select(ProjectChatMessage)
        .where(ProjectChatMessage.tenant_id == ctx.tenant_id)
        .where(ProjectChatMessage.demand_id == demand.id)
        .order_by(ProjectChatMessage.created_at.asc())
        .limit(80)
    )).scalars())
    return [
        {
            "id": str(row.id),
            "role": row.role,
            "content": row.content,
            "file_edits": row.file_edits or [],
            "timestamp": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.post("/{public_id}/chat/prepare")
async def chat_prepare(
    public_id: str,
    body: ChatBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    demand = await _resolve_demand(public_id, ctx, session)
    if not _has_edit_intent(body.message):
        return {
            "mode": "chat",
            "prompt": f"User message: {body.message}",
            "system": SYSTEM_PROMPT_CHAT,
        }
    files = await _read_project_files(_prefix(demand, ctx.tenant_id), compact=True)
    return {
        "mode": "edit",
        "prompt": _build_prompt_compact(body.message, files),
        "system": SYSTEM_PROMPT_COMPACT,
    }


@router.post("/{public_id}/chat/complete")
async def chat_complete(
    public_id: str,
    body: CompleteBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    demand = await _resolve_demand(public_id, ctx, session)
    response = _sanitize_response_for_intent(body.message, body.llm_response)
    edits = _extract_file_edits(response) if _has_edit_intent(body.message) else []
    await _record(session, tenant_id=ctx.tenant_id, demand_id=demand.id, role="user", content=body.message)
    await _record(
        session,
        tenant_id=ctx.tenant_id,
        demand_id=demand.id,
        role="assistant",
        content=response,
        file_edits=edits,
    )
    await _apply_edits(session, demand, ctx.tenant_id, edits)
    await session.commit()
    return {"response": response, "file_edits": edits}


@router.post("/{public_id}/chat")
async def chat(
    public_id: str,
    body: ChatBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    demand = await _resolve_demand(public_id, ctx, session)
    edit_intent = _has_edit_intent(body.message)

    if _is_small_talk(body.message):
        response = _small_talk_response(body.message)
        await _record(session, tenant_id=ctx.tenant_id, demand_id=demand.id, role="user", content=body.message)
        await _record(
            session,
            tenant_id=ctx.tenant_id,
            demand_id=demand.id,
            role="assistant",
            content=response,
            file_edits=[],
        )
        await session.commit()
        return {"response": response, "file_edits": []}

    compact = settings.is_browser
    files = await _read_project_files(_prefix(demand, ctx.tenant_id), compact=compact)
    prompt = _build_prompt_compact(body.message, files) if compact else _build_prompt(body.message, files)
    system = SYSTEM_PROMPT_COMPACT if edit_intent else SYSTEM_PROMPT_CHAT

    await _record(session, tenant_id=ctx.tenant_id, demand_id=demand.id, role="user", content=body.message)
    try:
        routed = model_router.resolve("longctx")
        provider = get_provider(routed.provider)
        response = await provider.chat(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            model=routed.model,
            temperature=0.25,
            max_tokens=4096,
        )
    except Exception as exc:
        response = _fallback_response(body.message, files, str(exc))

    response = _sanitize_response_for_intent(body.message, response)
    edits = _extract_file_edits(response) if edit_intent else []
    await _record(
        session,
        tenant_id=ctx.tenant_id,
        demand_id=demand.id,
        role="assistant",
        content=response,
        file_edits=edits,
    )
    await _apply_edits(session, demand, ctx.tenant_id, edits)
    await session.commit()
    return {"response": response, "file_edits": edits}


__all__ = [
    "_extract_file_edits",
    "_build_prompt_compact",
    "_build_prompt",
    "_has_edit_intent",
    "_is_small_talk",
    "_sanitize_response_for_intent",
]

"""Reusable GitHub publishing logic.

Extracted from the API route so both the HTTP endpoint and the background
worker (automatic production publish) can share one implementation.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from pathlib import Path
from typing import Optional

from app.storage import get_store


class GitPublishError(RuntimeError):
    """Raised when a git operation fails."""


def safe_branch(branch: str) -> str:
    out = branch.strip().replace(" ", "-")
    if not out or out.startswith("-") or ".." in out or any(ch in out for ch in "\\~^:?*["):
        raise GitPublishError("Invalid branch name")
    return out


def remote_with_token(remote_url: str, token: Optional[str]) -> str:
    url = remote_url.strip()
    if not url:
        raise GitPublishError("remote_url is required")
    if token and url.startswith("https://github.com/"):
        return "https://x-access-token:" + token.strip() + "@" + url.removeprefix("https://")
    return url


def _ensure_gitignore(workdir: Path) -> None:
    path = workdir / ".gitignore"
    existing = path.read_text() if path.exists() else ""
    required = [".env", ".env.local", "node_modules/", "dist/", ".vite/", "__pycache__/"]
    additions = [line for line in required if line not in existing.splitlines()]
    if additions:
        path.write_text((existing.rstrip() + "\n" if existing.strip() else "") + "\n".join(additions) + "\n")


async def _git(cwd: Path, *args: str) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    stdout, stderr = await proc.communicate()
    out = stdout.decode("utf-8", errors="replace")
    err = stderr.decode("utf-8", errors="replace")
    if proc.returncode != 0:
        raise GitPublishError((err or out).strip() or f"git {' '.join(args)} failed")
    return out.strip()


async def publish_project(
    *,
    prefix: str,
    remote_url: str,
    branch: str = "main",
    commit_message: str = "Publish generated project",
    github_token: Optional[str] = None,
    force: bool = False,
) -> dict:
    """Fetch a project's artifacts and push them to a GitHub remote.

    Returns ``{"pushed": True, "branch": ..., "output": ...}``.
    Raises :class:`GitPublishError` on failure (caller decides how to surface).
    """
    branch = safe_branch(branch)
    remote = remote_with_token(remote_url, github_token)

    with tempfile.TemporaryDirectory(prefix="forgeos-github-") as tmp:
        workdir = Path(tmp)
        await get_store().fetch_directory(prefix, str(workdir))
        if not any(workdir.iterdir()):
            raise GitPublishError("No generated files found for project")
        _ensure_gitignore(workdir)

        try:
            await _git(workdir, "init")
            await _git(workdir, "checkout", "-B", branch)
            await _git(workdir, "config", "user.email", "forgeos@local")
            await _git(workdir, "config", "user.name", "ForgeOS Agent")
            await _git(workdir, "add", ".")
            await _git(workdir, "commit", "-m", commit_message)
            await _git(workdir, "remote", "add", "origin", remote)
            push_args = ["push", "-u", "origin", branch]
            if force:
                push_args.insert(1, "--force-with-lease")
            pushed = await _git(workdir, *push_args)
        except GitPublishError as exc:
            msg = str(exc)
            if github_token:
                msg = msg.replace(github_token, "***")
            raise GitPublishError(msg) from exc

    return {"pushed": True, "branch": branch, "output": pushed[-1200:]}

"""GitHub export/push routes for generated projects."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthContext, require_auth
from app.db import get_session
from app.db.models import DemandRequest
from app.github import GitPublishError, publish_project
from app.github.publisher import remote_with_token as _remote_with_token  # noqa: F401
from app.github.publisher import safe_branch as _safe_branch  # noqa: F401

router = APIRouter(prefix="/api/projects", tags=["github"])


class GitHubPushBody(BaseModel):
    remote_url: str = Field(..., description="Existing GitHub repository clone URL")
    branch: str = "main"
    commit_message: Optional[str] = None
    github_token: Optional[str] = None
    force: bool = False


async def _resolve_prefix(public_id: str, ctx: AuthContext, session: AsyncSession) -> str:
    demand = (await session.execute(
        select(DemandRequest).where(
            DemandRequest.public_id == public_id,
            DemandRequest.tenant_id == ctx.tenant_id,
        )
    )).scalar_one_or_none()
    if not demand:
        raise HTTPException(status_code=404, detail="Project not found")
    return (demand.artifacts_prefix or f"tenants/{ctx.tenant_id}/projects/{public_id}").rstrip("/")


@router.post("/{public_id}/github/push")
async def push_to_github(
    public_id: str,
    body: GitHubPushBody,
    ctx: AuthContext = Depends(require_auth),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Push the generated project's artifacts to an existing GitHub repo.

    This operates on the generated project, not the ForgeOS source repository.
    The repo must already exist unless the remote URL points to a service that
    can create it on first push.
    """
    prefix = await _resolve_prefix(public_id, ctx, session)
    commit = body.commit_message or f"Publish generated project {public_id}"

    try:
        result = await publish_project(
            prefix=prefix,
            remote_url=body.remote_url,
            branch=body.branch,
            commit_message=commit,
            github_token=body.github_token,
            force=body.force,
        )
    except GitPublishError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {
        "project_id": public_id,
        "branch": result["branch"],
        "remote": body.remote_url,
        "pushed": True,
        "output": result["output"],
    }


__all__ = ["_safe_branch", "_remote_with_token"]

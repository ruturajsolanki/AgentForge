"""FastAPI auth dependency.

In production:
- Clerk-issued JWT in `Authorization: Bearer ...` header
- Validated against the Clerk JWKS endpoint
- Caller is mapped to a tenant + user row in Postgres

In dev (`FORGEOS_DEV_AUTH_BYPASS=true`):
- Any request is treated as belonging to a single "dev" tenant
- The tenant is auto-provisioned on first call
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional, Sequence

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import CLERK_JWKS_URL, CLERK_JWT_ISSUER, DEV_AUTH_BYPASS
from app.db.models import DemandRequest, Role, Task, Tenant, User, UserRoleAssignment
from app.db.session import get_session

logger = logging.getLogger(__name__)


@dataclass
class AuthContext:
    user_id: uuid.UUID
    tenant_id: uuid.UUID
    email: Optional[str]
    role: str
    roles: list[str] = field(default_factory=list)

    def has_role(self, slug: str) -> bool:
        return slug in self.roles

    @property
    def max_hierarchy(self) -> int:
        _MAP = {
            "executive": 6, "higher_manager": 5, "manager": 4,
            "middleware": 3, "leader": 2, "delivery_team": 2,
            "member": 1, "contributor": 1, "viewer": 0, "client": 0,
        }
        return max((_MAP.get(r, 0) for r in self.roles), default=0)


class _JWKSCache:
    def __init__(self) -> None:
        self._keys: dict[str, str] = {}
        self._fetched_at: float = 0.0
        self._ttl: float = 600.0

    async def get_key(self, kid: str) -> Optional[str]:
        if not CLERK_JWKS_URL:
            return None
        if time.time() - self._fetched_at > self._ttl or kid not in self._keys:
            try:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    resp = await client.get(CLERK_JWKS_URL)
                    resp.raise_for_status()
                    data = resp.json()
            except Exception as exc:
                logger.warning("Failed to fetch Clerk JWKS: %s", exc)
                return None
            self._keys = {
                k["kid"]: jwt.algorithms.RSAAlgorithm.from_jwk(k)  # type: ignore[attr-defined]
                for k in data.get("keys", [])
                if k.get("kid")
            }
            self._fetched_at = time.time()
        return self._keys.get(kid)


_jwks = _JWKSCache()


async def _ensure_dev_tenant(session: AsyncSession) -> tuple[Tenant, User]:
    """Create a 'dev' tenant + user on first call if they don't exist."""
    tenant = (await session.execute(select(Tenant).where(Tenant.slug == "dev"))).scalar_one_or_none()
    if not tenant:
        tenant = Tenant(name="Development", slug="dev")
        session.add(tenant)
        await session.flush()
    user = (await session.execute(select(User).where(User.tenant_id == tenant.id))).scalar_one_or_none()
    if not user:
        user = User(tenant_id=tenant.id, email="dev@forgeos.local", role="owner")
        session.add(user)
        await session.flush()
    await session.commit()
    return tenant, user


async def _load_roles(session: AsyncSession, user_id: uuid.UUID) -> list[str]:
    stmt = (
        select(Role.slug)
        .join(UserRoleAssignment, UserRoleAssignment.role_id == Role.id)
        .where(UserRoleAssignment.user_id == user_id)
    )
    result = await session.execute(stmt)
    roles = [row[0] for row in result.all()]
    if not roles:
        roles = ["manager"]
    return roles


async def _resolve_clerk_user(
    session: AsyncSession, payload: dict
) -> tuple[Tenant, User]:
    clerk_user_id: str = payload.get("sub", "")
    email = payload.get("email") or payload.get("email_address")
    org_slug = payload.get("org_slug") or payload.get("org_id") or f"user-{clerk_user_id[:8]}"
    org_name = payload.get("org_name") or org_slug

    user = (
        await session.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    ).scalar_one_or_none()
    if user:
        tenant = (
            await session.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        ).scalar_one_or_none()
        if tenant:
            return tenant, user

    tenant = (
        await session.execute(select(Tenant).where(Tenant.slug == org_slug))
    ).scalar_one_or_none()
    if not tenant:
        tenant = Tenant(name=org_name, slug=org_slug)
        session.add(tenant)
        await session.flush()

    user = User(
        clerk_user_id=clerk_user_id,
        tenant_id=tenant.id,
        email=email,
        role=payload.get("org_role", "member"),
    )
    session.add(user)
    await session.flush()
    await session.commit()
    return tenant, user


async def get_auth_context(
    authorization: Optional[str] = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> AuthContext:
    if DEV_AUTH_BYPASS:
        tenant, user = await _ensure_dev_tenant(session)
        roles = await _load_roles(session, user.id)
        return AuthContext(
            user_id=user.id,
            tenant_id=tenant.id,
            email=user.email,
            role=user.role,
            roles=roles,
        )

    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    token = authorization.split(" ", 1)[1].strip()

    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Bad token: {exc}") from exc

    key = await _jwks.get_key(header.get("kid", ""))
    if not key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown signing key")

    try:
        payload = jwt.decode(
            token,
            key=key,
            algorithms=["RS256"],
            issuer=CLERK_JWT_ISSUER or None,
            options={"verify_aud": False},
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc

    tenant, user = await _resolve_clerk_user(session, payload)
    roles = await _load_roles(session, user.id)
    return AuthContext(
        user_id=user.id,
        tenant_id=tenant.id,
        email=user.email,
        role=user.role,
        roles=roles,
    )


def require_auth(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
    return ctx


def require_role(*slugs: str):
    """FastAPI dependency factory — caller must hold at least one of the listed roles."""
    async def _dep(ctx: AuthContext = Depends(get_auth_context)) -> AuthContext:
        if not any(ctx.has_role(s) for s in slugs):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires one of: {', '.join(slugs)}")
        return ctx
    return Depends(_dep)


async def scope_filter(
    ctx: AuthContext,
    session: AsyncSession,
    entity: str = "demand",
):
    """Return a SQLAlchemy WHERE clause that limits visibility by role.

    Returns a list of filter expressions to AND onto a query.
    """
    if ctx.has_role("higher_manager"):
        return [DemandRequest.tenant_id == ctx.tenant_id]

    if ctx.has_role("manager"):
        return [
            DemandRequest.tenant_id == ctx.tenant_id,
            (DemandRequest.assigned_manager_id == ctx.user_id)
            | (DemandRequest.created_by == ctx.user_id),
        ]

    if ctx.has_role("middleware"):
        return [
            DemandRequest.tenant_id == ctx.tenant_id,
            (DemandRequest.stage == "awaiting_approval")
            | (DemandRequest.assigned_middleware_id == ctx.user_id),
        ]

    if ctx.has_role("leader"):
        return [
            DemandRequest.tenant_id == ctx.tenant_id,
            DemandRequest.assigned_leader_id == ctx.user_id,
        ]

    if ctx.has_role("member") and entity == "task":
        return [Task.owner_id == ctx.user_id]

    return [DemandRequest.tenant_id == ctx.tenant_id, DemandRequest.created_by == ctx.user_id]

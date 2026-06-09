"""Shared pytest fixtures for ForgeOS backend E2E tests.

Strategy:
- Point the app at a dedicated `forgeos_test` database on the dev Postgres
  (pgvector image) BEFORE importing any app module.
- Run in demo mode (deterministic, offline heuristics) with dev auth bypass.
- Create the schema with metadata.create_all + seed the role catalog.
- Truncate all tenant-scoped data before each test (roles are preserved).
- Provide an httpx AsyncClient bound to the ASGI app, a raw DB session, and an
  `as_role` helper to grant roles to the auto-provisioned dev user.

A session-scoped event loop (see pytest.ini) keeps the SQLAlchemy async engine's
pooled connections on a single loop for the whole run.
"""

from __future__ import annotations

import os

# ── Environment must be configured before importing app modules ──────────
TEST_DB_NAME = os.getenv("FORGEOS_TEST_DB", "forgeos_test")
_PG = {
    "user": os.getenv("FORGEOS_TEST_PG_USER", "forgeos"),
    "password": os.getenv("FORGEOS_TEST_PG_PASSWORD", "forgeos"),
    "host": os.getenv("FORGEOS_TEST_PG_HOST", "localhost"),
    "port": int(os.getenv("FORGEOS_TEST_PG_PORT", "5432")),
}

os.environ["DATABASE_URL"] = (
    f"postgresql+asyncpg://{_PG['user']}:{_PG['password']}@{_PG['host']}:{_PG['port']}/{TEST_DB_NAME}"
)
os.environ["FORGEOS_DEMO"] = "true"
os.environ["FORGEOS_DEV_AUTH_BYPASS"] = "true"
# Avoid loading the developer's on-disk settings (which could flip demo_mode).
os.environ["FORGEOS_SETTINGS_PATH"] = "/tmp/forgeos_test_settings.json"

import asyncpg  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import delete, text  # noqa: E402


ROLE_SEEDS = [
    ("executive", "Executive", 6),
    ("higher_manager", "Higher Manager", 5),
    ("manager", "Manager", 4),
    ("middleware", "Middleware", 3),
    ("leader", "Leader", 2),
    ("delivery_team", "Delivery Team", 2),
    ("member", "Team Member", 1),
    ("contributor", "Contributor", 1),
    ("viewer", "Viewer", 0),
    ("client", "Client", 0),
]


async def _ensure_database() -> None:
    """Create the test database + pgvector extension if missing."""
    sys_conn = await asyncpg.connect(database=_PG_DEFAULT_DB(), **_PG)
    try:
        exists = await sys_conn.fetchval(
            "SELECT 1 FROM pg_database WHERE datname = $1", TEST_DB_NAME
        )
        if not exists:
            await sys_conn.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        await sys_conn.close()

    conn = await asyncpg.connect(database=TEST_DB_NAME, **_PG)
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    finally:
        await conn.close()


def _PG_DEFAULT_DB() -> str:
    # Connect to the always-present app DB to issue CREATE DATABASE.
    return os.getenv("FORGEOS_TEST_PG_ADMIN_DB", "forgeos")


async def _create_schema() -> None:
    from app.db.models import Base
    from app.db.session import engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await _seed_roles()
    # Drop pooled connections created during setup so per-test code starts fresh.
    await engine.dispose()


async def _seed_roles() -> None:
    from app.db import AsyncSessionLocal
    from app.db.models import Role
    from sqlalchemy import select

    async with AsyncSessionLocal() as s:
        existing = {
            r for (r,) in (await s.execute(select(Role.slug))).all()
        }
        for slug, label, level in ROLE_SEEDS:
            if slug not in existing:
                s.add(Role(slug=slug, label=label, hierarchy_level=level))
        await s.commit()


@pytest.fixture(scope="session", autouse=True)
def _bootstrap_db():
    import asyncio

    asyncio.run(_ensure_database())
    asyncio.run(_create_schema())
    yield


@pytest_asyncio.fixture(autouse=True)
async def _clean_tables():
    """Truncate all tenant-scoped data before each test (roles preserved)."""
    from app.db.session import engine

    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE tenants CASCADE"))
    yield


@pytest_asyncio.fixture
async def client():
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def db_session():
    from app.db import AsyncSessionLocal

    async with AsyncSessionLocal() as s:
        yield s


@pytest_asyncio.fixture
async def dev_identity():
    """Ensure the dev tenant/user exist and return (tenant, user)."""
    from app.auth.dependency import _ensure_dev_tenant
    from app.db import AsyncSessionLocal

    async with AsyncSessionLocal() as s:
        tenant, user = await _ensure_dev_tenant(s)
        return tenant, user


@pytest_asyncio.fixture
async def as_role():
    """Return an async helper to assign role(s) to the dev user.

    Usage:  await as_role("higher_manager")  ->  (tenant, user)
    Clears prior assignments so role checks are deterministic.
    """
    from app.auth.dependency import _ensure_dev_tenant
    from app.db import AsyncSessionLocal
    from app.db.models import UserRoleAssignment
    from app.db.repositories import RoleRepository

    async def _assign(*slugs: str):
        async with AsyncSessionLocal() as s:
            tenant, user = await _ensure_dev_tenant(s)
            await s.execute(
                delete(UserRoleAssignment).where(UserRoleAssignment.user_id == user.id)
            )
            repo = RoleRepository(s)
            for slug in slugs:
                await repo.assign(tenant_id=tenant.id, user_id=user.id, role_slug=slug)
            await s.commit()
            return tenant, user

    return _assign


# ── Convenience helpers shared across suites ─────────────────────────────

DEMAND_TEXT = (
    "Build a customer support dashboard with user authentication, role-based "
    "access, a chat interface, analytics charts, and Salesforce CRM integration. "
    "It must support 500 concurrent users and comply with GDPR."
)


async def create_demand(client: AsyncClient, text: str = DEMAND_TEXT) -> dict:
    """Create a demand and return the response payload (awaiting_approval)."""
    resp = await client.post("/api/demands", json={"text": text})
    assert resp.status_code == 200, resp.text
    return resp.json()

"""Notification emit helper.

Centralises creation of durable per-user notifications so routers/worker don't
need to know about the model. Safe to call inside an existing DB session — the
caller is responsible for committing.
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import NotificationRepository


async def notify(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    user_id: Optional[uuid.UUID],
    kind: str,
    title: str,
    body: Optional[str] = None,
    entity_kind: Optional[str] = None,
    entity_id: Optional[str] = None,
) -> None:
    """Create a notification row. Never raises — notifications are best-effort."""
    try:
        await NotificationRepository(session).create(
            tenant_id=tenant_id,
            user_id=user_id,
            kind=kind,
            title=title,
            body=body,
            entity_kind=entity_kind,
            entity_id=entity_id,
        )
    except Exception:
        # A failed notification must never break the primary action.
        pass

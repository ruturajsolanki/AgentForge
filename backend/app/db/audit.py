"""Audit system — records every state-changing operation.

Provides both a programmatic `record()` helper for explicit labelled events
(e.g. "approved", "escalated") and a SQLAlchemy `after_flush` listener that
catches any writes the code path forgot to log.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import event, inspect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session as SyncSession

from app.db.models import (
    AuditEvent,
    Base,
    DemandRequest,
    SwonRecord,
    Task,
    TaskHandoff,
    TeamMember,
    UserRoleAssignment,
    WonRecord,
)

logger = logging.getLogger(__name__)

TRACKED_MODELS = (
    DemandRequest, SwonRecord, WonRecord,
    Task, TaskHandoff, TeamMember, UserRoleAssignment,
)

MODEL_TO_KIND = {
    DemandRequest: "demand",
    SwonRecord: "swon",
    WonRecord: "won",
    Task: "task",
    TaskHandoff: "handoff",
    TeamMember: "team_member",
    UserRoleAssignment: "user_role",
}


async def record(
    session: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    entity_kind: str,
    entity_id: str,
    action: str,
    actor_id: Optional[uuid.UUID] = None,
    diff: Optional[dict] = None,
    reason: Optional[str] = None,
) -> AuditEvent:
    ev = AuditEvent(
        tenant_id=tenant_id,
        entity_kind=entity_kind,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        diff=diff,
        reason=reason,
    )
    session.add(ev)
    await session.flush()
    return ev


def _get_entity_id(obj: Base) -> str:
    pk = inspect(obj).mapper.primary_key_from_instance(obj)
    return str(pk[0]) if pk else ""


def _get_tenant_id(obj: Base) -> Optional[uuid.UUID]:
    return getattr(obj, "tenant_id", None)


def _dirty_diff(obj: Base) -> dict:
    """Compute changed columns for an UPDATE."""
    insp = inspect(obj)
    changes = {}
    for attr in insp.attrs:
        hist = attr.history
        if hist.has_changes():
            old = hist.deleted[0] if hist.deleted else None
            new = hist.added[0] if hist.added else None
            if old != new:
                key = attr.key
                changes[key] = {"before": _serialise(old), "after": _serialise(new)}
    return changes


def _serialise(val):
    if isinstance(val, (datetime,)):
        return val.isoformat()
    if isinstance(val, uuid.UUID):
        return str(val)
    if isinstance(val, (dict, list)):
        return val
    return val


def _after_flush(sync_session: SyncSession, flush_context) -> None:
    """Sync-side listener that fires inside the flush transaction."""
    for obj in list(sync_session.new):
        if not isinstance(obj, TRACKED_MODELS) or isinstance(obj, AuditEvent):
            continue
        tid = _get_tenant_id(obj)
        if not tid:
            continue
        kind = MODEL_TO_KIND.get(type(obj), type(obj).__tablename__)
        eid = _get_entity_id(obj)
        if not eid:
            continue
        ev = AuditEvent(
            tenant_id=tid,
            entity_kind=kind,
            entity_id=eid,
            action="created",
            diff=None,
        )
        sync_session.add(ev)

    for obj in list(sync_session.dirty):
        if not isinstance(obj, TRACKED_MODELS) or isinstance(obj, AuditEvent):
            continue
        if not sync_session.is_modified(obj, include_collections=False):
            continue
        tid = _get_tenant_id(obj)
        if not tid:
            continue
        kind = MODEL_TO_KIND.get(type(obj), type(obj).__tablename__)
        eid = _get_entity_id(obj)
        diff = _dirty_diff(obj)
        if not diff:
            continue
        ev = AuditEvent(
            tenant_id=tid,
            entity_kind=kind,
            entity_id=eid,
            action="updated",
            diff=diff,
        )
        sync_session.add(ev)

    for obj in list(sync_session.deleted):
        if not isinstance(obj, TRACKED_MODELS) or isinstance(obj, AuditEvent):
            continue
        tid = _get_tenant_id(obj)
        if not tid:
            continue
        kind = MODEL_TO_KIND.get(type(obj), type(obj).__tablename__)
        eid = _get_entity_id(obj)
        ev = AuditEvent(
            tenant_id=tid,
            entity_kind=kind,
            entity_id=eid,
            action="deleted",
            diff=None,
        )
        sync_session.add(ev)


def install_audit_hooks() -> None:
    """Call once at app startup to register the flush listener globally."""
    event.listen(SyncSession, "after_flush", _after_flush)
    logger.info("Audit hooks installed for %d model types", len(TRACKED_MODELS))

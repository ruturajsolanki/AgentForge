"""Higher-Manager sanitizer — strips sensitive/negative data."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

EXCLUDED_STAGES = {"failed", "cancelled"}

EXCLUDED_FIELDS = {
    "error", "risk_factors", "uncovered_skills", "coverage_score",
    "aging_days", "sla_breach_count", "blocked_reason",
    "escalation_count", "escalation_history",
}

ALLOWED_AUDIT_ACTIONS = {
    "approved", "swon.opened", "swon.closed",
    "task.completed", "demand.shipped", "milestone.reached",
    "created", "state_changed",
}


class SanitizedDemandEntry(BaseModel):
    id: str
    public_id: str
    stage: str
    summary: str
    created_at: Optional[str] = None
    completed_at: Optional[str] = None


class SanitizedPortfolioResponse(BaseModel):
    demands: list[SanitizedDemandEntry]
    closed_swons_count: int
    active_swons_count: int
    total_demands: int


def sanitize_demand(raw: dict) -> Optional[SanitizedDemandEntry]:
    """Filter a single demand dict for higher-manager consumption."""
    if raw.get("stage") in EXCLUDED_STAGES:
        return None
    return SanitizedDemandEntry(
        id=raw.get("id", ""),
        public_id=raw.get("public_id", ""),
        stage=raw.get("stage", ""),
        summary=(raw.get("raw_text") or "")[:200],
        created_at=raw.get("created_at"),
        completed_at=raw.get("completed_at"),
    )


def sanitize_portfolio(raw_demands: list[dict], closed_swons: int, active_swons: int) -> SanitizedPortfolioResponse:
    entries = []
    for d in raw_demands:
        entry = sanitize_demand(d)
        if entry:
            entries.append(entry)
    return SanitizedPortfolioResponse(
        demands=entries,
        closed_swons_count=closed_swons,
        active_swons_count=active_swons,
        total_demands=len(entries),
    )


def sanitize_audit_events(events: list[dict]) -> list[dict]:
    return [e for e in events if e.get("action") in ALLOWED_AUDIT_ACTIONS]


def assert_no_leaks(data: dict) -> None:
    """Raise if any excluded field leaks into the sanitized response."""
    def _check(obj, path=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in EXCLUDED_FIELDS:
                    raise AssertionError(f"Leaked field '{k}' at {path}.{k}")
                _check(v, f"{path}.{k}")
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                _check(item, f"{path}[{i}]")
    _check(data)

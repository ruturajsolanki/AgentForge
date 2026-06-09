"""Tests for the Higher-Manager sanitizer."""

from app.sanitizer import (
    EXCLUDED_FIELDS,
    assert_no_leaks,
    sanitize_audit_events,
    sanitize_demand,
    sanitize_portfolio,
)


def test_sanitize_demand_filters_failed():
    raw = {"id": "1", "public_id": "DMD-001", "stage": "failed", "raw_text": "test"}
    assert sanitize_demand(raw) is None


def test_sanitize_demand_filters_cancelled():
    raw = {"id": "2", "public_id": "DMD-002", "stage": "cancelled", "raw_text": "test"}
    assert sanitize_demand(raw) is None


def test_sanitize_demand_passes_valid():
    raw = {"id": "3", "public_id": "DMD-003", "stage": "executing", "raw_text": "build an app"}
    entry = sanitize_demand(raw)
    assert entry is not None
    assert entry.stage == "executing"
    assert entry.public_id == "DMD-003"


def test_sanitize_portfolio_excludes_sensitive_stages():
    demands = [
        {"id": "1", "public_id": "DMD-001", "stage": "completed", "raw_text": "done"},
        {"id": "2", "public_id": "DMD-002", "stage": "failed", "raw_text": "bad"},
        {"id": "3", "public_id": "DMD-003", "stage": "cancelled", "raw_text": "nope"},
        {"id": "4", "public_id": "DMD-004", "stage": "executing", "raw_text": "ongoing"},
    ]
    result = sanitize_portfolio(demands, closed_swons=5, active_swons=3)
    assert result.total_demands == 2
    stages = {d.stage for d in result.demands}
    assert "failed" not in stages
    assert "cancelled" not in stages


def test_sanitized_response_has_no_excluded_fields():
    demands = [
        {
            "id": "1", "public_id": "DMD-001", "stage": "executing",
            "raw_text": "test", "error": "some error",
            "risk_factors": ["budget"], "uncovered_skills": ["ml"],
            "coverage_score": 0.3, "blocked_reason": "deps",
        }
    ]
    result = sanitize_portfolio(demands, 0, 0)
    data = result.model_dump()
    assert_no_leaks(data)


def test_assert_no_leaks_catches_nested_leak():
    data = {
        "demands": [
            {"id": "1", "public_id": "DMD-001", "stage": "ok", "error": "leaked!"}
        ]
    }
    try:
        assert_no_leaks(data)
        assert False, "Should have raised"
    except AssertionError as e:
        assert "error" in str(e)


def test_no_individual_user_names_in_sanitized_output():
    demands = [
        {"id": "1", "public_id": "DMD-001", "stage": "executing", "raw_text": "test"},
    ]
    result = sanitize_portfolio(demands, 1, 1)
    json_str = result.model_dump_json()
    assert "member" not in json_str.lower() or "team_member" not in json_str.lower()


def test_sanitize_audit_events():
    events = [
        {"action": "approved", "entity_kind": "demand"},
        {"action": "failed", "entity_kind": "demand"},
        {"action": "risk_flag", "entity_kind": "task"},
        {"action": "state_changed", "entity_kind": "swon"},
    ]
    filtered = sanitize_audit_events(events)
    actions = [e["action"] for e in filtered]
    assert "approved" in actions
    assert "state_changed" in actions
    assert "failed" not in actions
    assert "risk_flag" not in actions

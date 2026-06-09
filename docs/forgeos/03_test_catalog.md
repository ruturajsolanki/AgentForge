# ForgeOS — Test Catalog

ForgeOS ships a two-tier end-to-end test suite: backend API tests (pytest +
httpx against a real Postgres) and frontend UI tests (Playwright driving a real
browser). This catalog documents every test and how to run them.

## How to Run

Prerequisites: start the dev infrastructure (Postgres + Redis + MinIO):

```
docker compose -f deploy/docker-compose.dev.yml up -d
```

Backend (99 test cases):

```
cd backend && python3 -m pytest -q
```

Frontend (41 UI test cases):

```
cd frontend && npx playwright test
```

## Backend Test Architecture

`backend/tests/conftest.py` configures the environment before importing the app:
it points `DATABASE_URL` at a dedicated `forgeos_test` database on the dev
Postgres (pgvector image), enables demo mode (deterministic, offline heuristics)
and the dev auth bypass. A session-scoped fixture creates the schema and seeds
the role catalog; data tables are truncated before each test (roles preserved).
A session-scoped event loop keeps the async engine's pooled connections valid.

Fixtures: `client` (httpx AsyncClient over the ASGI app), `db_session` (raw
session for assertions/seeding), `dev_identity` (the auto-provisioned dev
tenant/user), and `as_role(*slugs)` which assigns roles to the dev user so
role-gated routes can be exercised.

## Backend Suites

### test_smoke.py — harness sanity (4)
- test_health_ok — health endpoint responds.
- test_dev_auth_default_manager — dev user can read settings.
- test_as_role_grants_role — granting a role unlocks the executive dashboard.
- test_create_demand_smoke — creating a demand returns a full plan.

### test_health_settings.py — health, settings, routing (6)
- test_health_no_auth_required — /api/health needs no auth.
- test_get_settings — settings include demo_mode true.
- test_update_settings_roundtrip — agent_concurrency persists.
- test_update_settings_clamps_values — worker_max_jobs is clamped.
- test_llm_routing — routing table returns.
- test_llm_models — model list returns.

### test_demand_pipeline.py — intake pipeline (15)
- test_clarify_returns_questions_with_options — clarify questions include options.
- test_clarify_detailed_demand_is_more_complete — completeness scales with detail.
- test_converse_returns_followups_and_readiness — converse returns follow-ups + readiness.
- test_converse_becomes_ready_with_rich_history — multi-turn returns a valid score.
- test_create_demand_full_plan — understanding/decision/allocation/reuse present.
- test_create_demand_with_clarifications_enriches_text — answers enrich raw text.
- test_list_demands_pagination_and_total — pagination + total + has_more.
- test_list_demands_filter_by_stage — stage filter.
- test_list_demands_search — text search.
- test_get_demand_includes_agent_runs_key — single demand includes agent_runs.
- test_get_demand_404 — unknown demand returns 404.
- test_stage_change_records_audit — stage change writes an audit event.
- test_reassign_demand — reassign succeeds.
- test_reassign_invalid_field — invalid field returns 400.
- test_manager_chat_fallback — manager copilot returns a response.

### test_execution.py — approval + worker pipeline (4)
- test_approve_transitions_to_executing — approve moves to executing + enqueues.
- test_approve_idempotent_when_not_awaiting — repeat approve is safe.
- test_run_full_pipeline_completes — full pipeline reaches completed with runs/artifacts.
- test_run_full_pipeline_handles_executor_failure — executor failure marks failed.

### test_rbac.py — role access + sanitizer (10, several parametrized)
- test_executive_dashboard_allowed_roles — executive/higher_manager/manager allowed.
- test_executive_dashboard_forbidden_roles — leader/member/viewer/client forbidden.
- test_manager_dashboard — manager dashboard allowed.
- test_leader_dashboard_allowed — leader dashboard allowed.
- test_leader_dashboard_forbidden_for_viewer — viewer forbidden.
- test_reports_allowed_for_manager — all reports allowed for manager.
- test_reports_forbidden_for_member — reports forbidden for member.
- test_report_csv_export — CSV export works.
- test_portfolio_sanitized_no_failed_or_risk_leak — sanitized portfolio hides failed/risk.
- test_portfolio_unsanitized_allowed_for_manager — unsanitized portfolio allowed.

### test_delivery.py — SWON/WON/tasks/audit (7)
- test_swon_create_requires_role — non-manager cannot create a SWON.
- test_swon_lifecycle — SWON create/list/get/state.
- test_won_lifecycle — WON create/list/state.
- test_task_full_lifecycle — task create/status/update/timeline/list.
- test_task_create_forbidden_for_member — member cannot create tasks.
- test_task_handoff — handoff succeeds.
- test_audit_pagination_and_filter — audit pagination + entity filter.

### test_portal.py — client portal (5)
- test_portal_create_request_infers_plan — request creates a planned demand.
- test_portal_list_requests — listing works.
- test_portal_add_message_and_patch — messages + status patch.
- test_portal_agent_chat — agent copilot responds.
- test_portal_team_crud — team create/list/update.

### test_allocation_move.py — reallocation signal (4)
- test_augment_marks_busy_member_for_move — busy member flagged with probability/importance.
- test_augment_ignores_available_members — available member not flagged.
- test_augment_ignores_agents — AI agents are never moved.
- test_create_demand_surfaces_move_when_humans_busy — busy humans surface the signal end to end.

### test_notifications.py — notification feed (6)
- test_demand_creation_emits_approval_notification — approval notification emitted.
- test_mark_one_read_decrements_unread — marking one read decrements the count.
- test_mark_all_read — read-all clears unread.
- test_unread_only_filter — unread filter returns only unread.
- test_reassign_notifies_assignee — reassignment notifies the assignee.
- test_swon_state_change_notifies — SWON state change emits a notification.

### test_email_sharelink.py — live-link email (4)
- test_share_link_sets_preview_and_logs_email — preview URL set + email logged.
- test_list_demand_emails — emails are listed for a demand.
- test_share_link_custom_link — a custom link is honored.
- test_share_link_unknown_demand_404 — unknown demand returns 404.

### test_team_edit.py — editable team (5)
- test_team_catalog_includes_trainers_and_learners — catalog has members/trainers/learners.
- test_add_trainer_and_learner — adding a trainer and AI-learner works.
- test_remove_member — removing a member works.
- test_team_edit_recomputes_cost_and_audits — cost recomputed + audited.
- test_team_edit_dedupes — duplicate adds are de-duplicated.

### test_github_commits.py — publisher + commits (8)
- test_safe_branch_valid / test_safe_branch_invalid — branch validation.
- test_remote_with_token_injects_token / passthrough — remote token handling.
- test_auto_publish_noop_when_unconfigured — no publish when unconfigured.
- test_auto_publish_runs_when_configured — publish + agent commit + event when configured.
- test_commit_create_and_list — commit CRUD.
- test_commit_unknown_demand_404 — unknown demand returns 404.

### test_sanitizer.py — sanitizer unit tests (8)
Covers sanitize_demand (failed/cancelled/valid), portfolio exclusion of
sensitive stages and fields, no individual user names leaked, audit-event
sanitization, and assert_no_leaks catching nested leaks.

## Frontend Test Architecture

`frontend/e2e/helpers/auth.ts` seeds a logged-in session directly into
localStorage (the exact shape the app writes), bypassing the custom login form.
`frontend/e2e/helpers/api.ts` (`mockApi`) intercepts `/api/**` and returns
deterministic, correctly-shaped responses so specs do not depend on a running
backend. Playwright starts the Vite dev server automatically.

## Frontend Specs

### delivery-happy-path.spec.ts (6)
Manager console, sanitized higher-manager portfolio (no risk leak), leader board,
member work, the dev delivery component gallery, and the reports page.

### auth-roles.spec.ts (8 literal, expands per role)
Each role lands on its own distinct dashboard with a persona banner; no-session
redirects to login; viewer denied executive; member denied reports; client routed
to the client landing; navigation is role-tailored (manager has Settings, viewer
does not); header shows the active role badge.

### profile.spec.ts (4)
Manager profile shows identity/role and a demands panel; member profile shows the
tasks panel and the correct role; viewer profile shows read-only capabilities;
the header profile link navigates to /profile.

### dashboards.spec.ts (6)
Executive, sanitized higher-manager, manager, middleware, leader, and member
dashboards each render their headline.

### manager-wizard.spec.ts (2)
Step 1 to the clarify chat shows AI questions with clickable option chips that
populate the free-text answer; the clarity progress bar is shown.

### client-demand.spec.ts (1)
Client describes an outcome, then sees the AI clarify chat with option chips and
a custom answer box.

### delivery.spec.ts (2)
The delivery view renders the pipeline, KPIs, and the commit timeline; the share-
live-link dialog sends to the client and closes on success.

### notifications.spec.ts (2)
The bell shows an unread badge and lists notifications; mark-all-read clears it.

### reports-audit.spec.ts (2)
The manager reports page shows export buttons and tabs; the audit history page
renders.

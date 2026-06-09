# ForgeOS — REST API Reference

All endpoints are JSON over HTTP. In local/dev mode, auth is bypassed and the
caller is the auto-provisioned dev user (default role: manager). In production,
a Clerk JWT bearer token is required. Role-gated endpoints return 403 when the
caller lacks an allowed role.

Conventions: `{id}` is a public identifier where noted (demands `DMD-XXXX`, SWON
`SWON-XXXX`, WON `WON-XXXX`, tasks `TSK-XXXX`) and a UUID otherwise.

## Demand & Pipeline (prefix /api)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| POST | /api/demands/clarify | any | Generate initial clarifying questions (with options) |
| POST | /api/demands/converse | any | Continue the multi-turn clarification |
| POST | /api/demands | any | Create a demand; runs the full plan synchronously |
| POST | /api/demands/{id}/approve | any | Approve and enqueue execution |
| POST | /api/demands/{id}/manager-chat | any | Manager planning copilot |
| GET | /api/demands | any | List/paginate/filter/sort demands |
| GET | /api/demands/{id} | any | Single demand plus agent runs |
| PATCH | /api/demands/{id}/stage | any | Change stage with reason (audited) |
| PATCH | /api/demands/{id}/reassign | any | Reassign manager/leader/middleware |
| POST | /api/demands/{id}/share-link | any | Email a live link to the client |
| GET | /api/demands/{id}/emails | any | List emails sent for a demand |
| POST | /api/demands/{id}/commits | any | Record a commit against a demand |
| GET | /api/demands/{id}/commits | any | List commits for a demand |
| GET | /api/demands/team/catalog | any | Addable resources (bench, trainers, AI-learners) |
| PATCH | /api/demands/{id}/team | any | Add/remove team members on a plan |

### POST /api/demands/clarify
Request: `{ "text": "<demand text>" }`
Response: `{ "questions": [ { "id", "question", "why", "category", "options": ["..."] } ], "completeness_score": 0.0-1.0 }`

### POST /api/demands/converse
Request: `{ "text": "<demand>", "history": [ { "role": "user|assistant", "content": "" } ], "message": "<latest user message>" }`
Response: `{ "message", "follow_up_questions": [ { "id", "question", "why", "category", "options" } ], "ready_for_plan": bool, "completeness_score" }`

### POST /api/demands
Request: `{ "text": "<demand>", "clarifications": [ { "question_id", "question", "answer" } ] }` (clarifications optional)
Response: `{ "demand_id", "stage": "awaiting_approval", "understanding", "decision", "allocation", "similar_projects", "reuse_score" }`
The allocation team entries carry the reallocation signal fields:
`kind`, `currently_allocated_to`, `move_recommended`, `move_probability`, `move_importance`, `move_rationale`.

### GET /api/demands
Query: `stage`, `search`, `sort`, `order` (asc/desc), `limit`, `offset`.
Response: `{ "items": [ ...demand ], "total", "limit", "offset", "has_more" }`

### PATCH /api/demands/{id}/stage
Request: `{ "stage": "<new stage>", "reason": "<optional>" }`

### PATCH /api/demands/{id}/reassign
Request: `{ "field": "assigned_manager_id|assigned_leader_id|assigned_middleware_id", "user_id": "<uuid>", "reason": "<optional>" }`

### POST /api/demands/{id}/share-link
Request: `{ "client_email": "x@y.com", "link": "<optional override>", "message": "<optional>" }`
Response: `{ "status": "ok", "preview_url", "email": { "id", "to", "delivered", "provider" } }`

### POST /api/demands/{id}/commits
Request: `{ "sha", "author", "message", "files_changed", "branch", "is_agent", "task_public_id"? }`

### PATCH /api/demands/{id}/team
Request: `{ "add": [ { "name", "title", "resource_type", "kind": "member|trainer|learner", "skills", "cost_per_day", "allocation_percentage" } ], "remove": ["<name>"], "reason": "<optional>" }`
Response: `{ "status": "ok", "allocation": { ...updated allocation } }`

## Notifications (prefix /api/notifications)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/notifications | any | List notifications + unread count |
| POST | /api/notifications/{id}/read | any | Mark one as read |
| POST | /api/notifications/read-all | any | Mark all as read |

GET response: `{ "items": [ { "id", "kind", "title", "body", "entity_kind", "entity_id", "read", "created_at" } ], "unread_count" }`
Notifications are emitted on: demand routing (`approval_needed`), approval
(`approved`), reassignment (`assignment`), task handoff (`handoff`), SWON state
(`swon_state`), WON state (`won_state`), team edits (`team_edited`).

## SWON (prefix /api/swon)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/swon | any | List SWONs for the tenant |
| GET | /api/swon/{id} | any | Get a SWON by public id or UUID |
| POST | /api/swon | manager, higher_manager | Create a SWON |
| PATCH | /api/swon/{id}/state | manager, higher_manager | Update lifecycle state |

Create request: `{ "demand_id": "<uuid>", "customer_loa_ref"?, "sow_summary"?, "total_value_inr"? }`

## WON (prefix /api/won)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/won | any | List (filter by swon, else tenant) |
| POST | /api/won | manager, higher_manager | Create a WON under a SWON |
| PATCH | /api/won/{id} | manager, higher_manager | Update WON state |

Create request: `{ "swon_id": "<uuid>", "billable", "resource_id"?, "cost_centre"?, "allocation_pct", "monthly_value_inr"? }`

## Tasks (prefix /api/tasks)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/tasks | any | List (by demand_id/owner_id/status; defaults to caller) |
| GET | /api/tasks/{id} | any | Get a task |
| POST | /api/tasks | manager, leader, middleware | Create a task |
| PATCH | /api/tasks/{id}/status | any | Update status (+ blocked reason) |
| POST | /api/tasks/{id}/updates | any | Add a comment/update |
| GET | /api/tasks/{id}/timeline | any | Merged updates + handoffs |
| POST | /api/tasks/{id}/handoff | any | Request a handoff (notifies assignee) |

## Audit (prefix /api/audit)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/audit | any | Paginated activity log |

Query: `entity_kind`, `entity_id`, `action`, `actor`, `since`, `limit` (<=500), `offset`.

## Dashboards (prefix /api/dashboard)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/dashboard/executive | executive, higher_manager, manager | Org KPIs |
| GET | /api/dashboard/manager | manager, higher_manager, executive | Manager console data |
| GET | /api/dashboard/leader | leader, delivery_team, manager, higher_manager, executive | Team execution data |

## Reports (prefix /api/reports)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/reports/delivery | manager, higher_manager | Delivery metrics |
| GET | /api/reports/team-performance | manager, higher_manager | Team performance |
| GET | /api/reports/demand-aging | manager, higher_manager | Demand aging |
| GET | /api/reports/sla-compliance | manager, higher_manager | SLA compliance |
| GET | /api/reports/swon-detail | manager, higher_manager | SWON detail |
| GET | /api/reports/portfolio | higher_manager, manager | Portfolio (supports sanitized=true) |

Most reports accept `format=json|csv|excel` for export.

## Client Portal (prefix /api/portal)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/portal/requests | any | List client requests |
| POST | /api/portal/requests | any | Create a request; infers and plans |
| PATCH | /api/portal/requests/{id} | any | Update status/plan/approved team |
| POST | /api/portal/requests/{id}/messages | any | Add a thread message |
| POST | /api/portal/requests/{id}/agent-chat | any | AI copilot for the request |
| GET | /api/portal/team | any | List portal team members |
| POST | /api/portal/team | any | Create a team member |
| PUT | /api/portal/team/{id} | any | Update a team member |

Create request body: `{ "client": { "name", "email", "company", "role" }, "description", "industry"?, "priority"?, "timeline"?, "budget_range"? }`

## GitHub, Projects, Artifacts

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| POST | /api/projects/{id}/github/push | any | Publish generated project to a remote |
| GET | /api/projects/{id}/files | any | List generated files |
| GET/PUT | /api/projects/{id}/files/{path} | any | Read/write a file |
| POST | /api/projects/{id}/server/start | any | Start the dev preview server |
| GET | /artifacts/{key} | any | Stream a stored artifact |

## Settings & Health (prefix /api)

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | /api/health | none | Liveness probe (no auth) |
| GET | /api/settings | any | Read runtime settings |
| PUT | /api/settings | any | Update runtime settings |
| GET | /api/llm/routing | any | Current model routing table |
| GET | /api/llm/models | any | Available models |

## WebSocket

`WS /ws` — per-tenant socket. Sends an `init` payload, relays Redis pub/sub
pipeline/agent events, and accepts browser-LLM bridge responses and pings.

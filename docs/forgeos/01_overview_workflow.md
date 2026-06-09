# ForgeOS — System Overview & End-to-End Workflow

## What ForgeOS Is

ForgeOS is a unified, AI-assisted demand-to-delivery operating system. A client
submits a free-text demand; an AI delivery architect refines it through a
multi-turn conversation; the platform produces a detailed plan, allocates a team
(human + AI agents), routes it to a manager for review and approval, executes the
build through an agent fleet, and tracks delivery end to end with full audit,
SWON/WON commercial records, notifications, and a sanitized higher-management
portfolio.

The platform is multi-tenant: every business row carries a `tenant_id` for
isolation. Access is governed by a role hierarchy enforced both in the backend
(RBAC dependencies) and the frontend (route guards + role-tailored navigation).

## Role Hierarchy

ForgeOS defines ten roles with an explicit hierarchy level. Higher levels can
see more; lower levels see a focused, role-specific workspace.

| Role | Level | Workspace landing | Primary responsibility |
| --- | --- | --- | --- |
| Executive | 6 | /dashboard/executive | Org-wide KPIs and trends |
| Higher Manager | 5 | /dashboard/higher-manager | Sanitized portfolio oversight |
| Manager | 4 | /dashboard/manager | Plan review, approval, team edits |
| Middleware | 3 | /dashboard/middleware | Intake routing and handoffs |
| Leader | 2 | /dashboard/leader | Squad execution and task board |
| Delivery Team | 2 | /dashboard/delivery | Squad throughput |
| Member | 1 | /dashboard/member | Individual task execution |
| Contributor | 1 | /dashboard/contributor | Tasks plus code commits |
| Viewer | 0 | /dashboard/viewer | Read-only portfolio and audit |
| Client | 0 | /client | Demand submission and tracking |

Each role gets a distinct dashboard, a role-tailored left navigation, a header
role badge, and a personal Profile page describing identity, role, hierarchy
level, and capabilities.

## The Demand Lifecycle (Stage Machine)

A demand advances through an ordered set of stages. The planner pipeline drives
the early stages synchronously; the background worker drives execution.

```
ingested -> understanding -> deciding -> allocating -> awaiting_approval
         -> executing -> monitoring -> explaining -> completed
```

Terminal/auxiliary stages: `failed`, `cancelled`. The sanitizer hides `failed`
and `cancelled` demands (and sensitive fields) from the higher-manager view.

## End-to-End Flow

### 1. Client writes a demand
The client submits a free-text description through the client portal
(`POST /api/portal/requests`) or an internal user creates one through the wizard
(`POST /api/demands`). Minimal input is accepted; the platform infers structure.

### 2. AI back-and-forth clarification (multi-turn, with options)
If the demand lacks detail, the AI delivery architect asks targeted clarifying
questions. Each question includes a short rationale and three suggested answer
options, while still allowing a free-text custom answer.

- `POST /api/demands/clarify` returns the first set of questions plus a
  completeness score.
- `POST /api/demands/converse` continues the conversation, acknowledging the
  latest answer, asking focused follow-ups, and reporting whether the demand is
  now detailed enough (`ready_for_plan`).

The engine has an LLM path and a deterministic heuristic fallback, so the
conversation works even offline (demo mode).

### 3. AI produces a detailed plan
On creation, the pipeline runs Understanding -> Reuse detection -> Decision ->
Allocation and persists the demand in `awaiting_approval` with a full snapshot:

- Understanding: problem type, domain, complexity, urgency, scope days, required
  skills, key features, summary.
- Decision: execution mode (AI agent / human team / hybrid / reuse), project
  type, estimated cost, estimated time, confidence, risk factors.
- Allocation: a team drawn from a 50-person bench (humans, AI agents, partner
  vendors) with coverage scoring and per-resource match scores.

### 4. DB-sourced allocation and "should we move this member?"
After allocation, the pipeline cross-references the live `team_members` table.
If a recommended person is already committed to another active project, the
resource is flagged with a reallocation signal: `move_recommended`, a
`move_probability` (skill-fit based), a `move_importance` grade (high/medium/low),
and a human-readable `move_rationale`. The manager sees this in the plan and can
decide whether to move the person.

### 5. Reuse suggestions
Reuse detection compares the demand against a library of past projects (pgvector
similarity with a keyword fallback). When a strong match exists, the plan shows
which components can be reused, why (and why not), components kept versus
replaced, and estimated savings in days.

### 6. Routing and notification
The demand is routed to the unit manager. A durable notification is created
(`approval_needed`) so the manager is alerted, in addition to the dashboard's
pending-approvals queue. Notifications are also emitted on approval, reassignment,
task handoff, and SWON/WON state changes.

### 7. Manager review
The manager reviews the plan and can:

- Chat with the AI planning copilot (`POST /api/demands/{id}/manager-chat`).
- Chat with the client through the portal thread
  (`POST /api/portal/requests/{id}/messages` and `.../agent-chat`).
- Share a live progress link with the client by email
  (`POST /api/demands/{id}/share-link`), which sets the demand's preview URL and
  records the send in an email outbox (`GET /api/demands/{id}/emails`).

### 8. Editable team (members, trainers, AI-learners)
Before approving, the manager can edit the team granularly
(`PATCH /api/demands/{id}/team`): add or remove members, add trainers (humans
upskilling the squad), or add AI-learners (agents shadowing the project for
training data). A catalog of addable resources is available at
`GET /api/demands/team/catalog`. Edits are persisted into the allocation,
audited, and notified.

### 9. Approval -> production
The manager approves (`POST /api/demands/{id}/approve`), which moves the demand
to `executing` and enqueues the background pipeline.

### 10. Production: scaffold, auto-publish, commits
The agent fleet scaffolds the project (Vite/React/Tailwind/Supabase template plus
generated files), runs through planning, frontend, backend, devops, QA, and docs
agents, and stores artifacts. When GitHub auto-publish is configured, the worker
pushes the generated project to the remote and records an agent commit. Human
contributors record their commits against the demand
(`POST /api/demands/{id}/commits`), producing a unified commit timeline.

### 11. Live tracking and sanitized portfolio
Throughout execution, WebSocket events stream stage and agent progress. Managers
track tasks, SWON/WON, blockers, and SLA risk. The higher-manager portfolio is
sanitized: failed/cancelled demands and sensitive fields (errors, risk factors,
coverage scores) are stripped before they are shown.

## Commercial Records: SWON and WON

ForgeOS tracks TCS-style work orders:

- SWON (Service Work Order Number) — the engagement-level record with a
  lifecycle state, SOW summary, customer LOA reference, and total value.
- WON (Work Order Number) — per-resource billing records under a SWON with
  allocation percentage, cost centre, and monthly value.

## Audit

Every meaningful mutation writes an `AuditEvent` (entity kind, entity id, actor,
action, diff, reason). The audit API supports filtering and pagination, and the
viewer/manager dashboards surface recent activity.

## Key Architectural Components

- Backend: FastAPI app, SQLAlchemy async ORM, Alembic migrations, Arq worker,
  pgvector for reuse, S3/MinIO artifact storage, smart LLM model router with a
  provider fallback chain.
- Frontend: React + Vite + Tailwind + React Router, role-aware shell, demand
  wizard with AI clarification chat, role-specific dashboards and Profile page.
- Auth: dev bypass for local development; Clerk JWT in production. RBAC via
  `require_role` and per-role route guards.

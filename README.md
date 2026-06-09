# ForgeOS

A production-grade demand-to-delivery AI operating system that fuses
**Vultron**'s strategic planner with **AgentForge**'s multi-agent code
executor. One prompt → planner picks the execution mode → multi-agent
fleet ships code → live preview, explanation, and reuse memory.

## Architecture

```
                       ┌──────────────────────┐
   User Demand  ──►    │  Vultron Planner     │
                       │  ingest → understand │
                       │  decide → allocate   │
                       └──────────┬───────────┘
                                  │ (reuse score from pgvector)
                                  ▼
                       ┌──────────────────────┐
                       │  AgentForge Executor │
                       │  PM / FE / BE / Dev  │
                       │  Ops / QA / Docs     │
                       └──────────┬───────────┘
                                  │
                ┌─────────────────┼────────────────┐
                ▼                 ▼                ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │  Postgres +  │  │   MinIO /    │  │  Redis pub/  │
        │  pgvector    │  │     S3       │  │  sub + Arq   │
        └──────────────┘  └──────────────┘  └──────────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │  Browser IDE + Live  │
                       │  Preview + Chat      │
                       └──────────────────────┘
```

Model plane (per-agent routing via [backend/app/llm/router.py](backend/app/llm/router.py)):

| Role            | Default model                          | Provider       |
|-----------------|-----------------------------------------|----------------|
| Planner         | `meta/llama-3.3-70b-instruct`           | NVIDIA NIM     |
| Code agents     | `qwen/qwen2.5-coder-32b-instruct`       | NVIDIA NIM     |
| Long context    | `zai-org/GLM-4.6`                       | vLLM           |
| Embeddings      | `nvidia/nv-embedqa-e5-v5`               | NVIDIA NIM     |
| Free / offline  | WebLLM (Qwen 2.5 Coder 3B) / Ollama     | Browser / local|

## Quick start (Docker)

```bash
cp deploy/.env.example deploy/.env
# add your NIM_API_KEY from build.nvidia.com
make prod-up
```

Open <http://localhost> (frontend), backend lives at <http://localhost:8000>,
Postgres on 5432, Redis on 6379, MinIO console at 9001.

## Quick start (host dev)

```bash
make dev-up                            # postgres + redis + minio in docker
cd backend && pip install -r requirements.txt
alembic upgrade head                   # creates schema + pgvector index
cd frontend && npm install
make backend                           # in one terminal
make worker                            # in another
make frontend                          # in a third
```

## Key paths

- Planner: [backend/app/planner/](backend/app/planner/)
- Executor: [backend/app/executor/](backend/app/executor/)
- LLM plane: [backend/app/llm/](backend/app/llm/)
- DB + pgvector reuse: [backend/app/db/](backend/app/db/)
- Worker queue: [backend/app/queue/](backend/app/queue/)
- Storage: [backend/app/storage/](backend/app/storage/)
- NIM / NGC docs: [deploy/nim/README.md](deploy/nim/README.md)

## Roles & Workspaces

ForgeOS implements a 10-role hierarchy. Every role gets a **distinct workspace**:
a role-tailored left navigation, its own dashboard, a header role badge, a
persona banner, and a personal **Profile page** (`/profile`) describing identity,
role, hierarchy level, and capabilities.

| Role | Level | Dashboard | Credentials (demo) |
|------|-------|-----------|---------------------|
| Executive | 6 | `/dashboard/executive` — org-wide KPIs and trends | `exec@forgeos.demo` / `exec123` |
| Higher Manager | 5 | `/dashboard/higher-manager` — sanitized portfolio (no failure/risk data) | `hm@forgeos.demo` / `hm123` |
| Manager | 4 | `/dashboard/manager` — operational console, approvals, team management | `manager@forgeos.demo` / `manager123` |
| Middleware | 3 | `/dashboard/middleware` — intake approval queue, handoffs | `middleware@forgeos.demo` / `middleware123` |
| Leader | 2 | `/dashboard/leader` — team task board, capacity heatmap | `leader@forgeos.demo` / `leader123` |
| Delivery Team | 2 | `/dashboard/delivery` — squad throughput and active demands | `delivery@forgeos.demo` / `delivery123` |
| Member | 1 | `/dashboard/member` — personal task list and status updates | `member@forgeos.demo` / `member123` |
| Contributor | 1 | `/dashboard/contributor` — my tasks and my commits | `contributor@forgeos.demo` / `contrib123` |
| Viewer | 0 | `/dashboard/viewer` — read-only portfolio and audit | `viewer@forgeos.demo` / `viewer123` |
| Client | 0 | `/client` — demand submission and live tracking | `client@forgeos.demo` / `client123` |

### Switching roles

Log out and log back in with a different demo user, or use the browser console:

```js
import { loginAs } from "./lib/auth";
loginAs("manager"); // or "leader", "member", "higher_manager", etc.
location.reload();
```

### TCS delivery tracking

- **SWON** (Service Work Order Number) — one per approved demand, lifecycle: Initiated → Planning → Executing → Monitoring → Closing → Warranty → Closed
- **WON** (Work Order Number) — billable resource allocation within a SWON
- **Tasks** — granular sub-work items with status (Todo/InProgress/Review/Blocked/Done), SLA tracking, handoffs, and comments
- **Audit trail** — every state change recorded with before/after diffs

### Component gallery

Visit `/dev/delivery` to see all delivery components (SwonBadge, WonBadge, TaskCard, TaskBoard, HandoffDialog, ActivityTimeline, CapacityHeatmap) rendered with demo data.

### Reports

Manager+ users can access `/reports` for delivery metrics with CSV export capability.

## Delivery features

The platform implements the full demand-to-product narrative:

- **AI clarification (multi-turn, with options)** — the AI delivery architect
  asks targeted questions, each with three suggested options plus a free-text
  answer box, until the demand is detailed enough.
  (`POST /api/demands/clarify`, `POST /api/demands/converse`)
- **DB-sourced allocation + "should we move this member?"** — the proposed team
  is cross-referenced against the live `team_members` bench; people already on
  another project are flagged with a move probability, importance, and rationale.
- **Reuse suggestions** — pgvector similarity surfaces reusable components from
  past projects with kept-vs-replaced rationale and estimated savings.
- **Notifications** — durable per-user feed (`/api/notifications`) emitted on
  routing, approval, reassignment, task handoff, and SWON/WON changes, with a
  header bell + unread badge.
- **Live-link email** — share a live progress link with the client
  (`POST /api/demands/{id}/share-link`); sends via SMTP or a demo outbox
  (`EmailLog`) and is listed at `GET /api/demands/{id}/emails`.
- **Editable team** — add/remove members, trainers, and AI-learners on a plan
  (`PATCH /api/demands/{id}/team`, catalog at `/api/demands/team/catalog`).
- **Auto GitHub publish + commit tracking** — optional auto-push of the
  generated project during production, plus human/agent commit records
  (`/api/demands/{id}/commits`) shown on a delivery commit timeline.

## Testing

Two-tier end-to-end suite. Start infra first:

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

- **Backend API E2E (pytest + httpx, real Postgres) — 99 cases:**

```bash
cd backend && python3 -m pytest -q
```

- **Frontend UI E2E (Playwright) — 41 cases:**

```bash
cd frontend && npx playwright test
```

Backend tests use a dedicated `forgeos_test` database (see
[backend/tests/conftest.py](backend/tests/conftest.py)); frontend specs seed a
session into `localStorage` and mock `/api/**` for determinism
(see [frontend/e2e/](frontend/e2e/)).

## Documentation

A combined reference manual lives in [docs/forgeos/](docs/forgeos/):

- `01_overview_workflow.md` — end-to-end workflow and role hierarchy
- `02_api_reference.md` — full REST API reference
- `03_test_catalog.md` — every backend and frontend test, with how-to-run

Regenerate the polished PDF ([docs/forgeos/ForgeOS_Reference.pdf](docs/forgeos/ForgeOS_Reference.pdf)):

```bash
python3 docs/forgeos/build_pdf.py
```

## Seeding demo data

```bash
cd backend
python -m app.scripts.seed_past_projects    # 12 past projects with reuse rationale
python -m app.scripts.seed_demo_demands     # 18 demands across all stages
```

## Legacy AgentForge UI

The standalone AgentForge IDE (Monaco + chat + preview) is still in
`frontend/src/components/ide/` and is reachable from a completed demand —
it's just no longer the front door. The original FastAPI app lives at
`backend/main.py` for reference.

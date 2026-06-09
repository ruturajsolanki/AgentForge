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

## Roles & Dashboards

ForgeOS implements a 5-role hierarchy with tailored dashboards:

| Role | Level | Dashboard | Credentials (demo) |
|------|-------|-----------|---------------------|
| Higher Manager | 5 | `/dashboard/higher-manager` — sanitized portfolio view (no failure data) | `hm@forgeos.demo` / `hm123` |
| Manager | 4 | `/dashboard/manager` — full operational console, team management, KPIs | `manager@forgeos.demo` / `manager123` |
| Middleware | 3 | `/dashboard/middleware` — intake approval queue, handoff coordination | `middleware@forgeos.demo` / `middleware123` |
| Leader | 2 | `/dashboard/leader` — team task board, capacity heatmap | `leader@forgeos.demo` / `leader123` |
| Member | 1 | `/dashboard/member` — personal task list, status updates, hour logging | `member@forgeos.demo` / `member123` |
| Client | 0 | `/client` — demand submission and status tracking | `client@forgeos.demo` / `client123` |

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

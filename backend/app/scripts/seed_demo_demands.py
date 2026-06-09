"""Seed 15-20 demo demands across stages so dashboards have content.

Run: python -m app.scripts.seed_demo_demands
Idempotent via ON CONFLICT (public_id) DO NOTHING.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import DemandRequest, SwonRecord, Task, Tenant, WonRecord
from app.db.session import AsyncSessionLocal

TENANT_SLUG = "dev"

DEMANDS = [
    {"public_id": "DMD-DEMO-001", "raw_text": "Build a customer onboarding portal for HDFC Bank with KYC verification", "stage": "completed"},
    {"public_id": "DMD-DEMO-002", "raw_text": "Develop predictive maintenance IoT dashboard for Tata Steel plant", "stage": "executing"},
    {"public_id": "DMD-DEMO-003", "raw_text": "Create insurance claims automation system for ICICI Lombard", "stage": "monitoring"},
    {"public_id": "DMD-DEMO-004", "raw_text": "Design omni-channel retail platform for Reliance Trends", "stage": "awaiting_approval"},
    {"public_id": "DMD-DEMO-005", "raw_text": "Implement fleet management system for BlueDart logistics", "stage": "executing"},
    {"public_id": "DMD-DEMO-006", "raw_text": "Build clinical trial management system for Cipla", "stage": "completed"},
    {"public_id": "DMD-DEMO-007", "raw_text": "Create credit scoring microservice for Bajaj Finserv NBFC", "stage": "completed"},
    {"public_id": "DMD-DEMO-008", "raw_text": "Develop quality inspection CV system for Maruti Suzuki", "stage": "monitoring"},
    {"public_id": "DMD-DEMO-009", "raw_text": "Build trade reconciliation dashboard for Kotak Securities", "stage": "executing"},
    {"public_id": "DMD-DEMO-010", "raw_text": "Create patient engagement portal for Apollo Hospitals", "stage": "awaiting_approval"},
    {"public_id": "DMD-DEMO-011", "raw_text": "Implement demand forecasting tool for Hindustan Unilever", "stage": "completed"},
    {"public_id": "DMD-DEMO-012", "raw_text": "Build customer 360 portal for LIC life insurance", "stage": "ingested"},
    {"public_id": "DMD-DEMO-013", "raw_text": "Create route optimization system for Delhivery", "stage": "understanding"},
    {"public_id": "DMD-DEMO-014", "raw_text": "Develop vendor management portal for TCS internal procurement", "stage": "deciding"},
    {"public_id": "DMD-DEMO-015", "raw_text": "Build real-time fraud detection for SBI Cards", "stage": "allocating"},
    {"public_id": "DMD-DEMO-016", "raw_text": "Create warehouse management system for Flipkart", "stage": "completed"},
    {"public_id": "DMD-DEMO-017", "raw_text": "Implement chatbot for Airtel customer service", "stage": "executing"},
    {"public_id": "DMD-DEMO-018", "raw_text": "Build digital lending platform for Axis Bank", "stage": "monitoring"},
]

TASK_TEMPLATES = [
    ("Setup project scaffold", "Todo"),
    ("Design database schema", "InProgress"),
    ("Implement auth module", "Done"),
    ("Build API endpoints", "InProgress"),
    ("Create frontend UI", "Review"),
    ("Write unit tests", "Todo"),
    ("Configure CI/CD", "Blocked"),
    ("Deploy to staging", "Todo"),
]


def _gen_id(prefix: str) -> str:
    import secrets
    return f"{prefix}-{secrets.token_hex(4).upper()}"


async def seed(session: AsyncSession) -> int:
    tenant = (await session.execute(
        select(Tenant).where(Tenant.slug == TENANT_SLUG)
    )).scalar_one_or_none()
    if not tenant:
        tenant = Tenant(name="Development", slug=TENANT_SLUG)
        session.add(tenant)
        await session.flush()

    count = 0
    for d in DEMANDS:
        existing = (await session.execute(
            select(DemandRequest).where(DemandRequest.public_id == d["public_id"])
        )).scalar_one_or_none()
        if existing:
            continue

        now = datetime.now(timezone.utc)
        created = now - timedelta(days=random.randint(1, 60))
        completed = now - timedelta(days=random.randint(0, 5)) if d["stage"] == "completed" else None

        demand = DemandRequest(
            tenant_id=tenant.id,
            public_id=d["public_id"],
            raw_text=d["raw_text"],
            stage=d["stage"],
            created_at=created,
            completed_at=completed,
            understanding={
                "problem_type": "web_app",
                "domain": "technology",
                "complexity": random.choice(["low", "medium", "high"]),
                "urgency": random.choice(["low", "medium", "high"]),
                "required_skills": ["python", "react", "postgresql"],
                "key_features": ["dashboard", "api", "auth"],
                "estimated_scope_days": random.randint(5, 30),
                "summary": d["raw_text"],
            },
            decision={
                "execution_mode": "ai_agent",
                "project_type": "project",
                "reasoning": "Standard delivery pipeline",
                "estimated_cost_usd": random.randint(5000, 50000),
                "estimated_time_days": random.randint(10, 45),
                "confidence_score": round(random.uniform(0.7, 0.95), 2),
                "risk_factors": [],
                "reuse_percentage": random.randint(10, 60),
            },
            allocation={
                "team": [],
                "total_daily_cost": random.randint(500, 2000),
                "allocation_reasoning": "Standard allocation",
            },
        )
        session.add(demand)
        await session.flush()

        if d["stage"] in ("executing", "monitoring", "completed", "explaining"):
            swon = SwonRecord(
                tenant_id=tenant.id,
                demand_id=demand.id,
                public_id=_gen_id("SWON"),
                lifecycle_state="Closed" if d["stage"] == "completed" else "Executing",
                total_value_inr=random.randint(500000, 5000000),
                closed_at=completed,
            )
            session.add(swon)
            await session.flush()

            won = WonRecord(
                tenant_id=tenant.id,
                swon_id=swon.id,
                public_id=_gen_id("WON"),
                billable=True,
                allocation_pct=100.0,
                monthly_value_inr=random.randint(50000, 500000),
            )
            session.add(won)

            for tmpl_title, tmpl_status in random.sample(TASK_TEMPLATES, min(5, len(TASK_TEMPLATES))):
                task = Task(
                    tenant_id=tenant.id,
                    demand_id=demand.id,
                    swon_id=swon.id,
                    public_id=_gen_id("TSK"),
                    title=tmpl_title,
                    status=tmpl_status if d["stage"] != "completed" else "Done",
                    priority=random.choice(["low", "medium", "high"]),
                    est_hours=random.randint(4, 40),
                )
                session.add(task)

        count += 1

    await session.commit()
    return count


async def main():
    async with AsyncSessionLocal() as session:
        n = await seed(session)
        print(f"Seeded {n} demo demands")


if __name__ == "__main__":
    asyncio.run(main())

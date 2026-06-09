"""Weekly Higher-Manager digest cron job stub.

Builds a sanitized portfolio summary JSON and writes it to MinIO
under `digests/{tenant_slug}/weekly_{date}.json`.

In production this would be triggered by Arq's cron scheduler.
For now it can be invoked manually:
    python -m app.queue.digest_cron
"""

from __future__ import annotations

import asyncio
import io
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import func, select

from app.db.models import DemandRequest, SwonRecord
from app.db.session import AsyncSessionLocal
from app.sanitizer import sanitize_portfolio

logger = logging.getLogger(__name__)


async def build_weekly_digest(tenant_id: str, tenant_slug: str = "dev") -> dict:
    async with AsyncSessionLocal() as session:
        demands_rows = (await session.execute(
            select(DemandRequest).where(DemandRequest.tenant_id == tenant_id)
            .order_by(DemandRequest.created_at.desc())
            .limit(100)
        )).scalars().all()

        raw_demands = []
        for d in demands_rows:
            raw_demands.append({
                "id": str(d.id),
                "public_id": d.public_id,
                "stage": d.stage,
                "raw_text": d.raw_text[:200],
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "completed_at": d.completed_at.isoformat() if d.completed_at else None,
            })

        closed = (await session.execute(
            select(func.count()).select_from(SwonRecord).where(
                SwonRecord.tenant_id == tenant_id,
                SwonRecord.lifecycle_state == "Closed",
            )
        )).scalar() or 0

        active = (await session.execute(
            select(func.count()).select_from(SwonRecord).where(
                SwonRecord.tenant_id == tenant_id,
                SwonRecord.lifecycle_state.notin_(["Closed", "Warranty"]),
            )
        )).scalar() or 0

    portfolio = sanitize_portfolio(raw_demands, closed, active)
    digest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tenant": tenant_slug,
        "portfolio": portfolio.model_dump(),
    }

    try:
        from app.config import S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY
        import boto3
        s3 = boto3.client(
            "s3",
            endpoint_url=S3_ENDPOINT,
            aws_access_key_id=S3_ACCESS_KEY,
            aws_secret_access_key=S3_SECRET_KEY,
        )
        key = f"digests/{tenant_slug}/weekly_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.json"
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=key,
            Body=json.dumps(digest, indent=2).encode(),
            ContentType="application/json",
        )
        logger.info("Weekly digest written to s3://%s/%s", S3_BUCKET, key)
    except Exception as exc:
        logger.warning("Failed to write digest to MinIO (stub mode): %s", exc)

    return digest


async def main():
    from sqlalchemy import select as sa_select
    from app.db.models import Tenant
    async with AsyncSessionLocal() as session:
        tenant = (await session.execute(
            sa_select(Tenant).where(Tenant.slug == "dev")
        )).scalar_one_or_none()
        if not tenant:
            print("No dev tenant found — run the app first to auto-provision.")
            return
    result = await build_weekly_digest(str(tenant.id), "dev")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())

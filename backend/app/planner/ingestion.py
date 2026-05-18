"""Demand ingestion — first stop in the pipeline."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app.schemas import DemandInput


class DemandIngestion:
    """Normalises raw demand text and produces a tracking record."""

    def ingest(self, raw_text: str, source: str = "manual") -> dict:
        demand_id = f"DMD-{uuid.uuid4().hex[:10].upper()}"
        demand = DemandInput(text=raw_text.strip(), source=source)
        return {
            "demand_id": demand_id,
            "text": demand.text,
            "source": demand.source,
            "ingested_at": datetime.now(timezone.utc).isoformat(),
            "char_count": len(demand.text),
            "word_count": len(demand.text.split()),
        }

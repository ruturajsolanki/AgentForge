"""Shared LLM-JSON salvaging helpers — small but heavily used."""

from __future__ import annotations

import json
import re
from typing import Any, Optional


def extract_json(text: str) -> Optional[dict[str, Any]]:
    """Try multiple strategies to parse a JSON object out of LLM output."""
    if not text:
        return None
    text = text.strip()

    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass

    for m in re.finditer(r"```(?:json)?\s*\n?([\s\S]*?)```", text):
        try:
            return json.loads(m.group(1).strip())
        except (json.JSONDecodeError, ValueError):
            continue

    depth = 0
    start = -1
    for i, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start != -1:
                candidate = text[start : i + 1]
                try:
                    return json.loads(candidate)
                except (json.JSONDecodeError, ValueError):
                    cleaned = re.sub(r",\s*([}\]])", r"\1", candidate)
                    try:
                        return json.loads(cleaned)
                    except (json.JSONDecodeError, ValueError):
                        pass
                start = -1
    return None

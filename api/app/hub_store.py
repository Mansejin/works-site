from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
HUB_FILE = DATA_DIR / "hub.json"


def read_hub() -> dict[str, Any] | None:
    if not HUB_FILE.exists():
        return None
    try:
        payload = json.loads(HUB_FILE.read_text(encoding="utf-8"))
        return payload.get("data") if isinstance(payload, dict) else None
    except (json.JSONDecodeError, OSError):
        return None


def write_hub(data: dict[str, Any], updated_at: int) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HUB_FILE.write_text(
        json.dumps({"updatedAt": updated_at, "data": data}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

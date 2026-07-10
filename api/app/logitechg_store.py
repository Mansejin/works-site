from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SCHEDULE_FILE = DATA_DIR / "logitechg-schedule.json"


def read_schedule() -> dict[str, Any] | None:
    if not SCHEDULE_FILE.exists():
        return None
    try:
        payload = json.loads(SCHEDULE_FILE.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except (json.JSONDecodeError, OSError):
        return None


def write_schedule(positions: dict[str, int], updated_at: int) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SCHEDULE_FILE.write_text(
        json.dumps({"updatedAt": updated_at, "positions": positions}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

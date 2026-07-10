from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "youtube"
PROMOTIONS_FILE = DATA_DIR / "promotions.json"
SNAPSHOTS_FILE = DATA_DIR / "subscriber-snapshots.json"


def _read_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else default
    except (json.JSONDecodeError, OSError):
        return default


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_promotions() -> dict[str, Any]:
    return _read_json(PROMOTIONS_FILE, {"promotions": [], "issues": []})


def write_promotions(data: dict[str, Any]) -> None:
    _write_json(PROMOTIONS_FILE, data)


def read_snapshots() -> dict[str, Any]:
    return _read_json(SNAPSHOTS_FILE, {"snapshots": [], "viewsTrend7d": []})


def write_snapshots(data: dict[str, Any]) -> None:
    _write_json(SNAPSHOTS_FILE, data)

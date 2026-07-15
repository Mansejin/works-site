from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "dddit" / "productlists"
_PROJECT_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,62}$", re.I)


def normalize_project(project: str) -> str:
    slug = str(project or "").strip().lower()
    if not slug or not _PROJECT_RE.match(slug):
        raise ValueError("invalid project")
    return slug


def _file_for(project: str) -> Path:
    return DATA_DIR / f"{normalize_project(project)}.json"


def normalize_row(row: Any) -> dict[str, str]:
    source = row if isinstance(row, dict) else {}
    return {
        "name": str(source.get("name") or "").strip(),
        "color": str(source.get("color") or "").strip(),
        "qty": str(source.get("qty") or "1").strip() or "1",
        "link": str(source.get("link") or "").strip(),
    }


def normalize_rows(rows: Any) -> list[dict[str, str]]:
    if not isinstance(rows, list):
        return []
    return [normalize_row(row) for row in rows]


def read_productlist(project: str) -> dict[str, Any] | None:
    path = _file_for(project)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(payload, dict):
        return None
    return {
        "project": normalize_project(project),
        "updatedAt": int(payload.get("updatedAt") or 0),
        "rows": normalize_rows(payload.get("rows")),
    }


def write_productlist(project: str, rows: list[dict[str, Any]], updated_at: int) -> dict[str, Any]:
    slug = normalize_project(project)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "project": slug,
        "updatedAt": int(updated_at),
        "rows": normalize_rows(rows),
    }
    path = _file_for(slug)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload

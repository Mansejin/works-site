from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "dddit"
REGISTRY_PATH = DATA_DIR / "sheet-registry.json"


def _load() -> dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {}
    try:
        payload = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _save(registry: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def get_project(project: str) -> dict[str, Any] | None:
    entry = _load().get(project)
    return entry if isinstance(entry, dict) else None


def list_projects() -> list[dict[str, Any]]:
    registry = _load()
    items: list[dict[str, Any]] = []
    for key, entry in registry.items():
        if not isinstance(entry, dict):
            continue
        items.append(
            {
                "project": key,
                "title": entry.get("title") or "",
                "spreadsheetId": entry.get("spreadsheetId") or "",
                "spreadsheetUrl": entry.get("spreadsheetUrl") or "",
                "createdAt": entry.get("createdAt"),
            }
        )
    return items


def save_project(project: str, entry: dict[str, Any]) -> dict[str, Any]:
    registry = _load()
    registry[project] = entry
    _save(registry)
    return entry


def upsert_project(
    project: str,
    *,
    spreadsheet_id: str,
    spreadsheet_url: str,
    title: str,
    created: bool,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc).isoformat()
    existing = get_project(project) or {}
    entry = {
        "spreadsheetId": spreadsheet_id,
        "spreadsheetUrl": spreadsheet_url,
        "title": title,
        "createdAt": existing.get("createdAt") or now,
        "updatedAt": now,
    }
    if created:
        entry["createdAt"] = now
    return save_project(project, entry)

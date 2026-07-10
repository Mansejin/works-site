from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CONTI_DIR = DATA_DIR / "conti"

HEADERS = ("대본", "장면", "사이즈", "자막", "코멘트")
PROJECT_RE = re.compile(r"^[a-z0-9-]+$")


def validate_project(project: str) -> str:
    slug = (project or "").strip().lower()
    if not slug or not PROJECT_RE.fullmatch(slug):
        raise ValueError("invalid project slug")
    return slug


def _project_file(project: str) -> Path:
    return CONTI_DIR / f"{validate_project(project)}.json"


def normalize_row(row: dict[str, Any] | None) -> dict[str, str]:
    source = row if isinstance(row, dict) else {}
    return {header: str(source.get(header, "") or "").strip() for header in HEADERS}


def normalize_rows(rows: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    normalized = [normalize_row(row) for row in (rows or [])]
    return [
        row
        for row in normalized
        if any(row[header] for header in HEADERS)
    ]


def read_conti(project: str) -> dict[str, Any] | None:
    path = _project_file(project)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(payload, dict):
        return None
    return {
        "project": validate_project(project),
        "title": str(payload.get("title") or "").strip(),
        "updatedAt": int(payload.get("updatedAt") or 0),
        "rows": normalize_rows(payload.get("rows")),
    }


def write_conti(
    project: str,
    rows: list[dict[str, Any]],
    updated_at: int,
    title: str = "",
) -> dict[str, Any]:
    slug = validate_project(project)
    CONTI_DIR.mkdir(parents=True, exist_ok=True)
    normalized_rows = normalize_rows(rows)
    payload = {
        "project": slug,
        "title": (title or "").strip(),
        "updatedAt": updated_at,
        "rows": normalized_rows,
    }
    _project_file(slug).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def list_projects() -> list[dict[str, Any]]:
    if not CONTI_DIR.exists():
        return []
    items: list[dict[str, Any]] = []
    for path in sorted(CONTI_DIR.glob("*.json")):
        project = path.stem
        data = read_conti(project)
        if not data:
            continue
        items.append(
            {
                "project": data["project"],
                "title": data["title"],
                "rowCount": len(data["rows"]),
                "updatedAt": data["updatedAt"],
            }
        )
    items.sort(key=lambda item: item.get("updatedAt") or 0, reverse=True)
    return items

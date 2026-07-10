from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.conti_store import list_projects, read_conti, validate_project, write_conti

router = APIRouter(prefix="/api/dddit", tags=["conti"])


class ContiSaveBody(BaseModel):
    project: str
    title: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)
    updatedAt: int | None = None


@router.get("/conti/projects")
def get_conti_projects() -> dict[str, Any]:
    return {"ok": True, "projects": list_projects()}


@router.get("/conti")
def get_conti(project: str = Query(..., min_length=1)) -> dict[str, Any]:
    try:
        slug = validate_project(project)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    data = read_conti(slug)
    if not data:
        return {
            "ok": True,
            "project": slug,
            "title": "",
            "rows": [],
            "updatedAt": 0,
        }
    return {"ok": True, **data}


@router.put("/conti")
def put_conti(body: ContiSaveBody) -> dict[str, Any]:
    try:
        slug = validate_project(body.project)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    updated_at = body.updatedAt or int(time.time() * 1000)
    payload = write_conti(slug, body.rows, updated_at, body.title)
    return {"ok": True, **payload}

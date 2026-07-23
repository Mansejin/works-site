from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.conti_store import list_projects, read_conti, validate_project, write_conti
from app.public_brands import PUBLIC_BRANDS, is_public_brand
from app.team_gate import verify_team_token
from app.team_gate_auth import team_token_from_request

router = APIRouter(prefix="/api/dddit", tags=["conti"])


class ContiSaveBody(BaseModel):
    project: str
    title: str = ""
    rows: list[dict[str, Any]] = Field(default_factory=list)
    updatedAt: int | None = None


@router.get("/conti/projects")
def get_conti_projects(request: Request) -> dict[str, Any]:
    projects = list_projects()
    token = team_token_from_request(request)
    if not verify_team_token(token):
        projects = [p for p in projects if is_public_brand(str(p))]
        # Also allow string project names that are public brands even if empty store
        known = set(projects) | set(PUBLIC_BRANDS)
        projects = sorted(known)
    return {"ok": True, "projects": projects}


@router.get("/conti")
def get_conti(request: Request, project: str = Query(..., min_length=1)) -> dict[str, Any]:
    try:
        slug = validate_project(project)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    token = team_token_from_request(request)
    if not verify_team_token(token) and not is_public_brand(slug):
        raise HTTPException(status_code=401, detail="Team authentication required")

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

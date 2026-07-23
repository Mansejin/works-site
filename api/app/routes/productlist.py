from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

from app.public_brands import is_public_brand
from app.productlist_store import read_productlist, write_productlist
from app.rate_limit import PRODUCTLIST_WRITE_LIMITER
from app.team_gate import verify_team_token
from app.team_gate_auth import team_token_from_request

router = APIRouter(prefix="/api/dddit", tags=["productlist"])

_MAX_ROWS = 200


class ProductlistSaveBody(BaseModel):
    project: str = Field(min_length=1, max_length=64)
    rows: list[dict[str, Any]] = Field(default_factory=list, max_length=_MAX_ROWS)
    updatedAt: int | None = None

    @field_validator("rows")
    @classmethod
    def _sanitize_links(cls, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        cleaned: list[dict[str, Any]] = []
        for row in rows or []:
            if not isinstance(row, dict):
                continue
            link = str(row.get("link") or "").strip()
            if link:
                try:
                    parsed = urlparse(link)
                except ValueError as exc:
                    raise ValueError("invalid link") from exc
                if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                    raise ValueError("link must be http(s) URL")
            cleaned.append(row)
        return cleaned


@router.get("/productlist")
def get_productlist(project: str = Query("default")) -> dict[str, Any]:
    try:
        data = read_productlist(project)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not data:
        return {"ok": True, "project": project.strip().lower(), "rows": None, "updatedAt": None}
    return {"ok": True, **data}


@router.put("/productlist")
def put_productlist(request: Request, body: ProductlistSaveBody) -> dict[str, Any]:
    slug = body.project.strip().lower()
    token = team_token_from_request(request)
    authed = verify_team_token(token)

    if not authed:
        if not is_public_brand(slug):
            raise HTTPException(status_code=401, detail="Team authentication required")
        client = request.client.host if request.client else "unknown"
        if not PRODUCTLIST_WRITE_LIMITER.allow(f"pl:{client}"):
            raise HTTPException(status_code=429, detail="Too many productlist writes")

    updated_at = body.updatedAt or int(time.time() * 1000)
    try:
        payload = write_productlist(body.project, body.rows, updated_at)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **payload}

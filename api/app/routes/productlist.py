from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.productlist_store import read_productlist, write_productlist

router = APIRouter(prefix="/api/dddit", tags=["productlist"])


class ProductlistSaveBody(BaseModel):
    project: str = Field(min_length=1, max_length=64)
    rows: list[dict[str, Any]] = Field(default_factory=list)
    updatedAt: int | None = None


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
def put_productlist(body: ProductlistSaveBody) -> dict[str, Any]:
    updated_at = body.updatedAt or int(time.time() * 1000)
    try:
        payload = write_productlist(body.project, body.rows, updated_at)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, **payload}

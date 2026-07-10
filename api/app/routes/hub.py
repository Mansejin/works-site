from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.hub_store import read_hub, write_hub

router = APIRouter(prefix="/api/dddit", tags=["hub"])


class HubSaveBody(BaseModel):
    data: dict[str, Any] = Field(default_factory=dict)
    updatedAt: int | None = None


@router.get("/hub")
def get_hub() -> dict[str, Any]:
    data = read_hub()
    return {"ok": True, "data": data}


@router.put("/hub")
def put_hub(body: HubSaveBody) -> dict[str, Any]:
    updated_at = body.updatedAt or int(time.time() * 1000)
    write_hub(body.data, updated_at)
    return {"ok": True, "updatedAt": updated_at}

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.logitechg_store import read_schedule, write_schedule

router = APIRouter(prefix="/api/logitechg", tags=["logitechg"])


class ScheduleSaveBody(BaseModel):
    positions: dict[str, int] = Field(default_factory=dict)
    updatedAt: int | None = None


@router.get("/schedule")
def get_schedule() -> dict[str, Any]:
    data = read_schedule()
    if not data:
        return {"ok": True, "updatedAt": 0, "positions": {}}
    return {
        "ok": True,
        "updatedAt": int(data.get("updatedAt") or 0),
        "positions": data.get("positions") or {},
    }


@router.put("/schedule")
def put_schedule(body: ScheduleSaveBody) -> dict[str, Any]:
    updated_at = body.updatedAt or int(time.time() * 1000)
    write_schedule(body.positions, updated_at)
    return {"ok": True, "updatedAt": updated_at}

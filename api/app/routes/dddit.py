from __future__ import annotations

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from app.config import gemini_api_key, sheet_api_token, sheet_api_url, sheet_open_url

router = APIRouter(prefix="/api/dddit", tags=["dddit"])

SHEET_TIMEOUT = 60.0
GEMINI_TIMEOUT = 180.0


class SheetRowsBody(BaseModel):
    project: str = "default"
    rows: list[dict[str, Any]] = Field(default_factory=list)


@router.get("/config")
def dddit_config() -> dict[str, Any]:
    return {
        "ok": True,
        "backend": True,
        "gemini": True,
        "sheet": True,
        "sheetOpenUrl": sheet_open_url() or None,
    }


@router.get("/sheet/meta")
async def sheet_meta() -> dict[str, Any]:
    return await _sheet_request("GET", {"action": "meta"})


@router.get("/sheet/get")
async def sheet_get(project: str = "default") -> dict[str, Any]:
    return await _sheet_request("GET", {"action": "get", "project": project})


@router.post("/sheet/replace")
async def sheet_replace(body: SheetRowsBody) -> dict[str, Any]:
    return await _sheet_request(
        "POST",
        {"action": "replace"},
        {"project": body.project, "rows": body.rows},
    )


@router.post("/sheet/append")
async def sheet_append(body: SheetRowsBody) -> dict[str, Any]:
    return await _sheet_request(
        "POST",
        {"action": "append"},
        {"project": body.project, "rows": body.rows},
    )


async def _sheet_request(
    method: str,
    params: dict[str, str],
    json_body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    token = sheet_api_token()
    url = sheet_api_url()
    query = {**params, "token": token}

    try:
        async with httpx.AsyncClient(timeout=SHEET_TIMEOUT) as client:
            if method == "GET":
                res = await client.get(url, params=query)
            else:
                payload = {**(json_body or {}), "token": token, "action": params["action"]}
                res = await client.post(url, json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Sheet upstream error: {exc}") from exc

    try:
        data = res.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="Invalid sheet API response") from exc

    if res.status_code >= 400 or data.get("ok") is False:
        raise HTTPException(
            status_code=res.status_code if res.status_code >= 400 else 502,
            detail=data.get("error") or "Sheet API request failed",
        )
    return data


@router.post("/gemini/v1beta/models/{model_path:path}")
async def gemini_proxy(model_path: str, request: Request) -> Response:
    if not model_path.endswith(":generateContent"):
        raise HTTPException(status_code=400, detail="Only :generateContent is supported")

    body = await request.body()
    key = gemini_api_key()
    upstream = (
        f"https://generativelanguage.googleapis.com/v1beta/models/{model_path}"
        f"?key={key}"
    )

    try:
        async with httpx.AsyncClient(timeout=GEMINI_TIMEOUT) as client:
            res = await client.post(
                upstream,
                content=body,
                headers={"Content-Type": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Gemini upstream error: {exc}") from exc

    media_type = res.headers.get("content-type", "application/json")
    return Response(content=res.content, status_code=res.status_code, media_type=media_type)

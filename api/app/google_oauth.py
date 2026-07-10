from __future__ import annotations

import time
from typing import Any

import httpx

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_TOKEN_CACHE: dict[str, dict[str, Any]] = {}


async def get_access_token(
    client: httpx.AsyncClient,
    *,
    client_id: str,
    client_secret: str,
    refresh_token: str,
    cache_key: str = "default",
) -> str:
    now = time.time()
    cached = _TOKEN_CACHE.get(cache_key)
    if cached and cached["expires_at"] > now + 60:
        return cached["access_token"]

    res = await client.post(
        _TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
    )
    res.raise_for_status()
    body = res.json()
    access_token = body.get("access_token") or ""
    if not access_token:
        raise RuntimeError("OAuth token response missing access_token")

    expires_in = int(body.get("expires_in") or 3600)
    _TOKEN_CACHE[cache_key] = {
        "access_token": access_token,
        "expires_at": now + expires_in,
    }
    return access_token

from __future__ import annotations

import hashlib
import os
import time
from typing import Any


_COOKIE_KEYS = ("SID", "HSID", "SSID", "APISID", "SAPISID", "LOGIN_INFO", "__Secure-1PSID", "__Secure-3PSID")


def studio_cookies_from_env() -> dict[str, str]:
    """YOUTUBE_STUDIO_COOKIES='SID=...; SAPISID=...' 또는 개별 키 환경변수."""
    cookies: dict[str, str] = {}
    raw = os.getenv("YOUTUBE_STUDIO_COOKIES", "").strip()
    if raw:
        for part in raw.split(";"):
            part = part.strip()
            if "=" not in part:
                continue
            key, value = part.split("=", 1)
            cookies[key.strip()] = value.strip()
    for key in _COOKIE_KEYS:
        env_key = f"YOUTUBE_STUDIO_{key.replace('-', '_').upper()}"
        value = os.getenv(env_key, "").strip()
        if value:
            cookies[key] = value
    return {k: v for k, v in cookies.items() if v}


def sapisidhash(sapisid: str, origin: str = "https://studio.youtube.com") -> str:
    ts = str(int(time.time()))
    digest = hashlib.sha1(f"{ts} {sapisid} {origin}".encode("utf-8")).hexdigest()
    return f"{ts}_{digest}"


def studio_auth_headers(cookies: dict[str, str]) -> dict[str, str]:
    sapisid = cookies.get("SAPISID") or cookies.get("__Secure-3PAPISID") or ""
    cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
    headers: dict[str, str] = {
        "Cookie": cookie_header,
        "Origin": "https://studio.youtube.com",
        "Referer": "https://studio.youtube.com/",
        "Content-Type": "application/json",
        "X-Goog-AuthUser": "0",
        "X-Youtube-Client-Name": "62",
        "X-Youtube-Client-Version": "1.20260701.00.00",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        ),
    }
    if sapisid:
        headers["Authorization"] = f"SAPISIDHASH {sapisidhash(sapisid)}"
    return headers


def cookies_configured(cookies: dict[str, str] | None = None) -> bool:
    jar = cookies if cookies is not None else studio_cookies_from_env()
    return bool(jar.get("SAPISID") or jar.get("SID") or jar.get("__Secure-1PSID"))


def default_innertube_context(channel_id: str = "") -> dict[str, Any]:
    ctx: dict[str, Any] = {
        "client": {
            "clientName": "WEB_CREATOR",
            "clientVersion": "1.20260701.00.00",
            "hl": "ko",
            "gl": "KR",
            "userAgent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
            ),
        },
        "user": {"lockedSafetyMode": False},
        "request": {"useSsl": True},
    }
    if channel_id:
        ctx["user"]["onBehalfOfUser"] = channel_id
        ctx["client"]["delegationContext"] = {
            "externalChannelId": channel_id,
            "roleType": {"channelRoleType": "CREATOR_CHANNEL_ROLE_TYPE_OWNER"},
        }
    return ctx

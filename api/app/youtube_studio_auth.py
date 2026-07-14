from __future__ import annotations

import hashlib
import os
import time
from typing import Any


_COOKIE_KEYS = (
    "SID",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "LOGIN_INFO",
    "__Secure-1PSID",
    "__Secure-3PSID",
    "__Secure-1PAPISID",
    "__Secure-3PAPISID",
)

# Captured from Chrome and replayed on sync.
_CAPTURE_HEADER_KEYS = (
    "authorization",
    "user-agent",
    "x-goog-authuser",
    "x-goog-visitor-id",
    "x-origin",
    "x-youtube-client-name",
    "x-youtube-client-version",
    "x-youtube-delegation-context",
    "x-youtube-page-cl",
    "x-youtube-page-label",
    "x-youtube-time-zone",
    "x-youtube-utc-offset",
    "referer",
    "origin",
)


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


def sapisidhash(sapisid: str, origin: str = "https://studio.youtube.com", *, suffix_u: bool = True) -> str:
    ts = str(int(time.time()))
    digest = hashlib.sha1(f"{ts} {sapisid} {origin}".encode("utf-8")).hexdigest()
    return f"{ts}_{digest}_u" if suffix_u else f"{ts}_{digest}"


def authorization_header(cookies: dict[str, str], origin: str = "https://studio.youtube.com") -> str:
    """Chrome Studio uses SAPISIDHASH + SAPISID1PHASH + SAPISID3PHASH."""
    parts: list[str] = []
    sapisid = cookies.get("SAPISID") or cookies.get("__Secure-3PAPISID") or ""
    sapisid_1p = cookies.get("__Secure-1PAPISID") or sapisid
    sapisid_3p = cookies.get("__Secure-3PAPISID") or sapisid
    if sapisid:
        parts.append(f"SAPISIDHASH {sapisidhash(sapisid, origin)}")
    if sapisid_1p:
        parts.append(f"SAPISID1PHASH {sapisidhash(sapisid_1p, origin)}")
    if sapisid_3p:
        parts.append(f"SAPISID3PHASH {sapisidhash(sapisid_3p, origin)}")
    return " ".join(parts)


def studio_auth_headers(
    cookies: dict[str, str],
    *,
    extra: dict[str, str] | None = None,
) -> dict[str, str]:
    cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
    extra = {str(k).lower(): str(v) for k, v in (extra or {}).items() if v}

    headers: dict[str, str] = {
        "Cookie": cookie_header,
        "Origin": extra.get("origin") or "https://studio.youtube.com",
        "Referer": extra.get("referer") or "https://studio.youtube.com/",
        "Content-Type": "application/json",
        "X-Goog-AuthUser": extra.get("x-goog-authuser") or "0",
        "X-Youtube-Client-Name": extra.get("x-youtube-client-name") or "62",
        "X-Youtube-Client-Version": extra.get("x-youtube-client-version") or "1.20260709.05.00",
        "User-Agent": extra.get("user-agent")
        or (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
        ),
    }

    # Fresh hash preferred over captured Authorization (timestamp expires quickly).
    auth = authorization_header(cookies, headers["Origin"])
    if auth:
        headers["Authorization"] = auth
    elif extra.get("authorization"):
        headers["Authorization"] = extra["authorization"]

    for key in (
        "x-goog-visitor-id",
        "x-origin",
        "x-youtube-delegation-context",
        "x-youtube-page-cl",
        "x-youtube-page-label",
        "x-youtube-time-zone",
        "x-youtube-utc-offset",
    ):
        if not extra.get(key):
            continue
        if key == "x-origin":
            headers["X-Origin"] = extra[key]
        elif key.startswith("x-goog-"):
            rest = key[len("x-goog-") :]
            name = "X-Goog-" + "-".join("ID" if p == "id" else p.title() for p in rest.split("-"))
            headers[name] = extra[key]
        else:
            rest = key[len("x-youtube-") :]
            name = "X-Youtube-" + "-".join(
                "CL" if p == "cl" else p.title() for p in rest.split("-")
            )
            headers[name] = extra[key]

    return headers


def cookies_configured(cookies: dict[str, str] | None = None) -> bool:
    jar = cookies if cookies is not None else studio_cookies_from_env()
    return bool(jar.get("SAPISID") or jar.get("SID") or jar.get("__Secure-1PSID"))


def capture_header_keys() -> tuple[str, ...]:
    return _CAPTURE_HEADER_KEYS


def default_innertube_context(channel_id: str = "") -> dict[str, Any]:
    ctx: dict[str, Any] = {
        "client": {
            "clientName": 62,
            "clientVersion": "1.20260709.05.00",
            "hl": "ko",
            "gl": "KR",
            "userAgent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36"
            ),
        },
        "user": {"lockedSafetyMode": False},
        "request": {"useSsl": True},
    }
    if channel_id:
        ctx["user"]["delegationContext"] = {
            "externalChannelId": channel_id,
            "roleType": {"channelRoleType": "CREATOR_CHANNEL_ROLE_TYPE_OWNER"},
        }
    return ctx

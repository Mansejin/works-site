from __future__ import annotations

import os
from typing import Callable
from urllib.parse import urlparse

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.public_brands import is_public_brand
from app.team_gate import team_gate_enabled, verify_team_token

# Public brand-read endpoints (no team token). Writes stay protected except
# allowlisted brand productlist PUT (see is_public_api_request).
_PUBLIC_GET = {
    "/api/dddit/team-gate/status",
    "/api/dddit/team-gate/verify",
    "/api/dddit/conti",
    "/api/dddit/conti/projects",
    "/api/dddit/sheet/get",
    "/api/dddit/productlist",
}
_PUBLIC_POST = {
    "/api/dddit/team-gate/login",
    "/api/dddit/team-gate/access-login",
}

# Studio bookmarklet: Origin alone is spoofable — require shared secret header.
_STUDIO_ORIGINS = {
    "https://studio.youtube.com",
}
_STUDIO_PUBLIC_POST = {
    "/api/dddit/youtube/report/studio-promotions/import",
}
_STUDIO_SECRET_HEADER = "X-Dddit-Studio-Import-Key"

_WORKS_HOST = "works." + "mansejin.com"
_WORKS_ORIGINS = {
    f"https://{_WORKS_HOST}",
}


def _normalize_path(path: str) -> str:
    if not path or path == "/":
        return "/"
    return path.rstrip("/") or "/"


def studio_import_secret() -> str:
    return os.getenv("DDDIT_STUDIO_IMPORT_SECRET", "").strip()


def is_studio_origin(request: Request) -> bool:
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    return origin in _STUDIO_ORIGINS


def is_works_origin(request: Request) -> bool:
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if origin in _WORKS_ORIGINS:
        return True
    # Same-origin navigations / some browsers omit Origin on GET; for PUT
    # prefer Origin, fall back to Referer host.
    referer = (request.headers.get("referer") or "").strip()
    if not referer:
        return False
    try:
        host = urlparse(referer).hostname or ""
    except ValueError:
        return False
    return host.lower() == _WORKS_HOST


def _query_project(request: Request) -> str:
    return (request.query_params.get("project") or "").strip().lower()


def is_public_brand_get(request: Request, path: str) -> bool:
    """Scope public conti/sheet/productlist reads to allowlisted brands."""
    if path == "/api/dddit/conti/projects":
        return True  # list is filtered in route
    if path in {"/api/dddit/conti", "/api/dddit/sheet/get", "/api/dddit/productlist"}:
        project = _query_project(request)
        if not project:
            return False
        return is_public_brand(project)
    return path in _PUBLIC_GET and path.startswith("/api/dddit/team-gate/")


def is_public_api_request(request: Request) -> bool:
    """Return True when this request may skip the team token."""
    method = request.method.upper()
    path = _normalize_path(request.url.path)

    if method == "OPTIONS":
        return True

    if method == "GET" and path.startswith("/api/dddit/team-gate/"):
        return True

    if method == "GET" and path in _PUBLIC_GET:
        if path.startswith("/api/dddit/team-gate/"):
            return True
        return is_public_brand_get(request, path)

    if method == "POST" and path in _PUBLIC_POST:
        return True

    # Brand productlist PUT: allowlisted projects only, and only from works Origin
    # (or with a team token — handled by caller). Anonymous curl without Origin → deny.
    if method == "PUT" and path == "/api/dddit/productlist":
        # Project is in JSON body; middleware cannot cheaply peek. Route enforces
        # allowlist; here we only allow the path when Origin/Referer looks like works
        # OR a valid team token is present (token checked below before this path).
        if is_works_origin(request):
            return True
        return False

    if method == "POST" and path in _STUDIO_PUBLIC_POST:
        secret = studio_import_secret()
        if not secret:
            return False
        provided = (request.headers.get(_STUDIO_SECRET_HEADER) or "").strip()
        if provided and provided == secret and is_studio_origin(request):
            return True
        return False

    return False


def team_token_from_request(request: Request) -> str:
    return (request.headers.get("X-Dddit-Team-Token") or "").strip()


def _unauthorized() -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={
            "detail": "Team authentication required",
            "code": "team_gate_required",
        },
        headers={"WWW-Authenticate": "DdditTeamToken"},
    )


class TeamGateApiMiddleware(BaseHTTPMiddleware):
    """Require team token for sensitive API routes when gate is enabled."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path or ""
        if not team_gate_enabled():
            return await call_next(request)

        # Protect dddit + logitechg APIs (logitech was previously ungated).
        if not (path.startswith("/api/dddit") or path.startswith("/api/logitechg")):
            return await call_next(request)

        token = team_token_from_request(request)
        if verify_team_token(token):
            return await call_next(request)

        if path.startswith("/api/dddit") and is_public_api_request(request):
            return await call_next(request)

        return _unauthorized()

from __future__ import annotations

from typing import Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.team_gate import team_gate_enabled, verify_team_token

# Public brand-read endpoints (no team token). Writes stay protected.
_PUBLIC_GET = {
    "/api/dddit/team-gate/status",
    "/api/dddit/team-gate/verify",
    "/api/dddit/conti",
    "/api/dddit/conti/projects",
    "/api/dddit/sheet/get",
}
_PUBLIC_POST = {
    "/api/dddit/team-gate/login",
}

# Studio Console bookmarklet cannot read works sessionStorage — allow import
# only when Origin is YouTube Studio.
_STUDIO_ORIGINS = {
    "https://studio.youtube.com",
}
_STUDIO_PUBLIC_POST = {
    "/api/dddit/youtube/report/studio-promotions/import",
}


def _normalize_path(path: str) -> str:
    if not path or path == "/":
        return "/"
    return path.rstrip("/") or "/"


def is_studio_origin(request: Request) -> bool:
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    return origin in _STUDIO_ORIGINS


def is_public_api_request(request: Request) -> bool:
    """Return True when this /api/dddit request may skip the team token."""
    method = request.method.upper()
    path = _normalize_path(request.url.path)

    if method == "OPTIONS":
        return True

    if method == "GET" and (path in _PUBLIC_GET or path.startswith("/api/dddit/team-gate/")):
        return True

    if method == "POST" and path in _PUBLIC_POST:
        return True

    if method == "POST" and path in _STUDIO_PUBLIC_POST and is_studio_origin(request):
        return True

    return False


def team_token_from_request(request: Request) -> str:
    return (request.headers.get("X-Dddit-Team-Token") or "").strip()


class TeamGateApiMiddleware(BaseHTTPMiddleware):
    """Require team token for sensitive /api/dddit/* when gate is enabled."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable):
        path = request.url.path or ""
        if not path.startswith("/api/dddit"):
            return await call_next(request)
        if not team_gate_enabled():
            return await call_next(request)
        if is_public_api_request(request):
            return await call_next(request)

        token = team_token_from_request(request)
        if verify_team_token(token):
            return await call_next(request)

        return JSONResponse(
            status_code=401,
            content={
                "detail": "Team authentication required",
                "code": "team_gate_required",
            },
            headers={"WWW-Authenticate": "DdditTeamToken"},
        )

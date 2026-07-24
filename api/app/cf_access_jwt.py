"""Validate Cloudflare Access JWTs (CF_Authorization / Cf-Access-Jwt-Assertion)."""

from __future__ import annotations

import os
import time
from functools import lru_cache
from typing import Any

import jwt
from jwt import PyJWKClient

# Team auth domain (Zero Trust)
DEFAULT_AUTH_DOMAIN = "restless-shadow-2aeb.cloudflareaccess.com"

# Audience tags for works Access apps (personal + company path apps)
DEFAULT_AUDS = (
    # works (catch-all personal)
    "4e1e78b75784b4da6936cd42d698d50ade4fd8590da72ded8e99e8f8c1165fe1",
    # works-dddit
    "540a37e016e3630c70067e7fcab10b184f3b28e8738e44649d7b3c463650c0f0",
    # works-logitechg
    "776e28f04987efe5096d3d86a40f319894223d9d677b5f7157e598f0bac6eaae",
)


def access_auth_domain() -> str:
    return (
        os.getenv("CF_ACCESS_AUTH_DOMAIN", "").strip()
        or DEFAULT_AUTH_DOMAIN
    )


def access_allowed_auds() -> set[str]:
    raw = os.getenv("CF_ACCESS_ALLOWED_AUDS", "").strip()
    if raw:
        return {a.strip() for a in raw.split(",") if a.strip()}
    return set(DEFAULT_AUDS)


@lru_cache(maxsize=1)
def _jwk_client() -> PyJWKClient:
    url = f"https://{access_auth_domain()}/cdn-cgi/access/certs"
    return PyJWKClient(url, cache_keys=True)


def verify_access_jwt(token: str) -> dict[str, Any]:
    """Return JWT claims if valid; raise ValueError otherwise."""
    token = (token or "").strip()
    if not token or token.count(".") != 2:
        raise ValueError("invalid access token format")

    try:
        signing_key = _jwk_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=None,  # checked manually — multiple AUDs
            options={"verify_aud": False},
            issuer=f"https://{access_auth_domain()}",
        )
    except Exception as exc:  # noqa: BLE001 — map to ValueError for callers
        raise ValueError(f"access jwt invalid: {exc}") from exc

    aud = claims.get("aud")
    auds = set(aud) if isinstance(aud, list) else {aud} if aud else set()
    allowed = access_allowed_auds()
    if allowed and not (auds & allowed):
        raise ValueError("access jwt audience mismatch")

    email = str(claims.get("email") or "").strip().lower()
    if not email:
        raise ValueError("access jwt missing email")

    exp = int(claims.get("exp") or 0)
    if exp and exp < int(time.time()):
        raise ValueError("access jwt expired")

    return claims


def clear_jwk_cache() -> None:
    _jwk_client.cache_clear()

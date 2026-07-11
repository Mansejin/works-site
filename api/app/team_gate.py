from __future__ import annotations

import hashlib
import hmac
import os
import time


def team_gate_passcode() -> str:
    return os.getenv("DDDIT_TEAM_GATE_PASSCODE", "").strip()


def team_gate_enabled() -> bool:
    return bool(team_gate_passcode())


def _signing_secret() -> str:
    explicit = os.getenv("DDDIT_TEAM_GATE_SECRET", "").strip()
    if explicit:
        return explicit
    return team_gate_passcode()


def issue_team_token() -> tuple[str, int]:
    secret = _signing_secret()
    if not secret:
        raise RuntimeError("team gate is not configured")
    expires_at = int(time.time()) + 7 * 24 * 3600
    payload = str(expires_at)
    sig = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}.{sig}", expires_at


def verify_team_token(token: str) -> bool:
    secret = _signing_secret()
    if not secret or not token:
        return False
    try:
        exp_str, sig = token.split(".", 1)
        expires_at = int(exp_str)
    except (TypeError, ValueError):
        return False
    if expires_at < int(time.time()):
        return False
    expected = hmac.new(secret.encode(), exp_str.encode(), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(sig, expected)


def verify_team_passcode(passcode: str) -> bool:
    expected = team_gate_passcode()
    if not expected:
        return False
    return hmac.compare_digest(expected, str(passcode or "").strip())

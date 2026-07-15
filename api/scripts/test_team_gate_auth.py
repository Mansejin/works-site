#!/usr/bin/env python3
"""Team gate API auth middleware smoke tests (no network)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

os.environ["DDDIT_TEAM_GATE_PASSCODE"] = "test-pass-123"
os.environ.pop("DDDIT_TEAM_GATE_SECRET", None)

from fastapi.testclient import TestClient

from app.main import create_app
from app.team_gate import issue_team_token


def main() -> None:
    app = create_app()
    client = TestClient(app)

    # Public endpoints
    assert client.get("/health").status_code == 200
    assert client.get("/api/dddit/team-gate/status").json()["enabled"] is True
    assert client.post("/api/dddit/team-gate/login", json={"passcode": "wrong"}).status_code == 401
    login = client.post("/api/dddit/team-gate/login", json={"passcode": "test-pass-123"})
    assert login.status_code == 200
    token = login.json()["token"]
    assert token

    # Sensitive GET blocked without token
    denied = client.get("/api/dddit/hub")
    assert denied.status_code == 401, denied.text
    assert denied.json().get("code") == "team_gate_required"

    denied_report = client.get("/api/dddit/youtube/report/overview")
    assert denied_report.status_code == 401

    denied_config = client.get("/api/dddit/config")
    assert denied_config.status_code == 401

    # Brand-share public reads stay open
    # (may 200/404 depending on data — must not be 401)
    for path in (
        "/api/dddit/conti/projects",
        "/api/dddit/conti?project=xenics",
        "/api/dddit/sheet/get?project=xenics",
    ):
        res = client.get(path)
        assert res.status_code != 401, path

    # Authenticated access works
    ok = client.get("/api/dddit/hub", headers={"X-Dddit-Team-Token": token})
    assert ok.status_code == 200, ok.text

    # Disabled gate opens all routes
    os.environ["DDDIT_TEAM_GATE_PASSCODE"] = ""
    # recreate app so env is re-read
    open_client = TestClient(create_app())
    assert open_client.get("/api/dddit/hub").status_code == 200

    print("ok")


if __name__ == "__main__":
    main()

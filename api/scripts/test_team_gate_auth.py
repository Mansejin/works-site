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
os.environ.pop("DDDIT_STUDIO_IMPORT_SECRET", None)

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
    headers = {"X-Dddit-Team-Token": token}

    # Sensitive GET blocked without token
    denied = client.get("/api/dddit/hub")
    assert denied.status_code == 401, denied.text
    assert denied.json().get("code") == "team_gate_required"

    denied_report = client.get("/api/dddit/youtube/report/overview")
    assert denied_report.status_code == 401

    denied_config = client.get("/api/dddit/config")
    assert denied_config.status_code == 401

    # Logitech schedule requires token
    assert client.get("/api/logitechg/schedule").status_code == 401
    assert client.put("/api/logitechg/schedule", json={"positions": {}}).status_code == 401
    assert client.get("/api/logitechg/schedule", headers=headers).status_code == 200

    # Brand-share public reads stay open for allowlisted brands only
    for path in (
        "/api/dddit/conti/projects",
        "/api/dddit/conti?project=xenics",
        "/api/dddit/sheet/get?project=xenics",
        "/api/dddit/productlist?project=xenics",
    ):
        res = client.get(path)
        assert res.status_code != 401, path

    # access-login without jwt → 401 (not missing middleware)
    assert (
        client.post("/api/dddit/team-gate/access-login", json={"accessJwt": ""}).status_code
        == 401
    )

    # Internal / unknown projects require token
    assert client.get("/api/dddit/conti?project=default").status_code == 401
    assert client.get("/api/dddit/sheet/get?project=default").status_code == 401
    assert client.get("/api/dddit/productlist?project=default").status_code == 401

    # Productlist PUT: non-brand blocked; brand needs works Origin
    assert (
        client.put(
            "/api/dddit/productlist",
            json={"project": "zzzaudit", "rows": []},
        ).status_code
        == 401
    )
    assert (
        client.put(
            "/api/dddit/productlist",
            json={"project": "xenics", "rows": []},
        ).status_code
        == 401
    )
    ok_pl = client.put(
        "/api/dddit/productlist",
        json={"project": "xenics", "rows": [{"name": "a", "link": "https://example.com"}]},
        headers={"Origin": "https://" + "works.mansejin.com"},  # pragma: allowlist secret
    )
    assert ok_pl.status_code == 200, ok_pl.text

    # Studio import: Origin alone is not enough
    assert (
        client.post(
            "/api/dddit/youtube/report/studio-promotions/import",
            json={"promotions": []},
            headers={"Origin": "https://studio.youtube.com"},
        ).status_code
        == 401
    )
    os.environ["DDDIT_STUDIO_IMPORT_SECRET"] = "studio-secret"
    studio_client = TestClient(create_app())
    assert (
        studio_client.post(
            "/api/dddit/youtube/report/studio-promotions/import",
            json={"promotions": []},
            headers={
                "Origin": "https://studio.youtube.com",
                "X-Dddit-Studio-Import-Key": "studio-secret",
            },
        ).status_code
        != 401
    )

    # Authenticated access works
    ok = client.get("/api/dddit/hub", headers=headers)
    assert ok.status_code == 200, ok.text

    # Disabled gate opens all routes
    os.environ["DDDIT_TEAM_GATE_PASSCODE"] = ""
    os.environ.pop("DDDIT_STUDIO_IMPORT_SECRET", None)
    open_client = TestClient(create_app())
    assert open_client.get("/api/dddit/hub").status_code == 200
    assert open_client.get("/api/logitechg/schedule").status_code == 200

    print("ok")


if __name__ == "__main__":
    main()

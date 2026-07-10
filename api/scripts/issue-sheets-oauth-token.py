#!/usr/bin/env python3
"""One-time OAuth refresh token for Google Sheets + Drive (디디딧 계정).

Usage (from api/ with .env or env vars):
  export YOUTUBE_OAUTH_CLIENT_ID=...
  export YOUTUBE_OAUTH_CLIENT_SECRET=...
  python scripts/issue-sheets-oauth-token.py

Open the printed URL in Chrome (디디딧 계정 only), approve, paste the `code` from redirect.

Add to NAS api/.env:
  DDDIT_SHEETS_OAUTH_REFRESH_TOKEN=...
  DDDIT_SHEETS_DRIVE_FOLDER_ID=1BH-5_kdPSKEmWIZmY-ESD9mfF3_pdjQm
"""

from __future__ import annotations

import os
import sys
import urllib.parse

import httpx

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]
REDIRECT_URI = "http://localhost:8765/oauth2callback"


def main() -> int:
    client_id = os.getenv("YOUTUBE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("YOUTUBE_OAUTH_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        print("Set YOUTUBE_OAUTH_CLIENT_ID and YOUTUBE_OAUTH_CLIENT_SECRET", file=sys.stderr)
        return 1

    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
    }
    auth_url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)
    print("1. Open this URL in Chrome (디디딧 account only):\n")
    print(auth_url)
    print("\n2. After approve, browser may fail to load localhost — copy `code=` from address bar.")
    code = input("\nPaste authorization code: ").strip()
    if not code:
        return 1

    res = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
        },
        timeout=30.0,
    )
    res.raise_for_status()
    body = res.json()
    refresh = body.get("refresh_token")
    if not refresh:
        print("No refresh_token in response. Try again with prompt=consent.", file=sys.stderr)
        print(body)
        return 1

    print("\nAdd to NAS api/.env:\n")
    print(f"DDDIT_SHEETS_OAUTH_REFRESH_TOKEN={refresh}")
    print("DDDIT_SHEETS_DRIVE_FOLDER_ID=1BH-5_kdPSKEmWIZmY-ESD9mfF3_pdjQm")
    print("\nGCP: enable Google Sheets API + Google Drive API for this project.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

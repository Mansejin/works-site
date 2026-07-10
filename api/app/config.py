from __future__ import annotations

import os


def allowed_origins() -> list[str]:
    raw = os.getenv(
        "WORKS_ALLOWED_ORIGINS",
        "https://works.mansejin.com,http://localhost:8080,http://127.0.0.1:8080",
    )
    return [item.strip() for item in raw.split(",") if item.strip()]


def gemini_api_key() -> str:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return key


def sheet_api_url() -> str:
    url = os.getenv("DDDIT_SHEET_API_URL", "").strip().rstrip("/")
    if not url:
        raise RuntimeError("DDDIT_SHEET_API_URL is not set")
    return url


def sheet_api_token() -> str:
    token = os.getenv("DDDIT_SHEET_API_TOKEN", "").strip()
    if not token:
        raise RuntimeError("DDDIT_SHEET_API_TOKEN is not set")
    return token


def sheet_open_url() -> str:
    return os.getenv("DDDIT_SHEET_OPEN_URL", "").strip()

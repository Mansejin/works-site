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


def sheet_open_url() -> str:
    return os.getenv("DDDIT_SHEET_OPEN_URL", "").strip()


def apps_script_sheet_config() -> tuple[str, str] | None:
    url = os.getenv("DDDIT_SHEET_API_URL", "").strip().rstrip("/")
    token = os.getenv("DDDIT_SHEET_API_TOKEN", "").strip()
    if url and token:
        return url, token
    return None


def sheet_api_url() -> str:
    cfg = apps_script_sheet_config()
    if not cfg:
        raise RuntimeError("DDDIT_SHEET_API_URL is not set")
    return cfg[0]


def sheet_api_token() -> str:
    cfg = apps_script_sheet_config()
    if not cfg:
        raise RuntimeError("DDDIT_SHEET_API_TOKEN is not set")
    return cfg[1]


def sheets_oauth_config() -> dict[str, str] | None:
    client_id = (
        os.getenv("DDDIT_SHEETS_OAUTH_CLIENT_ID", "").strip()
        or os.getenv("YOUTUBE_OAUTH_CLIENT_ID", "").strip()
    )
    client_secret = (
        os.getenv("DDDIT_SHEETS_OAUTH_CLIENT_SECRET", "").strip()
        or os.getenv("YOUTUBE_OAUTH_CLIENT_SECRET", "").strip()
    )
    refresh_token = os.getenv("DDDIT_SHEETS_OAUTH_REFRESH_TOKEN", "").strip()
    if not all([client_id, client_secret, refresh_token]):
        return None
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    }


def sheets_drive_folder_id() -> str:
    return os.getenv("DDDIT_SHEETS_DRIVE_FOLDER_ID", "").strip()


def youtube_api_key() -> str:
    return os.getenv("YOUTUBE_API_KEY", "").strip()


def youtube_channel_handle() -> str:
    return os.getenv("YOUTUBE_CHANNEL_HANDLE", "DD-DIT").strip().lstrip("@")


def youtube_channel_id() -> str:
    return os.getenv("YOUTUBE_CHANNEL_ID", "").strip()


def youtube_analytics_oauth_config() -> dict[str, str] | None:
    client_id = os.getenv("YOUTUBE_OAUTH_CLIENT_ID", "").strip()
    client_secret = os.getenv("YOUTUBE_OAUTH_CLIENT_SECRET", "").strip()
    refresh_token = os.getenv("YOUTUBE_OAUTH_REFRESH_TOKEN", "").strip()
    if not all([client_id, client_secret, refresh_token]):
        return None
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
    }


def google_ads_config() -> dict[str, str] | None:
    developer_token = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "").strip()
    client_id = (
        os.getenv("GOOGLE_ADS_CLIENT_ID", "").strip()
        or os.getenv("YOUTUBE_OAUTH_CLIENT_ID", "").strip()
    )
    client_secret = (
        os.getenv("GOOGLE_ADS_CLIENT_SECRET", "").strip()
        or os.getenv("YOUTUBE_OAUTH_CLIENT_SECRET", "").strip()
    )
    refresh_token = os.getenv("GOOGLE_ADS_REFRESH_TOKEN", "").strip()
    customer_id = os.getenv("GOOGLE_ADS_CUSTOMER_ID", "").strip()
    if not all([developer_token, client_id, client_secret, refresh_token, customer_id]):
        return None
    login_customer_id = os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "").strip()
    return {
        "developer_token": developer_token,
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "customer_id": customer_id.replace("-", ""),
        "login_customer_id": login_customer_id.replace("-", "") if login_customer_id else "",
    }


def google_ads_sync_enabled() -> bool:
    """Studio 프로모션은 Ads API에 없을 수 있어 기본 꺼짐. 1/true/yes/on 일 때만 동기화."""
    raw = os.getenv("GOOGLE_ADS_SYNC_ENABLED", "0").strip().lower()
    return raw in ("1", "true", "yes", "on")

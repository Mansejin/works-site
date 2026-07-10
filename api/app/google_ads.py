from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import google_ads_config
from app.google_oauth import get_access_token
from app.youtube_report_store import merge_ads_into_promotions, read_ads_sync, write_ads_sync

_ADS_API_VERSION = "v20"
_CACHE_TTL = 3600
_SYNC_CACHE: dict[str, Any] = {}


def _configured() -> bool:
    return google_ads_config() is not None


def _not_configured() -> dict[str, Any]:
    return {
        "ok": False,
        "configured": False,
        "message": (
            "Google Ads API가 설정되지 않았습니다. "
            "GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, "
            "GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, "
            "GOOGLE_ADS_CUSTOMER_ID를 NAS .env에 추가하세요."
        ),
    }


def _normalize_customer_id(customer_id: str) -> str:
    return re.sub(r"\D", "", customer_id)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^\w가-힣]+", "-", name.strip().lower())
    return slug.strip("-")[:48] or "campaign"


async def _search_ads(
    client: httpx.AsyncClient,
    access_token: str,
    cfg: dict[str, str],
    query: str,
) -> list[dict[str, Any]]:
    customer_id = cfg["customer_id"]
    url = (
        f"https://googleads.googleapis.com/{_ADS_API_VERSION}/"
        f"customers/{customer_id}/googleAds:search"
    )
    headers = {
        "Authorization": f"Bearer {access_token}",
        "developer-token": cfg["developer_token"],
        "Content-Type": "application/json",
    }
    if not cfg.get("login_customer_id"):
        raise RuntimeError(
            "GOOGLE_ADS_LOGIN_CUSTOMER_ID(MCC ID)가 필요합니다. 예: 1987587717"
        )
    headers["login-customer-id"] = cfg["login_customer_id"]

    res = await client.post(url, headers=headers, json={"query": query})
    if not res.is_success:
        detail = res.text[:500]
        raise RuntimeError(f"Google Ads API {res.status_code}: {detail}")
    body = res.json()
    return list(body.get("results") or [])


def _parse_campaign_row(row: dict[str, Any]) -> dict[str, Any]:
    campaign = row.get("campaign") or {}
    metrics = row.get("metrics") or {}
    cost_micros = int(metrics.get("costMicros") or 0)
    impressions = int(metrics.get("impressions") or 0)
    views = int(metrics.get("videoViews") or metrics.get("views") or 0)
    clicks = int(metrics.get("clicks") or 0)
    name = campaign.get("name") or "캠페인"
    campaign_id = str(campaign.get("id") or "")
    return {
        "id": f"ads-{campaign_id}" if campaign_id else _slugify(name),
        "adsCampaignId": campaign_id,
        "title": name,
        "videoTitle": name,
        "status": "진행중",
        "cost": round(cost_micros / 1_000_000),
        "impressions": impressions,
        "views": views,
        "clicks": clicks,
        "subscribers": 0,
        "source": "google-ads",
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }


async def sync_campaigns(force: bool = False) -> dict[str, Any]:
    if not force:
        cached = _SYNC_CACHE.get("last")
        if cached and time.time() - cached["at"] < 300:
            return cached["data"]

    if not _configured():
        return _not_configured()

    cfg = google_ads_config()
    assert cfg is not None

    query = """
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          metrics.cost_micros,
          metrics.impressions,
          metrics.video_views,
          metrics.clicks
        FROM campaign
        WHERE campaign.status != 'REMOVED'
          AND segments.date DURING LAST_30_DAYS
    """.strip()

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            token = await get_access_token(
                client,
                client_id=cfg["client_id"],
                client_secret=cfg["client_secret"],
                refresh_token=cfg["refresh_token"],
                cache_key="google-ads",
            )
            rows = await _search_ads(client, token, cfg, query)
            campaigns = [_parse_campaign_row(row) for row in rows]

        sync_payload = {
            "syncedAt": datetime.now(timezone.utc).isoformat(),
            "campaigns": campaigns,
            "campaignCount": len(campaigns),
        }
        write_ads_sync(sync_payload)
        merged = merge_ads_into_promotions(campaigns)

        result = {
            "ok": True,
            "configured": True,
            "syncedAt": sync_payload["syncedAt"],
            "campaignCount": len(campaigns),
            "campaigns": campaigns,
            "mergedPromotions": len(merged.get("promotions") or []),
            "message": f"{len(campaigns)}개 캠페인 동기화 완료",
        }
        _SYNC_CACHE["last"] = {"at": time.time(), "data": result}
        return result
    except Exception as exc:
        stale = read_ads_sync()
        return {
            "ok": False,
            "configured": True,
            "message": f"Google Ads 동기화 실패: {exc}",
            "lastSync": stale.get("syncedAt"),
            "campaigns": stale.get("campaigns") or [],
        }


async def get_ads_status() -> dict[str, Any]:
    if not _configured():
        return {**_not_configured(), "lastSync": None, "campaigns": []}

    stale = read_ads_sync()
    return {
        "ok": True,
        "configured": True,
        "lastSync": stale.get("syncedAt"),
        "campaignCount": stale.get("campaignCount") or len(stale.get("campaigns") or []),
        "campaigns": stale.get("campaigns") or [],
    }

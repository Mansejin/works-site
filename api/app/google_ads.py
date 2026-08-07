from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx

from app.config import google_ads_config, google_ads_sync_enabled
from app.google_oauth import get_access_token
from app.youtube_report_store import (
    merge_ads_into_promotions,
    read_ads_sync,
    write_ads_sync,
    write_promotions,
)

_ADS_API_VERSION = "v24"
_SYNC_CACHE: dict[str, Any] = {}


def _disabled_payload() -> dict[str, Any]:
    return {
        "ok": True,
        "configured": False,
        "enabled": False,
        "message": (
            "Google Ads 동기화가 꺼져 있습니다. "
            "YouTube Studio 프로모션은 보고 데이터 편집(수동)을 사용합니다."
        ),
    }


def _configured() -> bool:
    return google_ads_sync_enabled() and google_ads_config() is not None


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
            "GOOGLE_ADS_LOGIN_CUSTOMER_ID(MCC ID)가 필요합니다. 예: [REDACTED]"
        )
    headers["login-customer-id"] = cfg["login_customer_id"]

    results: list[dict[str, Any]] = []
    page_token = ""
    while True:
        payload: dict[str, Any] = {"query": query}
        if page_token:
            payload["pageToken"] = page_token
        res = await client.post(url, headers=headers, json=payload)
        if not res.is_success:
            detail = res.text[:500]
            raise RuntimeError(f"Google Ads API {res.status_code}: {detail}")
        body = res.json()
        results.extend(list(body.get("results") or []))
        page_token = body.get("nextPageToken") or ""
        if not page_token:
            break
    return results


def _status_label(status_raw: str) -> str:
    value = str(status_raw or "").upper()
    if value in ("ENABLED", "ACTIVE"):
        return "진행중"
    if value == "PAUSED":
        return "일시중지"
    return value or "진행중"


def _aggregate_campaign_rows(
    rows: list[dict[str, Any]],
    *,
    subscribe_conversions: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """segments.date 일별 행을 campaign.id 기준으로 합산."""
    buckets: dict[str, dict[str, Any]] = {}
    synced_at = datetime.now(timezone.utc).isoformat()
    subscribe_conversions = subscribe_conversions or {}

    for row in rows:
        campaign = row.get("campaign") or {}
        metrics = row.get("metrics") or {}
        campaign_id = str(campaign.get("id") or "").strip()
        name = campaign.get("name") or "캠페인"
        key = campaign_id or _slugify(name)
        bucket = buckets.get(key)
        if not bucket:
            bucket = {
                "campaign_id": campaign_id,
                "name": name,
                "status_raw": str(campaign.get("status") or ""),
                "cost_micros": 0,
                "impressions": 0,
                "views": 0,
                "clicks": 0,
            }
            buckets[key] = bucket

        bucket["cost_micros"] += int(metrics.get("costMicros") or 0)
        bucket["impressions"] += int(metrics.get("impressions") or 0)
        bucket["views"] += int(
            metrics.get("videoTrueviewViews")
            or metrics.get("videoViews")
            or metrics.get("views")
            or 0
        )
        bucket["clicks"] += int(metrics.get("clicks") or 0)
        status_raw = str(campaign.get("status") or "")
        if status_raw:
            # ENABLED를 PAUSED보다 우선
            if bucket["status_raw"].upper() != "ENABLED":
                bucket["status_raw"] = status_raw
            if name:
                bucket["name"] = name

    campaigns: list[dict[str, Any]] = []
    for bucket in buckets.values():
        campaign_id = bucket["campaign_id"]
        name = bucket["name"]
        subs = int(round(float(subscribe_conversions.get(campaign_id) or 0)))
        campaigns.append(
            {
                "id": f"ads-{campaign_id}" if campaign_id else _slugify(name),
                "adsCampaignId": campaign_id,
                "title": name,
                "videoTitle": name,
                "status": _status_label(bucket["status_raw"]),
                "cost": round(bucket["cost_micros"] / 1_000_000),
                "impressions": bucket["impressions"],
                "views": bucket["views"],
                "clicks": bucket["clicks"],
                "subscribers": max(0, subs),
                "source": "google-ads",
                "syncedAt": synced_at,
            }
        )

    campaigns.sort(key=lambda c: (-int(c.get("cost") or 0), str(c.get("title") or "")))
    return campaigns


async def _fetch_subscribe_conversion_actions(
    client: httpx.AsyncClient,
    access_token: str,
    cfg: dict[str, str],
) -> list[dict[str, str]]:
    """Return conversion actions that look like channel-subscribe tracking."""
    from app.ad_subscriber_events import is_subscribe_conversion_name

    query = """
        SELECT
          conversion_action.id,
          conversion_action.name,
          conversion_action.category,
          conversion_action.status
        FROM conversion_action
        WHERE conversion_action.status != 'REMOVED'
    """.strip()
    rows = await _search_ads(client, access_token, cfg, query)
    matched: list[dict[str, str]] = []
    for row in rows:
        action = row.get("conversionAction") or {}
        name = str(action.get("name") or "")
        category = str(action.get("category") or "")
        if not is_subscribe_conversion_name(name) and "SUBSCRIBE" not in category.upper():
            continue
        action_id = str(action.get("id") or "").strip()
        if not action_id:
            continue
        matched.append({"id": action_id, "name": name, "category": category})
    return matched


async def _fetch_subscribe_conversion_days(
    client: httpx.AsyncClient,
    access_token: str,
    cfg: dict[str, str],
    actions: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], dict[str, float], str | None, str | None]:
    """Daily subscribe conversions by campaign + totals per campaign id."""
    from app.ad_subscriber_events import is_subscribe_conversion_name

    if not actions:
        return [], {}, None, None

    action_ids = {a["id"] for a in actions}
    action_names = {a["name"] for a in actions if a.get("name")}
    query = """
        SELECT
          campaign.id,
          segments.date,
          segments.conversion_action,
          segments.conversion_action_name,
          metrics.conversions
        FROM campaign
        WHERE campaign.status != 'REMOVED'
          AND segments.date DURING LAST_30_DAYS
          AND metrics.conversions > 0
    """.strip()
    rows = await _search_ads(client, access_token, cfg, query)
    daily: list[dict[str, Any]] = []
    by_campaign: dict[str, float] = {}
    dates: list[str] = []
    for row in rows:
        campaign = row.get("campaign") or {}
        segments = row.get("segments") or {}
        metrics = row.get("metrics") or {}
        campaign_id = str(campaign.get("id") or "").strip()
        day = str(segments.get("date") or "")[:10]
        name = str(segments.get("conversionActionName") or "")
        resource = str(segments.get("conversionAction") or "")
        # Resource looks like customers/123/conversionActions/456
        resource_id = resource.rsplit("/", 1)[-1] if resource else ""
        if resource_id not in action_ids and name not in action_names:
            if not is_subscribe_conversion_name(name):
                continue
        conversions = float(metrics.get("conversions") or 0)
        if conversions <= 0 or not campaign_id or not day:
            continue
        daily.append(
            {
                "date": day,
                "promoId": f"ads-{campaign_id}",
                "delta": int(round(conversions)),
                "conversionAction": name or resource_id,
            }
        )
        by_campaign[campaign_id] = by_campaign.get(campaign_id, 0.0) + conversions
        dates.append(day)
    wipe_start = min(dates) if dates else None
    wipe_end = max(dates) if dates else None
    return daily, by_campaign, wipe_start, wipe_end


async def sync_campaigns(force: bool = False) -> dict[str, Any]:
    if not google_ads_sync_enabled():
        return {**_disabled_payload(), "lastSync": None, "campaigns": [], "campaignCount": 0}

    if not force:
        cached = _SYNC_CACHE.get("last")
        if cached and time.time() - cached["at"] < 300:
            return cached["data"]

    if not _configured():
        return _not_configured()

    cfg = google_ads_config()
    assert cfg is not None

    # Google Ads API v24 renamed metrics.video_views → metrics.video_trueview_views
    query = """
        SELECT
          campaign.id,
          campaign.name,
          campaign.status,
          metrics.cost_micros,
          metrics.impressions,
          metrics.video_trueview_views,
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
            subscribe_note = ""
            subscribe_by_campaign: dict[str, float] = {}
            try:
                actions = await _fetch_subscribe_conversion_actions(client, token, cfg)
                daily, subscribe_by_campaign, wipe_start, wipe_end = (
                    await _fetch_subscribe_conversion_days(client, token, cfg, actions)
                )
                from app.ad_subscriber_events import replace_google_ads_subscribe_events

                if daily:
                    replace_google_ads_subscribe_events(
                        daily, wipe_start=wipe_start, wipe_end=wipe_end
                    )
                if actions:
                    subscribe_note = (
                        f" · 구독전환 {len(actions)}개 / "
                        f"일별 {sum(r['delta'] for r in daily)}건"
                    )
                else:
                    subscribe_note = " · 구독 전환 액션 없음(이름에 구독/subscribe 필요)"
            except Exception as conv_exc:  # noqa: BLE001
                subscribe_note = f" · 구독전환 조회 실패: {conv_exc}"

            campaigns = _aggregate_campaign_rows(
                rows, subscribe_conversions=subscribe_by_campaign
            )

        sync_payload = {
            "syncedAt": datetime.now(timezone.utc).isoformat(),
            "campaigns": campaigns,
            "campaignCount": len(campaigns),
        }
        write_ads_sync(sync_payload)
        merged = merge_ads_into_promotions(campaigns)
        write_promotions(merged)
        from app.ad_subscriber_events import ingest_promo_subscriber_snapshots

        # Watermark Studio/manual subscribe promos too (Ads already upserted daily events).
        ingest_promo_subscriber_snapshots(
            merged.get("promotions") or [],
            as_of=datetime.now(timezone.utc).date().isoformat(),
            source="ads-sync",
        )

        active = sum(1 for c in campaigns if c.get("status") == "진행중")
        result = {
            "ok": True,
            "configured": True,
            "enabled": True,
            "syncedAt": sync_payload["syncedAt"],
            "campaignCount": len(campaigns),
            "activeCampaignCount": active,
            "campaigns": campaigns,
            "mergedPromotions": len(merged.get("promotions") or []),
            "message": (
                f"{len(campaigns)}개 캠페인 동기화 완료"
                + (f" (진행중 {active})" if active else "")
                + subscribe_note
            ),
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
    if not google_ads_sync_enabled():
        return {**_disabled_payload(), "lastSync": None, "campaigns": [], "campaignCount": 0}

    if not _configured():
        return {**_not_configured(), "lastSync": None, "campaigns": []}

    stale = read_ads_sync()
    return {
        "ok": True,
        "configured": True,
        "enabled": True,
        "lastSync": stale.get("syncedAt"),
        "campaignCount": stale.get("campaignCount") or len(stale.get("campaigns") or []),
        "campaigns": stale.get("campaigns") or [],
    }

from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any

import httpx

from app.config import youtube_analytics_oauth_config, youtube_channel_id
from app.google_oauth import get_access_token

_ANALYTICS_BASE = "https://youtubeanalytics.googleapis.com/v2/reports"
_CACHE: dict[str, Any] = {}
_CACHE_TTL = 3600  # 1 hour


def _configured() -> bool:
    return youtube_analytics_oauth_config() is not None


def _not_configured_payload(feature: str) -> dict[str, Any]:
    return {
        "ok": False,
        "configured": False,
        "message": (
            "YouTube Analytics OAuth가 설정되지 않았습니다. "
            "YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET, "
            "YOUTUBE_OAUTH_REFRESH_TOKEN을 NAS .env에 추가하세요."
        ),
        "feature": feature,
    }


def _cache_get(key: str) -> Any | None:
    entry = _CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry["at"] > _CACHE_TTL:
        return None
    return entry["data"]


def _cache_set(key: str, data: Any) -> None:
    _CACHE[key] = {"at": time.time(), "data": data}


def _date_range(days: int = 28) -> tuple[str, str]:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


async def _analytics_get(
    client: httpx.AsyncClient,
    access_token: str,
    channel_id: str,
    *,
    start_date: str,
    end_date: str,
    metrics: str,
    dimensions: str = "",
    filters: str = "",
    sort: str = "",
    max_results: int = 200,
) -> dict[str, Any]:
    params: dict[str, Any] = {
        "ids": f"channel=={channel_id}",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": metrics,
        "maxResults": max_results,
    }
    if dimensions:
        params["dimensions"] = dimensions
    if filters:
        params["filters"] = filters
    if sort:
        params["sort"] = sort

    res = await client.get(
        _ANALYTICS_BASE,
        params=params,
        headers={"Authorization": f"Bearer {access_token}"},
    )
    res.raise_for_status()
    return res.json()


def _parse_rows(body: dict[str, Any]) -> list[dict[str, Any]]:
    headers = [h.get("name") for h in body.get("columnHeaders") or []]
    rows = []
    for row in body.get("rows") or []:
        rows.append(dict(zip(headers, row)))
    return rows


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _safe_int(value: Any) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


async def _get_token_and_channel(client: httpx.AsyncClient) -> tuple[str, str]:
    cfg = youtube_analytics_oauth_config()
    if not cfg:
        raise RuntimeError("YouTube Analytics OAuth not configured")
    channel_id = youtube_channel_id()
    if not channel_id:
        raise RuntimeError("YOUTUBE_CHANNEL_ID is not set")
    token = await get_access_token(
        client,
        client_id=cfg["client_id"],
        client_secret=cfg["client_secret"],
        refresh_token=cfg["refresh_token"],
        cache_key="youtube-analytics",
    )
    return token, channel_id


async def fetch_analytics_overview(refresh: bool = False) -> dict[str, Any]:
    cache_key = "overview"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    if not _configured():
        return _not_configured_payload("overview")

    start_date, end_date = _date_range(28)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token, channel_id = await _get_token_and_channel(client)
            body = await _analytics_get(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="views,impressions,annotationClickThroughRate,averageViewDuration,averageViewPercentage",
            )
            rows = _parse_rows(body)
            totals = rows[0] if rows else {}

            impressions = _safe_int(totals.get("impressions"))
            views = _safe_int(totals.get("views"))
            ctr_api = _safe_float(totals.get("annotationClickThroughRate"))
            ctr = round(ctr_api * 100, 2) if ctr_api is not None else (
                round(views / impressions * 100, 2) if impressions > 0 else None
            )

            payload = {
                "ok": True,
                "configured": True,
                "period": {"startDate": start_date, "endDate": end_date, "days": 28},
                "impressions": impressions,
                "views": views,
                "ctr": ctr,
                "ctrUnit": "percent",
                "averageViewDurationSec": _safe_int(totals.get("averageViewDuration")),
                "averageViewPercentage": _safe_float(totals.get("averageViewPercentage")),
                "message": None,
            }
            _cache_set(cache_key, payload)
            return payload
    except Exception as exc:
        return {
            "ok": False,
            "configured": True,
            "message": f"YouTube Analytics 조회 실패: {exc}",
            "period": {"startDate": start_date, "endDate": end_date, "days": 28},
            "impressions": None,
            "views": None,
            "ctr": None,
        }


async def fetch_traffic_sources(refresh: bool = False) -> dict[str, Any]:
    cache_key = "traffic-sources"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    if not _configured():
        return {**_not_configured_payload("traffic-sources"), "sources": []}

    start_date, end_date = _date_range(28)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token, channel_id = await _get_token_and_channel(client)
            body = await _analytics_get(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="views",
                dimensions="insightTrafficSourceType",
                sort="-views",
            )
            rows = _parse_rows(body)
            total_views = sum(_safe_int(r.get("views")) for r in rows)
            sources = []
            for row in rows:
                views = _safe_int(row.get("views"))
                sources.append(
                    {
                        "source": row.get("insightTrafficSourceType") or "UNKNOWN",
                        "views": views,
                        "share": round(views / total_views * 100, 1) if total_views else 0,
                    }
                )

            payload = {
                "ok": True,
                "configured": True,
                "period": {"startDate": start_date, "endDate": end_date},
                "sources": sources,
                "totalViews": total_views,
                "message": None,
            }
            _cache_set(cache_key, payload)
            return payload
    except Exception as exc:
        return {
            "ok": False,
            "configured": True,
            "message": f"유입 경로 조회 실패: {exc}",
            "sources": [],
        }


async def fetch_retention(video_id: str | None = None, refresh: bool = False) -> dict[str, Any]:
    cache_key = f"retention:{video_id or 'channel'}"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    if not _configured():
        return {**_not_configured_payload("retention"), "points": []}

    start_date, end_date = _date_range(28)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token, channel_id = await _get_token_and_channel(client)

            if video_id:
                body = await _analytics_get(
                    client,
                    token,
                    channel_id,
                    start_date=start_date,
                    end_date=end_date,
                    metrics="audienceWatchRatio",
                    dimensions="elapsedVideoTimeRatio",
                    filters=f"video=={video_id}",
                    sort="elapsedVideoTimeRatio",
                    max_results=100,
                )
                rows = _parse_rows(body)
                points = [
                    {
                        "ratio": _safe_float(row.get("elapsedVideoTimeRatio")) or 0,
                        "watchRatio": _safe_float(row.get("audienceWatchRatio")) or 0,
                    }
                    for row in rows
                ]
                scope = "video"
            else:
                body = await _analytics_get(
                    client,
                    token,
                    channel_id,
                    start_date=start_date,
                    end_date=end_date,
                    metrics="averageViewPercentage",
                )
                rows = _parse_rows(body)
                avg_pct = _safe_float((rows[0] if rows else {}).get("averageViewPercentage"))
                points = []
                scope = "channel"

            payload = {
                "ok": True,
                "configured": True,
                "scope": scope,
                "videoId": video_id,
                "period": {"startDate": start_date, "endDate": end_date},
                "points": points,
                "averageViewPercentage": avg_pct if not video_id else None,
                "message": (
                    "영상별 시청 유지 곡선은 videoId 쿼리로 조회"
                    if not video_id
                    else None
                ),
            }
            _cache_set(cache_key, payload)
            return payload
    except Exception as exc:
        return {
            "ok": False,
            "configured": True,
            "message": f"시청 유지 조회 실패: {exc}",
            "points": [],
        }


async def fetch_demographics(refresh: bool = False) -> dict[str, Any]:
    cache_key = "demographics"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    if not _configured():
        return {
            **_not_configured_payload("demographics"),
            "ageGroups": [],
            "gender": [],
            "geo": [],
        }

    start_date, end_date = _date_range(28)
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            token, channel_id = await _get_token_and_channel(client)

            age_body = await _analytics_get(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="viewerPercentage",
                dimensions="ageGroup",
                sort="-viewerPercentage",
            )
            gender_body = await _analytics_get(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="viewerPercentage",
                dimensions="gender",
                sort="-viewerPercentage",
            )
            geo_body = await _analytics_get(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="views",
                dimensions="country",
                sort="-views",
                max_results=10,
            )

            age_groups = [
                {
                    "ageGroup": row.get("ageGroup") or "",
                    "viewerPercentage": _safe_float(row.get("viewerPercentage")) or 0,
                }
                for row in _parse_rows(age_body)
            ]
            gender = [
                {
                    "gender": row.get("gender") or "",
                    "viewerPercentage": _safe_float(row.get("viewerPercentage")) or 0,
                }
                for row in _parse_rows(gender_body)
            ]
            geo_rows = _parse_rows(geo_body)
            total_geo_views = sum(_safe_int(r.get("views")) for r in geo_rows)
            geo = [
                {
                    "country": row.get("country") or "",
                    "views": _safe_int(row.get("views")),
                    "share": round(_safe_int(row.get("views")) / total_geo_views * 100, 1)
                    if total_geo_views
                    else 0,
                }
                for row in geo_rows
            ]

            payload = {
                "ok": True,
                "configured": True,
                "period": {"startDate": start_date, "endDate": end_date},
                "ageGroups": age_groups,
                "gender": gender,
                "geo": geo,
                "message": None,
            }
            _cache_set(cache_key, payload)
            return payload
    except Exception as exc:
        return {
            "ok": False,
            "configured": True,
            "message": f"인구통계 조회 실패: {exc}",
            "ageGroups": [],
            "gender": [],
            "geo": [],
        }

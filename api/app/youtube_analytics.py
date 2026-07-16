from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any

import httpx

from app.config import youtube_analytics_oauth_config, youtube_channel_id, youtube_api_key
from app.google_oauth import get_access_token
from app.youtube_reporting import fetch_reporting_reach

_ANALYTICS_BASE = "https://youtubeanalytics.googleapis.com/v2/reports"
_CONTENT_LONGFORM = "VIDEO_ON_DEMAND"
_CONTENT_SHORTS = "SHORTS"
_SHORTS_MAX_DURATION_SEC = 60
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


async def _analytics_get_safe(
    client: httpx.AsyncClient,
    access_token: str,
    channel_id: str,
    **kwargs: Any,
) -> dict[str, Any]:
    try:
        return await _analytics_get(client, access_token, channel_id, **kwargs)
    except httpx.HTTPStatusError:
        return {"rows": [], "columnHeaders": []}


def _iso_duration_seconds(duration: str) -> int:
    if not duration or not duration.startswith("PT"):
        return 0
    hours = minutes = seconds = 0
    rest = duration[2:]
    num = ""
    for ch in rest:
        if ch.isdigit():
            num += ch
        elif ch == "H":
            hours = int(num or 0)
            num = ""
        elif ch == "M":
            minutes = int(num or 0)
            num = ""
        elif ch == "S":
            seconds = int(num or 0)
            num = ""
    return hours * 3600 + minutes * 60 + seconds


async def _fetch_video_meta(
    client: httpx.AsyncClient,
    video_ids: list[str],
) -> dict[str, dict[str, Any]]:
    """Return {videoId: {duration, title}} via Data API."""
    api_key = youtube_api_key()
    if not api_key or not video_ids:
        return {}
    meta: dict[str, dict[str, Any]] = {}
    for index in range(0, len(video_ids), 50):
        chunk = video_ids[index : index + 50]
        res = await client.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={
                "part": "contentDetails,snippet",
                "id": ",".join(chunk),
                "key": api_key,
            },
        )
        if res.status_code != 200:
            continue
        for item in res.json().get("items") or []:
            video_id = str(item.get("id") or "")
            if not video_id:
                continue
            duration = (item.get("contentDetails") or {}).get("duration") or ""
            title = str((item.get("snippet") or {}).get("title") or "").strip()
            meta[video_id] = {
                "duration": _iso_duration_seconds(duration),
                "title": title,
            }
    return meta


async def _fetch_video_durations(
    client: httpx.AsyncClient,
    video_ids: list[str],
) -> dict[str, int]:
    meta = await _fetch_video_meta(client, video_ids)
    return {vid: int(info.get("duration") or 0) for vid, info in meta.items()}


def _is_shorts_video(duration_sec: int) -> bool:
    return 0 < duration_sec <= _SHORTS_MAX_DURATION_SEC


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
                metrics="views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage",
            )
            rows = _parse_rows(body)
            totals = rows[0] if rows else {}

            views = _safe_int(totals.get("views"))

            payload = {
                "ok": True,
                "configured": True,
                "period": {"startDate": start_date, "endDate": end_date, "days": 28},
                "impressions": None,
                "views": views,
                "ctr": None,
                "ctrUnit": "percent",
                "averageViewDurationSec": _safe_int(totals.get("averageViewDuration")),
                "averageViewPercentage": _safe_float(totals.get("averageViewPercentage")),
                "estimatedMinutesWatched": _safe_int(totals.get("estimatedMinutesWatched")),
                "impressionsNote": None,
                "impressionsSource": None,
                "message": None,
            }

            reach = await fetch_reporting_reach(refresh=refresh)
            payload["reporting"] = reach
            if reach.get("impressions") is not None and reach.get("impressions") > 0:
                payload["impressions"] = reach["impressions"]
                payload["ctr"] = reach.get("ctr")
                payload["impressionsSource"] = "reporting-api"
            elif reach.get("message"):
                payload["impressionsNote"] = reach["message"]

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


_TRAFFIC_SOURCE_LABELS: dict[str, str] = {
    "ADVERTISING": "YouTube 광고",
    "ANNOTATION": "주석",
    "CAMPAIGN_CARD": "캠페인 카드",
    "END_SCREEN": "종료 화면",
    "EXT_URL": "외부",
    "HASHTAGS": "해시태그",
    "LIVE_REDIRECT": "라이브",
    "NO_LINK_EMBEDDED": "임베드",
    "NO_LINK_OTHER": "기타",
    "NOTIFICATION": "알림",
    "PLAYLIST": "재생목록",
    "PRODUCT_PAGE": "상품",
    "PROMOTED": "프로모션",
    "RELATED_VIDEO": "관련 영상",
    "SHORTS": "Shorts 피드",
    "SOUND_PAGE": "사운드",
    "SUBSCRIBER": "구독 피드",
    "YT_CHANNEL": "채널 페이지",
    "YT_OTHER_PAGE": "YouTube 홈",
    "YT_PLAYLIST_PAGE": "재생목록 페이지",
    "YT_SEARCH": "YouTube 검색",
    "VIDEO_REMIXES": "리믹스",
    "YT_REDIRECT": "리다이렉트",
}

# Studio-style top-level buckets (matches YouTube Studio grouping more closely).
_TRAFFIC_GROUP_MAP: dict[str, str] = {
    "RELATED_VIDEO": "YouTube 맞춤 동영상",
    "YT_OTHER_PAGE": "YouTube 맞춤 동영상",
    "SUBSCRIBER": "YouTube 맞춤 동영상",
    "NOTIFICATION": "YouTube 맞춤 동영상",
    "END_SCREEN": "YouTube 맞춤 동영상",
    "PLAYLIST": "YouTube 맞춤 동영상",
    "HASHTAGS": "YouTube 맞춤 동영상",
    "VIDEO_REMIXES": "YouTube 맞춤 동영상",
    "YT_REDIRECT": "YouTube 맞춤 동영상",
    "SOUND_PAGE": "YouTube 맞춤 동영상",
    "PROMOTED": "YouTube 맞춤 동영상",
    "SHORTS": "Shorts 피드",
    "ADVERTISING": "YouTube 광고",
    "YT_SEARCH": "YouTube 검색",
    "YT_CHANNEL": "채널 페이지",
    "YT_PLAYLIST_PAGE": "재생목록",
    "EXT_URL": "외부",
    "NO_LINK_EMBEDDED": "임베드",
    "NO_LINK_OTHER": "기타",
    "ANNOTATION": "기타",
    "CAMPAIGN_CARD": "기타",
    "PRODUCT_PAGE": "기타",
    "LIVE_REDIRECT": "기타",
    "UNKNOWN": "기타",
}


def _traffic_label(source: str) -> str:
    key = str(source or "UNKNOWN").strip() or "UNKNOWN"
    return _TRAFFIC_SOURCE_LABELS.get(key, key.replace("_", " ").title())


def _traffic_group_label(source: str) -> str:
    key = str(source or "UNKNOWN").strip() or "UNKNOWN"
    return _TRAFFIC_GROUP_MAP.get(key, _traffic_label(key))


def _group_traffic_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        raw_source = str(row.get("source") or "UNKNOWN")
        views = _safe_int(row.get("views"))
        group_label = _traffic_group_label(raw_source)
        bucket = grouped.setdefault(
            group_label,
            {"source": group_label, "label": group_label, "views": 0, "details": []},
        )
        bucket["views"] += views
        detail_label = _traffic_label(raw_source)
        if detail_label != group_label:
            bucket["details"].append(
                {"source": raw_source, "label": detail_label, "views": views}
            )
    total_views = sum(item["views"] for item in grouped.values()) or 1
    result: list[dict[str, Any]] = []
    for label, item in sorted(grouped.items(), key=lambda pair: -pair[1]["views"]):
        result.append(
            {
                "source": label,
                "label": label,
                "views": item["views"],
                "share": round(item["views"] / total_views * 100, 1),
                "details": sorted(item["details"], key=lambda d: -d["views"]),
            }
        )
    return result


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
            raw_sources = []
            for row in rows:
                views = _safe_int(row.get("views"))
                raw_source = str(row.get("insightTrafficSourceType") or "UNKNOWN")
                raw_sources.append(
                    {
                        "source": raw_source,
                        "label": _traffic_label(raw_source),
                        "views": views,
                    }
                )
            sources = _group_traffic_rows(raw_sources)
            total_views = sum(item["views"] for item in sources)

            payload = {
                "ok": True,
                "configured": True,
                "period": {"startDate": start_date, "endDate": end_date},
                "sources": sources,
                "rawSources": raw_sources,
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


async def _retention_points_for_video(
    client: httpx.AsyncClient,
    token: str,
    channel_id: str,
    video_id: str,
    *,
    start_date: str,
    end_date: str,
) -> list[dict[str, float]]:
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
    return [
        {
            "ratio": _safe_float(row.get("elapsedVideoTimeRatio")) or 0,
            "watchRatio": _safe_float(row.get("audienceWatchRatio")) or 0,
        }
        for row in rows
    ]


async def _top_videos_by_views(
    client: httpx.AsyncClient,
    token: str,
    channel_id: str,
    *,
    start_date: str,
    end_date: str,
    limit: int = 3,
    content_type: str | None = None,
) -> list[dict[str, Any]]:
    filters = f"creatorContentType=={content_type}" if content_type else ""
    body = await _analytics_get_safe(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
        metrics="views",
        dimensions="video",
        filters=filters,
        sort="-views",
        max_results=limit,
    )
    rows = _parse_rows(body)
    return [
        {"videoId": str(row.get("video") or ""), "views": _safe_int(row.get("views"))}
        for row in rows
        if row.get("video")
    ]


async def _average_view_percentage(
    client: httpx.AsyncClient,
    token: str,
    channel_id: str,
    *,
    start_date: str,
    end_date: str,
    content_type: str | None = None,
) -> float | None:
    filters = f"creatorContentType=={content_type}" if content_type else ""
    body = await _analytics_get_safe(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
        metrics="averageViewPercentage",
        filters=filters,
    )
    rows = _parse_rows(body)
    return _safe_float((rows[0] if rows else {}).get("averageViewPercentage"))


async def _daily_average_view_trend(
    client: httpx.AsyncClient,
    token: str,
    channel_id: str,
    *,
    start_date: str,
    end_date: str,
    content_type: str | None = None,
) -> list[dict[str, Any]]:
    filters = f"creatorContentType=={content_type}" if content_type else ""
    body = await _analytics_get_safe(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
        metrics="averageViewPercentage",
        dimensions="day",
        filters=filters,
        sort="day",
        max_results=31,
    )
    rows = _parse_rows(body)
    trend = []
    for row in rows:
        pct = _safe_float(row.get("averageViewPercentage"))
        day = str(row.get("day") or "")
        if day and pct is not None:
            trend.append({"date": day, "averageViewPercentage": round(pct, 2)})
    return trend


async def _retention_series_for_videos(
    client: httpx.AsyncClient,
    token: str,
    channel_id: str,
    videos: list[dict[str, Any]],
    *,
    start_date: str,
    end_date: str,
    format_key: str,
    limit: int = 6,
) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []
    for item in videos[:limit]:
        try:
            video_points = await _retention_points_for_video(
                client,
                token,
                channel_id,
                item["videoId"],
                start_date=start_date,
                end_date=end_date,
            )
        except httpx.HTTPStatusError:
            continue
        if video_points:
            series.append(
                {
                    "videoId": item["videoId"],
                    "title": item.get("title") or "",
                    "views": item["views"],
                    "points": video_points,
                    "format": format_key,
                }
            )
    return series


async def _partition_top_videos_by_format(
    client: httpx.AsyncClient,
    token: str,
    channel_id: str,
    *,
    start_date: str,
    end_date: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    top_all = await _top_videos_by_views(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
        limit=25,
    )
    if not top_all:
        return [], []

    durations_and_titles = await _fetch_video_meta(client, [item["videoId"] for item in top_all])
    if durations_and_titles:
        for item in top_all:
            info = durations_and_titles.get(item["videoId"]) or {}
            if info.get("title"):
                item["title"] = info["title"]
        longform = [
            item
            for item in top_all
            if not _is_shorts_video(int((durations_and_titles.get(item["videoId"]) or {}).get("duration") or 0))
        ]
        shorts = [
            item
            for item in top_all
            if _is_shorts_video(int((durations_and_titles.get(item["videoId"]) or {}).get("duration") or 0))
        ]
        return longform, shorts

    longform = await _top_videos_by_views(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
        limit=3,
        content_type=_CONTENT_LONGFORM,
    )
    shorts = await _top_videos_by_views(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
        limit=3,
        content_type=_CONTENT_SHORTS,
    )
    # Best-effort titles even on the Analytics contentType fallback path.
    title_meta = await _fetch_video_meta(
        client, [item["videoId"] for item in [*longform, *shorts]]
    )
    for item in [*longform, *shorts]:
        title = (title_meta.get(item["videoId"]) or {}).get("title")
        if title:
            item["title"] = title
    return longform, shorts


async def _build_channel_retention_formats(
    client: httpx.AsyncClient,
    token: str,
    channel_id: str,
    *,
    start_date: str,
    end_date: str,
) -> dict[str, dict[str, Any]]:
    longform_videos, shorts_videos = await _partition_top_videos_by_format(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
    )
    longform_series = await _retention_series_for_videos(
        client,
        token,
        channel_id,
        longform_videos,
        start_date=start_date,
        end_date=end_date,
        format_key="longform",
    )
    shorts_series = await _retention_series_for_videos(
        client,
        token,
        channel_id,
        shorts_videos,
        start_date=start_date,
        end_date=end_date,
        format_key="shorts",
    )
    channel_trend = await _daily_average_view_trend(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
    )
    channel_avg = await _average_view_percentage(
        client,
        token,
        channel_id,
        start_date=start_date,
        end_date=end_date,
    )
    return {
        "longform": {
            "format": "longform",
            "contentType": _CONTENT_LONGFORM,
            "series": longform_series,
            "trend": channel_trend if not longform_series else [],
            "averageViewPercentage": channel_avg if not longform_series else None,
        },
        "shorts": {
            "format": "shorts",
            "contentType": _CONTENT_SHORTS,
            "series": shorts_series,
            "trend": [],
            "averageViewPercentage": None,
        },
    }


async def fetch_retention(
    video_id: str | None = None,
    video_ids: list[str] | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    ids = [vid for vid in (video_ids or []) if vid]
    if not ids and video_id:
        ids = [video_id]
    # Cap compare fan-out to keep Analytics quota reasonable.
    ids = ids[:8]
    cache_key = f"retention:{','.join(ids) if ids else 'channel'}"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    if not _configured():
        return {**_not_configured_payload("retention"), "points": []}

    start_date, end_date = _date_range(28)
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            token, channel_id = await _get_token_and_channel(client)

            formats: dict[str, Any] | None = None
            series: list[dict[str, Any]] = []
            trend: list[dict[str, Any]] = []
            points: list[dict[str, Any]] = []
            avg_pct = None
            scope = "channel"
            primary_id = ids[0] if len(ids) == 1 else None

            if len(ids) >= 2:
                meta = await _fetch_video_meta(client, ids)
                series = await _retention_series_for_videos(
                    client,
                    token,
                    channel_id,
                    [
                        {
                            "videoId": vid,
                            "title": (meta.get(vid) or {}).get("title") or "",
                            "views": 0,
                        }
                        for vid in ids
                    ],
                    start_date=start_date,
                    end_date=end_date,
                    format_key="compare",
                    limit=len(ids),
                )
                scope = "compare"
                points = []
            elif len(ids) == 1:
                points = await _retention_points_for_video(
                    client,
                    token,
                    channel_id,
                    ids[0],
                    start_date=start_date,
                    end_date=end_date,
                )
                scope = "video"
                meta = await _fetch_video_meta(client, ids)
                if points:
                    series = [
                        {
                            "videoId": ids[0],
                            "title": (meta.get(ids[0]) or {}).get("title") or "",
                            "views": 0,
                            "points": points,
                            "format": "video",
                        }
                    ]
            else:
                formats = await _build_channel_retention_formats(
                    client,
                    token,
                    channel_id,
                    start_date=start_date,
                    end_date=end_date,
                )
                longform = formats["longform"]
                shorts = formats["shorts"]
                series = longform["series"]
                trend = longform["trend"] or shorts["trend"]
                avg_pct = longform["averageViewPercentage"]
                points = series[0]["points"] if len(series) == 1 else []
                scope = "channel"

            chart_mode = "average"
            if series:
                chart_mode = "series" if len(series) > 1 else "curve"
            elif trend:
                chart_mode = "trend"
            elif points:
                chart_mode = "curve"

            payload = {
                "ok": True,
                "configured": True,
                "scope": scope,
                "chartMode": chart_mode,
                "videoId": primary_id,
                "videoIds": ids,
                "period": {"startDate": start_date, "endDate": end_date},
                "points": points,
                "series": series,
                "formats": formats,
                "trend": trend,
                "averageViewPercentage": avg_pct if not ids else None,
                "message": None,
            }
            _cache_set(cache_key, payload)
            return payload
    except Exception as exc:
        return {
            "ok": False,
            "configured": True,
            "message": f"시청 유지 조회 실패: {exc}",
            "points": [],
            "series": [],
            "formats": None,
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


async def fetch_video_detail_analytics(video_id: str, refresh: bool = False) -> dict[str, Any]:
    video_id = str(video_id or "").strip()
    if not video_id:
        return {"ok": False, "configured": True, "message": "video_id가 필요합니다."}

    cache_key = f"video-analytics:{video_id}"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    if not _configured():
        return {**_not_configured_payload("video-analytics"), "videoId": video_id}

    start_date, end_date = _date_range(28)
    video_filter = f"video=={video_id}"
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            token, channel_id = await _get_token_and_channel(client)

            overview_body = await _analytics_get_safe(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics=(
                    "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,"
                    "subscribersGained,likes,comments,shares"
                ),
                filters=video_filter,
            )
            traffic_body = await _analytics_get_safe(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="views,estimatedMinutesWatched",
                dimensions="insightTrafficSourceType",
                filters=video_filter,
                sort="-views",
            )
            search_body = await _analytics_get_safe(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="views",
                dimensions="insightTrafficSourceDetail",
                filters=f"{video_filter};insightTrafficSourceType==YT_SEARCH",
                sort="-views",
                max_results=15,
            )
            device_body = await _analytics_get_safe(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="views,estimatedMinutesWatched",
                dimensions="deviceType",
                filters=video_filter,
                sort="-views",
            )
            audience_body = await _analytics_get_safe(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="views,estimatedMinutesWatched",
                dimensions="subscribedStatus",
                filters=video_filter,
                sort="-views",
            )
            age_body = await _analytics_get_safe(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="viewerPercentage",
                dimensions="ageGroup",
                filters=video_filter,
                sort="-viewerPercentage",
            )
            gender_body = await _analytics_get_safe(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="viewerPercentage",
                dimensions="gender",
                filters=video_filter,
                sort="-viewerPercentage",
            )
            impressions_body = await _analytics_get_safe(
                client,
                token,
                channel_id,
                start_date=start_date,
                end_date=end_date,
                metrics="impressions,views,estimatedMinutesWatched",
                filters=video_filter,
            )

            overview_row = (_parse_rows(overview_body) or [{}])[0]
            impressions_row = (_parse_rows(impressions_body) or [{}])[0]
            traffic_raw = [
                {
                    "source": str(row.get("insightTrafficSourceType") or "UNKNOWN"),
                    "views": _safe_int(row.get("views")),
                }
                for row in _parse_rows(traffic_body)
            ]
            traffic_sources = _group_traffic_rows(traffic_raw)

            search_terms = [
                {
                    "term": str(row.get("insightTrafficSourceDetail") or "").strip() or "—",
                    "views": _safe_int(row.get("views")),
                }
                for row in _parse_rows(search_body)
                if _safe_int(row.get("views")) > 0
            ]

            device_types = [
                {
                    "device": str(row.get("deviceType") or "UNKNOWN"),
                    "views": _safe_int(row.get("views")),
                    "watchMinutes": _safe_float(row.get("estimatedMinutesWatched")) or 0,
                }
                for row in _parse_rows(device_body)
            ]
            total_device_views = sum(item["views"] for item in device_types) or 1
            for item in device_types:
                item["share"] = round(item["views"] / total_device_views * 100, 1)

            audience_status = []
            for row in _parse_rows(audience_body):
                status = str(row.get("subscribedStatus") or "UNKNOWN")
                label = {
                    "SUBSCRIBED": "구독자",
                    "UNSUBSCRIBED": "비구독자",
                }.get(status, status)
                audience_status.append(
                    {
                        "status": status,
                        "label": label,
                        "views": _safe_int(row.get("views")),
                        "watchMinutes": _safe_float(row.get("estimatedMinutesWatched")) or 0,
                    }
                )
            total_audience_views = sum(item["views"] for item in audience_status) or 1
            for item in audience_status:
                item["share"] = round(item["views"] / total_audience_views * 100, 1)

            age_groups = [
                {
                    "ageGroup": str(row.get("ageGroup") or ""),
                    "viewerPercentage": _safe_float(row.get("viewerPercentage")) or 0,
                }
                for row in _parse_rows(age_body)
            ]
            gender = [
                {
                    "gender": str(row.get("gender") or ""),
                    "viewerPercentage": _safe_float(row.get("viewerPercentage")) or 0,
                }
                for row in _parse_rows(gender_body)
            ]

            impressions = _safe_int(impressions_row.get("impressions"))
            views = _safe_int(overview_row.get("views"))
            watch_minutes = _safe_float(overview_row.get("estimatedMinutesWatched")) or 0
            avg_duration = _safe_float(overview_row.get("averageViewDuration")) or 0

            payload = {
                "ok": True,
                "configured": True,
                "videoId": video_id,
                "period": {"startDate": start_date, "endDate": end_date},
                "dashboard": {
                    "views": views,
                    "likes": _safe_int(overview_row.get("likes")),
                    "comments": _safe_int(overview_row.get("comments")),
                    "shares": _safe_int(overview_row.get("shares")),
                    "watchMinutes": round(watch_minutes, 1),
                    "averageViewDurationSec": round(avg_duration, 1),
                    "averageViewPercentage": _safe_float(overview_row.get("averageViewPercentage")),
                    "subscribersGained": _safe_int(overview_row.get("subscribersGained")),
                },
                "trafficSources": traffic_sources,
                "reachFunnel": {
                    "impressions": impressions if impressions > 0 else None,
                    "views": views,
                    "watchMinutes": round(watch_minutes, 1),
                    "averageViewDurationSec": round(avg_duration, 1),
                },
                "searchTerms": search_terms,
                "audienceBySubscription": audience_status,
                "deviceTypes": device_types,
                "ageGroups": age_groups,
                "gender": gender,
                "message": None,
            }
            _cache_set(cache_key, payload)
            return payload
    except Exception as exc:
        return {
            "ok": False,
            "configured": True,
            "videoId": video_id,
            "message": f"영상 Analytics 조회 실패: {exc}",
        }

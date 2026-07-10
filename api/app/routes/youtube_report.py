from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import google_ads_config, youtube_analytics_oauth_config, youtube_api_key, youtube_channel_handle
from app.google_ads import get_ads_status, sync_campaigns
from app.routes.youtube import _fetch_via_api, _fetch_via_scrape, _format_count
from app.youtube_analytics import (
    fetch_analytics_overview,
    fetch_demographics,
    fetch_retention,
    fetch_traffic_sources,
)
from app.youtube_report_store import (
    read_merged_promotions,
    read_promotions,
    read_snapshots,
    write_promotions,
    write_snapshots,
)

router = APIRouter(prefix="/api/dddit/youtube/report", tags=["youtube-report"])

_REPORT_CACHE: dict[str, Any] = {}
_CACHE_TTL = 900


def _cache_get(key: str) -> Any | None:
    entry = _REPORT_CACHE.get(key)
    if not entry:
        return None
    if time.time() - entry["at"] > _CACHE_TTL:
        return None
    return entry["data"]


def _cache_set(key: str, data: Any) -> None:
    _REPORT_CACHE[key] = {"at": time.time(), "data": data}


def _parse_int(value: Any) -> int:
    try:
        return int(str(value or "0").replace(",", ""))
    except ValueError:
        return 0


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


def _format_duration(seconds: int) -> str:
    if seconds <= 0:
        return "—"
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _promotion_metrics(promo: dict[str, Any]) -> dict[str, Any]:
    cost = _parse_int(promo.get("cost"))
    impressions = _parse_int(promo.get("impressions"))
    views = _parse_int(promo.get("views"))
    subscribers = _parse_int(promo.get("subscribers"))
    clicks = _parse_int(promo.get("clicks") or promo.get("followOnViews"))

    cpv = round(cost / views, 1) if views > 0 else None
    cps = round(cost / subscribers) if subscribers > 0 else None
    cpm = round(cost / impressions * 1000, 1) if impressions > 0 else None
    cpc = round(cost / clicks, 1) if clicks > 0 else None
    ctr = round(views / impressions * 100, 2) if impressions > 0 else None

    efficiency = ""
    if cpv is not None:
        efficiency = f"조회 1회당 약 {cpv:,.0f}원"
        if cpv <= 30:
            efficiency += " · 효율 좋음"
    elif cps is not None:
        efficiency = f"구독자 1명당 약 {cps:,}원"
        if cps <= 400:
            efficiency += " · 효율 매우 좋음"

    return {
        "cpv": cpv,
        "cps": cps,
        "cpm": cpm,
        "cpc": cpc,
        "ctr": ctr,
        "efficiencyText": efficiency,
    }


async def _fetch_channel_bundle(client: httpx.AsyncClient, handle: str, api_key: str) -> dict[str, Any]:
    ch_res = await client.get(
        "https://www.googleapis.com/youtube/v3/channels",
        params={
            "part": "snippet,statistics,contentDetails",
            "forHandle": handle,
            "key": api_key,
        },
    )
    ch_res.raise_for_status()
    items = ch_res.json().get("items") or []
    if not items:
        raise HTTPException(status_code=404, detail="YouTube channel not found")
    ch = items[0]
    return {
        "channelId": ch["id"],
        "snippet": ch.get("snippet") or {},
        "statistics": ch.get("statistics") or {},
        "uploadsPlaylistId": ((ch.get("contentDetails") or {}).get("relatedPlaylists") or {}).get(
            "uploads"
        ),
    }


async def _fetch_playlist_videos(
    client: httpx.AsyncClient, api_key: str, playlist_id: str, max_results: int = 20
) -> list[str]:
    video_ids: list[str] = []
    page_token = ""
    while len(video_ids) < max_results:
        params: dict[str, Any] = {
            "part": "contentDetails,snippet",
            "playlistId": playlist_id,
            "maxResults": min(50, max_results - len(video_ids)),
            "key": api_key,
        }
        if page_token:
            params["pageToken"] = page_token
        res = await client.get("https://www.googleapis.com/youtube/v3/playlistItems", params=params)
        res.raise_for_status()
        body = res.json()
        for item in body.get("items") or []:
            vid = (item.get("contentDetails") or {}).get("videoId")
            if vid:
                video_ids.append(vid)
        page_token = body.get("nextPageToken") or ""
        if not page_token:
            break
    return video_ids[:max_results]


async def _fetch_video_details(
    client: httpx.AsyncClient, api_key: str, video_ids: list[str]
) -> list[dict[str, Any]]:
    if not video_ids:
        return []
    videos: list[dict[str, Any]] = []
    for i in range(0, len(video_ids), 50):
        chunk = video_ids[i : i + 50]
        res = await client.get(
            "https://www.googleapis.com/youtube/v3/videos",
            params={
                "part": "snippet,statistics,contentDetails",
                "id": ",".join(chunk),
                "key": api_key,
            },
        )
        res.raise_for_status()
        for item in res.json().get("items") or []:
            sn = item.get("snippet") or {}
            st = item.get("statistics") or {}
            cd = item.get("contentDetails") or {}
            vid = item.get("id") or ""
            thumbs = sn.get("thumbnails") or {}
            thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url") or ""
            duration_sec = _iso_duration_seconds(cd.get("duration") or "")
            views = _parse_int(st.get("viewCount"))
            likes = _parse_int(st.get("likeCount"))
            comments = _parse_int(st.get("commentCount"))
            videos.append(
                {
                    "id": vid,
                    "title": sn.get("title") or "",
                    "description": sn.get("description") or "",
                    "publishedAt": sn.get("publishedAt") or "",
                    "thumbnail": thumb,
                    "url": f"https://www.youtube.com/watch?v={vid}" if vid else "",
                    "views": views,
                    "viewsText": _format_count(views),
                    "likes": likes,
                    "comments": comments,
                    "durationSec": duration_sec,
                    "durationText": _format_duration(duration_sec),
                    "studioUrl": f"https://studio.youtube.com/video/{vid}/analytics" if vid else "",
                    "trafficSources": None,
                    "demographics": None,
                    "impressions": None,
                    "ctr": None,
                    "avgViewDuration": None,
                    "retentionNote": "YouTube Analytics OAuth 연동 시 노출·유입·시청 유지 데이터 표시",
                }
            )
    return videos


def _reporting_limitation_line(analytics: dict[str, Any] | None) -> str:
    reporting = (analytics or {}).get("reporting") or {}
    impressions = (analytics or {}).get("impressions")
    ctr = (analytics or {}).get("ctr")
    if (analytics or {}).get("impressionsSource") == "reporting-api" and impressions:
        ctr_part = f", CTR {ctr}%" if ctr is not None else ""
        return (
            f"YouTube Reporting API (OAuth): 썸네일 노출·CTR (연동됨 — "
            f"28일 {impressions:,} 노출{ctr_part})"
        )
    if reporting.get("ok") is False and reporting.get("message"):
        return f"YouTube Reporting API (OAuth): {reporting['message']}"
    if reporting.get("jobId"):
        count = reporting.get("reportCount") or 0
        note = reporting.get("message") or "첫 일별 CSV 대기 중 (보통 24~48시간)"
        return f"YouTube Reporting API (OAuth): job 연결됨 (CSV {count}건) — {note}"
    return "YouTube Reporting API (OAuth): 썸네일 노출·CTR (GCP API 활성화 + OAuth)"


def _analytics_status_note(analytics: dict[str, Any] | None) -> str:
    if analytics and analytics.get("ok"):
        reporting = analytics.get("reporting") or {}
        if analytics.get("impressionsSource") == "reporting-api" and analytics.get("impressions") is not None:
            return (
                "YouTube Analytics + Reporting API 연동됨 — 썸네일 노출·CTR·유입·시청 유지·인구통계를 표시합니다."
            )
        if reporting.get("jobId"):
            return (
                "YouTube Analytics 연동됨. Reporting job 준비됨 — 썸네일 노출/CTR은 "
                "첫 일별 CSV 생성(보통 24~48시간) 후 표시됩니다."
            )
        return "YouTube Analytics OAuth 연동됨 — 유입·시청 유지·인구통계를 표시합니다."
    if analytics and analytics.get("configured"):
        return "YouTube Analytics OAuth 설정됨 — 데이터 조회 오류 시 새로고침하세요."
    return (
        "YouTube Analytics OAuth 미연동 — NAS .env에 YOUTUBE_OAUTH_* 및 YOUTUBE_CHANNEL_ID 설정 필요."
    )


def _build_subscriber_trend(
    snapshots_data: dict[str, Any],
    live_subscribers: int | None,
    *,
    analytics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    snapshots = list(snapshots_data.get("snapshots") or [])
    if live_subscribers and snapshots:
        snapshots[-1] = {
            **snapshots[-1],
            "label": snapshots[-1].get("label") or "최신",
            "total": live_subscribers,
        }
        organic = snapshots[-1].get("organic")
        if organic is None:
            promo_subs = sum(_parse_int(p.get("subscribers")) for p in read_promotions().get("promotions") or [])
            snapshots[-1]["organic"] = max(0, live_subscribers - promo_subs)

    ad_subs_total = sum(_parse_int(p.get("subscribers")) for p in read_promotions().get("promotions") or [])

    points = []
    for row in snapshots:
        total = _parse_int(row.get("total"))
        organic = row.get("organic")
        if organic is None:
            organic = max(0, total - ad_subs_total)
        points.append(
            {
                "label": row.get("label") or "",
                "total": total,
                "organic": _parse_int(organic),
                "adDriven": max(0, total - _parse_int(organic)),
            }
        )

    if analytics and analytics.get("ok"):
        note = "회색=자연 증가(추정), 빨강=총 구독자. Analytics 연동됨 — 주간 스냅샷은 하단 JSON에서 편집."
    else:
        note = "회색=자연 증가(수동 입력·추정), 빨강=총 구독자. OAuth 연동 시 상단 Analytics와 함께 활용."

    return {
        "points": points,
        "adSubsTotal": ad_subs_total,
        "note": note,
    }


def _overview_insights(videos: list[dict[str, Any]], issues: list[str]) -> list[str]:
    insights = list(issues)
    if videos:
        recent = videos[:6]
        avg_views = sum(v.get("views", 0) for v in recent) / len(recent)
        top = max(recent, key=lambda v: v.get("views", 0))
        if avg_views < 2000:
            insights.append(f"최근 6개 영상 평균 조회 {int(avg_views):,}회 — 프로모션·썸네일·제목 A/B 검토 권장")
        insights.append(f"최근 최고 조회: 「{top.get('title', '')[:24]}…」 {top.get('viewsText', '')}")
    return insights


async def _build_report_overview(refresh: bool = False) -> dict[str, Any]:
    cache_key = "overview"
    if not refresh:
        cached = _cache_get(cache_key)
        if cached:
            return cached

    handle = youtube_channel_handle()
    promotions_data = read_merged_promotions()
    snapshots_data = read_snapshots()
    promotions = promotions_data.get("promotions") or []
    enriched_promos = [{**p, "metrics": _promotion_metrics(p)} for p in promotions]

    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            api_key = youtube_api_key()
            if api_key:
                bundle = await _fetch_channel_bundle(client, handle, api_key)
                stats = bundle["statistics"]
                uploads = bundle.get("uploadsPlaylistId")
                video_ids = (
                    await _fetch_playlist_videos(client, api_key, uploads, 20) if uploads else []
                )
                videos = await _fetch_video_details(client, api_key, video_ids)
                live_subs = _parse_int(stats.get("subscriberCount"))
                channel = {
                    "source": "youtube-api",
                    "handle": handle,
                    "channelId": bundle["channelId"],
                    "title": (bundle["snippet"].get("title") or "디디딧"),
                    "subscriberCount": live_subs,
                    "subscriberCountText": _format_count(live_subs),
                    "viewCount": _parse_int(stats.get("viewCount")),
                    "viewCountText": _format_count(stats.get("viewCount")),
                    "videoCount": _parse_int(stats.get("videoCount")),
                    "videoCountText": _format_count(stats.get("videoCount")),
                    "channelUrl": f"https://www.youtube.com/@{handle}",
                }
            else:
                scraped = await _fetch_via_scrape(client, handle)
                videos = [
                    {
                        **v,
                        "views": 0,
                        "viewsText": "—",
                        "likes": 0,
                        "comments": 0,
                        "durationSec": 0,
                        "durationText": "—",
                        "studioUrl": f"https://studio.youtube.com/video/{v.get('id')}/analytics"
                        if v.get("id")
                        else "",
                        "retentionNote": "YOUTUBE_API_KEY 설정 시 조회수·길이 자동 표시",
                    }
                    for v in scraped.get("videos") or []
                ]
                live_subs = _parse_int(scraped.get("subscriberCount"))
                channel = scraped
                channel["source"] = "scrape"

        recent_six = videos[:6]
        top_views = max((v.get("views") or 0 for v in videos), default=0)
        recent_avg = (
            sum(v.get("views", 0) for v in recent_six) / len(recent_six) if recent_six else 0
        )

        analytics_overview = await fetch_analytics_overview(refresh=refresh)
        ads_status = await get_ads_status()
        if google_ads_config() and not ads_status.get("lastSync"):
            await sync_campaigns(force=False)

        limitations = [
            "YouTube Data API: 조회수·구독자·영상 목록 (현재 지원)",
        ]
        if youtube_analytics_oauth_config():
            limitations.append("YouTube Analytics API (OAuth): 유입·시청 유지·인구통계 (연동됨)")
            limitations.append(_reporting_limitation_line(analytics_overview))
        else:
            limitations.append("YouTube Analytics API (OAuth): NAS .env에 OAuth 토큰 설정 필요")
        if google_ads_config():
            limitations.append("Google Ads API: 프로모션 비용·노출 동기화 (연동됨)")
        else:
            limitations.append("Google Ads API: 프로모션 비용·노출 실시간 동기화 (미설정)")

        if analytics_overview.get("ok"):
            for video in videos:
                video["retentionNote"] = ""
            views_trend_note = (
                "7일 조회 추이는 snapshots JSON 수동 입력. "
                "유입·시청 지표는 상단 Analytics(OAuth 연동됨) 참고."
            )
        else:
            views_trend_note = (
                "7일 조회 추이는 subscriber-snapshots.json의 viewsTrend7d 또는 "
                "YouTube Analytics OAuth 필요"
            )

        payload = {
            "ok": True,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "channel": channel,
            "kpis": {
                "subscribers": channel.get("subscriberCountText") or "—",
                "subscribersRaw": channel.get("subscriberCount") or live_subs,
                "videoCount": channel.get("videoCountText") or "—",
                "videoCountRaw": channel.get("videoCount") or 0,
                "topViews": _format_count(top_views),
                "topViewsRaw": top_views,
                "recentAvgViews": f"~{int(recent_avg):,}" if recent_avg else "—",
                "recentAvgViewsRaw": int(recent_avg),
            },
            "recentVideosBar": [
                {"title": (v.get("title") or "")[:18], "views": v.get("views", 0)} for v in recent_six
            ],
            "viewsTrend7d": snapshots_data.get("viewsTrend7d") or [],
            "viewsTrendNote": views_trend_note,
            "subscriberTrend": _build_subscriber_trend(
                snapshots_data, live_subs, analytics=analytics_overview
            ),
            "promotions": enriched_promos,
            "issues": promotions_data.get("issues") or [],
            "insights": _overview_insights(videos, promotions_data.get("issues") or []),
            "analytics": analytics_overview,
            "analyticsStatusNote": _analytics_status_note(analytics_overview),
            "adsSync": ads_status,
            "limitations": limitations,
        }
        _cache_set(cache_key, payload)
        _cache_set("videos", {"ok": True, "videos": videos, "generatedAt": payload["generatedAt"]})
        return payload
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Report build failed: {exc}") from exc


class PromotionsBody(BaseModel):
    promotions: list[dict[str, Any]] = Field(default_factory=list)
    issues: list[str] = Field(default_factory=list)


class SnapshotsBody(BaseModel):
    snapshots: list[dict[str, Any]] = Field(default_factory=list)
    viewsTrend7d: list[int] = Field(default_factory=list)


@router.get("/overview")
async def report_overview(refresh: bool = Query(False)) -> dict[str, Any]:
    return await _build_report_overview(refresh=refresh)


@router.get("/videos")
async def report_videos(refresh: bool = Query(False)) -> dict[str, Any]:
    if not refresh:
        cached = _cache_get("videos")
        if cached:
            return cached
    await _build_report_overview(refresh=True)
    cached = _cache_get("videos")
    if cached:
        return cached
    raise HTTPException(status_code=502, detail="Could not load videos")


@router.get("/subscribers-trend")
async def report_subscribers_trend(refresh: bool = Query(False)) -> dict[str, Any]:
    overview = await _build_report_overview(refresh=refresh)
    return {
        "ok": True,
        "subscriberTrend": overview.get("subscriberTrend"),
        "generatedAt": overview.get("generatedAt"),
    }


@router.get("/promotions")
def get_promotions() -> dict[str, Any]:
    data = read_merged_promotions()
    promos = [{**p, "metrics": _promotion_metrics(p)} for p in data.get("promotions") or []]
    return {"ok": True, "promotions": promos, "issues": data.get("issues") or []}


@router.put("/promotions")
def put_promotions(body: PromotionsBody) -> dict[str, Any]:
    write_promotions({"promotions": body.promotions, "issues": body.issues})
    _REPORT_CACHE.clear()
    promos = [{**p, "metrics": _promotion_metrics(p)} for p in body.promotions]
    return {"ok": True, "promotions": promos, "issues": body.issues}


@router.get("/snapshots")
def get_snapshots() -> dict[str, Any]:
    return {"ok": True, **read_snapshots()}


@router.put("/snapshots")
def put_snapshots(body: SnapshotsBody) -> dict[str, Any]:
    payload = {"snapshots": body.snapshots, "viewsTrend7d": body.viewsTrend7d}
    write_snapshots(payload)
    _REPORT_CACHE.clear()
    return {"ok": True, **payload}


@router.get("/analytics-overview")
async def report_analytics_overview(refresh: bool = Query(False)) -> dict[str, Any]:
    return await fetch_analytics_overview(refresh=refresh)


@router.get("/reporting-reach")
async def report_reporting_reach(refresh: bool = Query(False)) -> dict[str, Any]:
    from app.youtube_reporting import fetch_reporting_reach

    return await fetch_reporting_reach(refresh=refresh)


@router.get("/traffic-sources")
async def report_traffic_sources(refresh: bool = Query(False)) -> dict[str, Any]:
    return await fetch_traffic_sources(refresh=refresh)


@router.get("/retention")
async def report_retention(
    video_id: str | None = Query(None),
    refresh: bool = Query(False),
) -> dict[str, Any]:
    return await fetch_retention(video_id=video_id, refresh=refresh)


@router.get("/demographics")
async def report_demographics(refresh: bool = Query(False)) -> dict[str, Any]:
    return await fetch_demographics(refresh=refresh)


@router.get("/ads/status")
async def report_ads_status() -> dict[str, Any]:
    return await get_ads_status()


@router.post("/ads/sync")
async def report_ads_sync(force: bool = Query(True)) -> dict[str, Any]:
    result = await sync_campaigns(force=force)
    _REPORT_CACHE.clear()
    return result

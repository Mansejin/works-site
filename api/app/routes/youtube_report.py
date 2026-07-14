from __future__ import annotations

import re
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import google_ads_config, google_ads_sync_enabled, youtube_analytics_oauth_config, youtube_api_key, youtube_channel_handle
from app.google_ads import get_ads_status, sync_campaigns
from app.youtube_studio_promotions import (
    get_studio_promo_status,
    save_capture_from_curl,
    sync_studio_promotions,
)
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


_CHAPTER_LINE_RE = re.compile(r"^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.+?)\s*$")


def _timestamp_to_seconds(label: str) -> int:
    try:
        parts = [int(p) for p in str(label or "").split(":")]
    except ValueError:
        return -1
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return -1


def parse_description_chapters(description: str) -> list[dict[str, Any]]:
    """Parse YouTube description timeline chapters (`0:00 Title`)."""
    chapters: list[dict[str, Any]] = []
    for line in str(description or "").splitlines():
        m = _CHAPTER_LINE_RE.match(line)
        if not m:
            continue
        title = re.sub(r"^\s*[-–—]\s*", "", m.group(2) or "").strip()
        if not title or len(title) > 40 or "→" in title or title.startswith('"'):
            continue
        if re.search(r"https?://", title, re.I):
            continue
        seconds = _timestamp_to_seconds(m.group(1))
        if seconds < 0:
            continue
        intro = bool(re.search(r"인트로|인트|프롤로그|오프닝", title))
        chapters.append(
            {
                "timestamp": m.group(1),
                "seconds": seconds,
                "title": title,
                "titleCard": not intro,
            }
        )
    if not chapters or chapters[0]["seconds"] != 0:
        return []
    return chapters


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
            description = sn.get("description") or ""
            chapters = parse_description_chapters(description)
            videos.append(
                {
                    "id": vid,
                    "title": sn.get("title") or "",
                    "description": description,
                    "chapters": chapters,
                    "chapterCount": len(chapters),
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


def _normalize_match_text(value: str) -> str:
    return " ".join(str(value or "").lower().split())


def _promo_matches_video(title: str, video_id: str, promo: dict[str, Any]) -> bool:
    promo_vid = str(promo.get("videoId") or "").strip()
    if video_id and promo_vid and promo_vid == video_id:
        return True
    title_norm = _normalize_match_text(title)
    video_title = _normalize_match_text(promo.get("videoTitle"))
    if not video_title:
        return False
    if video_title in title_norm or title_norm in video_title:
        return True
    promo_core = re.sub(r"\s*\([^)]*\)", "", _normalize_match_text(promo.get("title")))
    if len(promo_core) >= 4 and promo_core in title_norm:
        return True
    return len(video_title) >= 8 and video_title[:24] in title_norm


def _ad_views_for_video(title: str, video_id: str, promotions: list[dict[str, Any]]) -> int:
    return sum(
        _parse_int(promo.get("views"))
        for promo in promotions
        if _promo_matches_video(title, video_id, promo)
    )


def _short_video_label(title: str, video_id: str, promotions: list[dict[str, Any]]) -> str:
    for promo in promotions:
        if _promo_matches_video(title, video_id, promo):
            short = re.sub(r"\s*\([^)]*\)\s*$", "", str(promo.get("title") or "")).strip()
            if short:
                return short[:18]
    if "?" in title:
        head, tail = title.split("?", 1)
        tail = re.sub(
            r"\s*(리뷰|사용기|직접 써봤습니다|써봤습니다|개봉기).*$",
            "",
            tail.strip(),
        ).strip()
        generic_tails = ("직접", "써보니", "개봉", "사용해", "현실", "이게", "진짜")
        if tail and not any(tail.startswith(word) for word in generic_tails):
            return tail[:18]
        head_short = head.strip()
        if head_short:
            return head_short[:18]
    compact = title.strip()
    return compact[:14] + "…" if len(compact) > 14 else compact


def _build_recent_videos_bar(
    videos: list[dict[str, Any]],
    promotions: list[dict[str, Any]],
    *,
    limit: int = 4,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for video in videos[:limit]:
        title = str(video.get("title") or "")
        video_id = str(video.get("id") or "")
        views = _parse_int(video.get("views"))
        ad_views = min(views, _ad_views_for_video(title, video_id, promotions))
        rows.append(
            {
                "title": title,
                "shortLabel": _short_video_label(title, video_id, promotions),
                "views": views,
                "adViews": ad_views,
                "organicViews": max(0, views - ad_views),
            }
        )
    return rows


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


def _overview_memo(promotions_data: dict[str, Any]) -> str:
    memo = str(promotions_data.get("memo") or "").strip()
    if memo:
        return memo
    issues = promotions_data.get("issues") or []
    if isinstance(issues, list):
        return "\n".join(str(item).strip() for item in issues if str(item).strip())
    return ""


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
        if google_ads_sync_enabled() and google_ads_config() and not ads_status.get("lastSync"):
            await sync_campaigns(force=False)

        limitations = [
            "YouTube Data API: 조회수·구독자·영상 목록 (현재 지원)",
        ]
        if youtube_analytics_oauth_config():
            limitations.append("YouTube Analytics API (OAuth): 유입·시청 유지·인구통계 (연동됨)")
            limitations.append(_reporting_limitation_line(analytics_overview))
        else:
            limitations.append("YouTube Analytics API (OAuth): NAS .env에 OAuth 토큰 설정 필요")
        if google_ads_sync_enabled() and google_ads_config():
            limitations.append("Google Ads API: 프로모션 비용·노출 동기화 (연동됨)")
        else:
            limitations.append(
                "Google Ads API: 동기화 꺼짐 — YouTube Studio 프로모션은 Studio 캡처/수동 입력"
            )
        studio_status = get_studio_promo_status()
        if studio_status.get("ready"):
            when = studio_status.get("lastSync") or "미동기화"
            limitations.append(f"YouTube Studio 내부 API: 프로모션 동기화 준비됨 (lastSync={when})")
        elif studio_status.get("cookiesConfigured") or studio_status.get("captureConfigured"):
            limitations.append("YouTube Studio 내부 API: 캡처/쿠키 일부 설정됨 — Studio 동기화 버튼으로 실행")
        else:
            limitations.append(
                "YouTube Studio 내부 API: 프로모션 탭 Copy as cURL 저장 후 자동 동기화 가능"
            )

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
            "recentVideosBar": _build_recent_videos_bar(videos, promotions),
            "viewsTrend7d": snapshots_data.get("viewsTrend7d") or [],
            "viewsTrendNote": views_trend_note,
            "subscriberTrend": _build_subscriber_trend(
                snapshots_data, live_subs, analytics=analytics_overview
            ),
            "promotions": enriched_promos,
            "memo": _overview_memo(promotions_data),
            "issues": [],
            "insights": [],
            "analytics": analytics_overview,
            "analyticsStatusNote": _analytics_status_note(analytics_overview),
            "adsSync": ads_status,
            "studioPromoSync": studio_status,
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
    memo: str = ""
    issues: list[str] = Field(default_factory=list)


class SnapshotsBody(BaseModel):
    snapshots: list[dict[str, Any]] = Field(default_factory=list)
    viewsTrend7d: list[int] = Field(default_factory=list)


@router.get("/overview")
async def report_overview(refresh: bool = Query(False)) -> dict[str, Any]:
    return await _build_report_overview(refresh=refresh)


@router.get("/videos")
async def report_videos(refresh: bool = Query(False)) -> dict[str, Any]:
    cached = _cache_get("videos")
    if cached and not refresh:
        return cached

    if refresh:
        # Overview call usually warms the videos cache first — reuse it.
        cached = _cache_get("videos")
        if cached:
            return cached
        await _build_report_overview(refresh=True)
    else:
        # Soft miss: if overview is warm but videos is cold, soft rebuild no-ops —
        # force one rebuild so videos is filled.
        force = _cache_get("videos") is None and _cache_get("overview") is not None
        await _build_report_overview(refresh=force)

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
    memo = str(data.get("memo") or "").strip()
    if not memo:
        memo = "\n".join(str(item).strip() for item in (data.get("issues") or []) if str(item).strip())
    return {"ok": True, "promotions": promos, "memo": memo, "issues": []}


@router.put("/promotions")
def put_promotions(body: PromotionsBody) -> dict[str, Any]:
    memo = (body.memo or "").strip()
    if not memo and body.issues:
        memo = "\n".join(str(item).strip() for item in body.issues if str(item).strip())
    write_promotions({"promotions": body.promotions, "memo": memo, "issues": []})
    _REPORT_CACHE.clear()
    promos = [{**p, "metrics": _promotion_metrics(p)} for p in body.promotions]
    return {"ok": True, "promotions": promos, "memo": memo, "issues": []}


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


class StudioCaptureBody(BaseModel):
    curl: str = Field(min_length=20)


class StudioImportBody(BaseModel):
    payload: Any = None
    promotions: list[dict[str, Any]] | None = None


@router.get("/studio-promotions/status")
def report_studio_promo_status() -> dict[str, Any]:
    return get_studio_promo_status()


@router.post("/studio-promotions/capture")
def report_studio_promo_capture(body: StudioCaptureBody) -> dict[str, Any]:
    result = save_capture_from_curl(body.curl)
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("message") or "캡처 저장 실패")
    _REPORT_CACHE.clear()
    return result


@router.post("/studio-promotions/import")
async def report_studio_promo_import(body: StudioImportBody) -> dict[str, Any]:
    """북마클릿/DevTools에서 응답 JSON을 바로 넣을 때 사용."""
    raw: Any
    if body.promotions is not None:
        raw = {"promotions": body.promotions}
    else:
        raw = body.payload
    if raw is None:
        raise HTTPException(status_code=400, detail="payload 또는 promotions가 필요합니다")
    result = await sync_studio_promotions(raw_payload=raw)
    _REPORT_CACHE.clear()
    return result


@router.post("/studio-promotions/sync")
async def report_studio_promo_sync(force: bool = Query(True)) -> dict[str, Any]:
    result = await sync_studio_promotions(force=force)
    _REPORT_CACHE.clear()
    return result

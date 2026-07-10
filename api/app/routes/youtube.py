from __future__ import annotations

import os
import re
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from app.config import youtube_api_key, youtube_channel_handle

router = APIRouter(prefix="/api/dddit/youtube", tags=["youtube"])

_CACHE: dict[str, Any] = {"at": 0.0, "data": None}
_CACHE_TTL = 900  # 15 min
_YT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "ko",
}


def _format_count(value: str | int | None) -> str:
    if value is None:
        return "—"
    try:
        num = int(str(value).replace(",", ""))
    except ValueError:
        return str(value)
    if num >= 100_000_000:
        return f"{num / 100_000_000:.1f}억"
    if num >= 10_000:
        return f"{num / 10_000:.1f}만"
    return f"{num:,}"


async def _resolve_channel_id(client: httpx.AsyncClient, handle: str) -> str:
    channel_id = os.getenv("YOUTUBE_CHANNEL_ID", "").strip()
    if channel_id:
        return channel_id

    res = await client.get(
        f"https://www.youtube.com/@{handle}",
        headers=_YT_HEADERS,
        follow_redirects=True,
    )
    res.raise_for_status()
    patterns = [
        r'"channelId":"(UC[\w-]{20,})"',
        r'"externalId":"(UC[\w-]{20,})"',
        r"channel_id=(UC[\w-]{20,})",
    ]
    for pattern in patterns:
        m = re.search(pattern, res.text)
        if m:
            return m.group(1)
    raise HTTPException(status_code=502, detail="Could not resolve YouTube channel id")


async def _fetch_via_api(client: httpx.AsyncClient, handle: str, api_key: str) -> dict[str, Any]:
    ch_res = await client.get(
        "https://www.googleapis.com/youtube/v3/channels",
        params={
            "part": "snippet,statistics",
            "forHandle": handle,
            "key": api_key,
        },
    )
    ch_res.raise_for_status()
    ch_data = ch_res.json()
    items = ch_data.get("items") or []
    if not items:
        raise HTTPException(status_code=404, detail="YouTube channel not found")

    ch = items[0]
    channel_id = ch["id"]
    snippet = ch.get("snippet") or {}
    stats = ch.get("statistics") or {}

    vid_res = await client.get(
        "https://www.googleapis.com/youtube/v3/search",
        params={
            "part": "snippet",
            "channelId": channel_id,
            "order": "date",
            "maxResults": 4,
            "type": "video",
            "key": api_key,
        },
    )
    vid_res.raise_for_status()
    videos = []
    for item in vid_res.json().get("items") or []:
        sn = item.get("snippet") or {}
        vid = (item.get("id") or {}).get("videoId") or ""
        thumbs = sn.get("thumbnails") or {}
        thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url") or ""
        videos.append(
            {
                "id": vid,
                "title": sn.get("title") or "",
                "publishedAt": sn.get("publishedAt") or "",
                "thumbnail": thumb,
                "url": f"https://www.youtube.com/watch?v={vid}" if vid else "",
            }
        )

    return {
        "ok": True,
        "source": "youtube-api",
        "handle": handle,
        "channelId": channel_id,
        "title": snippet.get("title") or "디디딧",
        "description": snippet.get("description") or "",
        "thumbnail": (snippet.get("thumbnails") or {}).get("default", {}).get("url") or "",
        "subscriberCount": stats.get("subscriberCount"),
        "subscriberCountText": _format_count(stats.get("subscriberCount")),
        "viewCount": stats.get("viewCount"),
        "viewCountText": _format_count(stats.get("viewCount")),
        "videoCount": stats.get("videoCount"),
        "videoCountText": _format_count(stats.get("videoCount")),
        "channelUrl": f"https://www.youtube.com/@{handle}",
        "videos": videos,
    }


async def _fetch_via_scrape(client: httpx.AsyncClient, handle: str) -> dict[str, Any]:
    channel_id = await _resolve_channel_id(client, handle)
    res = await client.get(
        f"https://www.youtube.com/@{handle}/videos",
        headers=_YT_HEADERS,
        follow_redirects=True,
    )
    res.raise_for_status()
    html = res.text

    title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    channel_title = title_match.group(1).split(" - YouTube")[0].strip() if title_match else "디디딧"

    videos: list[dict[str, str]] = []
    seen: set[str] = set()
    for block in re.finditer(
        r'"lockupViewModel":\{.*?"animationActivationTargetId":"([A-Za-z0-9_-]{11})"',
        html,
    ):
        vid = block.group(1)
        if vid in seen:
            continue
        seen.add(vid)
        chunk = html[block.start() : block.start() + 4000]
        title_match = re.search(r'"content":"((?:\\.|[^"\\])*)"', chunk)
        title = title_match.group(1) if title_match else ""
        videos.append(
            {
                "id": vid,
                "title": title,
                "publishedAt": "",
                "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                "url": f"https://www.youtube.com/watch?v={vid}",
            }
        )
        if len(videos) >= 4:
            break

    if len(videos) < 4:
        for m in re.finditer(r"https://i\.ytimg\.com/vi/([A-Za-z0-9_-]{11})/", html):
            vid = m.group(1)
            if vid in seen:
                continue
            seen.add(vid)
            videos.append(
                {
                    "id": vid,
                    "title": "",
                    "publishedAt": "",
                    "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                    "url": f"https://www.youtube.com/watch?v={vid}",
                }
            )
            if len(videos) >= 4:
                break

    sub_text = view_text = video_text = None
    for pattern in [
        r'"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"',
        r'"subscriberCountText":\{"simpleText":"([^"]+)"',
    ]:
        m = re.search(pattern, html)
        if m:
            sub_text = m.group(1).replace("구독자 ", "").strip()
            break
    for pattern in [
        r'"viewCountText":\{"simpleText":"([^"]+)"',
        r'"viewCountText":\{"runs":\[\{"text":"([^"]+)"',
    ]:
        m = re.search(pattern, html)
        if m:
            view_text = m.group(1).replace("조회수 ", "").strip()
            break
    m = re.search(r'"videoCountText":\{"runs":\[\{"text":"([^"]+)"', html)
    if m:
        video_text = m.group(1).strip()

    return {
        "ok": True,
        "source": "scrape",
        "handle": handle,
        "channelId": channel_id,
        "title": channel_title,
        "description": "",
        "thumbnail": "",
        "subscriberCount": None,
        "subscriberCountText": sub_text or "—",
        "viewCount": None,
        "viewCountText": view_text or "—",
        "videoCount": None,
        "videoCountText": video_text or "—",
        "channelUrl": f"https://www.youtube.com/@{handle}",
        "videos": videos,
    }


@router.get("/channel")
async def get_channel() -> dict[str, Any]:
    now = time.time()
    if _CACHE["data"] and now - _CACHE["at"] < _CACHE_TTL:
        return _CACHE["data"]

    handle = youtube_channel_handle()
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            api_key = youtube_api_key()
            if api_key:
                data = await _fetch_via_api(client, handle, api_key)
            else:
                data = await _fetch_via_scrape(client, handle)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"YouTube fetch failed: {exc}") from exc

    _CACHE["at"] = now
    _CACHE["data"] = data
    return data

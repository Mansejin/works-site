from __future__ import annotations

import csv
import io
import os
import time
from datetime import date, datetime, timedelta
from typing import Any

import httpx

from app.config import youtube_analytics_oauth_config, youtube_channel_id
from app.google_oauth import get_access_token
from app.youtube_report_store import read_reporting_sync, write_reporting_sync

_REPORTING_BASE = "https://youtubereporting.googleapis.com/v1"
_REPORT_TYPE_ID = os.getenv("YOUTUBE_REPORTING_TYPE_ID", "channel_reach_basic_a1").strip()
_JOB_NAME = "dddit-channel-reach"
_CACHE: dict[str, Any] = {}
_CACHE_TTL = 3600
_MAX_REPORTS = 28


def _configured() -> bool:
    return youtube_analytics_oauth_config() is not None and bool(youtube_channel_id())


def _cache_get() -> dict[str, Any] | None:
    entry = _CACHE.get("reach")
    if not entry:
        return None
    if time.time() - entry["at"] > _CACHE_TTL:
        return None
    return entry["data"]


def _cache_set(data: dict[str, Any]) -> None:
    _CACHE["reach"] = {"at": time.time(), "data": data}


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _parse_report_date(value: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _normalize_ctr_percent(value: float) -> float:
    if value <= 1:
        return round(value * 100, 2)
    return round(value, 2)


def _aggregate_csv(text: str, start: date, end: date) -> tuple[int, float | None]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return 0, None
    total_impressions = 0
    weighted_ctr = 0.0
    for row in reader:
        row_date = _parse_report_date(row.get("date") or "")
        if row_date and (row_date < start or row_date > end):
            continue
        impressions = int(float(row.get("video_thumbnail_impressions") or 0))
        if impressions <= 0:
            continue
        ctr_raw = float(row.get("video_thumbnail_impressions_ctr") or 0)
        ctr_percent = _normalize_ctr_percent(ctr_raw)
        total_impressions += impressions
        weighted_ctr += impressions * ctr_percent
    if total_impressions <= 0:
        return 0, None
    return total_impressions, round(weighted_ctr / total_impressions, 2)


async def _ensure_job(client: httpx.AsyncClient, token: str) -> str:
    env_job_id = os.getenv("YOUTUBE_REPORTING_JOB_ID", "").strip()
    if env_job_id:
        return env_job_id

    stored = read_reporting_sync()
    if stored.get("jobId"):
        return str(stored["jobId"])

    res = await client.get(f"{_REPORTING_BASE}/jobs", headers=_auth_headers(token))
    res.raise_for_status()
    for job in res.json().get("jobs") or []:
        if job.get("reportTypeId") == _REPORT_TYPE_ID:
            job_id = str(job.get("id") or "")
            if job_id:
                write_reporting_sync(
                    {
                        **stored,
                        "jobId": job_id,
                        "reportTypeId": _REPORT_TYPE_ID,
                    }
                )
                return job_id

    create_res = await client.post(
        f"{_REPORTING_BASE}/jobs",
        headers={**_auth_headers(token), "Content-Type": "application/json"},
        json={"reportTypeId": _REPORT_TYPE_ID, "name": _JOB_NAME},
    )
    create_res.raise_for_status()
    job_id = str(create_res.json().get("id") or "")
    if not job_id:
        raise RuntimeError("Reporting job 생성 응답에 id가 없습니다.")
    write_reporting_sync(
        {
            **stored,
            "jobId": job_id,
            "reportTypeId": _REPORT_TYPE_ID,
            "jobCreatedAt": datetime.utcnow().isoformat(),
        }
    )
    return job_id


async def _download_reports(
    client: httpx.AsyncClient,
    token: str,
    job_id: str,
    start: date,
    end: date,
) -> tuple[int, float | None, int]:
    res = await client.get(
        f"{_REPORTING_BASE}/jobs/{job_id}/reports",
        headers=_auth_headers(token),
    )
    res.raise_for_status()
    reports = list(res.json().get("reports") or [])
    reports.sort(key=lambda item: item.get("startTime") or "", reverse=True)

    total_impressions = 0
    weighted_ctr = 0.0
    used = 0

    for report in reports[:_MAX_REPORTS]:
        download_url = report.get("downloadUrl")
        if not download_url:
            continue
        dl = await client.get(download_url, headers=_auth_headers(token), follow_redirects=True)
        dl.raise_for_status()
        imp, ctr = _aggregate_csv(dl.text, start, end)
        if imp <= 0:
            continue
        total_impressions += imp
        if ctr is not None:
            weighted_ctr += imp * ctr
        used += 1

    if total_impressions <= 0:
        return 0, None, used
    ctr_pct = round(weighted_ctr / total_impressions, 2)
    return total_impressions, ctr_pct, used


async def fetch_reporting_reach(refresh: bool = False) -> dict[str, Any]:
    if not refresh:
        cached = _cache_get()
        if cached:
            return cached
        stale = read_reporting_sync()
        if stale.get("impressions") is not None:
            return {
                "ok": True,
                "configured": True,
                "impressions": stale.get("impressions"),
                "ctr": stale.get("ctr"),
                "reportCount": stale.get("reportCount") or 0,
                "syncedAt": stale.get("syncedAt"),
                "jobId": stale.get("jobId"),
                "message": stale.get("message"),
                "source": "reporting-api",
            }

    if not _configured():
        return {
            "ok": False,
            "configured": False,
            "message": "YouTube Reporting API — OAuth 및 YOUTUBE_CHANNEL_ID 필요",
        }

    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=27)
    cfg = youtube_analytics_oauth_config()
    assert cfg is not None

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            token = await get_access_token(
                client,
                client_id=cfg["client_id"],
                client_secret=cfg["client_secret"],
                refresh_token=cfg["refresh_token"],
                cache_key="youtube-reporting",
            )
            job_id = await _ensure_job(client, token)
            impressions, ctr, report_count = await _download_reports(
                client, token, job_id, start, end
            )

        if impressions <= 0:
            stored = read_reporting_sync()
            message = (
                "Reporting job 준비됨 — 첫 일별 CSV는 보통 24~48시간 후 생성됩니다."
                if stored.get("jobCreatedAt")
                else "아직 다운로드할 Reporting CSV가 없습니다."
            )
            payload = {
                "ok": True,
                "configured": True,
                "status": "pending",
                "jobId": job_id,
                "impressions": None,
                "ctr": None,
                "reportCount": report_count,
                "period": {"startDate": start.isoformat(), "endDate": end.isoformat()},
                "message": message,
                "source": "reporting-api",
            }
            write_reporting_sync({**stored, "jobId": job_id, "message": message})
            _cache_set(payload)
            return payload

        payload = {
            "ok": True,
            "configured": True,
            "status": "ready",
            "jobId": job_id,
            "impressions": impressions,
            "ctr": ctr,
            "reportCount": report_count,
            "period": {"startDate": start.isoformat(), "endDate": end.isoformat()},
            "syncedAt": datetime.utcnow().isoformat(),
            "message": None,
            "source": "reporting-api",
        }
        write_reporting_sync(payload)
        _cache_set(payload)
        return payload
    except Exception as exc:
        stale = read_reporting_sync()
        return {
            "ok": False,
            "configured": True,
            "message": f"YouTube Reporting API 조회 실패: {exc}",
            "impressions": stale.get("impressions"),
            "ctr": stale.get("ctr"),
            "jobId": stale.get("jobId"),
            "source": "reporting-api",
        }

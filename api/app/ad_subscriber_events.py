"""Track advertising subscriber *increments* from Studio/Ads syncs.

Lifetime campaign ``subscribers`` totals must not be dumped into a single week.
We store watermarks per promo id and only emit positive deltas between syncs.
Google Ads daily conversion rows (subscribe actions only) are upserted by date.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any

from app.youtube_report_store import DATA_DIR, _read_json, _write_json

EVENTS_FILE = DATA_DIR / "ad-subscriber-events.json"

_SUBSCRIBE_NAME_RE = re.compile(r"구독|subscribe|subscriber", re.I)


def _empty() -> dict[str, Any]:
    return {"watermarks": {}, "events": [], "updatedAt": None}


def read_ad_subscriber_events() -> dict[str, Any]:
    data = _read_json(EVENTS_FILE, _empty())
    if not isinstance(data.get("watermarks"), dict):
        data["watermarks"] = {}
    if not isinstance(data.get("events"), list):
        data["events"] = []
    return data


def write_ad_subscriber_events(data: dict[str, Any]) -> None:
    payload = {
        "watermarks": data.get("watermarks") or {},
        "events": data.get("events") or [],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
    EVENTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    _write_json(EVENTS_FILE, payload)


def _parse_int(value: Any) -> int:
    try:
        return int(float(str(value).replace(",", "").strip() or 0))
    except (TypeError, ValueError):
        return 0


def is_subscribe_promo(promo: dict[str, Any]) -> bool:
    goal = str(promo.get("goal") or "")
    title = str(promo.get("title") or "")
    if any(token in goal for token in ("시청자층", "구독")):
        return True
    if re.search(r"\(구독\)|구독\s*$|구독\s*캠페인", title):
        return True
    return False


def is_subscribe_conversion_name(name: str) -> bool:
    return bool(_SUBSCRIBE_NAME_RE.search(str(name or "")))


def event_timeline() -> list[tuple[date, int]]:
    """Point-in-time increments for weekly cumulative ad attribution."""
    rows: list[tuple[date, int]] = []
    for event in read_ad_subscriber_events().get("events") or []:
        if not isinstance(event, dict):
            continue
        delta = _parse_int(event.get("delta"))
        if delta <= 0:
            continue
        raw = str(event.get("date") or "")[:10]
        try:
            rows.append((date.fromisoformat(raw), delta))
        except ValueError:
            continue
    rows.sort(key=lambda item: item[0])
    return rows


def ingest_promo_subscriber_snapshots(
    promotions: list[dict[str, Any]],
    *,
    as_of: str | None = None,
    source: str = "promo",
) -> dict[str, Any]:
    """Set watermarks / emit positive deltas for subscribe promotions.

    First sight of a promo only sets the watermark (no historical dump).
    """
    data = read_ad_subscriber_events()
    watermarks: dict[str, Any] = dict(data.get("watermarks") or {})
    events: list[dict[str, Any]] = list(data.get("events") or [])
    day = (as_of or date.today().isoformat())[:10]
    added = 0
    seeded = 0

    for promo in promotions:
        if not isinstance(promo, dict) or not is_subscribe_promo(promo):
            continue
        promo_id = str(promo.get("id") or "").strip()
        if not promo_id:
            continue
        current = _parse_int(promo.get("subscribers"))
        prev_raw = watermarks.get(promo_id)
        if prev_raw is None:
            watermarks[promo_id] = current
            seeded += 1
            continue
        prev = _parse_int(prev_raw)
        delta = current - prev
        if delta > 0:
            events.append(
                {
                    "date": day,
                    "source": str(promo.get("source") or source),
                    "promoId": promo_id,
                    "delta": delta,
                }
            )
            watermarks[promo_id] = current
            added += delta
        elif current != prev:
            # Correction / reset — move watermark without inventing negative growth.
            watermarks[promo_id] = current

    data["watermarks"] = watermarks
    data["events"] = events
    write_ad_subscriber_events(data)
    return {"ok": True, "deltaAdded": added, "seeded": seeded, "asOf": day}


def replace_google_ads_subscribe_events(
    daily_rows: list[dict[str, Any]],
    *,
    wipe_start: str | None = None,
    wipe_end: str | None = None,
) -> dict[str, Any]:
    """Replace google-ads subscribe conversion events for a date window.

    ``daily_rows`` items: ``{date, promoId, delta, conversionAction?}``.
    """
    data = read_ad_subscriber_events()
    events: list[dict[str, Any]] = list(data.get("events") or [])
    start = wipe_start or "0000-01-01"
    end = wipe_end or "9999-12-31"

    kept = [
        e
        for e in events
        if not (
            isinstance(e, dict)
            and str(e.get("source") or "") == "google-ads"
            and start <= str(e.get("date") or "")[:10] <= end
        )
    ]
    added = 0
    for row in daily_rows:
        if not isinstance(row, dict):
            continue
        delta = _parse_int(row.get("delta"))
        day = str(row.get("date") or "")[:10]
        promo_id = str(row.get("promoId") or "").strip()
        if delta <= 0 or not day or not promo_id:
            continue
        try:
            date.fromisoformat(day)
        except ValueError:
            continue
        kept.append(
            {
                "date": day,
                "source": "google-ads",
                "promoId": promo_id,
                "delta": delta,
                "conversionAction": row.get("conversionAction"),
            }
        )
        added += delta

    data["events"] = kept
    write_ad_subscriber_events(data)
    return {"ok": True, "deltaAdded": added, "events": len(kept)}

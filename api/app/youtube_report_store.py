from __future__ import annotations

import json
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "youtube"
PROMOTIONS_FILE = DATA_DIR / "promotions.json"
SNAPSHOTS_FILE = DATA_DIR / "subscriber-snapshots.json"
ADS_SYNC_FILE = DATA_DIR / "ads-sync.json"
REPORTING_SYNC_FILE = DATA_DIR / "reporting-sync.json"


def _read_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return default
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else default
    except (json.JSONDecodeError, OSError):
        return default


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_promotions() -> dict[str, Any]:
    return _read_json(PROMOTIONS_FILE, {"promotions": [], "issues": []})


def write_promotions(data: dict[str, Any]) -> None:
    _write_json(PROMOTIONS_FILE, data)


def read_snapshots() -> dict[str, Any]:
    return _read_json(SNAPSHOTS_FILE, {"snapshots": [], "viewsTrend7d": []})


def write_snapshots(data: dict[str, Any]) -> None:
    _write_json(SNAPSHOTS_FILE, data)


def read_ads_sync() -> dict[str, Any]:
    return _read_json(ADS_SYNC_FILE, {"campaigns": [], "syncedAt": None, "campaignCount": 0})


def write_ads_sync(data: dict[str, Any]) -> None:
    _write_json(ADS_SYNC_FILE, data)


def read_reporting_sync() -> dict[str, Any]:
    return _read_json(
        REPORTING_SYNC_FILE,
        {"jobId": None, "reportTypeId": None, "impressions": None, "ctr": None},
    )


def write_reporting_sync(data: dict[str, Any]) -> None:
    _write_json(REPORTING_SYNC_FILE, data)


def _promo_match_key(promo: dict[str, Any]) -> str:
    for key in ("adsCampaignId", "id", "title"):
        value = str(promo.get(key) or "").strip().lower()
        if value:
            return value
    return ""


def merge_ads_into_promotions(ads_campaigns: list[dict[str, Any]]) -> dict[str, Any]:
    data = read_promotions()
    manual = list(data.get("promotions") or [])
    issues = list(data.get("issues") or [])
    by_key: dict[str, dict[str, Any]] = {}

    for promo in manual:
        key = _promo_match_key(promo)
        if key:
            by_key[key] = {**promo, "source": promo.get("source") or "manual"}

    for campaign in ads_campaigns:
        merged = dict(campaign)
        key = _promo_match_key(campaign)
        existing = by_key.get(key)
        if existing:
            merged = {
                **existing,
                "cost": campaign.get("cost") or existing.get("cost"),
                "impressions": campaign.get("impressions") or existing.get("impressions"),
                "views": campaign.get("views") or existing.get("views"),
                "clicks": campaign.get("clicks") or existing.get("clicks"),
                "subscribers": existing.get("subscribers") or campaign.get("subscribers") or 0,
                "status": existing.get("status") or campaign.get("status"),
                "notes": existing.get("notes") or [],
                "targeting": existing.get("targeting"),
                "source": "merged",
                "adsCampaignId": campaign.get("adsCampaignId"),
                "syncedAt": campaign.get("syncedAt"),
            }
        by_key[key or f"ads-{len(by_key)}"] = merged

    merged_promos = list(by_key.values())
    return {"promotions": merged_promos, "issues": issues}


def read_merged_promotions() -> dict[str, Any]:
    ads = read_ads_sync()
    campaigns = ads.get("campaigns") or []
    if not campaigns:
        return read_promotions()
    return merge_ads_into_promotions(campaigns)

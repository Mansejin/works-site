from __future__ import annotations

import json
import re
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


def _normalize_match_text(value: Any) -> str:
    return " ".join(str(value or "").lower().split())


def _promo_match_key(promo: dict[str, Any]) -> str:
    for key in ("adsCampaignId", "id", "title"):
        value = str(promo.get(key) or "").strip().lower()
        if value:
            return value
    return ""


def _titles_overlap(left: str, right: str) -> bool:
    a = _normalize_match_text(left)
    b = _normalize_match_text(right)
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    a_core = re.sub(r"\s*\([^)]*\)", "", a).strip()
    b_core = re.sub(r"\s*\([^)]*\)", "", b).strip()
    if len(a_core) >= 4 and a_core in b:
        return True
    if len(b_core) >= 4 and b_core in a:
        return True
    return False


def _find_manual_match(
    campaign: dict[str, Any], manuals: list[dict[str, Any]]
) -> dict[str, Any] | None:
    ads_id = str(campaign.get("adsCampaignId") or "").strip()
    if ads_id:
        for promo in manuals:
            if str(promo.get("adsCampaignId") or "").strip() == ads_id:
                return promo
    campaign_title = campaign.get("title") or ""
    for promo in manuals:
        if _titles_overlap(campaign_title, promo.get("title") or ""):
            return promo
        if _titles_overlap(campaign_title, promo.get("videoTitle") or ""):
            return promo
    return None


def merge_ads_into_promotions(ads_campaigns: list[dict[str, Any]]) -> dict[str, Any]:
    data = read_promotions()
    manuals = list(data.get("promotions") or [])
    issues = list(data.get("issues") or [])

    merged_promos: list[dict[str, Any]] = []
    matched_ads_ids: set[str] = set()

    for promo in manuals:
        matched = None
        for campaign in ads_campaigns:
            if _find_manual_match(campaign, [promo]) is promo:
                matched = campaign
                break

        if matched:
            ads_id = str(matched.get("adsCampaignId") or "").strip()
            if ads_id:
                matched_ads_ids.add(ads_id)

            def _prefer_ads(field: str) -> Any:
                ads_val = matched.get(field)
                if ads_val is None:
                    return promo.get(field)
                try:
                    if int(ads_val) > 0:
                        return ads_val
                except (TypeError, ValueError):
                    if ads_val:
                        return ads_val
                return promo.get(field)

            merged_promos.append(
                {
                    **promo,
                    "cost": _prefer_ads("cost"),
                    "impressions": _prefer_ads("impressions"),
                    "views": _prefer_ads("views"),
                    "clicks": _prefer_ads("clicks"),
                    "subscribers": promo.get("subscribers") or matched.get("subscribers") or 0,
                    "status": matched.get("status") or promo.get("status"),
                    "source": "merged",
                    "adsCampaignId": matched.get("adsCampaignId"),
                    "syncedAt": matched.get("syncedAt"),
                }
            )
        else:
            merged_promos.append({**promo, "source": promo.get("source") or "manual"})

    for campaign in ads_campaigns:
        ads_id = str(campaign.get("adsCampaignId") or "").strip()
        if ads_id and ads_id in matched_ads_ids:
            continue
        if _find_manual_match(campaign, manuals):
            continue
        if not (
            int(campaign.get("cost") or 0)
            or int(campaign.get("impressions") or 0)
            or int(campaign.get("views") or 0)
        ):
            continue
        merged_promos.append(dict(campaign))

    def _sort_key(promo: dict[str, Any]) -> tuple[int, int, str]:
        status = str(promo.get("status") or "")
        rank = 0 if status == "진행중" else 1 if status == "일시중지" else 2
        return (rank, -int(promo.get("cost") or 0), str(promo.get("title") or ""))

    merged_promos.sort(key=_sort_key)
    return {"promotions": merged_promos, "issues": issues}



def read_merged_promotions() -> dict[str, Any]:
    ads = read_ads_sync()
    campaigns = ads.get("campaigns") or []
    if not campaigns:
        return read_promotions()
    return merge_ads_into_promotions(campaigns)

from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import youtube_api_key, youtube_channel_id
from app.youtube_report_store import (
    DATA_DIR,
    _read_json,
    _write_json,
    read_promotions,
    write_promotions,
)
from app.youtube_studio_auth import (
    capture_header_keys,
    cookies_configured,
    default_innertube_context,
    studio_auth_headers,
    studio_cookies_from_env,
)

CAPTURE_FILE = DATA_DIR / "studio-promo-capture.json"
SYNC_META_FILE = DATA_DIR / "studio-promo-sync.json"

# Studio Network에서 확인되면 capture에 저장되어 우선 사용. 아래는 자동 탐색용 후보.
_PROBE_PATHS = (
    "youtubei/v1/promotions/list_promotions",
    "youtubei/v1/ypc/list_promotions",
    "youtubei/v1/promotion/list_promotions",
    "youtubei/v1/promotion/get_promotions",
    "youtubei/v1/campaign/list_campaigns",
    "youtubei/v1/ypc/get_cart",
    "youtubei/v1/ypc/get_offers",
    "youtubei/v1/creator/list_creator_received_item",
    "youtubei/v1/creator/get_creator_channels",
)

_INNERTUBE_KEY_DEFAULT = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w"


def read_capture() -> dict[str, Any]:
    return _read_json(
        CAPTURE_FILE,
        {
            "url": "",
            "method": "POST",
            "body": None,
            "channelId": "",
            "notes": [],
            "capturedAt": None,
        },
    )


def write_capture(data: dict[str, Any]) -> None:
    _write_json(CAPTURE_FILE, data)


def read_sync_meta() -> dict[str, Any]:
    return _read_json(SYNC_META_FILE, {"syncedAt": None, "promotionCount": 0, "message": None})


def write_sync_meta(data: dict[str, Any]) -> None:
    _write_json(SYNC_META_FILE, data)


def _parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    # Google Money / Amount: { "units": "45489", "nanos": 0, "currencyCode": "KRW" }
    if isinstance(value, dict):
        if "units" in value or "nanos" in value:
            units = _parse_int(value.get("units")) or 0
            nanos = _parse_int(value.get("nanos")) or 0
            return units + (1 if nanos >= 500_000_000 else 0)
        # { "simpleText": "₩45,489" } / { "value": 45489 }
        for nested_key in ("simpleText", "text", "label", "value", "amount", "count"):
            if nested_key in value:
                parsed = _parse_int(value[nested_key])
                if parsed is not None:
                    return parsed
        return None
    text = str(value).strip()
    # "₩44,435" / "44,435원" / "1.2만"
    text = text.replace(",", "").replace("₩", "").replace("원", "").strip()
    if re.fullmatch(r"\d+(\.\d+)?만", text):
        return int(float(text[:-1]) * 10_000)
    digits = re.sub(r"[^\d.-]", "", text)
    if not digits or digits in (".", "-", "-."):
        return None
    try:
        return int(float(digits))
    except ValueError:
        return None


def _is_money_obj(obj: dict[str, Any]) -> bool:
    keys = {str(k).lower() for k in obj.keys()}
    return "units" in keys or ("amountmicros" in keys) or ("micros" in keys and "currencycode" in keys)


def _key_has(key: str, *needles: str) -> bool:
    k = re.sub(r"[^a-z0-9]", "", str(key).lower())
    return any(n in k for n in needles)


def _text_from_any(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        for nested_key in ("simpleText", "text", "label", "accessibilityText", "value"):
            if nested_key in value:
                text = _text_from_any(value[nested_key])
                if text:
                    return text
        runs = value.get("runs")
        if isinstance(runs, list) and runs and isinstance(runs[0], dict) and runs[0].get("text"):
            return str(runs[0]["text"])
        return ""
    return str(value).strip()


_LABEL_COST = re.compile(r"비용|지출|사용.?금|금액|amount\s*spent|^spend$|spent|cost|총\s*비용", re.I)
_LABEL_IMPR = re.compile(r"노출|impression|reach", re.I)
_LABEL_VIEWS = re.compile(r"조회|view(?!er)", re.I)
_LABEL_SUBS = re.compile(r"구독|subscriber|followers?\s*gained", re.I)


def _metric_label_bucket(label: str) -> str | None:
    text = (label or "").strip()
    if not text:
        return None
    if _LABEL_COST.search(text):
        return "cost"
    if _LABEL_IMPR.search(text):
        return "impressions"
    if _LABEL_VIEWS.search(text):
        return "views"
    if _LABEL_SUBS.search(text):
        return "subscribers"
    return None


def _absorb_metric_collections(flat: dict[str, Any]) -> dict[str, Any]:
    """Turn metric row lists / typed metric bags into cost/impressions/views/subs keys."""
    out = dict(flat)
    for _key, val in list(flat.items()):
        if isinstance(val, dict):
            # { COST: {...}, IMPRESSIONS: n, ... }
            for mk, mv in val.items():
                bucket = _metric_label_bucket(str(mk))
                if bucket and bucket not in out:
                    out[bucket] = mv
            continue
        if not isinstance(val, list):
            continue
        for item in val:
            if not isinstance(item, dict):
                continue
            label = _text_from_any(
                item.get("label")
                or item.get("title")
                or item.get("name")
                or item.get("metricType")
                or item.get("type")
                or item.get("key")
                or ""
            )
            bucket = _metric_label_bucket(label)
            if not bucket:
                # typed enums like METRIC_TYPE_COST
                for mk, mv in item.items():
                    if _key_has(str(mk), "type", "metric") and isinstance(mv, str):
                        bucket = _metric_label_bucket(mv)
                        if bucket:
                            break
            if not bucket:
                continue
            value = (
                item.get("value")
                if "value" in item
                else item.get("amount")
                if "amount" in item
                else item.get("count")
                if "count" in item
                else item.get("metricValue")
                if "metricValue" in item
                else item.get("money")
                if "money" in item
                else None
            )
            if value is None and _is_money_obj(item):
                value = item
            if value is not None and bucket not in out:
                out[bucket] = value
    return out


def _shallow_unwrap(obj: dict[str, Any]) -> dict[str, Any]:
    flat: dict[str, Any] = dict(obj)
    for wrap in (
        "promotionRenderer",
        "campaignRenderer",
        "promotionCardRenderer",
        "promotionListItemRenderer",
        "ypcPromotionRenderer",
        "promotionEntity",
        "campaignEntity",
        "promotion",
        "campaign",
        "entity",
        "item",
        "data",
        "payload",
    ):
        inner = flat.get(wrap)
        if isinstance(inner, dict):
            flat = {**flat, **inner}
    for nest in (
        "metrics",
        "statistics",
        "stats",
        "performance",
        "campaignMetrics",
        "promotionMetrics",
        "lifecycleMetrics",
        "resultMetrics",
        "deliveryMetrics",
        "insightMetrics",
        "totals",
        "summary",
        "results",
    ):
        inner = flat.get(nest)
        if isinstance(inner, dict):
            flat = {**flat, **inner}
    video = flat.get("video")
    if isinstance(video, dict):
        flat = {**flat, **video}
        if video.get("title") and not flat.get("videoTitle"):
            flat["videoTitle"] = video.get("title")
        if video.get("videoId") and not flat.get("videoId"):
            flat["videoId"] = video.get("videoId")
    return flat


def _flatten_promo_dict(obj: dict[str, Any], depth: int = 0) -> dict[str, Any]:
    """Unwrap Studio wrappers and nested metric bags into a flat-ish dict."""
    flat = _shallow_unwrap(obj)
    if depth < 4:
        for key, value in list(flat.items()):
            if not isinstance(value, dict) or _is_money_obj(value):
                continue
            if _key_has(
                str(key),
                "metric",
                "stat",
                "performance",
                "result",
                "delivery",
                "lifecycle",
                "summary",
                "total",
                "budget",
                "spend",
                "cost",
            ):
                nested = _flatten_promo_dict(value, depth + 1)
                for nk, nv in nested.items():
                    if nk not in flat or flat.get(nk) in (None, "", {}, []):
                        flat[nk] = nv
            else:
                # Still pull money children up one level under their field name.
                for nk, nv in value.items():
                    if isinstance(nv, dict) and _is_money_obj(nv) and nk not in flat:
                        flat[nk] = nv
                    elif _key_has(str(nk), "cost", "spend", "impression", "view", "subscriber") and nk not in flat:
                        flat[nk] = nv
    return _absorb_metric_collections(flat)


def _looks_like_promo(obj: dict[str, Any]) -> bool:
    keys = {str(k).lower() for k in obj.keys()}
    if "botguarddata" in keys or "botguardresponse" in keys:
        return False
    has_cost = any(_key_has(k, "cost", "spend", "spent", "budget") for k in keys)
    has_units_money = _is_money_obj(obj)
    nested_money = any(isinstance(v, dict) and _is_money_obj(v) for v in obj.values())
    has_views = any(_key_has(k, "view") for k in keys)
    has_impr = any(_key_has(k, "impression", "reach", "impr") for k in keys)
    has_subs = any(_key_has(k, "subscriber", "follower", "subs") for k in keys)
    has_name = any(_key_has(k, "title", "name", "campaign", "promotion", "video") for k in keys)
    has_id = any(_key_has(k, "campaignid", "promotionid", "entityid") for k in keys) or ("id" in keys)
    metric_hits = sum(
        1 for flag in (has_cost or has_units_money or nested_money, has_views, has_impr, has_subs) if flag
    )
    return bool((has_name or has_id) and metric_hits >= 1)


def _pick(obj: dict[str, Any], *names: str) -> Any:
    lower_map = {str(k).lower(): v for k, v in obj.items()}
    for name in names:
        if name.lower() in lower_map:
            return lower_map[name.lower()]
    return None


def _pick_money(obj: dict[str, Any], *names: str) -> int | None:
    """Resolve scalar or {units} money / metric fields."""
    for name in names:
        val = _pick(obj, name)
        parsed = _parse_int(val)
        if parsed is not None:
            return parsed
    return None


def _pick_money_fuzzy(obj: dict[str, Any], *needles: str) -> int | None:
    exact = _pick_money(obj, *needles)
    if exact is not None:
        return exact
    best = None
    for key, value in obj.items():
        if not _key_has(str(key), *needles):
            continue
        parsed = _parse_int(value)
        if parsed is not None:
            best = parsed
            # Prefer keys that look most like the primary metric
            if any(n in re.sub(r"[^a-z0-9]", "", str(key).lower()) for n in needles[:1]):
                return parsed
    return best


def _walk_promos(
    node: Any,
    found: list[dict[str, Any]],
    depth: int = 0,
    parent: dict[str, Any] | None = None,
) -> None:
    if depth > 32:
        return
    if isinstance(node, dict):
        flat = _flatten_promo_dict(node)
        if _looks_like_promo(flat):
            found.append(flat)
        if _is_money_obj(node) and parent is not None:
            found.append(_flatten_promo_dict(parent))
        for value in node.values():
            _walk_promos(value, found, depth + 1, parent=node)
    elif isinstance(node, list):
        for item in node:
            _walk_promos(item, found, depth + 1, parent=parent)


def analyze_payload_shape(payload: Any) -> dict[str, Any]:
    """Diagnostics when parsing finds zero promotions."""
    top_keys = list(payload.keys())[:30] if isinstance(payload, dict) else []
    units_paths: list[str] = []
    interesting_keys: set[str] = set()

    def walk(node: Any, path: str, depth: int = 0) -> None:
        if depth > 24 or len(units_paths) >= 12:
            return
        if isinstance(node, dict):
            for k, v in node.items():
                key = str(k)
                if _key_has(key, "unit", "cost", "spend", "impression", "view", "subscriber", "promotion", "campaign"):
                    interesting_keys.add(key)
                child = f"{path}.{key}" if path else key
                if isinstance(v, dict) and _is_money_obj(v):
                    units_paths.append(child)
                walk(v, child, depth + 1)
        elif isinstance(node, list):
            for i, item in enumerate(node[:20]):
                walk(item, f"{path}[{i}]", depth + 1)

    walk(payload, "")
    return {
        "topKeys": top_keys,
        "unitsPaths": units_paths[:12],
        "interestingKeys": sorted(interesting_keys)[:40],
        "unitsCount": len(units_paths),
    }


def _slugify(name: str) -> str:
    slug = re.sub(r"[^\w가-힣]+", "-", (name or "").strip().lower())
    return slug.strip("-")[:48] or "studio-promo"


_GENERIC_PROMO_TITLE = re.compile(
    r"(?i)^youtube\s*promotion\s*[-–—]\s*(20\d{2}-\d{2}-\d{2})(?:\s*[-–—]\s*(\w+))?$"
)


def _is_generic_studio_title(title: str) -> bool:
    return bool(_GENERIC_PROMO_TITLE.match((title or "").strip()))


def _status_label(raw: Any) -> str:
    text = str(raw or "").strip()
    upper = text.upper()
    upper = re.sub(r"^(PROMOTION|CAMPAIGN|AD)_?STATUS_?", "", upper)
    upper = upper.replace(" ", "_")
    if upper in {"ACTIVE", "ENABLED", "RUNNING", "LIVE", "PROMOTING"}:
        return "진행중"
    if upper in {"PAUSED", "PAUSE"}:
        return "일시중지"
    if upper in {"ENDED", "COMPLETED", "DONE", "FINISHED", "EXPIRED", "STOPPED"}:
        return "완료"
    if text in {"진행중", "일시중지", "완료"}:
        return text
    if not upper:
        return "진행중"
    # Unknown raw enums should not leak into UI.
    if "_" in upper or upper.startswith("PROMOTION"):
        return "진행중"
    return text[:20] or "진행중"


def _goal_label(raw: Any) -> str:
    text = str(raw or "").strip()
    if not text:
        return ""
    key = re.sub(r"^(PROMOTION|CAMPAIGN)_?GOAL_?", "", text.upper())
    key = key.replace(" ", "_")
    goal_map = {
        "AUDIENCE_GROWTH": "시청자층 성장",
        "SUBSCRIBE": "시청자층 성장",
        "SUBSCRIBERS": "시청자층 성장",
        "VIEWS": "동영상 조회수",
        "VIDEO_VIEWS": "동영상 조회수",
        "WEBSITE": "웹사이트 방문",
        "WEBSITE_TRAFFIC": "웹사이트 방문",
    }
    if key in goal_map:
        return goal_map[key]
    if "_" in key:
        return ""
    return text


def _extract_promo_date(*values: Any) -> str | None:
    for value in values:
        if not value:
            continue
        text = str(value)
        match = re.search(r"(20\d{2}-\d{2}-\d{2})", text)
        if match:
            return match.group(1)
        try:
            num = int(float(text))
            if num > 1_000_000_000_000:
                num //= 1000
            if 1_600_000_000 <= num <= 2_200_000_000:
                return datetime.fromtimestamp(num, tz=timezone.utc).strftime("%Y-%m-%d")
        except (TypeError, ValueError, OSError, OverflowError):
            pass
    return None


def _humanize_promo_title(
    *,
    title: str,
    video_title: str,
    goal: str | None,
    promo_date: str | None,
) -> str:
    base = (title or "").strip()
    video = (video_title or "").strip()
    if _is_generic_studio_title(base):
        if video and not _is_generic_studio_title(video):
            short = video if len(video) <= 42 else f"{video[:42]}…"
            if goal:
                return f"{short} ({goal})"
            return short
        if promo_date:
            return f"Studio 프로모션 {promo_date}"
        return "Studio 프로모션"
    return (base[:80] if base else "") or "Studio 프로모션"


def normalize_studio_promo(raw: dict[str, Any]) -> dict[str, Any]:
    raw = _flatten_promo_dict(raw)

    def _text_field(*names: str) -> str:
        for name in names:
            val = _pick(raw, name)
            if val is None:
                continue
            if isinstance(val, dict):
                simple = _pick(val, "simpleText", "text", "label")
                if simple:
                    return str(simple)
                runs = val.get("runs")
                if isinstance(runs, list) and runs and isinstance(runs[0], dict) and runs[0].get("text"):
                    return str(runs[0]["text"])
                continue
            text = str(val).strip()
            if text:
                return text
        return ""

    raw_title = _text_field(
        "title", "name", "campaignName", "promotionName", "displayName", "videoTitle"
    ) or "Studio 프로모션"
    video_title = _text_field("videoTitle", "video_title", "promotedVideoTitle") or ""
    if not video_title and not _is_generic_studio_title(raw_title):
        video_title = raw_title
    video_id = str(_pick(raw, "videoId", "encryptedVideoId", "externalVideoId") or "")
    campaign_raw = _pick(raw, "campaignId", "promotionId", "externalCampaignId", "entityId", "id")
    if isinstance(campaign_raw, dict):
        campaign_raw = _pick(campaign_raw, "id", "campaignId", "promotionId")
    campaign_id = str(campaign_raw or "").strip()
    if len(campaign_id) > 80 or "\n" in campaign_id:
        campaign_id = ""
    generic_match = _GENERIC_PROMO_TITLE.match(raw_title.strip())
    if generic_match and not campaign_id:
        campaign_id = generic_match.group(2) or ""

    cost = _pick_money_fuzzy(
        raw,
        "cost",
        "spend",
        "amountSpent",
        "budgetSpent",
        "totalCost",
        "amountSpentMoney",
        "spentAmount",
        "spendAmount",
        "costAmount",
        "totalSpend",
        "costToDate",
    )
    if cost is None and isinstance(_pick(raw, "units"), (str, int, float)):
        if _pick(raw, "currencyCode", "currency", "nanos") is not None:
            cost = _parse_int({"units": _pick(raw, "units"), "nanos": _pick(raw, "nanos")})

    micros = _pick_money_fuzzy(raw, "costMicros", "spentMicros", "amountSpentMicros", "budgetSpentMicros")
    if cost is None and micros is not None:
        cost = round(micros / 1_000_000) if abs(micros) >= 1_000_000 else micros
    elif cost is not None and abs(cost) >= 1_000_000 and micros is not None and abs(micros) >= 1_000_000:
        cost = round(micros / 1_000_000)

    impressions = _pick_money_fuzzy(raw, "impressions", "impressionCount", "reach", "impression", "impr")
    views = _pick_money_fuzzy(
        raw, "views", "viewCount", "videoViews", "trueviewViews", "promotedViews", "viewedCount", "view"
    )
    subscribers = _pick_money_fuzzy(
        raw,
        "subscribersGained",
        "subscribers",
        "subscriberCount",
        "followersGained",
        "newSubscribers",
        "gainedSubscribers",
        "subs",
        "subscriber",
    )
    follow_on = _pick_money_fuzzy(raw, "followOnViews", "clicks", "followOnViewCount", "followon")
    budget = _pick_money_fuzzy(
        raw,
        "budget",
        "totalBudget",
        "campaignBudget",
        "dailyBudget",
        "budgetAmount",
        "totalBudgetAmount",
    )

    status = _status_label(_pick(raw, "status", "campaignStatus", "state", "promotionStatus"))
    goal = _goal_label(_pick(raw, "goal", "objective", "campaignGoal", "promotionGoal"))
    promo_date = _extract_promo_date(
        _pick(raw, "startDate", "startTime", "createTime", "createdAt", "beginDate"),
        raw_title,
        _pick(raw, "endDate", "endTime"),
    )
    title = _humanize_promo_title(
        title=raw_title,
        video_title=video_title,
        goal=goal or None,
        promo_date=promo_date,
    )

    if campaign_id.startswith("studio-"):
        promo_id = campaign_id
        studio_campaign_id = campaign_id[len("studio-") :] or None
    else:
        promo_id = f"studio-{campaign_id}" if campaign_id else f"studio-{_slugify(title)}"
        studio_campaign_id = campaign_id or None

    payload = {
        "id": promo_id,
        "title": title[:80],
        "videoTitle": (video_title or title)[:120],
        "videoId": video_id,
        "status": status,
        "goal": goal or None,
        "cost": cost or 0,
        "impressions": impressions or 0,
        "views": views or 0,
        "subscribers": subscribers or 0,
        "followOnViews": follow_on or 0,
        "startDate": promo_date,
        "source": "youtube-studio",
        "studioCampaignId": studio_campaign_id,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "notes": ["YouTube Studio 내부 API 동기화"],
        "rawTitle": raw_title[:120],
    }
    if budget:
        payload["budget"] = budget
    return payload


def _status_rank(status: Any) -> int:
    label = _status_label(status)
    if label == "진행중":
        return 0
    if label == "일시중지":
        return 1
    return 2


def _sort_promotions(promos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def key(p: dict[str, Any]) -> tuple:
        date = _extract_promo_date(
            p.get("startDate"),
            p.get("syncedAt"),
            p.get("rawTitle"),
            p.get("title"),
            " ".join(str(n) for n in (p.get("notes") or [])),
        ) or "1970-01-01"
        return (
            _status_rank(p.get("status")),
            -int(date.replace("-", "") or 0),
            -int(p.get("cost") or 0),
            str(p.get("title") or ""),
        )

    return sorted(promos, key=key)


def _token_overlap(a: str, b: str) -> bool:
    x = " ".join((a or "").lower().split())
    y = " ".join((b or "").lower().split())
    if not x or not y:
        return False
    if x in y or y in x or x[:16] in y or y[:16] in x:
        return True
    xt = {t for t in re.split(r"[\s\-_/()]+", x) if len(t) >= 2}
    yt = {t for t in re.split(r"[\s\-_/()]+", y) if len(t) >= 2}
    if not xt or not yt:
        return False
    return len(xt & yt) >= 2


def _metrics_match_score(a: dict[str, Any], b: dict[str, Any]) -> float:
    score = 0.0
    matched = 0
    for field, weight in (("cost", 3.0), ("impressions", 2.0), ("views", 2.0)):
        av = int(a.get(field) or 0)
        bv = int(b.get(field) or 0)
        if av <= 0 or bv <= 0:
            continue
        ratio = abs(av - bv) / max(av, bv)
        if ratio > 0.28:
            return 999.0
        score += ratio * weight
        matched += 1
    return score if matched >= 2 else 999.0


def _is_stale_studio_row(promo: dict[str, Any]) -> bool:
    source = str(promo.get("source") or "")
    title = str(promo.get("title") or "")
    if source == "youtube-studio":
        return True
    if _is_generic_studio_title(title) or _is_generic_studio_title(str(promo.get("rawTitle") or "")):
        return True
    if status := str(promo.get("status") or ""):
        if "PROMOTION_STATUS" in status.upper() or "CAMPAIGN_STATUS" in status.upper():
            # keep row but caller remaps status; not stale by itself
            pass
    return False


def _coerce_payload(payload: Any) -> Any:
    """Normalize common wrappers / double-encoded JSON before walking."""
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            return payload
    if not isinstance(payload, dict):
        return payload
    for wrap in ("response", "result", "data", "body", "payload"):
        inner = payload.get(wrap)
        if isinstance(inner, (dict, list)) and (
            (isinstance(inner, dict) and len(inner) > 1)
            or (isinstance(inner, list) and inner)
        ):
            outer_keys = {str(k).lower() for k in payload.keys()}
            if outer_keys <= {wrap, "error", "context", "frameworkupdates"} or wrap in {
                "response",
                "result",
                "body",
            }:
                payload = inner
                break
    return payload


def _collect_list_candidates(payload: Any) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []

    def walk(node: Any, key_hint: str = "", depth: int = 0) -> None:
        if depth > 28:
            return
        if isinstance(node, dict):
            payload_bag = node.get("payload")
            if isinstance(payload_bag, dict):
                for pk, pv in payload_bag.items():
                    if isinstance(pv, dict) and _key_has(str(pk), "promo", "campaign"):
                        found.append(_flatten_promo_dict(pv))
            for k, v in node.items():
                walk(v, str(k), depth + 1)
        elif isinstance(node, list):
            key_l = re.sub(r"[^a-z0-9]", "", key_hint.lower())
            interesting = any(
                n in key_l for n in ("promo", "campaign", "mutation", "entity", "item", "entry", "content")
            )
            sample_ok = False
            if node and isinstance(node[0], dict):
                sample_ok = _looks_like_promo(_flatten_promo_dict(node[0]))
            if interesting or sample_ok:
                for item in node:
                    if isinstance(item, dict):
                        found.append(_flatten_promo_dict(item))
            for item in node[:80]:
                walk(item, key_hint, depth + 1)

    walk(payload)
    return found


def extract_promotions_from_payload(payload: Any) -> list[dict[str, Any]]:
    payload = _coerce_payload(payload)
    raw_items: list[dict[str, Any]] = []
    _walk_promos(payload, raw_items)
    raw_items.extend(_collect_list_candidates(payload))

    if isinstance(payload, dict):
        for key in ("promotions", "campaigns", "items", "entries"):
            val = payload.get(key)
            if isinstance(val, list):
                for item in val:
                    if isinstance(item, dict):
                        raw_items.append(_flatten_promo_dict(item))

    seen: set[str] = set()
    promos: list[dict[str, Any]] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        promo = normalize_studio_promo(raw)
        key = str(promo.get("id") or "")
        if not key or key in seen:
            continue
        if not (promo.get("cost") or promo.get("impressions") or promo.get("views") or promo.get("subscribers")):
            continue
        seen.add(key)
        promos.append(promo)

    return _sort_promotions(promos)


def merge_studio_into_promotions(studio_promos: list[dict[str, Any]]) -> dict[str, Any]:
    data = read_promotions()
    existing = list(data.get("promotions") or [])
    memo = str(data.get("memo") or "").strip()
    if not memo:
        memo = "\n".join(str(item).strip() for item in (data.get("issues") or []) if str(item).strip())
    issues: list[str] = []

    manuals = [p for p in existing if isinstance(p, dict) and not _is_stale_studio_row(p)]
    for manual in manuals:
        manual["status"] = _status_label(manual.get("status"))

    safe_studio: list[dict[str, Any]] = []
    for promo in studio_promos:
        if not isinstance(promo, dict) or not promo.get("id"):
            continue
        goal = _goal_label(promo.get("goal")) or (str(promo.get("goal") or "") if promo.get("goal") else "")
        promo_date = promo.get("startDate") or _extract_promo_date(
            promo.get("title"), promo.get("rawTitle"), promo.get("syncedAt")
        )
        safe_studio.append(
            {
                **promo,
                "status": _status_label(promo.get("status")),
                "goal": goal or None,
                "startDate": promo_date,
                "title": _humanize_promo_title(
                    title=str(promo.get("rawTitle") or promo.get("title") or ""),
                    video_title=str(promo.get("videoTitle") or ""),
                    goal=goal or None,
                    promo_date=promo_date,
                ),
            }
        )

    used_studio: set[str] = set()
    merged: list[dict[str, Any]] = []

    for manual in manuals:
        candidates: list[tuple[float, dict[str, Any]]] = []
        for studio in safe_studio:
            sid = str(studio.get("studioCampaignId") or "")
            if sid and sid == str(manual.get("studioCampaignId") or ""):
                candidates.append((0.0, studio))
                continue
            if manual.get("videoId") and studio.get("videoId") and manual["videoId"] == studio["videoId"]:
                candidates.append((0.05, studio))
                continue
            if _token_overlap(str(manual.get("title") or ""), str(studio.get("title") or "")):
                candidates.append((0.1, studio))
                continue
            if _token_overlap(str(manual.get("videoTitle") or ""), str(studio.get("videoTitle") or "")):
                candidates.append((0.12, studio))
                continue
            if _token_overlap(str(manual.get("title") or ""), str(studio.get("videoTitle") or "")):
                candidates.append((0.14, studio))
                continue
            metric = _metrics_match_score(manual, studio)
            if metric < 999:
                candidates.append((0.4 + metric, studio))

        match = None
        if candidates:
            candidates.sort(key=lambda item: item[0])
            for _score, studio in candidates:
                if str(studio.get("id")) in used_studio:
                    continue
                match = studio
                break

        if match:
            used_studio.add(str(match["id"]))
            studio_video = str(match.get("videoTitle") or "")
            merged.append(
                {
                    **manual,
                    "title": manual.get("title") or match.get("title"),
                    "cost": match.get("cost") or manual.get("cost") or 0,
                    "impressions": match.get("impressions") or manual.get("impressions") or 0,
                    "views": match.get("views") or manual.get("views") or 0,
                    "subscribers": match.get("subscribers")
                    if match.get("subscribers")
                    else manual.get("subscribers") or 0,
                    "followOnViews": match.get("followOnViews") or manual.get("followOnViews") or 0,
                    "status": _status_label(match.get("status") or manual.get("status")),
                    "goal": match.get("goal") or manual.get("goal"),
                    "videoId": match.get("videoId") or manual.get("videoId") or "",
                    "videoTitle": studio_video
                    if studio_video and not _is_generic_studio_title(studio_video)
                    else manual.get("videoTitle") or studio_video or "",
                    "startDate": match.get("startDate") or manual.get("startDate"),
                    "capturedAt": manual.get("capturedAt") or match.get("capturedAt") or date.today().isoformat(),
                    "endDate": manual.get("endDate") or match.get("endDate"),
                    "source": "merged-studio",
                    "studioCampaignId": match.get("studioCampaignId") or manual.get("studioCampaignId"),
                    "syncedAt": match.get("syncedAt"),
                    "notes": list({*(manual.get("notes") or []), "Studio 동기화"}),
                }
            )
        else:
            if manual.get("source") == "google-ads" and not (
                manual.get("cost") or manual.get("impressions") or manual.get("views")
            ):
                continue
            merged.append(manual)

    for studio in safe_studio:
        sid = str(studio.get("id") or "")
        if not sid or sid in used_studio:
            continue
        if any(_metrics_match_score(studio, kept) < 0.55 for kept in merged):
            continue
        merged.append(studio)

    return {"promotions": _sort_promotions(merged), "memo": memo, "issues": issues}


def parse_curl_capture(curl_text: str) -> dict[str, Any]:
    """Chrome 'Copy as cURL' 텍스트에서 url/body/cookies/headers를 추출."""
    text = curl_text.strip()
    url_match = re.search(r"curl\s+(?:'|\")?(https?://[^'\"\s]+)", text)
    if not url_match:
        raise ValueError("cURL에서 URL을 찾지 못했습니다")
    url = url_match.group(1)

    body = None
    data_match = re.search(r"--data-raw\s+'((?:\\'|[^'])*)'", text, re.S)
    if not data_match:
        data_match = re.search(r"--data(?:-binary)?\s+'((?:\\'|[^'])*)'", text, re.S)
    if not data_match:
        data_match = re.search(r'--data-raw\s+"((?:\\"|[^"])*)"', text, re.S)
    if data_match:
        raw_body = data_match.group(1).replace("\\'", "'").replace('\\"', '"')
        try:
            body = json.loads(raw_body)
        except json.JSONDecodeError:
            body = {"_raw": raw_body}

    cookies: dict[str, str] = {}
    cookie_match = re.search(r"-H\s+'Cookie:\s*([^']+)'", text, re.I)
    if not cookie_match:
        cookie_match = re.search(r'-H\s+"Cookie:\s*([^"]+)"', text, re.I)
    if not cookie_match:
        cookie_match = re.search(r"-b\s+'((?:\\'|[^'])*)'", text, re.S)
    if not cookie_match:
        cookie_match = re.search(r'-b\s+"((?:\\"|[^"])*)"', text, re.S)
    if cookie_match:
        raw_cookies = cookie_match.group(1).replace("\\'", "'").replace('\\"', '"')
        for part in raw_cookies.split(";"):
            if "=" in part:
                k, v = part.split("=", 1)
                cookies[k.strip()] = v.strip()

    headers: dict[str, str] = {}
    wanted = set(capture_header_keys())
    for match in re.finditer(r"-H\s+'([^:]+):\s*([^']*)'", text):
        name = match.group(1).strip().lower()
        if name in wanted:
            headers[name] = match.group(2).strip()
    for match in re.finditer(r'-H\s+"([^:]+):\s*([^"]*)"', text):
        name = match.group(1).strip().lower()
        if name in wanted and name not in headers:
            headers[name] = match.group(2).strip()

    return {
        "url": url,
        "method": "POST",
        "body": body,
        "cookies": cookies,
        "headers": headers,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "notes": ["Parsed from Chrome Copy as cURL"],
    }


async def _post_studio(
    client: httpx.AsyncClient,
    *,
    url: str,
    body: dict[str, Any] | None,
    cookies: dict[str, str],
    extra_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    headers = studio_auth_headers(cookies, extra=extra_headers)
    # Prefer Cookie jar over a raw Cookie header so Secure cookies are sent intact.
    headers.pop("Cookie", None)
    jar = httpx.Cookies()
    for name, value in cookies.items():
        jar.set(name, value, domain=".youtube.com", path="/")

    post_url = url
    if "key=" not in post_url:
        sep = "&" if "?" in post_url else "?"
        post_url = f"{post_url}{sep}key={_INNERTUBE_KEY_DEFAULT}"

    res = await client.post(post_url, headers=headers, json=body or {}, cookies=jar)
    if not res.is_success:
        raise RuntimeError(f"Studio API {res.status_code}: {res.text[:400]}")
    try:
        return res.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Studio API JSON 파싱 실패: {exc}") from exc


def _sanitize_capture_body(body: dict[str, Any] | None, channel_id: str) -> dict[str, Any] | None:
    """Drop one-time session tokens that often break when replaying from NAS IP."""
    if not isinstance(body, dict):
        return body
    clean = {k: v for k, v in body.items() if k not in {"_raw"}}
    ctx = clean.get("context")
    if isinstance(ctx, dict):
        ctx = {**ctx}
        req = ctx.get("request")
        if isinstance(req, dict):
            req = {
                k: v
                for k, v in req.items()
                if k
                not in {
                    "eats",
                    "sessionInfo",
                    "consistencyTokenJars",
                    "internalExperimentFlags",
                }
            }
            ctx["request"] = req
        # Keep delegation context (needed for channel-scoped promotions).
        user = ctx.get("user")
        if isinstance(user, dict):
            user = {**user}
            if channel_id and not user.get("delegationContext"):
                user["delegationContext"] = {
                    "externalChannelId": channel_id,
                    "roleType": {"channelRoleType": "CREATOR_CHANNEL_ROLE_TYPE_OWNER"},
                }
            ctx["user"] = user
        ctx.pop("clickTracking", None)
        ctx.pop("clientScreenNonce", None)
        clean["context"] = ctx
    if channel_id and not clean.get("channelId"):
        clean["channelId"] = channel_id
    return clean


def _candidate_urls(api_key: str) -> list[str]:
    urls = []
    for path in _PROBE_PATHS:
        urls.append(f"https://studio.youtube.com/{path}?alt=json&prettyPrint=false&key={api_key}")
    return urls


async def fetch_studio_payload(
    *,
    cookies: dict[str, str] | None = None,
    capture: dict[str, Any] | None = None,
) -> tuple[Any, str]:
    jar = cookies or load_local_cookies()
    if not cookies_configured(jar):
        raise RuntimeError(
            "YouTube Studio 쿠키가 없습니다. "
            "Studio 프로모션 목록 요청을 Copy as cURL로 붙여 저장하거나 "
            "YOUTUBE_STUDIO_COOKIES를 NAS .env에 넣으세요."
        )

    cap = capture if capture is not None else read_capture()
    channel_id = str(cap.get("channelId") or youtube_channel_id() or "").strip()
    context = default_innertube_context(channel_id)
    extra_headers = cap.get("headers") if isinstance(cap.get("headers"), dict) else {}

    async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
        if cap.get("url"):
            body = _sanitize_capture_body(
                cap.get("body") if isinstance(cap.get("body"), dict) else None,
                channel_id,
            )
            if isinstance(body, dict) and "context" not in body:
                body = {**body, "context": context}
            payload = await _post_studio(
                client,
                url=str(cap["url"]),
                body=body,
                cookies=jar,
                extra_headers=extra_headers,
            )
            return payload, str(cap["url"])

        errors: list[str] = []
        for url in _candidate_urls(_INNERTUBE_KEY_DEFAULT):
            body = {"context": context}
            try:
                payload = await _post_studio(
                    client,
                    url=url,
                    body=body,
                    cookies=jar,
                    extra_headers=extra_headers,
                )
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{urlparse(url).path}: {exc}")
                continue
            promos = extract_promotions_from_payload(payload)
            if promos:
                # Auto-save working endpoint for next runs
                write_capture(
                    {
                        "url": url,
                        "method": "POST",
                        "body": body,
                        "headers": extra_headers,
                        "channelId": channel_id,
                        "capturedAt": datetime.now(timezone.utc).isoformat(),
                        "notes": ["Auto-discovered by probe"],
                    }
                )
                return payload, url

        raise RuntimeError(
            "Studio 프로모션 API를 자동으로 찾지 못했습니다. "
            "Studio → 프로모션 탭 → DevTools Network에서 목록 요청을 "
            "Copy as cURL로 저장해 주세요. "
            + (" | ".join(errors[:3]) if errors else "")
        )


async def enrich_studio_promos_with_video_titles(
    promos: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Fill missing/generic titles using YouTube Data API when videoId is known."""
    api_key = youtube_api_key()
    ids = sorted(
        {
            str(p.get("videoId") or "").strip()
            for p in promos
            if p.get("videoId")
            and (
                _is_generic_studio_title(str(p.get("title") or ""))
                or _is_generic_studio_title(str(p.get("videoTitle") or ""))
                or not str(p.get("videoTitle") or "").strip()
            )
        }
    )
    if not api_key or not ids:
        return promos

    titles: dict[str, str] = {}
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            for index in range(0, len(ids), 50):
                chunk = ids[index : index + 50]
                res = await client.get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    params={"part": "snippet", "id": ",".join(chunk), "key": api_key},
                )
                if res.status_code != 200:
                    continue
                for item in res.json().get("items") or []:
                    vid = str(item.get("id") or "")
                    title = str((item.get("snippet") or {}).get("title") or "").strip()
                    if vid and title:
                        titles[vid] = title
    except Exception:  # noqa: BLE001
        return promos

    if not titles:
        return promos

    enriched: list[dict[str, Any]] = []
    for promo in promos:
        vid = str(promo.get("videoId") or "")
        video_title = titles.get(vid) or str(promo.get("videoTitle") or "")
        title = _humanize_promo_title(
            title=str(promo.get("rawTitle") or promo.get("title") or ""),
            video_title=video_title,
            goal=str(promo.get("goal") or "") or None,
            promo_date=promo.get("startDate"),
        )
        enriched.append({**promo, "videoTitle": video_title or promo.get("videoTitle"), "title": title})
    return enriched


def cleanup_stale_studio_promotions() -> dict[str, Any]:
    """Drop raw Studio duplicate rows and re-sort without a live Studio fetch."""
    data = read_promotions()
    existing = list(data.get("promotions") or [])
    memo = str(data.get("memo") or "").strip()
    if not memo:
        memo = "\n".join(str(item).strip() for item in (data.get("issues") or []) if str(item).strip())
    kept: list[dict[str, Any]] = []
    dropped = 0
    for promo in existing:
        if not isinstance(promo, dict):
            continue
        if _is_stale_studio_row(promo):
            dropped += 1
            continue
        promo = {**promo, "status": _status_label(promo.get("status"))}
        if promo.get("goal"):
            promo["goal"] = _goal_label(promo.get("goal")) or promo.get("goal")
        kept.append(promo)
    payload = {"promotions": _sort_promotions(kept), "memo": memo, "issues": []}
    write_promotions(payload)
    return {
        "ok": True,
        "dropped": dropped,
        "kept": len(kept),
        "message": f"깨진 Studio 행 {dropped}개 정리, {len(kept)}개 유지",
        "promotions": payload["promotions"],
    }


async def sync_studio_promotions(
    *,
    force: bool = True,
    raw_payload: Any | None = None,
) -> dict[str, Any]:
    _ = force
    source = "studio-api"
    used_url = ""

    try:
        if raw_payload is not None:
            payload = _coerce_payload(raw_payload)
            source = "studio-import"
        else:
            payload, used_url = await fetch_studio_payload()
            payload = _coerce_payload(payload)

        promos = extract_promotions_from_payload(payload)
        if not promos and isinstance(payload, dict) and isinstance(payload.get("promotions"), list):
            # Force-normalize raw Studio rows (never keep objects without id).
            for item in payload["promotions"]:
                if not isinstance(item, dict):
                    continue
                promo = normalize_studio_promo(item)
                if promo.get("id") and (
                    promo.get("cost")
                    or promo.get("impressions")
                    or promo.get("views")
                    or promo.get("subscribers")
                ):
                    promos.append(promo)

        if promos:
            promos = await enrich_studio_promos_with_video_titles(promos)

        if not promos:
            shape = analyze_payload_shape(payload)
            # Persist raw payload for local diagnosis (gitignored under data/youtube).
            try:
                _write_json(
                    DATA_DIR / "studio-promo-last-payload.json",
                    {
                        "savedAt": datetime.now(timezone.utc).isoformat(),
                        "shape": shape,
                        "payload": payload,
                    },
                )
            except Exception:  # noqa: BLE001
                pass
            keys_hint = ", ".join(shape.get("topKeys") or []) or "(none)"
            units_hint = shape.get("unitsCount") or 0
            meta = {
                "ok": False,
                "source": source,
                "url": used_url,
                "message": (
                    "응답에서 프로모션 수치를 파싱하지 못했습니다. "
                    f"topKeys=[{keys_hint}] units={units_hint}. "
                    "콘솔에 window.__ddditLastPayload 가 있으면 알려주세요."
                ),
                "payloadKeys": shape.get("topKeys") or [],
                "unitsPaths": shape.get("unitsPaths") or [],
                "interestingKeys": shape.get("interestingKeys") or [],
                "syncedAt": datetime.now(timezone.utc).isoformat(),
                "promotions": [],
            }
            write_sync_meta(meta)
            return meta

        merged = merge_studio_into_promotions(promos)
        write_promotions(merged)
        result = {
            "ok": True,
            "source": source,
            "url": used_url,
            "syncedAt": datetime.now(timezone.utc).isoformat(),
            "promotionCount": len(promos),
            "mergedCount": len(merged.get("promotions") or []),
            "promotions": promos,
            "message": f"Studio 프로모션 {len(promos)}개 동기화 완료",
        }
        write_sync_meta(
            {
                "syncedAt": result["syncedAt"],
                "promotionCount": len(promos),
                "message": result["message"],
                "url": used_url,
                "source": source,
            }
        )
        return result
    except Exception as exc:  # noqa: BLE001
        err = str(exc)
        if "401" in err or "UNAUTHENTICATED" in err:
            err = (
                "Studio 로그인 인증 실패(401). "
                "NAS 서버 IP에서는 브라우저 쿠키가 거절될 수 있습니다. "
                "보고 페이지 「JSON 가져오기」를 사용하세요 "
                "(Studio Console에서 list_promotions 응답 복사)."
            )
        meta = {
            "ok": False,
            "source": source,
            "message": f"Studio 동기화 실패: {err}",
            "syncedAt": None,
            "promotions": [],
        }
        write_sync_meta({**read_sync_meta(), **meta})
        return meta


def get_studio_promo_status() -> dict[str, Any]:
    capture = read_capture()
    jar = load_local_cookies()
    cookies_ok = cookies_configured(jar)
    meta = read_sync_meta()
    auth_user = None
    headers = capture.get("headers") if isinstance(capture.get("headers"), dict) else {}
    if headers:
        auth_user = headers.get("x-goog-authuser")
    return {
        "ok": True,
        "cookiesConfigured": cookies_ok,
        "cookieCount": len(jar) if cookies_ok else 0,
        "captureConfigured": bool(capture.get("url")),
        "captureUrl": capture.get("url") or None,
        "capturedAt": capture.get("capturedAt"),
        "authUser": auth_user,
        "lastSync": meta.get("syncedAt"),
        "promotionCount": meta.get("promotionCount") or 0,
        "message": meta.get("message"),
        "ready": cookies_ok and bool(capture.get("url")),
    }


_NON_PROMO_URL_HINTS = (
    "/att/esr",
    "/att/get",
    "botguard",
    "log_event",
    "get_survey",
    "get_web_reauth_url",
    "get_creator_videos",
)


def _capture_url_warning(url: str, body: Any) -> str | None:
    lower = (url or "").lower()
    # Good endpoints — never warn even if body carries eats/consistency tokens.
    if "list_promotions" in lower or "get_promotions" in lower or "list_campaigns" in lower:
        return None
    for hint in _NON_PROMO_URL_HINTS:
        if hint in lower:
            return (
                "이 URL은 프로모션 목록 API가 아닙니다 "
                f"({hint}). Network에서 list_promotions / promotion/campaign/ypc 또는 "
                "비용·노출이 있는 요청을 다시 캡처하세요."
            )
    if isinstance(body, dict) and ("botguardResponse" in body or "challenge" in body):
        return (
            "요청 본문에 botguard/challenge가 있습니다. "
            "attestation(봇 검증) 요청이므로 프로모션 동기화에 쓸 수 없습니다. "
            "Search에서 숫자를 찾은 list_promotions 요청을 Copy as cURL 하세요."
        )
    return None


def save_capture_from_curl(curl_text: str, *, also_store_cookies: bool = True) -> dict[str, Any]:
    parsed = parse_curl_capture(curl_text)
    cookies = parsed.pop("cookies", {}) or {}
    channel_id = youtube_channel_id()
    parsed["channelId"] = channel_id
    url_warning = _capture_url_warning(str(parsed.get("url") or ""), parsed.get("body"))

    if not cookies:
        return {
            "ok": False,
            "capture": {k: parsed.get(k) for k in ("url", "method", "capturedAt", "channelId")},
            "cookieCount": 0,
            "cookiesConfigured": False,
            "warning": url_warning,
            "message": (
                "cURL에서 로그인 쿠키를 찾지 못했습니다. "
                "Studio에서 Copy as cURL (bash)로 다시 복사하세요. "
                "(-b 'SID=...; SAPISID=...' 줄이 포함되어야 합니다)"
            ),
        }

    write_capture(parsed)

    cookie_note = None
    if also_store_cookies and cookies:
        # Persist cookies next to capture for NAS-local use (not committed).
        cookie_path = DATA_DIR / "studio-cookies.json"
        _write_json(cookie_path, {"cookies": cookies, "updatedAt": datetime.now(timezone.utc).isoformat()})
        cookie_note = f"쿠키 {len(cookies)}개 로컬 저장"

    message = f"캡처 저장 완료 · 쿠키 {len(cookies)}개"
    if cookie_note:
        message = f"{message} ({cookie_note})"
    if url_warning:
        message = f"{message} · 경고: {url_warning}"

    return {
        "ok": True,
        "capture": {k: parsed.get(k) for k in ("url", "method", "capturedAt", "channelId")},
        "cookieCount": len(cookies),
        "cookiesConfigured": cookies_configured(cookies),
        "warning": url_warning,
        "message": message,
    }


def load_local_cookies() -> dict[str, str]:
    env_cookies = studio_cookies_from_env()
    if env_cookies:
        return env_cookies
    stored = _read_json(DATA_DIR / "studio-cookies.json", {})
    cookies = stored.get("cookies") if isinstance(stored, dict) else None
    return cookies if isinstance(cookies, dict) else {}

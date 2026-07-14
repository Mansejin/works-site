from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import youtube_channel_id
from app.youtube_report_store import (
    DATA_DIR,
    _read_json,
    _write_json,
    read_promotions,
    write_promotions,
)
from app.youtube_studio_auth import (
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


def _flatten_promo_dict(obj: dict[str, Any]) -> dict[str, Any]:
    """Unwrap common Studio renderer wrappers into a flat-ish dict for matching."""
    flat: dict[str, Any] = dict(obj)
    for wrap in (
        "promotionRenderer",
        "campaignRenderer",
        "promotionCardRenderer",
        "promotionListItemRenderer",
        "ypcPromotionRenderer",
    ):
        inner = obj.get(wrap)
        if isinstance(inner, dict):
            flat = {**flat, **inner}
    return flat


def _looks_like_promo(obj: dict[str, Any]) -> bool:
    keys = {str(k).lower() for k in obj.keys()}
    # Skip botguard / attestation blobs.
    if "botguarddata" in keys or "botguardresponse" in keys:
        return False
    has_cost = any(
        k in keys
        for k in (
            "cost",
            "budget",
            "spend",
            "amountspent",
            "spentmicros",
            "costmicros",
            "totalcost",
            "amountspentmoney",
            "spentamount",
            "budgetspent",
            "spendamount",
            "costamount",
        )
    )
    # Money sometimes only appears as nested {units} under spend-like keys — also detect units sibling metric bags.
    has_units_money = "units" in keys and any(
        k in keys for k in ("currencycode", "currency", "nanos")
    )
    has_views = any(
        k in keys
        for k in ("views", "viewcount", "videoviews", "trueviewviews", "promotedviews", "viewedcount")
    )
    has_impr = any(k in keys for k in ("impressions", "impressioncount", "reach", "impression"))
    has_subs = any(
        k in keys
        for k in ("subscribers", "subscribersgained", "subscribercount", "followersgained", "subs")
    )
    has_name = any(
        k in keys
        for k in (
            "title",
            "name",
            "campaignname",
            "promotionname",
            "videotitle",
            "displayname",
            "campaignid",
            "promotionid",
            "externalcampaignid",
        )
    )
    metric_hits = sum(1 for flag in (has_cost or has_units_money, has_views, has_impr, has_subs) if flag)
    return has_name and metric_hits >= 1


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


def _walk_promos(node: Any, found: list[dict[str, Any]], depth: int = 0) -> None:
    if depth > 28:
        return
    if isinstance(node, dict):
        flat = _flatten_promo_dict(node)
        if _looks_like_promo(flat):
            found.append(flat)
        for value in node.values():
            _walk_promos(value, found, depth + 1)
    elif isinstance(node, list):
        for item in node:
            _walk_promos(item, found, depth + 1)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^\w가-힣]+", "-", (name or "").strip().lower())
    return slug.strip("-")[:48] or "studio-promo"


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

    title = _text_field("title", "name", "campaignName", "promotionName", "videoTitle", "displayName") or (
        "Studio 프로모션"
    )
    video_title = _text_field("videoTitle", "video_title") or title
    video_id = str(_pick(raw, "videoId", "encryptedVideoId", "externalVideoId") or "")
    campaign_id = str(
        _pick(raw, "campaignId", "promotionId", "id", "externalCampaignId", "entityId") or ""
    )

    cost = _pick_money(
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
        "costMicros",
        "spentMicros",
    )
    # Bare {units} sibling only when parent already looks like spend metrics bag.
    if cost is None and isinstance(_pick(raw, "units"), (str, int, float)):
        if _pick(raw, "currencyCode", "currency", "nanos") is not None:
            cost = _parse_int({"units": _pick(raw, "units"), "nanos": _pick(raw, "nanos")})

    if cost is not None and abs(cost) > 1_000_000 and (
        _pick(raw, "costMicros", "spentMicros") is not None
    ):
        # micros → 원
        cost = round(cost / 1_000_000)

    impressions = _pick_money(raw, "impressions", "impressionCount", "reach", "impression")
    views = _pick_money(
        raw, "views", "viewCount", "videoViews", "trueviewViews", "promotedViews", "viewedCount"
    )
    subscribers = _pick_money(
        raw, "subscribers", "subscribersGained", "subscriberCount", "followersGained", "subs"
    )
    follow_on = _pick_money(raw, "followOnViews", "clicks", "followOnViewCount")

    status_raw = str(_pick(raw, "status", "campaignStatus", "state") or "").upper()
    if status_raw in ("ACTIVE", "ENABLED", "RUNNING", "LIVE"):
        status = "진행중"
    elif status_raw in ("PAUSED",):
        status = "일시중지"
    elif status_raw in ("ENDED", "COMPLETED", "DONE", "FINISHED"):
        status = "완료"
    else:
        status = "진행중" if status_raw == "" else status_raw

    goal = str(_pick(raw, "goal", "objective", "campaignGoal") or "")
    goal_map = {
        "AUDIENCE_GROWTH": "시청자층 성장",
        "SUBSCRIBE": "시청자층 성장",
        "VIEWS": "동영상 조회수",
        "VIDEO_VIEWS": "동영상 조회수",
        "WEBSITE": "웹사이트 방문",
    }
    goal = goal_map.get(goal.upper(), goal) if goal else ""

    return {
        "id": f"studio-{campaign_id}" if campaign_id else f"studio-{_slugify(title)}",
        "title": title[:80],
        "videoTitle": video_title,
        "videoId": video_id,
        "status": status,
        "goal": goal or None,
        "cost": cost or 0,
        "impressions": impressions or 0,
        "views": views or 0,
        "subscribers": subscribers or 0,
        "followOnViews": follow_on or 0,
        "source": "youtube-studio",
        "studioCampaignId": campaign_id or None,
        "syncedAt": datetime.now(timezone.utc).isoformat(),
        "notes": ["YouTube Studio 내부 API 동기화"],
    }


def extract_promotions_from_payload(payload: Any) -> list[dict[str, Any]]:
    raw_items: list[dict[str, Any]] = []
    _walk_promos(payload, raw_items)

    seen: set[str] = set()
    promos: list[dict[str, Any]] = []
    for raw in raw_items:
        promo = normalize_studio_promo(raw)
        key = promo["id"]
        if key in seen:
            continue
        if not (promo["cost"] or promo["impressions"] or promo["views"] or promo["subscribers"]):
            continue
        seen.add(key)
        promos.append(promo)

    promos.sort(
        key=lambda p: (
            0 if p.get("status") == "진행중" else 1,
            -int(p.get("cost") or 0),
            str(p.get("title") or ""),
        )
    )
    return promos


def merge_studio_into_promotions(studio_promos: list[dict[str, Any]]) -> dict[str, Any]:
    data = read_promotions()
    manuals = list(data.get("promotions") or [])
    issues = list(data.get("issues") or [])
    merged: list[dict[str, Any]] = []
    used_studio: set[str] = set()

    def _overlap(a: str, b: str) -> bool:
        x = " ".join((a or "").lower().split())
        y = " ".join((b or "").lower().split())
        if not x or not y:
            return False
        return x in y or y in x or x[:16] in y or y[:16] in x

    for manual in manuals:
        match = None
        for studio in studio_promos:
            sid = str(studio.get("studioCampaignId") or "")
            if sid and sid == str(manual.get("studioCampaignId") or ""):
                match = studio
                break
            if manual.get("videoId") and studio.get("videoId") and manual["videoId"] == studio["videoId"]:
                match = studio
                break
            if _overlap(str(manual.get("title") or ""), str(studio.get("title") or "")):
                match = studio
                break
            if _overlap(str(manual.get("videoTitle") or ""), str(studio.get("videoTitle") or "")):
                match = studio
                break
        if match:
            used_studio.add(match["id"])
            merged.append(
                {
                    **manual,
                    "cost": match.get("cost") or manual.get("cost") or 0,
                    "impressions": match.get("impressions") or manual.get("impressions") or 0,
                    "views": match.get("views") or manual.get("views") or 0,
                    "subscribers": match.get("subscribers")
                    if match.get("subscribers")
                    else manual.get("subscribers") or 0,
                    "followOnViews": match.get("followOnViews") or manual.get("followOnViews") or 0,
                    "status": match.get("status") or manual.get("status"),
                    "goal": match.get("goal") or manual.get("goal"),
                    "videoId": match.get("videoId") or manual.get("videoId") or "",
                    "videoTitle": match.get("videoTitle") or manual.get("videoTitle") or "",
                    "source": "merged-studio",
                    "studioCampaignId": match.get("studioCampaignId"),
                    "syncedAt": match.get("syncedAt"),
                    "notes": list({*(manual.get("notes") or []), "Studio 동기화"}),
                }
            )
        else:
            # keep non-studio manuals; drop empty google-ads shells
            if manual.get("source") == "google-ads" and not (
                manual.get("cost") or manual.get("impressions") or manual.get("views")
            ):
                continue
            merged.append(manual)

    for studio in studio_promos:
        if studio["id"] in used_studio:
            continue
        merged.append(studio)

    merged.sort(
        key=lambda p: (
            0 if p.get("status") == "진행중" else 1 if p.get("status") == "일시중지" else 2,
            -int(p.get("cost") or 0),
            str(p.get("title") or ""),
        )
    )
    return {"promotions": merged, "issues": issues}


def parse_curl_capture(curl_text: str) -> dict[str, Any]:
    """Chrome 'Copy as cURL' 텍스트에서 url/body/cookies를 추출."""
    text = curl_text.strip()
    url_match = re.search(r"curl\s+(?:'|\")?(https?://[^'\"\s]+)", text)
    if not url_match:
        raise ValueError("cURL에서 URL을 찾지 못했습니다")
    url = url_match.group(1)

    body = None
    data_match = re.search(r"--data-raw\s+'((?:\\'|[^'])*)'", text, re.S)
    if not data_match:
        data_match = re.search(r"--data(?:-binary)?\s+'((?:\\'|[^'])*)'", text, re.S)
    if data_match:
        raw_body = data_match.group(1).replace("\\'", "'")
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

    return {
        "url": url,
        "method": "POST",
        "body": body,
        "cookies": cookies,
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "notes": ["Parsed from Chrome Copy as cURL"],
    }


async def _post_studio(
    client: httpx.AsyncClient,
    *,
    url: str,
    body: dict[str, Any] | None,
    cookies: dict[str, str],
) -> dict[str, Any]:
    headers = studio_auth_headers(cookies)
    res = await client.post(url, headers=headers, json=body or {})
    if not res.is_success:
        raise RuntimeError(f"Studio API {res.status_code}: {res.text[:400]}")
    try:
        return res.json()
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Studio API JSON 파싱 실패: {exc}") from exc


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

    async with httpx.AsyncClient(timeout=45.0, follow_redirects=True) as client:
        if cap.get("url"):
            body = cap.get("body")
            if isinstance(body, dict):
                body = {**body}
                if "context" not in body:
                    body["context"] = context
            payload = await _post_studio(client, url=str(cap["url"]), body=body, cookies=jar)
            return payload, str(cap["url"])

        errors: list[str] = []
        for url in _candidate_urls(_INNERTUBE_KEY_DEFAULT):
            body = {"context": context}
            try:
                payload = await _post_studio(client, url=url, body=body, cookies=jar)
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
            payload = raw_payload
            source = "studio-import"
        else:
            payload, used_url = await fetch_studio_payload()

        promos = extract_promotions_from_payload(payload)
        if not promos and isinstance(payload, dict) and isinstance(payload.get("promotions"), list):
            # already-normalized import
            promos = [normalize_studio_promo(p) if "cost" in p or "impressions" in p else p for p in payload["promotions"]]

        if not promos:
            meta = {
                "ok": False,
                "source": source,
                "url": used_url,
                "message": (
                    "응답에서 프로모션 수치를 파싱하지 못했습니다. "
                    "캡처 URL이 프로모션 목록이 맞는지 확인하세요."
                ),
                "payloadKeys": list(payload.keys())[:20] if isinstance(payload, dict) else [],
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
        meta = {
            "ok": False,
            "source": source,
            "message": f"Studio 동기화 실패: {exc}",
            "syncedAt": None,
            "promotions": [],
        }
        write_sync_meta({**read_sync_meta(), **meta})
        return meta


def get_studio_promo_status() -> dict[str, Any]:
    capture = read_capture()
    cookies_ok = cookies_configured()
    meta = read_sync_meta()
    return {
        "ok": True,
        "cookiesConfigured": cookies_ok,
        "captureConfigured": bool(capture.get("url")),
        "captureUrl": capture.get("url") or None,
        "capturedAt": capture.get("capturedAt"),
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
    write_capture(parsed)

    cookie_note = None
    if also_store_cookies and cookies:
        # Persist cookies next to capture for NAS-local use (not committed).
        cookie_path = DATA_DIR / "studio-cookies.json"
        _write_json(cookie_path, {"cookies": cookies, "updatedAt": datetime.now(timezone.utc).isoformat()})
        cookie_note = f"쿠키 {len(cookies)}개 로컬 저장 (data/youtube/studio-cookies.json)"

    message = "캡처 저장 완료" + (f" · {cookie_note}" if cookie_note else "")
    if url_warning:
        message = f"{message} · 경고: {url_warning}"

    return {
        "ok": True,
        "capture": {k: parsed.get(k) for k in ("url", "method", "capturedAt", "channelId")},
        "cookieCount": len(cookies),
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
